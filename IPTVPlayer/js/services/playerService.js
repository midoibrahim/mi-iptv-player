/* ============================================================
   IPTV Player â€” Video Player & HLS Streaming Coordinator
   Coordinates PlaybackEngine, StreamResolver, PlayerOsd,
   ChannelDrawer, and WatchProgressTracker.
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
        this.seriesContext = null;
        this.visible = false;
        this.osdTimeout = null;
        this.bannerTimeout = null;
        this.currentCandidates = [];
        this.currentCandidateIndex = 0;

        // In-Player Channel Drawer component
        this.isChannelDrawerOpen = false;
        if (window.IPTV.ChannelDrawer) {
            window.IPTV.ChannelDrawer.init(this);
        }

        // Resume & Watch progress state
        this._initialSeekPending = null;
        this._lastProgressSaveTime = 0;
        this._userPaused = false;

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

        // Prev button: Previous Channel on live TV, Previous Episode in series
        const prevBtn = document.getElementById('osd-prev');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentItem && this.currentItem.type === 'series') {
                    this.prevEpisode();
                } else {
                    this.app.prevChannel();
                }
            });
        }

        // Next button: Next Channel on live TV, Next Episode in series
        const nextBtn = document.getElementById('osd-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.currentItem && this.currentItem.type === 'series') {
                    this.nextEpisode();
                } else {
                    this.app.nextChannel();
                }
            });
        }

        // Live Channels button on OSD top bar
        const channelsBtn = document.getElementById('osd-channels-btn');
        if (channelsBtn) {
            channelsBtn.addEventListener('click', () => this.toggleChannelDrawer());
        }

        // In-Player Side Channel Drawer close & backdrop controls
        const drawerCloseBtn = document.getElementById('drawer-close-btn');
        if (drawerCloseBtn) {
            drawerCloseBtn.addEventListener('click', () => this.closeChannelDrawer());
        }

        const drawerBackdrop = document.getElementById('player-drawer-backdrop');
        if (drawerBackdrop) {
            drawerBackdrop.addEventListener('click', () => this.closeChannelDrawer());
        }

        const favBtn = document.getElementById('osd-fav');
        if (favBtn) {
            favBtn.addEventListener('click', () => {
                if (this.currentItem) {
                    window.IPTV.CatalogStore.toggleFavorite(this.currentItem);
                    this.updateFavoriteState();
                }
            });
        }

        // Pointer move on player screen keeps OSD alive while user moves Magic Remote
        if (this.playerScreen) {
            this.playerScreen.addEventListener('mousemove', () => {
                if (this.visible && this.isOSDVisible() && !this._isProgressBarDragging && !this.isChannelDrawerOpen) {
                    this.autoHideOSD();
                }
            });
        }

        // Interactive Playbar Seeking (Click & Drag for Magic Remote Mouse & Touch Events)
        if (window.IPTV.PlayerOsd) {
            window.IPTV.PlayerOsd.bindScrubbing(this);
        }

        // Video playback events
        this.video.addEventListener('timeupdate', () => this._updateProgress());
        this.video.addEventListener('loadedmetadata', () => {
            this._checkPendingInitialSeek();
            this._updateProgress();
        });
        this.video.addEventListener('durationchange', () => {
            this._checkPendingInitialSeek();
            this._updateProgress();
        });
        this.video.addEventListener('canplay', () => {
            this._checkPendingInitialSeek();
            if (!this._userPaused) {
                const p = this.video.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            }
        });
        this.video.addEventListener('seeked', () => {
            if (!this._userPaused) {
                const p = this.video.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            }
            this._updateProgress();
        });
        this.video.addEventListener('play', () => {
            this._updatePlayPauseIcon(true);
        });
        this.video.addEventListener('playing', () => {
            this._updatePlayPauseIcon(true);
        });
        this.video.addEventListener('pause', () => {
            if (this._userPaused) {
                this._updatePlayPauseIcon(false);
            }
            this._recordWatchProgress();
        });
        this.video.addEventListener('ended', () => {
            this._recordWatchProgress(true);
            if (this.currentItem && this.currentItem.type === 'series') {
                const settings = window.IPTV.Storage ? window.IPTV.Storage.getSettings() : null;
                const autoplay = !settings || settings.autoplay !== false;
                if (autoplay && this.hasNextEpisode()) {
                    console.log('[PlayerService] Episode ended, automatically playing next episode...');
                    this.nextEpisode();
                }
            }
        });

        // Lifecycle exit hooks (best effort save watch progress)
        window.addEventListener('pagehide', () => this._recordWatchProgress());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this._recordWatchProgress();
        });

        // Click on video to toggle OSD
        this.video.addEventListener('click', () => this.toggleOSD());
    },

    isLiveStream() {
        if (!this.currentItem) return false;
        if (this.currentItem.type === 'movie' || this.currentItem.type === 'series') return false;
        return this.currentItem.type === 'live';
    },

    _checkPendingInitialSeek() {
        if (this._initialSeekPending !== null && this.canSeek()) {
            const target = this._initialSeekPending;
            this._initialSeekPending = null;
            console.log('[PlayerService] Executing initial seek to saved position:', target);
            this.seekTo(target, true);
        }
    },

    play(item, options = {}) {
        if (!item || (!item.url && !item.hlsUrl && !item.fallbackUrl)) {
            window.IPTV.EventBus.toast('No stream URL provided');
            return;
        }

        // Save last focused element and originating screen
        this.lastFocusedElement = document.activeElement;
        const seriesScreen = document.getElementById('series-detail-screen');
        this.originScreen = (seriesScreen && seriesScreen.classList.contains('active')) ? 'series-detail' : 'main-shell';

        this.currentItem = item;
        this.seriesContext = item.seriesContext || null;
        this._userPaused = false;
        this._localToastShown = false;
        this._avplayTried = false;
        this._initialSeekPending = (options && typeof options.initialSeekTime === 'number' && options.initialSeekTime > 0)
            ? options.initialSeekTime
            : null;
        this._lastProgressSaveTime = 0;

        if (window.IPTV.Platform && typeof window.IPTV.Platform.setKeepScreenOn === 'function') {
            window.IPTV.Platform.setKeepScreenOn(true);
        }

        if (this.isChannelDrawerOpen) {
            this.closeChannelDrawer();
        }

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
            window.IPTV.EventBus.toast('No valid stream URL found');
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
        // Save watch progress immediately before stopping playback
        this._recordWatchProgress();

        if (this.isChannelDrawerOpen) {
            this.closeChannelDrawer();
        }

        this._destroyPlayers();
        if (window.IPTV.Platform && typeof window.IPTV.Platform.setKeepScreenOn === 'function') {
            window.IPTV.Platform.setKeepScreenOn(false);
        }
        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
        }

        this.playerScreen.classList.remove('active');
        this.visible = false;
        const closedSeriesContext = this.seriesContext;
        this.currentItem = null;
        this.seriesContext = null;
        this._initialSeekPending = null;
        this.hideOSD();
        document.body.classList.remove('player-active');

        // Restore originating screen
        if (this.originScreen === 'series-detail') {
            const seriesScreen = document.getElementById('series-detail-screen');
            if (seriesScreen) seriesScreen.classList.add('active');
            const mainShell = document.getElementById('main-shell');
            if (mainShell) mainShell.classList.remove('active');

            if (this.app && this.app.seriesDetailView && closedSeriesContext) {
                this.app.seriesDetailView.focusEpisodeCard(
                    closedSeriesContext.currentSeason,
                    closedSeriesContext.currentEpisodeId
                );
            } else if (this.lastFocusedElement && document.contains(this.lastFocusedElement)) {
                setTimeout(() => {
                    try { this.lastFocusedElement.focus(); } catch(e) {}
                }, 60);
            }
        } else {
            const mainShell = document.getElementById('main-shell');
            if (mainShell) mainShell.classList.add('active');

            if (this.app && this.app.currentSection === 'home' && this.app.homeView) {
                this.app.homeView.render(
                    window.IPTV.CatalogStore.getLive(),
                    window.IPTV.CatalogStore.getMovies(),
                    window.IPTV.CatalogStore.getSeries()
                );
            }

            if (this.lastFocusedElement && document.contains(this.lastFocusedElement)) {
                setTimeout(() => {
                    try { this.lastFocusedElement.focus(); } catch(e) {}
                }, 60);
            }
        }
    },

    _focusDrawerItem(el) {
        if (window.IPTV.ChannelDrawer) window.IPTV.ChannelDrawer.focusItem(el);
    },

    handleDrawerKey(e, keyHandler) {
        if (window.IPTV.ChannelDrawer) window.IPTV.ChannelDrawer.handleKey(e, keyHandler);
    },

    handleKey(e, keyHandler) {
        // 0. If Side Channel List Drawer is open, trap and isolate keys to the drawer
        if (this.isChannelDrawerOpen) {
            this.handleDrawerKey(e, keyHandler);
            return;
        }

        // Dedicated Channel List / Guide Remote Key
        if (keyHandler && typeof keyHandler.isChannelListKey === 'function' && keyHandler.isChannelListKey(e)) {
            if (this.isLiveStream()) {
                this.toggleChannelDrawer();
                return;
            }
        }

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
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.navigate(this, dir);
    },

    _loadScriptOnce(src) {
        return window.IPTV.PlaybackEngine ? window.IPTV.PlaybackEngine.loadScriptOnce(src) : Promise.resolve(false);
    },

    _getCandidateStrategy(rawUrl) {
        return window.IPTV.StreamResolver ? window.IPTV.StreamResolver.getStrategy(rawUrl) : '';
    },

    _markCandidateSuccess(rawCandidateUrl) {
        this._clearCandidateWatchdog();
        if (rawCandidateUrl && String(rawCandidateUrl).startsWith('file:///')) {
            if (window.IPTV.EventBus && !this._localToastShown) {
                this._localToastShown = true;
                window.IPTV.EventBus.toast('âœ“ Playing from downloaded local file (Offline)', 3000);
            }
        }
        if (this.isLiveStream() && window.IPTV.CatalogStore && window.IPTV.CatalogStore.getConnection() && window.IPTV.Storage && window.IPTV.Storage.saveStreamStrategy) {
            const strat = this._getCandidateStrategy(rawCandidateUrl);
            if (strat) {
                window.IPTV.Storage.saveStreamStrategy(window.IPTV.CatalogStore.getConnection(), strat);
            }
        }
    },

    _buildCandidateUrls(item) {
        if (!window.IPTV.StreamResolver) return [];
        const preferredStrategy = (window.IPTV.CatalogStore && window.IPTV.CatalogStore.getConnection() && window.IPTV.Storage && window.IPTV.Storage.getStreamStrategy)
            ? window.IPTV.Storage.getStreamStrategy(window.IPTV.CatalogStore.getConnection())
            : null;
        return window.IPTV.StreamResolver.buildCandidates(item, { preferredStrategy });
    },

    _clearCandidateWatchdog() {
        if (window.IPTV.PlaybackEngine) window.IPTV.PlaybackEngine.clearWatchdog(this);
    },

    _startCandidateWatchdog(item, sessionId, timeoutMs = 8500) {
        if (window.IPTV.PlaybackEngine) window.IPTV.PlaybackEngine.startWatchdog(this, item, sessionId, timeoutMs);
    },

    _destroyPlayers() {
        if (window.IPTV.PlaybackEngine) window.IPTV.PlaybackEngine.destroy(this);
    },

    async _loadStreamCandidate(rawCandidateUrl, item) {
        if (window.IPTV.PlaybackEngine) return window.IPTV.PlaybackEngine.loadCandidate(this, rawCandidateUrl, item);
    },

    _playNativeDirect(url, item, rawCandidateUrl, sessionId) {
        if (window.IPTV.PlaybackEngine) window.IPTV.PlaybackEngine.playNativeDirect(this, url, item, rawCandidateUrl, sessionId);
    },

    _tryNextCandidate(item, fromSessionId) {
        if (window.IPTV.PlaybackEngine) window.IPTV.PlaybackEngine.tryNextCandidate(this, item, fromSessionId);
    },

    _updatePlayPauseIcon(isPlaying) {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.updatePlayPauseIcon(isPlaying);
    },

    getCurrentTime() {
        if (this._avplayActive) return this._avplayCurrentTime || 0;
        return (this.video && this.video.currentTime) ? this.video.currentTime : 0;
    },

    getDuration() {
        if (this._avplayActive) return this._avplayDuration || 0;
        return (this.video && this.video.duration) ? this.video.duration : 0;
    },

    playVideo() {
        if (!this.video) return;
        this._userPaused = false;
        if (this._avplayActive && window.webapis && window.webapis.avplay) {
            try {
                window.webapis.avplay.play();
                this._avplayPaused = false;
            } catch (e) {}
        } else {
            this.video.play().catch(e => console.warn('Play blocked:', e));
        }
        this._updatePlayPauseIcon(true);
        this.showSeekHUD('play', 'Play', '');
        this.showOSD();
    },

    pauseVideo() {
        if (!this.video) return;
        this._userPaused = true;
        if (this._avplayActive && window.webapis && window.webapis.avplay) {
            try {
                window.webapis.avplay.pause();
                this._avplayPaused = true;
            } catch (e) {}
            this._recordWatchProgress();
        } else {
            this.video.pause();
        }
        this._updatePlayPauseIcon(false);
        this.showSeekHUD('pause', 'Pause', '');
        this.showOSD();
    },

    togglePlay() {
        if (!this.video) return;
        const isPaused = this._avplayActive ? !!this._avplayPaused : this.video.paused;
        if (isPaused) {
            this.playVideo();
        } else {
            this.pauseVideo();
        }
    },

    hasValidDuration() {
        const dur = this.getDuration();
        return !!(
            dur &&
            !isNaN(dur) &&
            isFinite(dur) &&
            dur > 0 &&
            dur !== Infinity
        );
    },

    canSeek() {
        if (!this.video || this.isLiveStream()) return false;
        if (!this.hasValidDuration()) return false;
        if (this._avplayActive) return true;
        try {
            const seekable = this.video.seekable;
            if (!seekable || seekable.length === 0) {
                return this.hasValidDuration() && this.video.duration > 0;
            }
            return seekable.end(seekable.length - 1) > 0;
        } catch(e) {
            return false;
        }
    },

    _osdEls() {
        return window.IPTV.PlayerOsd ? window.IPTV.PlayerOsd.osdEls(this) : {};
    },

    _updateProgressUI(currentTime, duration) {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.updateProgressUI(this, currentTime, duration);
    },

    seekTo(targetSeconds, startPlaying = true) {
        if (!this.video || !this.canSeek()) return;
        const duration = this.getDuration();
        const clamped = Math.max(0, Math.min(duration - 0.5, targetSeconds));

        this._updateProgressUI(clamped, duration);
        this.showOSD();

        if (this._avplayActive && window.webapis && window.webapis.avplay) {
            try {
                window.webapis.avplay.seekTo(Math.floor(clamped * 1000), () => {
                    this._avplayCurrentTime = clamped;
                    if (startPlaying) {
                        this._userPaused = false;
                        this._avplayPaused = false;
                        try { window.webapis.avplay.play(); } catch (e) {}
                        this._updatePlayPauseIcon(true);
                    }
                    this._updateProgress();
                }, () => {});
            } catch (err) {
                console.warn('[PlayerService] AVPlay seek error:', err);
            }
            return;
        }

        if (this.hls && typeof this.hls.startLoad === 'function') {
            try { this.hls.startLoad(clamped); } catch(e) {}
        }

        try {
            this.video.currentTime = clamped;
        } catch(err) {
            console.warn('[PlayerService] Seek error:', err);
        }

        if (startPlaying) {
            this._userPaused = false;
        }

        const ensurePlaying = () => {
            if (!this._userPaused) {
                const p = this.video.play();
                if (p && typeof p.then === 'function') {
                    p.catch(e => console.warn('[PlayerService] Play after seek caught:', e));
                }
                this._updatePlayPauseIcon(true);
            }
        };

        const onSeeked = () => {
            this.video.removeEventListener('seeked', onSeeked);
            ensurePlaying();
            this._updateProgress();
        };
        this.video.addEventListener('seeked', onSeeked);

        ensurePlaying();
        setTimeout(ensurePlaying, 200);
        setTimeout(ensurePlaying, 500);
    },

    seekRelative(delta) {
        if (!this.video) return;
        if (this.isLiveStream()) {
            this.showSeekHUD(delta > 0 ? 'ff' : 'rw', 'Live Broadcast', '');
            this.showOSD();
            return;
        }
        if (!this.canSeek()) {
            this.showSeekHUD(delta > 0 ? 'ff' : 'rw', 'Loading...', '');
            this.showOSD();
            return;
        }
        const current = this.getCurrentTime();
        const duration = this.getDuration();
        const target = Math.max(0, Math.min(duration - 0.5, current + delta));
        this.seekTo(target, true);
        const sign = delta > 0 ? '+' : '';
        this.showSeekHUD(
            delta > 0 ? 'ff' : 'rw',
            `${sign}${delta}s`,
            `${this._fmtTime(target)} / ${this._fmtTime(duration)}`
        );
    },

    showSeekHUD(icon, text, time) {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.showSeekHUD(this, icon, text, time);
    },

    isVisible() {
        return !!(this.visible || (this.playerScreen && this.playerScreen.classList.contains('active')) || document.body.classList.contains('player-active'));
    },

    isOSDVisible() {
        return window.IPTV.PlayerOsd
            ? window.IPTV.PlayerOsd.isVisible(this)
            : !!(this.osd && !this.osd.classList.contains('hidden'));
    },

    showOSD() {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.show(this);
    },

    updateFavoriteState() {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.updateFavoriteState(this);
    },

    hideOSD() {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.hide(this);
    },

    toggleOSD() {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.toggle(this);
    },

    autoHideOSD() {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.autoHide(this);
    },

    showBanner(item) {
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.showBanner(this, item);
    },

    _updateProgress() {
        this._checkPendingInitialSeek();
        this._throttledSaveProgress();
        if (window.IPTV.PlayerOsd) window.IPTV.PlayerOsd.updateProgress(this);
    },

    _fmtTime(sec) {
        const dur = this.getDuration();
        return window.IPTV.PlayerOsd ? window.IPTV.PlayerOsd.fmtTime(sec, dur) : '00:00';
    },

    // ---- Series Adjacent Episode Navigation & Autoplay ----
    _getSeriesAdjacentEpisodes() {
        return window.IPTV.WatchProgressTracker
            ? window.IPTV.WatchProgressTracker.getAdjacentEpisodes(this.seriesContext)
            : { hasPrev: false, hasNext: false };
    },

    hasNextEpisode() {
        return this._getSeriesAdjacentEpisodes().hasNext;
    },

    hasPrevEpisode() {
        return this._getSeriesAdjacentEpisodes().hasPrev;
    },

    nextEpisode() {
        const { hasNext, nextSeason, nextIndex } = this._getSeriesAdjacentEpisodes();
        if (!hasNext || !this.app || !this.app.seriesDetailView || !this.seriesContext) {
            window.IPTV.EventBus.toast('No next episode available');
            return;
        }

        this._recordWatchProgress(true);

        const nextPlayItem = this.app.seriesDetailView.buildEpisodePlayItem(
            window.IPTV.CatalogStore.getConnection(),
            {
                id: this.seriesContext.seriesId,
                name: this.seriesContext.seriesName,
                poster: this.seriesContext.poster,
                plot: this.seriesContext.plot
            },
            this.seriesContext.seasonsData,
            nextSeason,
            nextIndex
        );

        if (nextPlayItem) {
            this.play(nextPlayItem);
            window.IPTV.EventBus.toast(`Next: ${nextPlayItem.name}`);
        }
    },

    prevEpisode() {
        const { hasPrev, prevSeason, prevIndex } = this._getSeriesAdjacentEpisodes();
        if (!hasPrev || !this.app || !this.app.seriesDetailView || !this.seriesContext) {
            window.IPTV.EventBus.toast('No previous episode available');
            return;
        }

        this._recordWatchProgress();

        const prevPlayItem = this.app.seriesDetailView.buildEpisodePlayItem(
            window.IPTV.CatalogStore.getConnection(),
            {
                id: this.seriesContext.seriesId,
                name: this.seriesContext.seriesName,
                poster: this.seriesContext.poster,
                plot: this.seriesContext.plot
            },
            this.seriesContext.seasonsData,
            prevSeason,
            prevIndex
        );

        if (prevPlayItem) {
            this.play(prevPlayItem);
            window.IPTV.EventBus.toast(`Previous: ${prevPlayItem.name}`);
        }
    },

    // ---- In-Player Side Channel List Drawer (delegates to ChannelDrawer) ----
    toggleChannelDrawer() {
        if (window.IPTV.ChannelDrawer) window.IPTV.ChannelDrawer.toggle();
    },

    openChannelDrawer() {
        if (window.IPTV.ChannelDrawer) window.IPTV.ChannelDrawer.open();
    },

    closeChannelDrawer() {
        if (window.IPTV.ChannelDrawer) window.IPTV.ChannelDrawer.close();
    },

    renderDrawerCategories() {
        if (window.IPTV.ChannelDrawer) window.IPTV.ChannelDrawer.renderCategories();
    },

    renderDrawerChannels() {
        if (window.IPTV.ChannelDrawer) window.IPTV.ChannelDrawer.renderChannels();
    },

    _appendDrawerChannelChunk(chunkSize) {
        if (window.IPTV.ChannelDrawer) window.IPTV.ChannelDrawer.appendChunk(chunkSize);
    },

    // ---- Watch Progress Persistence (delegates to WatchProgressTracker) ----
    _recordWatchProgress(isCompleted = false) {
        if (!this.currentItem || this.isLiveStream() || !this.video) return;
        if (window.IPTV.WatchProgressTracker) {
            window.IPTV.WatchProgressTracker.recordProgress(
                this.currentItem,
                this.getCurrentTime(),
                this.getDuration(),
                isCompleted
            );
        }
    },

    _throttledSaveProgress() {
        const now = Date.now();
        if (!this._lastProgressSaveTime || now - this._lastProgressSaveTime >= 5000) {
            this._lastProgressSaveTime = now;
            this._recordWatchProgress();
        }
    }
};
