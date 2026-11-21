/* ============================================================
   IPTV Player — Multi-Stage Playback Engine (Orchestrator & FSM)
   Coordinates PlaybackStrategies (Hls, MpegTs, Native, TizenAvPlay),
   explicit playback states, candidate watchdogs, and stall monitor.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.PlaybackEngine = {
    STATES: {
        IDLE: 'IDLE',
        LOADING: 'LOADING',
        PLAYING: 'PLAYING',
        PAUSED: 'PAUSED',
        SEEKING: 'SEEKING',
        RECOVERING: 'RECOVERING',
        ERROR: 'ERROR'
    },

    _scriptPromises: {},

    setState(player, nextState) {
        if (!player || !nextState) return;
        const prev = player._playbackState || this.STATES.IDLE;
        if (prev === nextState) return;
        player._playbackState = nextState;
        if (window.IPTV.EventBus && typeof window.IPTV.EventBus.emit === 'function') {
            window.IPTV.EventBus.emit('player:state', { prev, state: nextState, item: player.currentItem || null });
        }
    },

    getState(player) {
        return (player && player._playbackState) || this.STATES.IDLE;
    },

    _strategies() {
        return (window.IPTV && window.IPTV.PlaybackStrategies) || {};
    },

    _getStrategy(player) {
        const S = this._strategies();
        if (player && player._avplayActive && S.avplay) return S.avplay;
        if (player && player._session && player._session.strategy) return player._session.strategy;
        if (player && player.hls && S.hls) return S.hls;
        if (player && player.mpegtsPlayer && S.mpegts) return S.mpegts;
        return S.native || null;
    },

    loadScriptOnce(src) {
        if (this._scriptPromises[src]) return this._scriptPromises[src];
        this._scriptPromises[src] = new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve(true);
            s.onerror = () => {
                delete this._scriptPromises[src];
                resolve(false);
            };
            document.head.appendChild(s);
        });
        return this._scriptPromises[src];
    },

    /**
     * Returns platform-tuned MSE buffer limits, back-buffer eviction, and worker flags.
     * Evicts watched segments to prevent MSE quota stalls while keeping continuous
     * streaming (lazyLoad: false) and inline demuxing (enableWorker: false).
     */
    getEngineProfile() {
        const P = window.IPTV && window.IPTV.Platform;
        const isTv = Boolean(P && ((typeof P.isWebOS === 'function' && P.isWebOS()) || (typeof P.isTizen === 'function' && P.isTizen())));
        if (isTv) {
            return {
                enableWorker: false,
                hlsMaxBufferLength: 20,
                hlsMaxMaxBufferLength: 36,
                hlsMaxBufferSize: 20 * 1000 * 1000,
                hlsBackBufferLength: 10,
                hlsLiveBackBufferLength: 8,
                hlsCapLevelToPlayerSize: true,
                mpegtsLazyLoad: false,
                mpegtsStashInitialSize: 384 * 1024,
                mpegtsAutoCleanup: true,
                mpegtsAutoCleanupMaxBackward: 25,
                mpegtsAutoCleanupMinBackward: 12,
                mpegtsLiveMaxLatency: 15.0,
                mpegtsLiveMinRemain: 4.0
            };
        }
        return {
            enableWorker: false,
            hlsMaxBufferLength: 30,
            hlsMaxMaxBufferLength: 60,
            hlsMaxBufferSize: 60 * 1000 * 1000,
            hlsBackBufferLength: 30,
            hlsLiveBackBufferLength: 15,
            hlsCapLevelToPlayerSize: false,
            mpegtsLazyLoad: false,
            mpegtsStashInitialSize: 384 * 1024,
            mpegtsAutoCleanup: true,
            mpegtsAutoCleanupMaxBackward: 60,
            mpegtsAutoCleanupMinBackward: 30,
            mpegtsLiveMaxLatency: 8.0,
            mpegtsLiveMinRemain: 2.5
        };
    },

    getCurrentTime(player) {
        const strat = this._getStrategy(player);
        return strat ? strat.getCurrentTime(player) : ((player && player.video && player.video.currentTime) || 0);
    },

    getDuration(player) {
        const strat = this._getStrategy(player);
        return strat ? strat.getDuration(player) : ((player && player.video && player.video.duration) || 0);
    },

    isPaused(player) {
        const strat = this._getStrategy(player);
        return strat ? strat.isPaused(player) : Boolean(player && player.video && player.video.paused);
    },

    play(player) {
        if (!player || !player.video) return;
        player._userPaused = false;
        const strat = this._getStrategy(player);
        if (strat) strat.play(player);
        this.setState(player, this.STATES.PLAYING);
        if (typeof player._updatePlayPauseIcon === 'function') {
            player._updatePlayPauseIcon(true);
        }
    },

    pause(player) {
        if (!player || !player.video) return;
        player._userPaused = true;
        const strat = this._getStrategy(player);
        if (strat) strat.pause(player);
        this.setState(player, this.STATES.PAUSED);
        if (typeof player._updatePlayPauseIcon === 'function') {
            player._updatePlayPauseIcon(false);
        }
    },

    canSeek(player) {
        if (!player || !player.video || player.isLiveStream()) return false;
        if (!player.hasValidDuration()) return false;
        const strat = this._getStrategy(player);
        return strat ? strat.canSeek(player) : Boolean(player.video.duration > 0);
    },

    seekTo(player, clamped, startPlaying = true) {
        if (!player) return;
        this.setState(player, this.STATES.SEEKING);
        const strat = this._getStrategy(player);
        if (strat) strat.seekTo(player, clamped, startPlaying);
    },

    _addCandidateListener(player, type, fn) {
        if (!player || !player.video || !type || typeof fn !== 'function') return;
        if (!Array.isArray(player._candidateListeners)) {
            player._candidateListeners = [];
        }
        player.video.addEventListener(type, fn);
        player._candidateListeners.push({ type, fn });
    },

    _clearVideoListeners(player) {
        if (!player || !player.video) return;
        if (Array.isArray(player._candidateListeners)) {
            for (let i = 0; i < player._candidateListeners.length; i++) {
                const entry = player._candidateListeners[i];
                try { player.video.removeEventListener(entry.type, entry.fn); } catch (e) {}
            }
            player._candidateListeners = [];
        }
        if (player._onSeekedHandler) {
            try { player.video.removeEventListener('seeked', player._onSeekedHandler); } catch (e) {}
            player._onSeekedHandler = null;
        }
    },

    suspend(player) {
        if (!player || !player.visible) return;
        player._wasPlayingBeforeHidden = !this.isPaused(player) && !player._userPaused;
        this.clearWatchdog(player);
        const strat = this._getStrategy(player);
        if (strat) strat.suspend(player);
    },

    restore(player) {
        if (!player || !player.visible) return;
        const shouldResume = Boolean(player._wasPlayingBeforeHidden && !player._userPaused);
        player._wasPlayingBeforeHidden = false;
        const strat = this._getStrategy(player);
        if (strat) strat.restore(player, shouldResume);
        if (shouldResume) {
            this.setState(player, this.STATES.PLAYING);
        }
    },

    _createSession(player) {
        const nextId = (player._loadSessionId || 0) + 1;
        player._loadSessionId = nextId;
        const session = {
            id: nextId,
            engine: null,
            strategy: null,
            started: false,
            hlsNetRetries: 0,
            hlsMediaRecovered: false,
            hlsCodecSwapped: false,
            tsReconnects: 0,
            timers: {
                watchdog: null,
                stall: null,
                reconnect: null,
                tsHealthy: null
            }
        };
        player._session = session;
        player._streamStarted = false;
        return session;
    },

    clearWatchdog(player) {
        if (!player) return;
        const wd = (player._session && player._session.timers && player._session.timers.watchdog) || player._candidateWatchdog;
        if (wd) clearTimeout(wd);
        if (player._session && player._session.timers) {
            player._session.timers.watchdog = null;
        }
        player._candidateWatchdog = null;
    },

    stopStallMonitor(player) {
        if (!player) return;
        const timers = player._session && player._session.timers;
        const stall = (timers && timers.stall) || player._stallTimer;
        if (stall) clearInterval(stall);
        const reconnect = (timers && timers.reconnect) || player._reconnectTimer;
        if (reconnect) clearTimeout(reconnect);
        const healthy = (timers && timers.tsHealthy) || player._tsHealthyTimer;
        if (healthy) clearTimeout(healthy);

        if (timers) {
            timers.stall = null;
            timers.reconnect = null;
            timers.tsHealthy = null;
        }
        player._stallTimer = null;
        player._reconnectTimer = null;
        player._tsHealthyTimer = null;
    },

    startStallMonitor(player, item, sessionId, rawCandidateUrl, engine) {
        if (player) {
            const prevStall = (player._session && player._session.timers && player._session.timers.stall) || player._stallTimer;
            if (prevStall) clearInterval(prevStall);
            if (player._session && player._session.timers) player._session.timers.stall = null;
            player._stallTimer = null;
        }
        if (!player || !player.video) return;
        const isLive = player.isLiveStream();
        let lastTime = -1;
        let stuckSince = 0;

        const stallId = setInterval(() => {
            if (player._loadSessionId !== sessionId || !player.visible || player.currentItem !== item || player._avplayActive) {
                this.stopStallMonitor(player);
                return;
            }
            const v = player.video;
            if (!v || !player._streamStarted || v.paused || player._userPaused || v.seeking || player._initialSeekPending !== null) {
                lastTime = v ? v.currentTime : -1;
                stuckSince = 0;
                return;
            }
            const t = v.currentTime;
            if (t !== lastTime) {
                lastTime = t;
                stuckSince = 0;
                return;
            }
            const now = Date.now();
            if (!stuckSince) {
                stuckSince = now;
                return;
            }
            const stuckMs = now - stuckSince;

            let inRange = false;
            let ahead = 0;
            let nextStart = -1;
            try {
                const b = v.buffered;
                for (let i = 0; i < b.length; i++) {
                    const s = b.start(i);
                    const e = b.end(i);
                    if (t >= s - 0.05 && t < e) {
                        inRange = true;
                        ahead = e - t;
                    } else if (s > t && (nextStart < 0 || s < nextStart)) {
                        nextStart = s;
                    }
                }
            } catch (e) {}

            if (engine !== 'hls') {
                if (!inRange && nextStart > 0 && (nextStart - t) < 6 && stuckMs >= 800) {
                    console.warn(`[PlaybackEngine] Jumping buffer gap ${t.toFixed(2)} -> ${nextStart.toFixed(2)}`);
                    try { v.currentTime = nextStart + 0.1; } catch (e) {}
                    stuckSince = 0;
                    return;
                }
                if (inRange && ahead > 1.5 && stuckMs >= 2000) {
                    console.warn('[PlaybackEngine] Decoder stuck with data buffered, nudging playhead');
                    try { v.currentTime = t + 0.1; } catch (e) {}
                    stuckSince = 0;
                    return;
                }
            }

            if (isLive && stuckMs >= 10000 && ahead < 1) {
                this.stopStallMonitor(player);
                player._liveReloads = (player._liveReloads || 0) + 1;
                if (player._liveReloads <= 3) {
                    console.warn(`[PlaybackEngine] Live stream frozen for 10s, reloading in place (${player._liveReloads}/3)`);
                    this.setState(player, this.STATES.RECOVERING);
                    player.currentCandidateIndex = Math.max(0, player.currentCandidateIndex);
                    this.loadCandidate(player, rawCandidateUrl, item);
                } else {
                    console.warn('[PlaybackEngine] Live stream repeatedly frozen, trying next candidate');
                    player._liveReloads = 0;
                    this.tryNextCandidate(player, item, sessionId);
                }
            }
        }, 500);

        player._stallTimer = stallId;
        if (player._session && player._session.timers) {
            player._session.timers.stall = stallId;
        }
    },

    startWatchdog(player, item, sessionId, timeoutMs = 8500) {
        this.clearWatchdog(player);
        const wdId = setTimeout(() => {
            if (player._loadSessionId !== sessionId) return;
            if (!player.visible || player.currentItem !== item) return;

            let hasVideoData = false;
            if (player._avplayActive) {
                hasVideoData = (player._avplayCurrentTime > 0);
            } else if (player.video) {
                const v = player.video;
                const isSeeking = v.seeking || (player._initialSeekPending !== null);
                const hasBufferedData = v.readyState >= 2;
                const isPlaying = !v.paused && v.playbackRate > 0;
                hasVideoData = !isSeeking && hasBufferedData && isPlaying;
            }

            if (!hasVideoData) {
                console.warn('[PlaybackEngine] Candidate timed out waiting for data, trying next...');
                this.tryNextCandidate(player, item, sessionId);
            }
        }, timeoutMs);
        player._candidateWatchdog = wdId;
        if (player._session && player._session.timers) {
            player._session.timers.watchdog = wdId;
        }
    },

    destroy(player) {
        if (!player) return;
        this.clearWatchdog(player);
        this.stopStallMonitor(player);
        this._clearVideoListeners(player);
        if (player.video) {
            player.video.onerror = null;
            player.video.onplaying = null;
            player.video.onloadeddata = null;
            player.video.oncanplay = null;
            player.video.onended = null;
        }
        const S = this._strategies();
        if (player.hls && S.hls) S.hls.destroy(player);
        else if (player.hls) { try { player.hls.destroy(); } catch (e) {} player.hls = null; }

        if (player.mpegtsPlayer && S.mpegts) S.mpegts.destroy(player);
        else if (player.mpegtsPlayer) { try { player.mpegtsPlayer.destroy(); } catch (e) {} player.mpegtsPlayer = null; }

        if (player._avplayActive) {
            this.destroyTizenAvPlay(player);
        }
        player._session = null;
        player._streamStarted = false;
        this.setState(player, this.STATES.IDLE);
    },

    isTizenAvPlayAvailable() {
        const S = this._strategies();
        return Boolean(S.avplay && S.avplay.isAvailable());
    },

    destroyTizenAvPlay(player) {
        const S = this._strategies();
        if (S.avplay) S.avplay.destroy(player);
    },

    playTizenAvPlay(player, url, item, sessionId) {
        const S = this._strategies();
        return Boolean(S.avplay && S.avplay.load(this, player, url, item, sessionId));
    },

    async loadCandidate(player, rawCandidateUrl, item) {
        this.destroy(player);
        if (!player || !player.video) return;

        const session = this._createSession(player);
        const currentSessionId = session.id;
        this.setState(player, this.STATES.LOADING);

        player.video.pause();
        try {
            player.video.removeAttribute('src');
            player.video.load();
        } catch (e) {}

        const forceMseHls = rawCandidateUrl.indexOf('mse-hls:') === 0;
        const forceMseTs = rawCandidateUrl.indexOf('mse-ts:') === 0;
        const url = forceMseHls
            ? rawCandidateUrl.slice(8)
            : (forceMseTs ? rawCandidateUrl.slice(7) : rawCandidateUrl);

        const isLive = player.isLiveStream();
        const decodedUrl = decodeURIComponent(url);
        const isM3u8 = forceMseHls || /\.m3u8($|\?)/i.test(decodedUrl);
        const isTs = forceMseTs || (!isM3u8 && (/\.(ts|mpegts)($|\?)/i.test(decodedUrl) || (isLive && !/\.(mp4|mkv|avi|mov|webm)($|\?)/i.test(decodedUrl))));

        console.log(`[PlaybackEngine] Loading stream candidate [${player.currentCandidateIndex + 1}/${player.currentCandidates.length}]: ${rawCandidateUrl}`);

        if (player._resilienceItem !== item) {
            player._resilienceItem = item;
            player._liveReloads = 0;
        }

        this.startWatchdog(player, item, currentSessionId, isLive ? 7000 : 12000);
        const profile = this.getEngineProfile();

        const armStallMonitor = (engineName) => {
            session.engine = engineName;
            const onFirstPlaying = () => {
                if (player._loadSessionId !== currentSessionId) return;
                player.video.removeEventListener('playing', onFirstPlaying);
                session.started = true;
                player._streamStarted = true;
                this.setState(player, this.STATES.PLAYING);
                this.startStallMonitor(player, item, currentSessionId, rawCandidateUrl, engineName);
            };
            this._addCandidateListener(player, 'playing', onFirstPlaying);
        };

        const S = this._strategies();
        const ctx = { url, rawCandidateUrl, item, isLive, session, profile, armStallMonitor };

        // 1. HLS (.m3u8) Strategy
        if (isM3u8 && (forceMseHls || typeof window.MediaSource !== 'undefined') && S.hls) {
            if (await S.hls.load(this, player, ctx)) return;
        }

        // 2. MPEG-TS (.ts) Strategy
        if (isTs && (forceMseTs || typeof window.MediaSource !== 'undefined') && S.mpegts) {
            if (await S.mpegts.load(this, player, ctx)) return;
        }

        // 3. Direct Native Video Strategy
        armStallMonitor('native');
        this.playNativeDirect(player, url, item, rawCandidateUrl, currentSessionId);
    },

    playNativeDirect(player, url, item, rawCandidateUrl, sessionId) {
        const S = this._strategies();
        if (S.native) {
            S.native.load(this, player, {
                url,
                item,
                rawCandidateUrl,
                session: player._session || { id: sessionId }
            });
        }
    },

    tryNextCandidate(player, item, fromSessionId) {
        if (!player) return;
        if (fromSessionId !== undefined && fromSessionId !== player._loadSessionId) {
            return;
        }
        if (!player.visible || player.currentItem !== item) return;

        player.currentCandidateIndex++;
        if (player.currentCandidateIndex < player.currentCandidates.length) {
            const nextUrl = player.currentCandidates[player.currentCandidateIndex];
            this.loadCandidate(player, nextUrl, item);
        } else {
            // Last-resort fallback on Samsung Tizen TVs: try hardware webapis.avplay
            if (!player._avplayTried && this.isTizenAvPlayAvailable()) {
                player._avplayTried = true;
                const rawUrl = item && (item.url || item.hlsUrl || item.fallbackUrl);
                if (rawUrl) {
                    console.log('[PlaybackEngine] Falling back to Samsung Tizen AVPlay hardware decoder:', rawUrl);
                    const avSession = this._createSession(player);
                    avSession.engine = 'avplay';
                    this.setState(player, this.STATES.LOADING);
                    if (this.playTizenAvPlay(player, rawUrl, item, avSession.id)) {
                        return;
                    }
                }
            }

            if (player._initialSeekAttempted) {
                console.warn('[PlaybackEngine] Seeking to resume position failed across all candidates. Playing from beginning.');
                player._initialSeekAttempted = false;
                player._initialSeekPending = null;
                player.currentCandidateIndex = 0;
                if (window.IPTV.EventBus) {
                    window.IPTV.EventBus.toast('Cannot seek on this stream. Playing from beginning.', 4000);
                }
                this.loadCandidate(player, player.currentCandidates[0], item);
                return;
            }

            this.setState(player, this.STATES.ERROR);
            console.error('[PlaybackEngine] All stream candidates failed for:', item ? item.name : 'Unknown');
            if (window.IPTV.EventBus) {
                window.IPTV.EventBus.toast('Unable to play stream. Server unreachable or format unsupported.');
            }
        }
    }
};
