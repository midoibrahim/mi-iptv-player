/* ============================================================
   IPTV Player — Multi-Stage Playback Engine
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
            const hasVideoData = player.video && (player.video.readyState >= 2 || player.video.currentTime > 0);
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
            console.error('[PlaybackEngine] All stream candidates failed for:', item ? item.name : 'Unknown');
            if (window.IPTV.EventBus) {
                window.IPTV.EventBus.toast('Unable to play stream. Server unreachable or format unsupported.');
            }
        }
    }
};

