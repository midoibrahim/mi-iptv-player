/* ============================================================
   IPTV Player — Playback Engine Strategies (Strategy Pattern)
   Uniform Liskov-substitutable transport adapters for:
   - HlsStrategy (Hls.js MSE)
   - MpegTsStrategy (mpegts.js MSE)
   - NativeVideoStrategy (HTML5 <video>)
   - TizenAvPlayStrategy (Samsung Tizen hardware webapis.avplay)
   ============================================================ */

window.IPTV = window.IPTV || {};

(function () {
    const html5Transport = {
        getCurrentTime(player) {
            return (player && player.video && player.video.currentTime) ? player.video.currentTime : 0;
        },

        getDuration(player) {
            return (player && player.video && player.video.duration) ? player.video.duration : 0;
        },

        isPaused(player) {
            return Boolean(player && player.video && player.video.paused);
        },

        canSeek(player) {
            if (!player || !player.video) return false;
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

        play(player) {
            if (!player || !player.video) return;
            const p = player.video.play();
            if (p && typeof p.catch === 'function') {
                p.catch(e => console.warn('Play blocked:', e));
            }
        },

        pause(player) {
            if (!player || !player.video) return;
            player.video.pause();
        },

        seekTo(player, clamped, startPlaying) {
            if (!player || !player.video) return;
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

        suspend(player) {
            if (player.hls && typeof player.hls.stopLoad === 'function') {
                try { player.hls.stopLoad(); } catch (e) {}
            }
            if (player.video) {
                try { player.video.pause(); } catch (e) {}
            }
        },

        restore(player, shouldResume) {
            if (!shouldResume) return;
            if (player.hls && typeof player.hls.startLoad === 'function') {
                try { player.hls.startLoad(); } catch (e) {}
            }
            this.play(player);
            if (typeof player._updatePlayPauseIcon === 'function') {
                player._updatePlayPauseIcon(true);
            }
        }
    };

    const HlsStrategy = Object.assign({
        name: 'hls',

        async load(engine, player, ctx) {
            const { url, rawCandidateUrl, item, session, profile, armStallMonitor } = ctx;
            const currentSessionId = session.id;

            if (!window.Hls) {
                await engine.loadScriptOnce('js/hls.min.js');
                if (player._loadSessionId !== currentSessionId) return true;
            }
            if (!window.Hls || !Hls.isSupported()) return false;

            try {
                const hlsConfig = {
                    enableWorker: profile.enableWorker,
                    lowLatencyMode: false,
                    maxBufferLength: profile.hlsMaxBufferLength,
                    maxMaxBufferLength: profile.hlsMaxMaxBufferLength,
                    maxBufferSize: profile.hlsMaxBufferSize,
                    backBufferLength: profile.hlsBackBufferLength,
                    liveBackBufferLength: profile.hlsLiveBackBufferLength,
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

                const hls = new Hls(hlsConfig);
                player.hls = hls;
                session.strategy = HlsStrategy;
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
                    session.hlsNetRetries = 0;
                });

                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (player._loadSessionId !== currentSessionId) return;
                    if (!data.fatal) return;

                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && session.started && session.hlsNetRetries < 4) {
                        session.hlsNetRetries++;
                        engine.setState(player, 'RECOVERING');
                        const delay = 500 * session.hlsNetRetries;
                        console.warn(`[PlaybackEngine] HLS network error (${data.details}), resuming load in ${delay}ms (${session.hlsNetRetries}/4)`);
                        clearTimeout(session.timers.reconnect);
                        const recId = setTimeout(() => {
                            if (player._loadSessionId !== currentSessionId || player.hls !== hls) return;
                            try { hls.startLoad(); } catch (err) { engine.tryNextCandidate(player, item, currentSessionId); }
                        }, delay);
                        session.timers.reconnect = recId;
                        player._reconnectTimer = recId;
                        return;
                    }

                    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && typeof hls.recoverMediaError === 'function') {
                        if (!session.hlsMediaRecovered) {
                            session.hlsMediaRecovered = true;
                            engine.setState(player, 'RECOVERING');
                            console.warn('[PlaybackEngine] HLS media error, attempting in-place recovery:', data.details);
                            try { hls.recoverMediaError(); return; } catch (err) {}
                        } else if (!session.hlsCodecSwapped && typeof hls.swapAudioCodec === 'function') {
                            session.hlsCodecSwapped = true;
                            engine.setState(player, 'RECOVERING');
                            console.warn('[PlaybackEngine] HLS media error persists, swapping audio codec and recovering');
                            try { hls.swapAudioCodec(); hls.recoverMediaError(); return; } catch (err) {}
                        }
                    }

                    console.warn('[PlaybackEngine] HLS fatal error:', data.type, data.details);
                    engine.tryNextCandidate(player, item, currentSessionId);
                });
                return true;
            } catch (e) {
                console.warn('[PlaybackEngine] Hls.js init failed, falling back to native:', e);
                return false;
            }
        },

        destroy(player) {
            if (player && player.hls) {
                try { player.hls.destroy(); } catch (e) {}
                player.hls = null;
            }
        }
    }, html5Transport);

    const MpegTsStrategy = Object.assign({
        name: 'mpegts',

        async load(engine, player, ctx) {
            const { url, rawCandidateUrl, item, isLive, session, profile, armStallMonitor } = ctx;
            const currentSessionId = session.id;

            if (!window.mpegts) {
                await engine.loadScriptOnce('js/mpegts.js');
                if (player._loadSessionId !== currentSessionId) return true;
            }
            if (!window.mpegts || !mpegts.isSupported()) return false;

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
                    liveBufferLatencyChasing: isLive,
                    liveBufferLatencyMaxLatency: profile.mpegtsLiveMaxLatency,
                    liveBufferLatencyMinRemain: profile.mpegtsLiveMinRemain,
                    seekType: isLive ? 'range' : 'param'
                });
                player.mpegtsPlayer = tsPlayer;
                session.strategy = MpegTsStrategy;
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
                engine._addCandidateListener(player, 'playing', onMsePlaying);
                engine._addCandidateListener(player, 'loadeddata', onMsePlaying);
                armStallMonitor('mpegts');

                const reconnectLiveTs = (reason) => {
                    if (player._loadSessionId !== currentSessionId || player.mpegtsPlayer !== tsPlayer) return false;
                    if (!isLive || !session.started || session.tsReconnects >= 5) return false;
                    session.tsReconnects++;
                    engine.setState(player, 'RECOVERING');
                    const delay = 300 * session.tsReconnects;
                    console.warn(`[PlaybackEngine] Live TS ${reason}, reconnecting in place in ${delay}ms (${session.tsReconnects}/5)`);
                    clearTimeout(session.timers.reconnect);
                    const recId = setTimeout(() => {
                        if (player._loadSessionId !== currentSessionId || player.mpegtsPlayer !== tsPlayer) return;
                        try {
                            tsPlayer.unload();
                            tsPlayer.load();
                            const rp = tsPlayer.play();
                            if (rp && typeof rp.catch === 'function') rp.catch(() => {});
                        } catch (err) {
                            engine.tryNextCandidate(player, item, currentSessionId);
                        }
                    }, delay);
                    session.timers.reconnect = recId;
                    player._reconnectTimer = recId;
                    return true;
                };

                engine._addCandidateListener(player, 'playing', () => {
                    if (player._loadSessionId !== currentSessionId) return;
                    clearTimeout(session.timers.tsHealthy);
                    const healthyId = setTimeout(() => {
                        if (player._loadSessionId === currentSessionId) session.tsReconnects = 0;
                    }, 30000);
                    session.timers.tsHealthy = healthyId;
                    player._tsHealthyTimer = healthyId;
                });

                if (mpegts.Events.LOADING_COMPLETE) {
                    tsPlayer.on(mpegts.Events.LOADING_COMPLETE, () => {
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
                    engine.tryNextCandidate(player, item, currentSessionId);
                });
                return true;
            } catch (e) {
                console.warn('[PlaybackEngine] mpegts init error:', e);
                return false;
            }
        },

        destroy(player) {
            if (player && player.mpegtsPlayer) {
                try {
                    player.mpegtsPlayer.pause();
                    player.mpegtsPlayer.unload();
                    player.mpegtsPlayer.detachMediaElement();
                    player.mpegtsPlayer.destroy();
                } catch (e) {}
                player.mpegtsPlayer = null;
            }
        }
    }, html5Transport);

    const NativeVideoStrategy = Object.assign({
        name: 'native',

        load(engine, player, ctx) {
            const { url, item, rawCandidateUrl, session } = ctx;
            const sessionId = session ? session.id : player._loadSessionId;
            if (!player || !player.video) return false;

            if (session) session.strategy = NativeVideoStrategy;

            while (player.video.firstChild) {
                player.video.removeChild(player.video.firstChild);
            }

            const onPlaying = () => {
                if (player._loadSessionId !== sessionId) return;
                if (player._initialSeekPending !== null || (player.video && player.video.seeking)) {
                    return;
                }
                player._markCandidateSuccess(rawCandidateUrl || url);
                player.video.removeEventListener('playing', onPlaying);
                player.video.removeEventListener('loadeddata', onPlaying);
            };
            engine._addCandidateListener(player, 'playing', onPlaying);
            engine._addCandidateListener(player, 'loadeddata', onPlaying);

            const onSeeked = () => {
                if (player._loadSessionId !== sessionId) return;
                if (!player.video || player.video.seeking || player._initialSeekPending !== null) return;
                player._markCandidateSuccess(rawCandidateUrl || url);
                player.video.removeEventListener('seeked', onSeeked);
            };
            engine._addCandidateListener(player, 'seeked', onSeeked);

            player.video.onerror = () => {
                if (player._loadSessionId !== sessionId) return;
                player.video.removeEventListener('playing', onPlaying);
                player.video.removeEventListener('loadeddata', onPlaying);
                player.video.removeEventListener('seeked', onSeeked);
                player.video.onerror = null;
                const err = player.video.error;
                console.warn('[PlaybackEngine] Native video error:', err ? err.code : 'unknown', 'on URL:', url);
                engine.tryNextCandidate(player, item, sessionId);
            };

            player.video.src = url;
            player.video.load();

            const p = player.video.play();
            if (p && typeof p.catch === 'function') {
                p.catch(e => {
                    console.warn('[PlaybackEngine] Native play error:', e);
                });
            }
            return true;
        },

        destroy() {}
    }, html5Transport);

    const TizenAvPlayStrategy = {
        name: 'avplay',

        isAvailable() {
            return !!(
                window.IPTV.Platform &&
                window.IPTV.Platform.isTizen() &&
                window.webapis &&
                window.webapis.avplay &&
                typeof window.webapis.avplay.open === 'function'
            );
        },

        getCurrentTime(player) {
            return (player && player._avplayCurrentTime) || 0;
        },

        getDuration(player) {
            return (player && player._avplayDuration) || 0;
        },

        isPaused(player) {
            return Boolean(player && player._avplayPaused);
        },

        canSeek() {
            return true;
        },

        play(player) {
            if (!window.webapis || !window.webapis.avplay) return;
            try {
                window.webapis.avplay.play();
                player._avplayPaused = false;
            } catch (e) {}
        },

        pause(player) {
            if (!window.webapis || !window.webapis.avplay) return;
            try {
                window.webapis.avplay.pause();
                player._avplayPaused = true;
            } catch (e) {}
            if (typeof player._recordWatchProgress === 'function') {
                player._recordWatchProgress();
            }
        },

        seekTo(player, clamped, startPlaying) {
            if (!window.webapis || !window.webapis.avplay) return;
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
        },

        suspend(player) {
            if (!window.webapis || !window.webapis.avplay) return;
            try {
                if (typeof window.webapis.avplay.suspend === 'function') {
                    window.webapis.avplay.suspend();
                } else if (typeof window.webapis.avplay.pause === 'function') {
                    window.webapis.avplay.pause();
                }
                player._avplayPaused = true;
            } catch (e) {}
        },

        restore(player, shouldResume) {
            if (!window.webapis || !window.webapis.avplay) return;
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
        },

        load(engine, player, url, item, sessionId) {
            if (!player || !this.isAvailable()) return false;
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
                if (player._session) player._session.strategy = TizenAvPlayStrategy;
                document.body.classList.add('avplay-active');
                if (player.video) {
                    player.video.style.visibility = 'hidden';
                }

                const isLive = player.isLiveStream();
                engine.startWatchdog(player, item, sessionId, isLive ? 10000 : 15000);

                avplay.open(url);
                try { avplay.setDisplayRect(0, 0, 1920, 1080); } catch (e) {}
                try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) {}

                avplay.setListener({
                    onbufferingstart: () => {},
                    onbufferingprogress: () => {},
                    onbufferingcomplete: () => {
                        if (player._loadSessionId !== sessionId) return;
                        engine.clearWatchdog(player);
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
                        this.destroy(player);
                        engine.setState(player, 'ERROR');
                        if (window.IPTV.EventBus) {
                            window.IPTV.EventBus.toast('Unable to play stream. Server unreachable or format unsupported.');
                        }
                    }
                });

                avplay.prepareAsync(() => {
                    if (player._loadSessionId !== sessionId || !player._avplayActive) return;
                    engine.clearWatchdog(player);
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
                        engine.setState(player, 'PLAYING');
                        player._updatePlayPauseIcon(true);
                        player._checkPendingInitialSeek();
                    } catch (playErr) {
                        console.warn('[PlaybackEngine] AVPlay play() failed:', playErr);
                    }
                }, (prepErr) => {
                    if (player._loadSessionId !== sessionId || !player._avplayActive) return;
                    console.warn('[PlaybackEngine] AVPlay prepareAsync failed:', prepErr);
                    this.destroy(player);
                    engine.setState(player, 'ERROR');
                    if (window.IPTV.EventBus) {
                        window.IPTV.EventBus.toast('Unable to play stream. Server unreachable or format unsupported.');
                    }
                });

                return true;
            } catch (err) {
                console.warn('[PlaybackEngine] Tizen AVPlay exception:', err);
                this.destroy(player);
                return false;
            }
        },

        destroy(player) {
            if (!player) return;
            player._avplayActive = false;
            player._avplayPaused = false;
            player._avplayCurrentTime = 0;
            player._avplayDuration = 0;
            if (window.webapis && window.webapis.avplay) {
                try { window.webapis.avplay.stop(); } catch (e) {}
                try { window.webapis.avplay.close(); } catch (e) {}
            }
            if (typeof document !== 'undefined' && document.body && document.body.classList) {
                document.body.classList.remove('avplay-active');
            }
            if (player.video && player.video.style) {
                player.video.style.visibility = '';
            }
        }
    };

    window.IPTV.PlaybackStrategies = {
        hls: HlsStrategy,
        mpegts: MpegTsStrategy,
        native: NativeVideoStrategy,
        avplay: TizenAvPlayStrategy
    };
})();
