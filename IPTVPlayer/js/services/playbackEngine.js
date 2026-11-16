/* ============================================================
   IPTV Player â€” Multi-Stage Playback Engine
   Manages <video>, Hls.js MSE, mpegts.js MSE, candidate
   watchdog timers, and automatic fallback sequencing.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.PlaybackEngine = {
    _scriptPromises: {},

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
                hlsMaxBufferLength: 30,
                hlsMaxMaxBufferLength: 60,
                hlsMaxBufferSize: 30 * 1000 * 1000,
                hlsBackBufferLength: 15,
                hlsLiveBackBufferLength: 10,
                hlsCapLevelToPlayerSize: true,
                mpegtsLazyLoad: false,
                // ~384KB (mpegts.js documented default). Larger initial stashes delay first
                // frame AND every in-place reconnect, because data is only dispatched once full.
                mpegtsStashInitialSize: 384 * 1024,
                mpegtsAutoCleanup: true,
                mpegtsAutoCleanupMaxBackward: 25,
                mpegtsAutoCleanupMinBackward: 12
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
            mpegtsAutoCleanupMinBackward: 30
        };
    },

    getCurrentTime(player) {
        if (player._avplayActive) return player._avplayCurrentTime || 0;
        return (player.video && player.video.currentTime) ? player.video.currentTime : 0;
    },

    getDuration(player) {
        if (player._avplayActive) return player._avplayDuration || 0;
        return (player.video && player.video.duration) ? player.video.duration : 0;
    },

    isPaused(player) {
        if (player._avplayActive) return !!player._avplayPaused;
        return Boolean(player.video && player.video.paused);
    },

    play(player) {
        if (!player || !player.video) return;
        player._userPaused = false;
        if (player._avplayActive && window.webapis && window.webapis.avplay) {
            try {
                window.webapis.avplay.play();
                player._avplayPaused = false;
            } catch (e) {}
        } else {
            const p = player.video.play();
            if (p && typeof p.catch === 'function') {
                p.catch(e => console.warn('Play blocked:', e));
            }
        }
        player._updatePlayPauseIcon(true);
    },

    pause(player) {
        if (!player || !player.video) return;
        player._userPaused = true;
        if (player._avplayActive && window.webapis && window.webapis.avplay) {
            try {
                window.webapis.avplay.pause();
                player._avplayPaused = true;
            } catch (e) {}
            player._recordWatchProgress();
        } else {
            player.video.pause();
        }
        player._updatePlayPauseIcon(false);
    },

    canSeek(player) {
        if (!player || !player.video || player.isLiveStream()) return false;
        if (!player.hasValidDuration()) return false;
        if (player._avplayActive) return true;
        try {
            const seekable = player.video.seekable;
            if (!seekable || seekable.length === 0) {
                return player.hasValidDuration() && player.video.duration > 0;
            }
            return seekable.end(seekable.length - 1) > 0;
        } catch (e) {
            return false;
        }
    },

    seekTo(player, clamped, startPlaying = true) {
        if (player._avplayActive && window.webapis && window.webapis.avplay) {
            try {
                window.webapis.avplay.seekTo(Math.floor(clamped * 1000), () => {
                    player._avplayCurrentTime = clamped;
                    if (startPlaying) {
                        player._userPaused = false;
                        player._avplayPaused = false;
                        try { window.webapis.avplay.play(); } catch (e) {}
                        player._updatePlayPauseIcon(true);
                    }
                    player._updateProgress();
                }, () => {});
            } catch (err) {
                console.warn('[PlayerService] AVPlay seek error:', err);
            }
            return;
        }

        if (player.hls && typeof player.hls.startLoad === 'function') {
            try { player.hls.startLoad(clamped); } catch (e) {}
        }

        try {
            player.video.currentTime = clamped;
        } catch (err) {
            console.warn('[PlayerService] Seek error:', err);
        }

        if (startPlaying) {
            player._userPaused = false;
        }

        const ensurePlaying = () => {
            if (!player._userPaused) {
                const p = player.video.play();
                if (p && typeof p.then === 'function') {
                    p.catch(e => console.warn('[PlayerService] Play after seek caught:', e));
                }
                player._updatePlayPauseIcon(true);
            }
        };

        if (player._onSeekedHandler) {
            try { player.video.removeEventListener('seeked', player._onSeekedHandler); } catch (e) {}
            player._onSeekedHandler = null;
        }

        const onSeeked = () => {
            player.video.removeEventListener('seeked', onSeeked);
            if (player._onSeekedHandler === onSeeked) {
                player._onSeekedHandler = null;
            }
            ensurePlaying();
            player._updateProgress();
        };
        player._onSeekedHandler = onSeeked;
        player.video.addEventListener('seeked', onSeeked);

        if (!player.video.seeking) {
            ensurePlaying();
        }
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

        if (player._avplayActive && window.webapis && window.webapis.avplay) {
            try {
                if (typeof window.webapis.avplay.suspend === 'function') {
                    window.webapis.avplay.suspend();
                } else if (typeof window.webapis.avplay.pause === 'function') {
                    window.webapis.avplay.pause();
                }
                player._avplayPaused = true;
            } catch (e) {}
            return;
        }

        if (player.hls && typeof player.hls.stopLoad === 'function') {
            try { player.hls.stopLoad(); } catch (e) {}
        }
        if (player.video) {
            try { player.video.pause(); } catch (e) {}
        }
    },

    restore(player) {
        if (!player || !player.visible) return;
        const shouldResume = Boolean(player._wasPlayingBeforeHidden && !player._userPaused);
        player._wasPlayingBeforeHidden = false;

        if (player._avplayActive && window.webapis && window.webapis.avplay) {
            try {
                if (typeof window.webapis.avplay.restore === 'function') {
                    window.webapis.avplay.restore();
                }
                if (shouldResume) {
                    if (typeof window.webapis.avplay.play === 'function') {
                        window.webapis.avplay.play();
                    }
                    player._avplayPaused = false;
                    if (typeof player._updatePlayPauseIcon === 'function') {
                        player._updatePlayPauseIcon(true);
                    }
                }
            } catch (e) {}
            return;
        }

        if (shouldResume) {
            if (player.hls && typeof player.hls.startLoad === 'function') {
                try { player.hls.startLoad(); } catch (e) {}
            }
            this.play(player);
        }
    },

    clearWatchdog(player) {
        if (player && player._candidateWatchdog) {
            clearTimeout(player._candidateWatchdog);
            player._candidateWatchdog = null;
        }
    },

    stopStallMonitor(player) {
        if (player && player._stallTimer) {
            clearInterval(player._stallTimer);
            player._stallTimer = null;
        }
        if (player && player._reconnectTimer) {
            clearTimeout(player._reconnectTimer);
            player._reconnectTimer = null;
        }
        if (player && player._tsHealthyTimer) {
            clearTimeout(player._tsHealthyTimer);
            player._tsHealthyTimer = null;
        }
    },

    /**
     * Playback stall monitor (runs after the first frame has rendered).
     * - mpegts.js / native: jumps small buffered gaps (timestamp discontinuities are common
     *   on IPTV TS streams and mpegts.js has no built-in gap controller) and nudges stuck decoders.
     *   Hls.js has its own GapController, so gap handling is skipped for it.
     * - Live (all engines): if the picture is frozen for 10s with nothing buffered, reloads
     *   the same candidate in place (up to 3 times) before falling back to the next candidate.
     */
    startStallMonitor(player, item, sessionId, rawCandidateUrl, engine) {
        if (player && player._stallTimer) {
            clearInterval(player._stallTimer);
            player._stallTimer = null;
        }
        if (!player || !player.video) return;
        const isLive = player.isLiveStream();
        let lastTime = -1;
        let stuckSince = 0;

        player._stallTimer = setInterval(() => {
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
                    player.currentCandidateIndex = Math.max(0, player.currentCandidateIndex);
                    this.loadCandidate(player, rawCandidateUrl, item);
                } else {
                    console.warn('[PlaybackEngine] Live stream repeatedly frozen, trying next candidate');
                    player._liveReloads = 0;
                    this.tryNextCandidate(player, item, sessionId);
                }
            }
        }, 500);
    },

    startWatchdog(player, item, sessionId, timeoutMs = 8500) {
        this.clearWatchdog(player);
        player._candidateWatchdog = setTimeout(() => {
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
        if (player.hls) {
            try { player.hls.destroy(); } catch (e) {}
            player.hls = null;
        }
        if (player.mpegtsPlayer) {
            try {
                player.mpegtsPlayer.pause();
                player.mpegtsPlayer.unload();
                player.mpegtsPlayer.detachMediaElement();
                player.mpegtsPlayer.destroy();
            } catch (e) {}
            player.mpegtsPlayer = null;
        }
        if (player._avplayActive) {
            this.destroyTizenAvPlay(player);
        }
    },

    isTizenAvPlayAvailable() {
        return !!(
            window.IPTV.Platform &&
            window.IPTV.Platform.isTizen() &&
            window.webapis &&
            window.webapis.avplay &&
            typeof window.webapis.avplay.open === 'function'
        );
    },

    destroyTizenAvPlay(player) {
        if (!player) return;
        player._avplayActive = false;
        player._avplayPaused = false;
        player._avplayCurrentTime = 0;
        player._avplayDuration = 0;
        if (window.webapis && window.webapis.avplay) {
            try { window.webapis.avplay.stop(); } catch (e) {}
            try { window.webapis.avplay.close(); } catch (e) {}
        }
        document.body.classList.remove('avplay-active');
        if (player.video) {
            player.video.style.visibility = '';
        }
    },

    playTizenAvPlay(player, url, item, sessionId) {
        if (!player || !this.isTizenAvPlayAvailable()) return false;
        try {
            const avplay = window.webapis.avplay;
            let avObj = document.getElementById('av-player');
            if (!avObj && player.playerScreen) {
                avObj = document.createElement('object');
                avObj.id = 'av-player';
                avObj.setAttribute('type', 'application/avplayer');
                avObj.style.cssText = 'position:absolute;top:0;left:0;width:1920px;height:1080px;z-index:1;pointer-events:none;';
                player.playerScreen.insertBefore(avObj, player.playerScreen.firstChild);
            }

            try { avplay.stop(); } catch (e) {}
            try { avplay.close(); } catch (e) {}

            player._avplayActive = true;
            player._avplayPaused = false;
            player._avplayCurrentTime = 0;
            player._avplayDuration = 0;
            document.body.classList.add('avplay-active');
            if (player.video) {
                player.video.style.visibility = 'hidden';
            }

            const isLive = player.isLiveStream();
            this.startWatchdog(player, item, sessionId, isLive ? 10000 : 15000);

            avplay.open(url);
            try { avplay.setDisplayRect(0, 0, 1920, 1080); } catch (e) {}
            try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) {}

            avplay.setListener({
                onbufferingstart: () => {},
                onbufferingprogress: () => {},
                onbufferingcomplete: () => {
                    if (player._loadSessionId !== sessionId) return;
                    this.clearWatchdog(player);
                },
                oncurrentplaytime: (currentTimeMs) => {
                    if (player._loadSessionId !== sessionId || !player._avplayActive) return;
                    player._avplayCurrentTime = (currentTimeMs || 0) / 1000;
                    if (!player._avplayDuration && !isLive) {
                        try {
                            const durMs = avplay.getDuration();
                            if (durMs > 0) player._avplayDuration = durMs / 1000;
                        } catch (e) {}
                    }
                    player._updateProgress();
                },
                onstreamcompleted: () => {
                    if (player._loadSessionId !== sessionId || !player._avplayActive) return;
                    try { avplay.stop(); } catch (e) {}
                    player._recordWatchProgress(true);
                    if (player.currentItem && player.currentItem.type === 'series') {
                        const settings = window.IPTV.Storage ? window.IPTV.Storage.getSettings() : null;
                        const autoplay = !settings || settings.autoplay !== false;
                        if (autoplay && player.hasNextEpisode()) {
                            player.nextEpisode();
                        }
                    }
                },
                onerror: (eventType) => {
                    if (player._loadSessionId !== sessionId || !player._avplayActive) return;
                    console.warn('[PlaybackEngine] Tizen AVPlay error:', eventType);
                    this.destroyTizenAvPlay(player);
                    if (window.IPTV.EventBus) {
                        window.IPTV.EventBus.toast('Unable to play stream. Server unreachable or format unsupported.');
                    }
                }
            });

            avplay.prepareAsync(() => {
                if (player._loadSessionId !== sessionId || !player._avplayActive) return;
                this.clearWatchdog(player);
                player._markCandidateSuccess(url);
                if (!isLive) {
                    try {
                        const durMs = avplay.getDuration();
                        if (durMs > 0) player._avplayDuration = durMs / 1000;
                    } catch (e) {}
                }
                try {
                    avplay.play();
                    player._avplayPaused = false;
                    player._updatePlayPauseIcon(true);
                    player._checkPendingInitialSeek();
                } catch (playErr) {
                    console.warn('[PlaybackEngine] AVPlay play() failed:', playErr);
                }
            }, (prepErr) => {
                if (player._loadSessionId !== sessionId || !player._avplayActive) return;
                console.warn('[PlaybackEngine] AVPlay prepareAsync failed:', prepErr);
                this.destroyTizenAvPlay(player);
                if (window.IPTV.EventBus) {
                    window.IPTV.EventBus.toast('Unable to play stream. Server unreachable or format unsupported.');
                }
            });

            return true;
        } catch (err) {
            console.warn('[PlaybackEngine] Tizen AVPlay exception:', err);
            this.destroyTizenAvPlay(player);
            return false;
        }
    },

    async loadCandidate(player, rawCandidateUrl, item) {
        this.destroy(player);
        if (!player || !player.video) return;

        player._loadSessionId = (player._loadSessionId || 0) + 1;
        const currentSessionId = player._loadSessionId;

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

        // Per-item resilience counters (survive in-place reloads of the same item)
        if (player._resilienceItem !== item) {
            player._resilienceItem = item;
            player._liveReloads = 0;
        }
        player._streamStarted = false;
        player._hlsNetRetries = 0;
        player._tsReconnects = 0;

        this.startWatchdog(player, item, currentSessionId, isLive ? 7000 : 12000);

        const profile = this.getEngineProfile();

        // Arms the stall monitor once the first frame actually renders
        const armStallMonitor = (engine) => {
            const onFirstPlaying = () => {
                if (player._loadSessionId !== currentSessionId) return;
                player.video.removeEventListener('playing', onFirstPlaying);
                player._streamStarted = true;
                this.startStallMonitor(player, item, currentSessionId, rawCandidateUrl, engine);
            };
            this._addCandidateListener(player, 'playing', onFirstPlaying);
        };

        // 1. HLS (.m3u8) streams via Hls.js MSE
        if (isM3u8 && (forceMseHls || typeof window.MediaSource !== 'undefined')) {
            if (!window.Hls) {
                await this.loadScriptOnce('js/hls.min.js');
                if (player._loadSessionId !== currentSessionId) return;
            }
            if (window.Hls && Hls.isSupported()) {
                try {
                    const hlsConfig = {
                        enableWorker: profile.enableWorker,
                        lowLatencyMode: false,
                        maxBufferLength: profile.hlsMaxBufferLength,
                        maxMaxBufferLength: profile.hlsMaxMaxBufferLength,
                        maxBufferSize: profile.hlsMaxBufferSize,
                        backBufferLength: profile.hlsBackBufferLength,
                        liveBackBufferLength: profile.hlsLiveBackBufferLength,
                        // Smoothness / resilience tuning for IPTV providers
                        maxBufferHole: 0.5,
                        nudgeMaxRetry: 6,
                        startFragPrefetch: true,
                        capLevelToPlayerSize: profile.hlsCapLevelToPlayerSize,
                        liveSyncDurationCount: 3,
                        liveMaxLatencyDurationCount: 10,
                        manifestLoadingMaxRetry: 2,
                        levelLoadingMaxRetry: 4,
                        fragLoadingMaxRetry: 6
                    };
                    if (player._initialSeekPending !== null && player._initialSeekPending > 0) {
                        hlsConfig.startPosition = player._initialSeekPending;
                    }
                    player._hlsMediaRecovered = false;
                    player._hlsCodecSwapped = false;
                    const hls = new Hls(hlsConfig);
                    player.hls = hls;
                    hls.loadSource(url);
                    hls.attachMedia(player.video);
                    armStallMonitor('hls');

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (player._loadSessionId !== currentSessionId) return;
                        player._markCandidateSuccess(rawCandidateUrl);
                        const p = player.video.play();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    });

                    hls.on(Hls.Events.FRAG_BUFFERED, () => {
                        if (player._loadSessionId !== currentSessionId) return;
                        player._hlsNetRetries = 0;
                    });

                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (player._loadSessionId !== currentSessionId) return;
                        if (!data.fatal) return;

                        // Network hiccup after playback started: resume loading in place instead of
                        // tearing down and restarting the whole candidate chain (= long black "loading").
                        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && player._streamStarted && player._hlsNetRetries < 4) {
                            player._hlsNetRetries++;
                            const delay = 500 * player._hlsNetRetries;
                            console.warn(`[PlaybackEngine] HLS network error (${data.details}), resuming load in ${delay}ms (${player._hlsNetRetries}/4)`);
                            clearTimeout(player._reconnectTimer);
                            player._reconnectTimer = setTimeout(() => {
                                if (player._loadSessionId !== currentSessionId || player.hls !== hls) return;
                                try { hls.startLoad(); } catch (err) { this.tryNextCandidate(player, item, currentSessionId); }
                            }, delay);
                            return;
                        }

                        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && typeof hls.recoverMediaError === 'function') {
                            if (!player._hlsMediaRecovered) {
                                player._hlsMediaRecovered = true;
                                console.warn('[PlaybackEngine] HLS media error, attempting in-place recovery:', data.details);
                                try { hls.recoverMediaError(); return; } catch (err) {}
                            } else if (!player._hlsCodecSwapped && typeof hls.swapAudioCodec === 'function') {
                                player._hlsCodecSwapped = true;
                                console.warn('[PlaybackEngine] HLS media error persists, swapping audio codec and recovering');
                                try { hls.swapAudioCodec(); hls.recoverMediaError(); return; } catch (err) {}
                            }
                        }

                        console.warn('[PlaybackEngine] HLS fatal error:', data.type, data.details);
                        this.tryNextCandidate(player, item, currentSessionId);
                    });
                    return;
                } catch (e) {
                    console.warn('[PlaybackEngine] Hls.js init failed, falling back to native:', e);
                }
            }
        }

        // 2. MPEG-TS (.ts) streams via mpegts.js MSE
        if (isTs && (forceMseTs || typeof window.MediaSource !== 'undefined')) {
            if (!window.mpegts) {
                await this.loadScriptOnce('js/mpegts.js');
                if (player._loadSessionId !== currentSessionId) return;
            }
            if (window.mpegts && mpegts.isSupported()) {
                try {
                    const tsPlayer = mpegts.createPlayer({
                        type: 'mse',
                        isLive: isLive,
                        url: url
                    }, {
                        enableWorker: profile.enableWorker,
                        enableStashBuffer: true,
                        stashInitialSize: profile.mpegtsStashInitialSize,
                        lazyLoad: profile.mpegtsLazyLoad,
                        autoCleanupSourceBuffer: profile.mpegtsAutoCleanup,
                        autoCleanupMaxBackwardDuration: profile.mpegtsAutoCleanupMaxBackward,
                        autoCleanupMinBackwardDuration: profile.mpegtsAutoCleanupMinBackward,
                        seekType: isLive ? 'range' : 'param'
                    });
                    player.mpegtsPlayer = tsPlayer;
                    tsPlayer.attachMediaElement(player.video);
                    tsPlayer.load();
                    const p = tsPlayer.play();
                    if (p && typeof p.catch === 'function') p.catch(() => {});

                    const onMsePlaying = () => {
                        if (player._loadSessionId !== currentSessionId) return;
                        player._markCandidateSuccess(rawCandidateUrl);
                        player.video.removeEventListener('playing', onMsePlaying);
                        player.video.removeEventListener('loadeddata', onMsePlaying);
                    };
                    this._addCandidateListener(player, 'playing', onMsePlaying);
                    this._addCandidateListener(player, 'loadeddata', onMsePlaying);
                    armStallMonitor('mpegts');

                    // Live TS: providers routinely drop/close the HTTP connection. Reconnect the
                    // same player in place (fast) instead of restarting the whole candidate chain.
                    const reconnectLiveTs = (reason) => {
                        if (player._loadSessionId !== currentSessionId || player.mpegtsPlayer !== tsPlayer) return false;
                        if (!isLive || !player._streamStarted || player._tsReconnects >= 5) return false;
                        player._tsReconnects++;
                        const delay = 300 * player._tsReconnects;
                        console.warn(`[PlaybackEngine] Live TS ${reason}, reconnecting in place in ${delay}ms (${player._tsReconnects}/5)`);
                        clearTimeout(player._reconnectTimer);
                        player._reconnectTimer = setTimeout(() => {
                            if (player._loadSessionId !== currentSessionId || player.mpegtsPlayer !== tsPlayer) return;
                            try {
                                tsPlayer.unload();
                                tsPlayer.load();
                                const rp = tsPlayer.play();
                                if (rp && typeof rp.catch === 'function') rp.catch(() => {});
                            } catch (err) {
                                this.tryNextCandidate(player, item, currentSessionId);
                            }
                        }, delay);
                        return true;
                    };

                    // Reset the reconnect budget once playback is healthy again
                    this._addCandidateListener(player, 'playing', () => {
                        if (player._loadSessionId !== currentSessionId) return;
                        clearTimeout(player._tsHealthyTimer);
                        player._tsHealthyTimer = setTimeout(() => {
                            if (player._loadSessionId === currentSessionId) player._tsReconnects = 0;
                        }, 30000);
                    });

                    if (mpegts.Events.LOADING_COMPLETE) {
                        tsPlayer.on(mpegts.Events.LOADING_COMPLETE, () => {
                            // A live stream should never "complete"; the server closed the socket.
                            reconnectLiveTs('stream ended by server');
                        });
                    }

                    tsPlayer.on(mpegts.Events.ERROR, (errType, errDetail) => {
                        if (player._loadSessionId !== currentSessionId) return;
                        const isNetErr = mpegts.ErrorTypes && errType === mpegts.ErrorTypes.NETWORK_ERROR;
                        if (isNetErr && reconnectLiveTs(`network error (${errDetail})`)) return;
                        player.video.removeEventListener('playing', onMsePlaying);
                        player.video.removeEventListener('loadeddata', onMsePlaying);
                        console.warn('[PlaybackEngine] mpegts error:', errType, errDetail);
                        this.tryNextCandidate(player, item, currentSessionId);
                    });
                    return;
                } catch (e) {
                    console.warn('[PlaybackEngine] mpegts init error:', e);
                }
            }
        }

        // 3. Direct native hardware video playback
        armStallMonitor('native');
        this.playNativeDirect(player, url, item, rawCandidateUrl, currentSessionId);
    },

    playNativeDirect(player, url, item, rawCandidateUrl, sessionId) {
        if (!player || !player.video) return;

        while (player.video.firstChild) {
            player.video.removeChild(player.video.firstChild);
        }

        const onPlaying = () => {
            if (player._loadSessionId !== sessionId) return;
            // If an initial resume seek is still pending or the video is currently seeking,
            // wait until the seek completes and video actually renders before marking candidate success
            if (player._initialSeekPending !== null || (player.video && player.video.seeking)) {
                return;
            }
            player._markCandidateSuccess(rawCandidateUrl || url);
            player.video.removeEventListener('playing', onPlaying);
            player.video.removeEventListener('loadeddata', onPlaying);
        };
        this._addCandidateListener(player, 'playing', onPlaying);
        this._addCandidateListener(player, 'loadeddata', onPlaying);

        const onSeeked = () => {
            if (player._loadSessionId !== sessionId) return;
            if (!player.video || player.video.seeking || player._initialSeekPending !== null) return;
            player._markCandidateSuccess(rawCandidateUrl || url);
            player.video.removeEventListener('seeked', onSeeked);
        };
        this._addCandidateListener(player, 'seeked', onSeeked);

        player.video.onerror = () => {
            if (player._loadSessionId !== sessionId) return;
            player.video.removeEventListener('playing', onPlaying);
            player.video.removeEventListener('loadeddata', onPlaying);
            player.video.removeEventListener('seeked', onSeeked);
            player.video.onerror = null;
            const err = player.video.error;
            console.warn('[PlaybackEngine] Native video error:', err ? err.code : 'unknown', 'on URL:', url);
            this.tryNextCandidate(player, item, sessionId);
        };

        player.video.src = url;
        player.video.load();

        const p = player.video.play();
        if (p && typeof p.catch === 'function') {
            p.catch(e => {
                console.warn('[PlaybackEngine] Native play error:', e);
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
                    player._loadSessionId = (player._loadSessionId || 0) + 1;
                    if (this.playTizenAvPlay(player, rawUrl, item, player._loadSessionId)) {
                        return;
                    }
                }
            }

            // If an initial resume seek was attempted and failed across all candidates
            // (e.g. provider server does not support HTTP Range requests for seeking),
            // gracefully fall back to playing from the beginning (0) so the user is never stuck on a black screen!
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

            console.error('[PlaybackEngine] All stream candidates failed for:', item ? item.name : 'Unknown');
            if (window.IPTV.EventBus) {
                window.IPTV.EventBus.toast('Unable to play stream. Server unreachable or format unsupported.');
            }
        }
    }
};

