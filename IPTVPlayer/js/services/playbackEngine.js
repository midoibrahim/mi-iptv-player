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
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
        return this._scriptPromises[src];
    },

    clearWatchdog(player) {
        if (player && player._candidateWatchdog) {
            clearTimeout(player._candidateWatchdog);
            player._candidateWatchdog = null;
        }
    },

    startWatchdog(player, item, sessionId, timeoutMs = 8500) {
        this.clearWatchdog(player);
        player._candidateWatchdog = setTimeout(() => {
            if (player._loadSessionId !== sessionId) return;
            if (!player.visible || player.currentItem !== item) return;
            const hasVideoData = player._avplayActive
            ? (player._avplayCurrentTime > 0)
            : (player.video && (player.video.readyState >= 2 || player.video.currentTime > 0));
            if (!hasVideoData) {
                console.warn('[PlaybackEngine] Candidate timed out waiting for data, trying next...');
                this.tryNextCandidate(player, item, sessionId);
            }
        }, timeoutMs);
    },

    destroy(player) {
        if (!player) return;
        this.clearWatchdog(player);
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

        this.startWatchdog(player, item, currentSessionId, isLive ? 7000 : 12000);

        // 1. HLS (.m3u8) streams via Hls.js MSE
        if (isM3u8 && (forceMseHls || typeof window.MediaSource !== 'undefined')) {
            if (!window.Hls) {
                await this.loadScriptOnce('js/hls.min.js');
                if (player._loadSessionId !== currentSessionId) return;
            }
            if (window.Hls && Hls.isSupported()) {
                try {
                    const hlsConfig = {
                        enableWorker: false,
                        lowLatencyMode: false,
                        maxBufferLength: 20,
                        maxMaxBufferLength: 40,
                        maxBufferSize: 30 * 1000 * 1000
                    };
                    if (player._initialSeekPending !== null && player._initialSeekPending > 0) {
                        hlsConfig.startPosition = player._initialSeekPending;
                    }
                    const hls = new Hls(hlsConfig);
                    player.hls = hls;
                    hls.loadSource(url);
                    hls.attachMedia(player.video);

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (player._loadSessionId !== currentSessionId) return;
                        player._markCandidateSuccess(rawCandidateUrl);
                        const p = player.video.play();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    });

                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (player._loadSessionId !== currentSessionId) return;
                        if (data.fatal) {
                            console.warn('[PlaybackEngine] HLS fatal error:', data.type, data.details);
                            this.tryNextCandidate(player, item, currentSessionId);
                        }
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
                        enableWorker: false,
                        lazyLoadMaxDuration: 30,
                        lazyLoadRecoverDuration: 15,
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
                    player.video.addEventListener('playing', onMsePlaying);
                    player.video.addEventListener('loadeddata', onMsePlaying);

                    tsPlayer.on(mpegts.Events.ERROR, (errType, errDetail) => {
                        if (player._loadSessionId !== currentSessionId) return;
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
        this.playNativeDirect(player, url, item, rawCandidateUrl, currentSessionId);
    },

    playNativeDirect(player, url, item, rawCandidateUrl, sessionId) {
        if (!player || !player.video) return;

        while (player.video.firstChild) {
            player.video.removeChild(player.video.firstChild);
        }

        const onPlaying = () => {
            if (player._loadSessionId !== sessionId) return;
            player._markCandidateSuccess(rawCandidateUrl || url);
            player.video.removeEventListener('playing', onPlaying);
            player.video.removeEventListener('loadeddata', onPlaying);
        };
        player.video.addEventListener('playing', onPlaying);
        player.video.addEventListener('loadeddata', onPlaying);

        player.video.onerror = () => {
            if (player._loadSessionId !== sessionId) return;
            player.video.removeEventListener('playing', onPlaying);
            player.video.removeEventListener('loadeddata', onPlaying);
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
            console.error('[PlaybackEngine] All stream candidates failed for:', item ? item.name : 'Unknown');
            if (window.IPTV.EventBus) {
                window.IPTV.EventBus.toast('Unable to play stream. Server unreachable or format unsupported.');
            }
        }
    }
};

