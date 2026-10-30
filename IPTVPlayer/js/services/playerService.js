/* ============================================================
   IPTV Player — Video Player & HLS Streaming Engine
   Adheres to TV Navigation Architecture Media Player OSD specs
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.PlayerService = {
    init(app) {
        this.app = app;
        this.video = document.getElementById('video-player');
        this.osd = document.getElementById('player-osd');
        this.banner = document.getElementById('channel-banner');
        this.playerScreen = document.getElementById('player-screen');

        this.hls = null;
        this.mpegtsPlayer = null;
        this.currentItem = null;
        this.visible = false;
        this.osdTimeout = null;
        this.bannerTimeout = null;
        this.currentCandidates = [];
        this.currentCandidateIndex = 0;

        this._bindEvents();
    },

    _bindEvents() {
        if (!this.video) return;

        // OSD transport controls
        const backBtn = document.getElementById('player-back');
        if (backBtn) backBtn.addEventListener('click', () => this.close());

        const playPauseBtn = document.getElementById('osd-playpause');
        if (playPauseBtn) playPauseBtn.addEventListener('click', () => this.togglePlay());

        const rwBtn = document.getElementById('osd-rw');
        if (rwBtn) rwBtn.addEventListener('click', () => this.seekRelative(-10));

        const ffBtn = document.getElementById('osd-ff');
        if (ffBtn) ffBtn.addEventListener('click', () => this.seekRelative(10));

        const prevBtn = document.getElementById('osd-prev');
        if (prevBtn) prevBtn.addEventListener('click', () => this.app.prevChannel());

        const nextBtn = document.getElementById('osd-next');
        if (nextBtn) nextBtn.addEventListener('click', () => this.app.nextChannel());

        const favBtn = document.getElementById('osd-fav');
        if (favBtn) {
            favBtn.addEventListener('click', () => {
                if (this.currentItem) {
                    this.app.toggleFavorite(this.currentItem);
                    this.updateFavoriteState();
                }
            });
        }

        // Interactive Playbar Seeking (Single-commit click & smooth drag scrubbing)
        const progressBar = document.getElementById('osd-progress-bar');
        if (progressBar) {
            let isDragging = false;
            let pendingRatio = null;

            const getRatioFromEvent = (e) => {
                const rect = progressBar.getBoundingClientRect();
                const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
                return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            };

            const updateScrubPreview = (ratio) => {
                if (!this.hasValidDuration()) return;
                const targetTime = ratio * this.video.duration;
                this._updateProgressUI(targetTime, this.video.duration);
                this.showSeekHUD(
                    '📍',
                    this._fmtTime(targetTime),
                    `${this._fmtTime(targetTime)} / ${this._fmtTime(this.video.duration)}`
                );
            };

            progressBar.addEventListener('pointerdown', (e) => {
                if (!this.hasValidDuration()) return;
                isDragging = true;
                progressBar.classList.add('scrubbing');
                try { progressBar.setPointerCapture(e.pointerId); } catch(err) {}
                pendingRatio = getRatioFromEvent(e);
                updateScrubPreview(pendingRatio);
            });

            progressBar.addEventListener('pointermove', (e) => {
                if (isDragging) {
                    pendingRatio = getRatioFromEvent(e);
                    updateScrubPreview(pendingRatio);
                }
            });

            const finalizeSeek = (e) => {
                if (!isDragging) return;
                isDragging = false;
                progressBar.classList.remove('scrubbing');
                try { progressBar.releasePointerCapture(e.pointerId); } catch(err) {}

                if (pendingRatio !== null && this.hasValidDuration()) {
                    const targetTime = pendingRatio * this.video.duration;
                    pendingRatio = null;
                    this.seekTo(targetTime, true);
                }
            };

            progressBar.addEventListener('pointerup', finalizeSeek);
            progressBar.addEventListener('pointercancel', (e) => {
                if (isDragging) {
                    isDragging = false;
                    progressBar.classList.remove('scrubbing');
                    try { progressBar.releasePointerCapture(e.pointerId); } catch(err) {}
                    pendingRatio = null;
                    this._updateProgress();
                }
            });
        }

        // Video playback events
        this.video.addEventListener('timeupdate', () => this._updateProgress());
        this.video.addEventListener('loadedmetadata', () => this._updateProgress());
        this.video.addEventListener('durationchange', () => this._updateProgress());
        this.video.addEventListener('canplay', () => {
            if (!this.video.paused) {
                this.video.play().catch(() => {});
            }
        });
        this.video.addEventListener('seeked', () => {
            if (!this.video.paused) {
                this.video.play().catch(() => {});
            }
            this._updateProgress();
        });
        this.video.addEventListener('play', () => {
            this._updatePlayPauseIcon(true);
        });
        this.video.addEventListener('pause', () => {
            this._updatePlayPauseIcon(false);
        });

        // Click on video to toggle OSD
        this.video.addEventListener('click', () => this.toggleOSD());
    },

    isLiveStream() {
        if (!this.currentItem) return false;
        if (this.currentItem.type === 'movie' || this.currentItem.type === 'series') return false;
        return this.currentItem.type === 'live';
    },

    play(item) {
        if (!item || (!item.url && !item.hlsUrl && !item.fallbackUrl)) {
            this.app.toast('No stream URL provided');
            return;
        }

        // Save last focused element and originating screen
        this.lastFocusedElement = document.activeElement;
        const seriesScreen = document.getElementById('series-detail-screen');
        this.originScreen = (seriesScreen && seriesScreen.classList.contains('active')) ? 'series-detail' : 'main-shell';

        this.currentItem = item;

        // Clean up previous playback engines
        this._destroyPlayers();

        // Show player screen and activate player isolation
        this.playerScreen.classList.add('active');
        this.visible = true;
        document.body.classList.add('player-active');

        // Blur background focused elements so no keystrokes reach them
        if (document.activeElement) {
            document.activeElement.blur();
        }

        this.video.pause();
        this.video.removeAttribute('src');

        const isLive = this.isLiveStream();

        // Build prioritized candidate URLs list
        this.currentCandidates = this._buildCandidateUrls(item);
        this.currentCandidateIndex = 0;

        if (this.currentCandidates.length === 0) {
            this.app.toast('No valid stream URL found');
            return;
        }

        this._loadStreamCandidate(this.currentCandidates[0], item);

        // Show channel banner only for live TV
        if (isLive) {
            this.showBanner(item);
        }
        this.showOSD();
        this.autoHideOSD();
    },

    close() {
        this._destroyPlayers();
        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
        }

        this.playerScreen.classList.remove('active');
        this.visible = false;
        this.currentItem = null;
        this.hideOSD();
        document.body.classList.remove('player-active');

        // Restore originating screen
        if (this.originScreen === 'series-detail') {
            const seriesScreen = document.getElementById('series-detail-screen');
            if (seriesScreen) seriesScreen.classList.add('active');
            const mainShell = document.getElementById('main-shell');
            if (mainShell) mainShell.classList.remove('active');
        } else {
            const mainShell = document.getElementById('main-shell');
            if (mainShell) mainShell.classList.add('active');
        }

        // Restore focus to exact card or element that launched playback
        if (this.lastFocusedElement && document.contains(this.lastFocusedElement)) {
            setTimeout(() => {
                try { this.lastFocusedElement.focus(); } catch(e) {}
            }, 60);
        }
    },

    handleKey(e, keyHandler) {
        // 1. Back button: always close player and return to previous screen
        if (keyHandler && keyHandler.isBackKey(e)) {
            this.close();
            return;
        }

        // 2. Dedicated Media Remote Buttons (Play, Pause, Play/Pause Toggle)
        if (keyHandler && keyHandler.isPlayKey(e)) {
            this.playVideo();
            return;
        }
        if (keyHandler && keyHandler.isPauseKey(e)) {
            this.pauseVideo();
            return;
        }
        if (keyHandler && keyHandler.isPlayPauseKey(e)) {
            this.togglePlay();
            return;
        }

        // 3. Dedicated Fast Forward / Rewind Remote Buttons
        if (keyHandler && keyHandler.isForwardKey(e)) {
            this.seekRelative(10);
            return;
        }
        if (keyHandler && keyHandler.isBackwardKey(e)) {
            this.seekRelative(-10);
            return;
        }

        // 4. Directional D-Pad Traversal & Scrubbing
        const dir = keyHandler ? keyHandler.getDirection(e) : null;
        if (dir) {
            this._navigateOSD(dir);
            return;
        }

        // 5. Enter / OK Button
        if (keyHandler && keyHandler.isEnterKey(e)) {
            const active = document.activeElement;
            if (this.isOSDVisible()) {
                if (active && this.osd && this.osd.contains(active) && active.tagName === 'BUTTON') {
                    active.click();
                    return;
                }
                if (active && (active.id === 'osd-progress-bar' || active.classList.contains('progress-bar'))) {
                    this.togglePlay();
                    return;
                }
            }
            // If OSD is hidden, summon OSD and focus Play/Pause
            this.showOSD();
            const playPause = document.getElementById('osd-playpause');
            if (playPause) playPause.focus();
            return;
        }
    },

    _navigateOSD(dir) {
        // If OSD is currently hidden:
        if (!this.isOSDVisible()) {
            if (dir === 'left') {
                // Quick scrub backward on left D-pad
                this.seekRelative(-10);
                this.showOSD();
                return;
            }
            if (dir === 'right') {
                // Quick scrub forward on right D-pad
                this.seekRelative(10);
                this.showOSD();
                return;
            }
            // Up or Down: summon OSD and focus play/pause
            this.showOSD();
            const playPause = document.getElementById('osd-playpause');
            if (playPause) playPause.focus();
            return;
        }

        // OSD is visible: reset auto-hide timer
        this.autoHideOSD();

        const backBtn = document.getElementById('player-back');
        const progressBar = document.getElementById('osd-progress-bar') || document.querySelector('.progress-bar');
        const bottomBtns = [
            document.getElementById('osd-prev'),
            document.getElementById('osd-rw'),
            document.getElementById('osd-playpause'),
            document.getElementById('osd-ff'),
            document.getElementById('osd-next')
        ].filter(b => b && b.style.display !== 'none');

        const active = document.activeElement;

        // If focus is not currently inside OSD controls, focus default (Play/Pause)
        if (!active || !this.osd || !this.osd.contains(active)) {
            const defaultTarget = document.getElementById('osd-playpause') || bottomBtns[0];
            if (defaultTarget) defaultTarget.focus();
            return;
        }

        // Tier 1: Active is Top Bar Back Button
        if (active === backBtn) {
            if (dir === 'down') {
                if (progressBar && !this.isLiveStream()) {
                    progressBar.focus();
                } else {
                    const pp = document.getElementById('osd-playpause') || bottomBtns[0];
                    if (pp) pp.focus();
                }
            }
            return;
        }

        // Tier 2: Active is Middle Progress Bar
        if (active === progressBar || (progressBar && progressBar.contains(active))) {
            if (dir === 'up') {
                if (backBtn) backBtn.focus();
                return;
            }
            if (dir === 'down') {
                const pp = document.getElementById('osd-playpause') || bottomBtns[0];
                if (pp) pp.focus();
                return;
            }
            if (dir === 'left') {
                this.seekRelative(-10);
                return;
            }
            if (dir === 'right') {
                this.seekRelative(10);
                return;
            }
            return;
        }

        // Tier 3: Active is one of the Bottom Transport Buttons
        const idx = bottomBtns.indexOf(active);
        if (idx >= 0) {
            if (dir === 'up') {
                if (progressBar && !this.isLiveStream()) {
                    progressBar.focus();
                } else if (backBtn) {
                    backBtn.focus();
                }
                return;
            }
            if (dir === 'left') {
                if (idx > 0) {
                    bottomBtns[idx - 1].focus();
                }
                return;
            }
            if (dir === 'right') {
                if (idx < bottomBtns.length - 1) {
                    bottomBtns[idx + 1].focus();
                }
                return;
            }
            if (dir === 'down') {
                // Clamp at bottom row
                return;
            }
        }
    },


    _buildCandidateUrls(item) {
        const list = [];
        const add = (u) => {
            if (u && typeof u === 'string' && !list.includes(u)) {
                list.push(u);
            }
        };

        const canUseLocalProxy = (window.location.protocol.startsWith('http') && window.location.host) ||
            (window.IPTV.TvServer && window.IPTV.TvServer.isRunning());
        const proxyBase = (window.location.protocol.startsWith('http') && window.location.host)
            ? `${window.location.origin}/api/proxy?url=`
            : `http://127.0.0.1:8089/api/proxy?url=`;

        const toProxy = (u) => (canUseLocalProxy && u && u.startsWith('http') && !u.includes('/api/proxy'))
            ? `${proxyBase}${encodeURIComponent(u)}`
            : null;

        if (item.type === 'live') {
            // For Live TV on Smart TVs (especially LG webOS):
            // 1. HLS (.m3u8) is the native standard for live streaming on webOS GStreamer & MSE
            // 2. Proxied HLS (.m3u8) bypasses IPTV provider User-Agent blocks & 302 token redirects
            // 3. Proxied MPEG-TS (.ts) streams raw TS with VLC User-Agent
            // 4. Direct MPEG-TS (.ts) & extensionless fallback URLs
            const hlsCandidate = item.hlsUrl || (item.url && item.url.includes('.ts') ? item.url.replace(/\.ts($|\?)/i, '.m3u8$1') : null);
            const tsCandidate = item.url || (item.hlsUrl && item.hlsUrl.includes('.m3u8') ? item.hlsUrl.replace(/\.m3u8($|\?)/i, '.ts$1') : null);
            const rawCandidate = item.fallbackUrl || (item.url ? item.url.replace(/\.(ts|m3u8)($|\?)/i, '$2') : null);

            // Priority 1: Direct & Proxied HLS (.m3u8)
            if (hlsCandidate) {
                add(hlsCandidate);
                add(toProxy(hlsCandidate));
            }
            // Priority 2: Direct & Proxied MPEG-TS (.ts)
            if (tsCandidate) {
                add(tsCandidate);
                add(toProxy(tsCandidate));
            }
            // Priority 3: Extensionless stream URL
            if (rawCandidate) {
                add(rawCandidate);
                add(toProxy(rawCandidate));
            }
            return list;
        }

        // Movies & Series (VOD)
        if (item.url) add(item.url);
        if (item.hlsUrl) add(item.hlsUrl);
        if (item.fallbackUrl) add(item.fallbackUrl);
        if (item.url) add(toProxy(item.url));

        return list;
    },

    _clearCandidateWatchdog() {
        if (this._candidateWatchdog) {
            clearTimeout(this._candidateWatchdog);
            this._candidateWatchdog = null;
        }
    },

    _startCandidateWatchdog(item, timeoutMs = 8500) {
        this._clearCandidateWatchdog();
        this._candidateWatchdog = setTimeout(() => {
            if (!this.visible || this.currentItem !== item) return;
            // If video has not progressed or loaded any frame within timeoutMs, advance to next candidate
            const hasVideoData = this.video && (this.video.readyState >= 2 || this.video.currentTime > 0);
            if (!hasVideoData) {
                console.warn('[PlayerService] Candidate timed out waiting for data, trying next...');
                this._tryNextCandidate(item);
            }
        }, timeoutMs);
    },

    _destroyPlayers() {
        this._clearCandidateWatchdog();
        if (this.hls) {
            try { this.hls.destroy(); } catch(e) {}
            this.hls = null;
        }
        if (this.mpegtsPlayer) {
            try {
                this.mpegtsPlayer.pause();
                this.mpegtsPlayer.unload();
                this.mpegtsPlayer.detachMediaElement();
                this.mpegtsPlayer.destroy();
            } catch(e) {}
            this.mpegtsPlayer = null;
        }
    },

    _loadStreamCandidate(url, item) {
        this._destroyPlayers();
        if (!this.video) return;

        this.video.pause();
        this.video.removeAttribute('src');

        const isLive = this.isLiveStream();
        const decodedUrl = decodeURIComponent(url);
        const isM3u8 = /\.m3u8($|\?)/i.test(decodedUrl);
        const isTs = !isM3u8 && (/\.(ts|mpegts)($|\?)/i.test(decodedUrl) || (isLive && !/\.(mp4|mkv|avi|mov)($|\?)/i.test(decodedUrl)));

        console.log(`[PlayerService] Loading stream candidate [${this.currentCandidateIndex + 1}/${this.currentCandidates.length}]: ${url}`);

        // Start watchdog timer so if a candidate stalls without firing an error, we try the next one
        this._startCandidateWatchdog(item, isLive ? 8000 : 12000);

        const isWebOSTV = !!(window.webOS || /Web0S|webOS|SmartTV/i.test(navigator.userAgent));

        // 1. HLS (.m3u8) streams:
        // On LG webOS TVs, native hardware GStreamer HLS playback is far faster and more compatible
        // than MSE software demuxing (especially on webOS 3.x / Chromium 38).
        if (isM3u8) {
            if (isWebOSTV || this.video.canPlayType('application/vnd.apple.mpegurl') || this.video.canPlayType('application/x-mpegURL')) {
                this._playNativeDirect(url, item, 'application/vnd.apple.mpegurl');
                return;
            }
            if (window.Hls && Hls.isSupported()) {
                try {
                    const hls = new Hls({
                        enableWorker: false,
                        lowLatencyMode: false,
                        maxBufferLength: 25,
                        maxMaxBufferLength: 45
                    });
                    this.hls = hls;
                    hls.loadSource(url);
                    hls.attachMedia(this.video);

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        this._clearCandidateWatchdog();
                        const p = this.video.play();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    });

                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            console.warn('[PlayerService] HLS fatal error:', data.type, data.details);
                            this._tryNextCandidate(item);
                        }
                    });
                    return;
                } catch(e) {
                    console.warn('[PlayerService] Hls.js init failed, falling back to native:', e);
                }
            }
        }

        // 2. MPEG-TS (.ts) streams:
        // On real LG webOS TVs, try native hardware MPEG-TS decoding first; on desktop browsers use mpegts.js
        if (isTs && !isWebOSTV && window.mpegts && mpegts.isSupported()) {
            try {
                const player = mpegts.createPlayer({
                    type: 'mse',
                    isLive: true,
                    url: url
                }, {
                    enableWorker: false,
                    lazyLoadMaxDuration: 120,
                    seekType: 'range'
                });
                this.mpegtsPlayer = player;
                player.attachMediaElement(this.video);
                player.load();
                const p = player.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});

                player.on(mpegts.Events.ERROR, (errType, errDetail) => {
                    console.warn('[PlayerService] mpegts error:', errType, errDetail);
                    this._tryNextCandidate(item);
                });
                return;
            } catch(e) {
                console.warn('[PlayerService] mpegts init error:', e);
            }
        }

        // 3. Direct native hardware video playback (LG webOS GStreamer / MP4 VOD / TS)
        this._playNativeDirect(url, item);
    },

    _playNativeDirect(url, item, mimeType) {
        if (!this.video) return;

        // Clear any old <source> tags
        while (this.video.firstChild) {
            this.video.removeChild(this.video.firstChild);
        }

        const onPlaying = () => {
            this._clearCandidateWatchdog();
            this.video.removeEventListener('playing', onPlaying);
            this.video.removeEventListener('loadeddata', onPlaying);
        };
        this.video.addEventListener('playing', onPlaying);
        this.video.addEventListener('loadeddata', onPlaying);

        this.video.onerror = () => {
            this.video.removeEventListener('playing', onPlaying);
            this.video.removeEventListener('loadeddata', onPlaying);
            const err = this.video.error;
            console.warn('[PlayerService] Native video error:', err ? err.code : 'unknown', 'on URL:', url);
            this._tryNextCandidate(item);
        };

        this.video.src = url;
        this.video.load();

        const p = this.video.play();
        if (p && typeof p.catch === 'function') {
            p.catch(e => {
                console.warn('[PlayerService] Native play error:', e);
            });
        }
    },

    _tryNextCandidate(item) {
        this.currentCandidateIndex++;
        if (this.currentCandidateIndex < this.currentCandidates.length) {
            const nextUrl = this.currentCandidates[this.currentCandidateIndex];
            this._loadStreamCandidate(nextUrl, item);
        } else {
            console.error('[PlayerService] All stream candidates failed for:', item ? item.name : 'Unknown');
            if (this.app && typeof this.app.toast === 'function') {
                this.app.toast('Unable to play stream. Server unreachable or format unsupported.');
            }
        }
    },

    _updatePlayPauseIcon(isPlaying) {
        const pp = document.getElementById('osd-playpause');
        if (!pp) return;
        if (window.IPTV && window.IPTV.Icons) {
            pp.innerHTML = window.IPTV.Icons.get(isPlaying ? 'pause' : 'play', 'osd-svg-icon');
        } else {
            pp.textContent = isPlaying ? '⏸' : '▶';
        }
    },

    playVideo() {
        if (!this.video) return;
        this.video.play().catch(e => console.warn('Play blocked:', e));
        this._updatePlayPauseIcon(true);
        this.showSeekHUD('play', 'Play', '');
        this.showOSD();
    },

    pauseVideo() {
        if (!this.video) return;
        this.video.pause();
        this._updatePlayPauseIcon(false);
        this.showSeekHUD('pause', 'Pause', '');
        this.showOSD();
    },

    togglePlay() {
        if (!this.video) return;
        if (this.video.paused) {
            this.playVideo();
        } else {
            this.pauseVideo();
        }
    },

    hasValidDuration() {
        return !!(
            this.video && 
            this.video.duration && 
            !isNaN(this.video.duration) && 
            isFinite(this.video.duration) && 
            this.video.duration > 0 &&
            this.video.duration !== Infinity
        );
    },

    _updateProgressUI(currentTime, duration) {
        if (!duration || isNaN(duration) || !isFinite(duration) || duration <= 0) return;
        const pct = Math.max(0, Math.min(100, (currentTime / duration) * 100));
        const fill = document.getElementById('osd-progress-fill');
        if (fill) fill.style.width = `${pct}%`;
        const thumb = document.getElementById('osd-progress-thumb');
        if (thumb) thumb.style.left = `${pct}%`;
        const cur = document.getElementById('osd-time-current');
        if (cur) cur.textContent = this._fmtTime(currentTime);
        const dur = document.getElementById('osd-time-duration');
        if (dur) dur.textContent = this._fmtTime(duration);
        const bar = document.getElementById('osd-progress-bar');
        if (bar) bar.setAttribute('aria-valuenow', Math.round(pct).toString());
    },

    seekTo(targetSeconds, startPlaying = true) {
        if (!this.video || !this.hasValidDuration()) return;
        const duration = this.video.duration;
        const clamped = Math.max(0, Math.min(duration - 0.5, targetSeconds));

        // Update progress bar UI immediately
        this._updateProgressUI(clamped, duration);
        this.showOSD();

        // If Hls.js is active, instruct it to load fragments from the seek point
        if (this.hls && typeof this.hls.startLoad === 'function') {
            try { this.hls.startLoad(clamped); } catch(e) {}
        }

        // Perform native seek
        try {
            if (typeof this.video.fastSeek === 'function') {
                this.video.fastSeek(clamped);
            } else {
                this.video.currentTime = clamped;
            }
        } catch(err) {
            this.video.currentTime = clamped;
        }

        // Guarantee playback starts from the seeked position
        const ensurePlaying = () => {
            if (startPlaying || !this.video.paused) {
                const p = this.video.play();
                if (p && typeof p.then === 'function') {
                    p.catch(e => console.warn('Play after seek caught:', e));
                }
                const pp = document.getElementById('osd-playpause');
                if (pp) pp.textContent = '⏸';
            }
        };

        // When seek finishes, immediately resume
        this.video.addEventListener('seeked', () => {
            ensurePlaying();
            this._updateProgress();
        }, { once: true });

        // Immediate and timeout fallbacks in case seeked is delayed
        ensurePlaying();
        setTimeout(ensurePlaying, 200);
        setTimeout(ensurePlaying, 500);
    },

    seekRelative(delta) {
        if (!this.video) return;
        if (!this.hasValidDuration()) {
            this.showSeekHUD(delta > 0 ? 'ff' : 'rw', 'Live Broadcast', '');
            this.showOSD();
            return;
        }
        const current = this.video.currentTime || 0;
        const target = Math.max(0, Math.min(this.video.duration - 0.5, current + delta));
        this.seekTo(target, true);
        const sign = delta > 0 ? '+' : '';
        this.showSeekHUD(
            delta > 0 ? 'ff' : 'rw',
            `${sign}${delta}s`,
            `${this._fmtTime(target)} / ${this._fmtTime(this.video.duration)}`
        );
    },

    showSeekHUD(icon, text, time) {
        const hud = document.getElementById('seek-hud');
        if (!hud) return;
        const iconEl = document.getElementById('seek-hud-icon');
        const textEl = document.getElementById('seek-hud-text');
        const timeEl = document.getElementById('seek-hud-time');

        if (iconEl) {
            if (window.IPTV && window.IPTV.Icons) {
                const mapped = icon === '⏩' ? 'ff' : (icon === '⏪' ? 'rw' : (icon === '▶' ? 'play' : (icon === '⏸' ? 'pause' : icon)));
                iconEl.innerHTML = window.IPTV.Icons.get(mapped, 'hud-svg-icon');
            } else {
                iconEl.textContent = icon || '⏩';
            }
        }
        if (textEl) textEl.textContent = text || '';
        if (timeEl) timeEl.textContent = time || '';

        hud.classList.remove('hidden');
        clearTimeout(this.seekHudTimeout);
        this.seekHudTimeout = setTimeout(() => {
            hud.classList.add('hidden');
        }, 1600);
    },

    isVisible() {
        return !!(this.visible || (this.playerScreen && this.playerScreen.classList.contains('active')) || document.body.classList.contains('player-active'));
    },

    isOSDVisible() {
        return this.osd && !this.osd.classList.contains('hidden');
    },

    showOSD() {
        if (!this.osd) return;
        this.osd.classList.remove('hidden');

        // Update title and clock
        const titleEl = document.getElementById('osd-channel-name');
        if (titleEl && this.currentItem) titleEl.textContent = this.currentItem.name || '';

        const clockEl = document.getElementById('osd-clock');
        if (clockEl) {
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // Toggle buttons: Prev/Next for Live TV, Rewind/Forward for Movies & Series
        const isLive = this.isLiveStream();
        const prevBtn = document.getElementById('osd-prev');
        const nextBtn = document.getElementById('osd-next');
        const rwBtn = document.getElementById('osd-rw');
        const ffBtn = document.getElementById('osd-ff');

        if (isLive) {
            if (prevBtn) prevBtn.style.display = '';
            if (nextBtn) nextBtn.style.display = '';
            if (rwBtn) rwBtn.style.display = 'none';
            if (ffBtn) ffBtn.style.display = 'none';
        } else {
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (rwBtn) rwBtn.style.display = '';
            if (ffBtn) ffBtn.style.display = '';
        }

        this.updateFavoriteState();
        this._updateProgress();
        this.autoHideOSD();
    },

    updateFavoriteState() {
        const favBtn = document.getElementById('osd-fav');
        if (!favBtn || !this.currentItem) return;
        const isFav = this.app.isFavorite(this.currentItem.id);
        favBtn.classList.toggle('active', isFav);
        favBtn.title = isFav ? 'Remove from Favorites (Press F on remote)' : 'Add to Favorites (Press F on remote)';
    },

    hideOSD() {
        if (this.osd) this.osd.classList.add('hidden');
        clearTimeout(this.osdTimeout);
    },

    toggleOSD() {
        if (this.isOSDVisible()) {
            this.hideOSD();
        } else {
            this.showOSD();
        }
    },

    autoHideOSD() {
        clearTimeout(this.osdTimeout);
        this.osdTimeout = setTimeout(() => this.hideOSD(), 4000);
    },

    showBanner(item) {
        if (!this.banner) return;
        const logo = document.getElementById('banner-logo');
        if (logo) {
            logo.src = item.logo || item.poster || '';
            logo.style.display = (item.logo || item.poster) ? 'block' : 'none';
        }

        const nameEl = document.getElementById('banner-name');
        if (nameEl) nameEl.textContent = item.name || '';

        const progEl = document.getElementById('banner-program');
        if (progEl) progEl.textContent = item.category || '';

        this.banner.classList.remove('hidden');
        clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => this.banner.classList.add('hidden'), 3500);
    },

    _updateProgress() {
        if (!this.video) return;

        const bar = document.getElementById('osd-progress-bar');
        const fill = document.getElementById('osd-progress-fill');
        const thumb = document.getElementById('osd-progress-thumb');
        const cur = document.getElementById('osd-time-current');
        const dur = document.getElementById('osd-time-duration');

        const isLive = this.isLiveStream();
        if (isLive) {
            if (fill) fill.style.width = '100%';
            if (thumb) thumb.style.left = '100%';
            if (cur) cur.textContent = 'LIVE';
            if (dur) dur.textContent = '🔴';
            if (bar) {
                bar.setAttribute('aria-valuenow', '100');
                bar.removeAttribute('tabindex');
            }
            return;
        }

        // Movie or Series (VOD)
        if (bar && !bar.hasAttribute('tabindex')) {
            bar.setAttribute('tabindex', '0');
        }

        // Do not overwrite user preview if dragging/scrubbing
        if (bar && bar.classList.contains('scrubbing')) {
            return;
        }

        if (!this.hasValidDuration()) {
            // Still loading duration from network
            if (fill) fill.style.width = '0%';
            if (thumb) thumb.style.left = '0%';
            if (cur) cur.textContent = '00:00';
            if (dur) dur.textContent = '--:--';
            return;
        }

        this._updateProgressUI(this.video.currentTime || 0, this.video.duration);
    },

    _fmtTime(sec) {
        if (isNaN(sec) || sec < 0) return '00:00';
        const totalSec = Math.floor(sec);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0 || (this.video && this.video.duration >= 3600)) {
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
};
