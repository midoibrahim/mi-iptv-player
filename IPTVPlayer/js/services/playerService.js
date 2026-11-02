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
        this.seriesContext = null;
        this.visible = false;
        this.osdTimeout = null;
        this.bannerTimeout = null;
        this.currentCandidates = [];
        this.currentCandidateIndex = 0;

        // In-Player Channel Drawer state
        this.isChannelDrawerOpen = false;
        this.selectedDrawerCategory = null;
        this.drawerSearchQuery = '';

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
                    this.app.toggleFavorite(this.currentItem);
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
        const progressBar = document.getElementById('osd-progress-bar');
        if (progressBar) {
            let isDragging = false;
            let pendingRatio = null;

            const getRatioFromEvent = (e) => {
                const rect = progressBar.getBoundingClientRect();
                const clientX = (e.clientX !== undefined)
                    ? e.clientX
                    : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
                return Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
            };

            const updateScrubPreview = (ratio) => {
                if (!this.canSeek()) return;
                const targetTime = ratio * this.video.duration;
                this._updateProgressUI(targetTime, this.video.duration);
                const bubble = document.getElementById('osd-scrub-bubble');
                if (bubble) {
                    bubble.textContent = this._fmtTime(targetTime);
                    bubble.style.opacity = '1';
                }
                this.showSeekHUD(
                    'seekPin',
                    this._fmtTime(targetTime),
                    `${this._fmtTime(targetTime)} / ${this._fmtTime(this.video.duration)}`
                );
            };

            const onStart = (e) => {
                if (!this.canSeek()) return;
                if (e.button !== undefined && e.button !== 0) return; // ignore non-left click
                isDragging = true;
                this._isProgressBarDragging = true;
                clearTimeout(this.osdTimeout);
                progressBar.classList.add('scrubbing');
                pendingRatio = getRatioFromEvent(e);
                updateScrubPreview(pendingRatio);

                const onMove = (ev) => {
                    if (!isDragging) return;
                    clearTimeout(this.osdTimeout);
                    pendingRatio = getRatioFromEvent(ev);
                    updateScrubPreview(pendingRatio);
                };

                const onEnd = (ev) => {
                    window.removeEventListener('mousemove', onMove, true);
                    window.removeEventListener('mouseup', onEnd, true);
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onEnd);

                    if (!isDragging) return;
                    isDragging = false;
                    this._isProgressBarDragging = false;
                    progressBar.classList.remove('scrubbing');

                    const bubble = document.getElementById('osd-scrub-bubble');
                    if (bubble) bubble.style.opacity = '';

                    if (pendingRatio !== null && this.canSeek()) {
                        const targetTime = pendingRatio * this.video.duration;
                        pendingRatio = null;
                        this.seekTo(targetTime, true);
                    }
                    this.autoHideOSD();
                };

                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('mouseup', onEnd, true);
                window.addEventListener('touchmove', onMove, { passive: true });
                window.addEventListener('touchend', onEnd);
            };

            // Standard mouse events for LG Magic Remote (webOS 3.x / Chromium 38)
            progressBar.addEventListener('mousedown', onStart);
            progressBar.addEventListener('touchstart', onStart, { passive: true });

            // Direct click on seek bar
            progressBar.addEventListener('click', (e) => {
                if (!this.canSeek()) return;
                const ratio = getRatioFromEvent(e);
                const targetTime = ratio * this.video.duration;
                this.seekTo(targetTime, true);
                this.autoHideOSD();
            });

            // Hover preview with Magic Remote pointer
            progressBar.addEventListener('mousemove', (e) => {
                if (!isDragging && this.canSeek()) {
                    this.autoHideOSD();
                    const ratio = getRatioFromEvent(e);
                    const targetTime = ratio * this.video.duration;
                    const bubble = document.getElementById('osd-scrub-bubble');
                    if (bubble) {
                        bubble.textContent = this._fmtTime(targetTime);
                        bubble.style.opacity = '1';
                    }
                }
            });

            progressBar.addEventListener('mouseleave', () => {
                if (!isDragging) {
                    const bubble = document.getElementById('osd-scrub-bubble');
                    if (bubble) bubble.style.opacity = '';
                }
            });
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
            this._recordWatchProgress(true); // Reached 100% -> cleans up per 95% threshold
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
            this.app.toast('No stream URL provided');
            return;
        }

        // Save last focused element and originating screen
        this.lastFocusedElement = document.activeElement;
        const seriesScreen = document.getElementById('series-detail-screen');
        this.originScreen = (seriesScreen && seriesScreen.classList.contains('active')) ? 'series-detail' : 'main-shell';

        this.currentItem = item;
        this.seriesContext = item.seriesContext || null;
        this._userPaused = false;
        this._initialSeekPending = (options && typeof options.initialSeekTime === 'number' && options.initialSeekTime > 0)
            ? options.initialSeekTime
            : null;
        this._lastProgressSaveTime = 0;

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
        // Save watch progress immediately before stopping playback
        this._recordWatchProgress();

        if (this.isChannelDrawerOpen) {
            this.closeChannelDrawer();
        }

        this._destroyPlayers();
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

            // Restore focus to current episode card in series detail screen
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

            // If returning to Home screen, refresh Home View so Continue Watching row updates instantly
            if (this.app && this.app.currentSection === 'home' && this.app.homeView) {
                this.app.homeView.render(this.app.liveChannels, this.app.movies, this.app.series);
            }

            if (this.lastFocusedElement && document.contains(this.lastFocusedElement)) {
                setTimeout(() => {
                    try { this.lastFocusedElement.focus(); } catch(e) {}
                }, 60);
            }
        }
    },

    _focusDrawerItem(el) {
        if (!el) return;
        if (window.IPTV.SpatialNav) {
            window.IPTV.SpatialNav.focusElement(el);
        } else {
            el.focus();
        }
        try {
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch(e) {}
    },

    handleDrawerKey(e, keyHandler) {
        if (!keyHandler) return;

        // 1. Back button: dismiss drawer without switching channel
        if (keyHandler.isBackKey(e)) {
            this.closeChannelDrawer();
            return;
        }

        // 2. Channel Up / Down hardware remote keys: scroll channel list by page
        if (keyHandler.isChannelUp(e) || keyHandler.isChannelDown(e)) {
            const listEl = document.getElementById('drawer-channel-list');
            if (listEl) {
                listEl.scrollBy({ top: keyHandler.isChannelDown(e) ? 280 : -280, behavior: 'smooth' });
            }
            return;
        }

        const drawer = document.getElementById('player-channel-drawer');
        if (!drawer) return;

        // 3. Directional D-pad navigation inside drawer
        const dir = keyHandler.getDirection(e);
        if (dir) {
            let active = document.activeElement;

            // If active element is not inside drawer, focus playing channel or first channel
            if (!active || !drawer.contains(active)) {
                const target = drawer.querySelector('.drawer-channel-item.active-playing, .drawer-channel-item, .drawer-cat-btn');
                if (target) {
                    this._focusDrawerItem(target);
                    return;
                }
            }

            // Case A: Focused on a Channel Item in the vertical list
            if (active.classList.contains('drawer-channel-item')) {
                if (dir === 'down') {
                    const idx = parseInt(active.getAttribute('data-index'), 10);
                    if (!isNaN(idx) && idx >= this.drawerRenderedCount - 6) {
                        this._appendDrawerChannelChunk(25);
                    }
                    const next = active.nextElementSibling;
                    if (next && next.classList.contains('drawer-channel-item')) {
                        this._focusDrawerItem(next);
                        return;
                    }
                    return; // Clamp at bottom
                }
                if (dir === 'up') {
                    const prev = active.previousElementSibling;
                    if (prev && prev.classList.contains('drawer-channel-item')) {
                        this._focusDrawerItem(prev);
                        return;
                    }
                    // At top of channel list: navigate up to active category pill
                    const activeCat = drawer.querySelector('.drawer-cat-btn.active') || drawer.querySelector('.drawer-cat-btn');
                    if (activeCat) {
                        this._focusDrawerItem(activeCat);
                        return;
                    }
                    return;
                }
                if (dir === 'left') {
                    // Page up by 5 items
                    const items = Array.from(drawer.querySelectorAll('.drawer-channel-item'));
                    const curIdx = items.indexOf(active);
                    if (curIdx > 0) {
                        const targetIdx = Math.max(0, curIdx - 5);
                        this._focusDrawerItem(items[targetIdx]);
                    }
                    return;
                }
                if (dir === 'right') {
                    // Page down by 5 items
                    const idx = parseInt(active.getAttribute('data-index'), 10);
                    if (!isNaN(idx) && idx >= this.drawerRenderedCount - 10) {
                        this._appendDrawerChannelChunk(25);
                    }
                    const items = Array.from(drawer.querySelectorAll('.drawer-channel-item'));
                    const curIdx = items.indexOf(active);
                    if (curIdx >= 0 && curIdx < items.length - 1) {
                        const targetIdx = Math.min(items.length - 1, curIdx + 5);
                        this._focusDrawerItem(items[targetIdx]);
                    }
                    return;
                }
            }

            // Case B: Focused on a Category Pill button
            if (active.classList.contains('drawer-cat-btn')) {
                if (dir === 'right') {
                    const next = active.nextElementSibling;
                    if (next && next.classList.contains('drawer-cat-btn')) {
                        this._focusDrawerItem(next);
                        return;
                    }
                    return; // Clamp at end of category row
                }
                if (dir === 'left') {
                    const prev = active.previousElementSibling;
                    if (prev && prev.classList.contains('drawer-cat-btn')) {
                        this._focusDrawerItem(prev);
                        return;
                    }
                    return; // Clamp at beginning of category row
                }
                if (dir === 'down') {
                    // Move down into channel list: prioritize playing channel, else first channel
                    const ch = drawer.querySelector('.drawer-channel-item.active-playing') || drawer.querySelector('.drawer-channel-item');
                    if (ch) {
                        this._focusDrawerItem(ch);
                        return;
                    }
                    return;
                }
                if (dir === 'up') {
                    const closeBtn = document.getElementById('drawer-close-btn');
                    if (closeBtn) {
                        this._focusDrawerItem(closeBtn);
                        return;
                    }
                    return;
                }
            }

            // Case C: Close Button
            if (active.id === 'drawer-close-btn') {
                if (dir === 'down') {
                    const activeCat = drawer.querySelector('.drawer-cat-btn.active') || drawer.querySelector('.drawer-cat-btn');
                    if (activeCat) {
                        this._focusDrawerItem(activeCat);
                        return;
                    }
                }
                return;
            }

            // Fallback to spatial navigation inside drawer
            const handled = window.IPTV.SpatialNav ? window.IPTV.SpatialNav.navigate(dir) : false;
            if (handled) return;
        }

        // 4. Enter / Remote OK key
        if (keyHandler.isEnterKey(e)) {
            const active = document.activeElement;
            if (active && typeof active.click === 'function') {
                active.click();
                return;
            }
        }
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

        const topBtns = [
            document.getElementById('player-back'),
            document.getElementById('osd-channels-btn'),
            document.getElementById('osd-fav')
        ].filter(b => b && b.style.display !== 'none');

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

        // Tier 1: Active is in Top Bar Buttons
        const topIdx = topBtns.indexOf(active);
        if (topIdx >= 0) {
            if (dir === 'left' && topIdx > 0) {
                topBtns[topIdx - 1].focus();
                return;
            }
            if (dir === 'right' && topIdx < topBtns.length - 1) {
                topBtns[topIdx + 1].focus();
                return;
            }
            if (dir === 'down') {
                if (progressBar && !this.isLiveStream()) {
                    progressBar.focus();
                } else {
                    const pp = document.getElementById('osd-playpause') || bottomBtns[0];
                    if (pp) pp.focus();
                }
                return;
            }
            return;
        }

        // Tier 2: Active is Middle Progress Bar
        if (active === progressBar || (progressBar && progressBar.contains(active))) {
            if (dir === 'up') {
                if (topBtns.length > 0) topBtns[0].focus();
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
                } else if (topBtns.length > 0) {
                    topBtns[0].focus();
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


    _scriptPromises: {},

    _loadScriptOnce(src) {
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

    _getCandidateStrategy(rawUrl) {
        if (!rawUrl) return '';
        if (rawUrl.indexOf('mse-hls:') === 0) return 'mse-hls';
        if (rawUrl.indexOf('mse-ts:') === 0) return 'mse-ts';
        const isProxy = rawUrl.indexOf('/api/proxy') !== -1;
        const decoded = decodeURIComponent(rawUrl);
        if (/\.m3u8($|\?)/i.test(decoded)) return isProxy ? 'proxy-hls' : 'native-hls';
        if (/\.(ts|mpegts)($|\?)/i.test(decoded)) return isProxy ? 'proxy-ts' : 'native-ts';
        return isProxy ? 'proxy-raw' : 'native-raw';
    },

    _markCandidateSuccess(rawCandidateUrl) {
        this._clearCandidateWatchdog();
        if (this.isLiveStream() && this.app && this.app.connection && window.IPTV.Storage && window.IPTV.Storage.saveStreamStrategy) {
            const strat = this._getCandidateStrategy(rawCandidateUrl);
            if (strat) {
                window.IPTV.Storage.saveStreamStrategy(this.app.connection, strat);
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

        const canUseMse = typeof window.MediaSource !== 'undefined';

        if (item.type === 'live') {
            let hlsCandidate = null;
            let tsCandidate = null;

            if (item.hlsUrl) {
                hlsCandidate = item.hlsUrl;
            } else if (item.url && item.url.includes('.m3u8')) {
                hlsCandidate = item.url;
            } else if (item.url && item.url.includes('.ts')) {
                hlsCandidate = item.url.replace(/\.ts($|\?)/i, '.m3u8$1');
            }

            if (item.url && item.url.includes('.ts')) {
                tsCandidate = item.url;
            } else if (item.url && item.url.includes('.m3u8')) {
                tsCandidate = item.url.replace(/\.m3u8($|\?)/i, '.ts$1');
            } else if (item.hlsUrl && item.hlsUrl.includes('.m3u8')) {
                tsCandidate = item.hlsUrl.replace(/\.m3u8($|\?)/i, '.ts$1');
            } else if (item.url) {
                tsCandidate = item.url;
            }

            const rawCandidate = item.fallbackUrl || (item.url ? item.url.replace(/\.(ts|m3u8)($|\?)/i, '$2') : null);

            // Priority 1: HLS (.m3u8) via MSE & Direct
            if (hlsCandidate) {
                if (canUseMse) {
                    add(`mse-hls:${hlsCandidate}`);
                }
                add(hlsCandidate);
                add(toProxy(hlsCandidate));
            }
            // Priority 2: MPEG-TS (.ts) via MSE & Direct
            if (tsCandidate) {
                if (canUseMse) {
                    add(`mse-ts:${tsCandidate}`);
                }
                add(tsCandidate);
                add(toProxy(tsCandidate));
            }
            // Priority 3: Extensionless stream URL
            if (rawCandidate) {
                add(rawCandidate);
                add(toProxy(rawCandidate));
            }

            // Promote remembered winning strategy for this server to index 0 for < 2s channel zapping
            const preferredStrategy = (this.app && this.app.connection && window.IPTV.Storage && window.IPTV.Storage.getStreamStrategy)
                ? window.IPTV.Storage.getStreamStrategy(this.app.connection)
                : null;
            if (preferredStrategy && list.length > 1) {
                const prefIdx = list.findIndex(u => this._getCandidateStrategy(u) === preferredStrategy);
                if (prefIdx > 0) {
                    const [winner] = list.splice(prefIdx, 1);
                    list.unshift(winner);
                }
            }
            return list;
        }

        // Movies & Series (VOD)
        const vodUrl = item.url || item.hlsUrl || item.fallbackUrl;
        if (vodUrl) {
            const isM3u8Vod = /\.m3u8($|\?)/i.test(vodUrl);
            const isTsVod = /\.(ts|mpegts)($|\?)/i.test(vodUrl);

            if (isM3u8Vod && canUseMse) {
                add(`mse-hls:${vodUrl}`);
            } else if (isTsVod && canUseMse) {
                add(`mse-ts:${vodUrl}`);
            }
            add(vodUrl);
            if (item.url && item.url !== vodUrl) add(item.url);
            if (item.hlsUrl && item.hlsUrl !== vodUrl) add(item.hlsUrl);
            if (item.fallbackUrl && item.fallbackUrl !== vodUrl) add(item.fallbackUrl);
            add(toProxy(vodUrl));
        }

        return list;
    },

    _clearCandidateWatchdog() {
        if (this._candidateWatchdog) {
            clearTimeout(this._candidateWatchdog);
            this._candidateWatchdog = null;
        }
    },

    _startCandidateWatchdog(item, sessionId, timeoutMs = 8500) {
        this._clearCandidateWatchdog();
        this._candidateWatchdog = setTimeout(() => {
            if (this._loadSessionId !== sessionId) return;
            if (!this.visible || this.currentItem !== item) return;
            const hasVideoData = this.video && (this.video.readyState >= 2 || this.video.currentTime > 0);
            if (!hasVideoData) {
                console.warn('[PlayerService] Candidate timed out waiting for data, trying next...');
                this._tryNextCandidate(item, sessionId);
            }
        }, timeoutMs);
    },

    _destroyPlayers() {
        this._clearCandidateWatchdog();
        if (this.video) {
            this.video.onerror = null;
            this.video.onplaying = null;
            this.video.onloadeddata = null;
            this.video.oncanplay = null;
            this.video.onended = null;
        }
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

    async _loadStreamCandidate(rawCandidateUrl, item) {
        this._destroyPlayers();
        if (!this.video) return;

        this._loadSessionId = (this._loadSessionId || 0) + 1;
        const currentSessionId = this._loadSessionId;

        this.video.pause();
        try {
            this.video.removeAttribute('src');
            this.video.load();
        } catch(e) {}

        const forceMseHls = rawCandidateUrl.indexOf('mse-hls:') === 0;
        const forceMseTs = rawCandidateUrl.indexOf('mse-ts:') === 0;
        const url = forceMseHls
            ? rawCandidateUrl.slice(8)
            : (forceMseTs ? rawCandidateUrl.slice(7) : rawCandidateUrl);

        const isLive = this.isLiveStream();
        const decodedUrl = decodeURIComponent(url);
        const isM3u8 = forceMseHls || /\.m3u8($|\?)/i.test(decodedUrl);
        const isTs = forceMseTs || (!isM3u8 && (/\.(ts|mpegts)($|\?)/i.test(decodedUrl) || (isLive && !/\.(mp4|mkv|avi|mov|webm)($|\?)/i.test(decodedUrl))));

        console.log(`[PlayerService] Loading stream candidate [${this.currentCandidateIndex + 1}/${this.currentCandidates.length}]: ${rawCandidateUrl}`);

        this._startCandidateWatchdog(item, currentSessionId, isLive ? 7000 : 12000);

        // 1. HLS (.m3u8) streams via Hls.js MSE
        if (isM3u8 && (forceMseHls || typeof window.MediaSource !== 'undefined')) {
            if (!window.Hls) {
                await this._loadScriptOnce('js/hls.min.js');
                if (this._loadSessionId !== currentSessionId) return;
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
                    if (this._initialSeekPending !== null && this._initialSeekPending > 0) {
                        hlsConfig.startPosition = this._initialSeekPending;
                    }
                    const hls = new Hls(hlsConfig);
                    this.hls = hls;
                    hls.loadSource(url);
                    hls.attachMedia(this.video);

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (this._loadSessionId !== currentSessionId) return;
                        this._markCandidateSuccess(rawCandidateUrl);
                        const p = this.video.play();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    });

                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (this._loadSessionId !== currentSessionId) return;
                        if (data.fatal) {
                            console.warn('[PlayerService] HLS fatal error:', data.type, data.details);
                            this._tryNextCandidate(item, currentSessionId);
                        }
                    });
                    return;
                } catch(e) {
                    console.warn('[PlayerService] Hls.js init failed, falling back to native:', e);
                }
            }
        }

        // 2. MPEG-TS (.ts) streams via mpegts.js MSE
        if (isTs && (forceMseTs || typeof window.MediaSource !== 'undefined')) {
            if (!window.mpegts) {
                await this._loadScriptOnce('js/mpegts.js');
                if (this._loadSessionId !== currentSessionId) return;
            }
            if (window.mpegts && mpegts.isSupported()) {
                try {
                    const player = mpegts.createPlayer({
                        type: 'mse',
                        isLive: isLive,
                        url: url
                    }, {
                        enableWorker: false,
                        lazyLoadMaxDuration: 30,
                        lazyLoadRecoverDuration: 15,
                        seekType: isLive ? 'range' : 'param'
                    });
                    this.mpegtsPlayer = player;
                    player.attachMediaElement(this.video);
                    player.load();
                    const p = player.play();
                    if (p && typeof p.catch === 'function') p.catch(() => {});

                    const onMsePlaying = () => {
                        if (this._loadSessionId !== currentSessionId) return;
                        this._markCandidateSuccess(rawCandidateUrl);
                        this.video.removeEventListener('playing', onMsePlaying);
                        this.video.removeEventListener('loadeddata', onMsePlaying);
                    };
                    this.video.addEventListener('playing', onMsePlaying);
                    this.video.addEventListener('loadeddata', onMsePlaying);

                    player.on(mpegts.Events.ERROR, (errType, errDetail) => {
                        if (this._loadSessionId !== currentSessionId) return;
                        this.video.removeEventListener('playing', onMsePlaying);
                        this.video.removeEventListener('loadeddata', onMsePlaying);
                        console.warn('[PlayerService] mpegts error:', errType, errDetail);
                        this._tryNextCandidate(item, currentSessionId);
                    });
                    return;
                } catch(e) {
                    console.warn('[PlayerService] mpegts init error:', e);
                }
            }
        }

        // 3. Direct native hardware video playback (MP4 / MKV VOD, or native HLS fallback)
        this._playNativeDirect(url, item, rawCandidateUrl, currentSessionId);
    },

    _playNativeDirect(url, item, rawCandidateUrl, sessionId) {
        if (!this.video) return;

        // Clear any old <source> tags
        while (this.video.firstChild) {
            this.video.removeChild(this.video.firstChild);
        }

        const onPlaying = () => {
            if (this._loadSessionId !== sessionId) return;
            this._markCandidateSuccess(rawCandidateUrl || url);
            this.video.removeEventListener('playing', onPlaying);
            this.video.removeEventListener('loadeddata', onPlaying);
        };
        this.video.addEventListener('playing', onPlaying);
        this.video.addEventListener('loadeddata', onPlaying);

        this.video.onerror = () => {
            if (this._loadSessionId !== sessionId) return;
            this.video.removeEventListener('playing', onPlaying);
            this.video.removeEventListener('loadeddata', onPlaying);
            this.video.onerror = null;
            const err = this.video.error;
            console.warn('[PlayerService] Native video error:', err ? err.code : 'unknown', 'on URL:', url);
            this._tryNextCandidate(item, sessionId);
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

    _tryNextCandidate(item, fromSessionId) {
        if (fromSessionId !== undefined && fromSessionId !== this._loadSessionId) {
            return;
        }
        if (!this.visible || this.currentItem !== item) return;

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
        this._userPaused = false;
        this.video.play().catch(e => console.warn('Play blocked:', e));
        this._updatePlayPauseIcon(true);
        this.showSeekHUD('play', 'Play', '');
        this.showOSD();
    },

    pauseVideo() {
        if (!this.video) return;
        this._userPaused = true;
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

    canSeek() {
        if (!this.video || this.isLiveStream()) return false;
        if (!this.hasValidDuration()) return false;
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
        if (!this._cachedOsdEls) {
            this._cachedOsdEls = {
                bar: document.getElementById('osd-progress-bar'),
                fill: document.getElementById('osd-progress-fill'),
                thumb: document.getElementById('osd-progress-thumb'),
                cur: document.getElementById('osd-time-current'),
                dur: document.getElementById('osd-time-duration')
            };
        }
        return this._cachedOsdEls;
    },

    _updateProgressUI(currentTime, duration) {
        if (!duration || isNaN(duration) || !isFinite(duration) || duration <= 0) return;
        const pct = Math.max(0, Math.min(100, (currentTime / duration) * 100));
        const els = this._osdEls();
        if (els.fill) els.fill.style.width = `${pct}%`;
        if (els.thumb) els.thumb.style.left = `${pct}%`;
        if (els.cur) els.cur.textContent = this._fmtTime(currentTime);
        if (els.dur) els.dur.textContent = this._fmtTime(duration);
        if (els.bar) els.bar.setAttribute('aria-valuenow', Math.round(pct).toString());
    },

    seekTo(targetSeconds, startPlaying = true) {
        if (!this.video || !this.canSeek()) return;
        const duration = this.video.duration;
        const clamped = Math.max(0, Math.min(duration - 0.5, targetSeconds));

        // Update progress bar UI immediately
        this._updateProgressUI(clamped, duration);
        this.showOSD();

        // If Hls.js is active, instruct it to load fragments from the seek point
        if (this.hls && typeof this.hls.startLoad === 'function') {
            try { this.hls.startLoad(clamped); } catch(e) {}
        }

        // Perform native seek (always standard currentTime on progressive streams)
        try {
            this.video.currentTime = clamped;
        } catch(err) {
            console.warn('[PlayerService] Seek error:', err);
        }

        if (startPlaying) {
            this._userPaused = false;
        }

        // Guarantee playback starts from the seeked position
        const ensurePlaying = () => {
            if (!this._userPaused) {
                const p = this.video.play();
                if (p && typeof p.then === 'function') {
                    p.catch(e => console.warn('[PlayerService] Play after seek caught:', e));
                }
                this._updatePlayPauseIcon(true);
            }
        };

        // Self-removing listener (compatible with Chromium 38 where options object is treated as useCapture)
        const onSeeked = () => {
            this.video.removeEventListener('seeked', onSeeked);
            ensurePlaying();
            this._updateProgress();
        };
        this.video.addEventListener('seeked', onSeeked);

        // Immediate and timeout fallbacks in case seeked is delayed
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

        // Toggle buttons: Prev/Next for Live TV or Series, Rewind/Forward for Movies & Series
        const isLive = this.isLiveStream();
        const prevBtn = document.getElementById('osd-prev');
        const nextBtn = document.getElementById('osd-next');
        const rwBtn = document.getElementById('osd-rw');
        const ffBtn = document.getElementById('osd-ff');
        const channelsBtn = document.getElementById('osd-channels-btn');

        if (isLive) {
            if (channelsBtn) channelsBtn.style.display = '';
            if (prevBtn) {
                prevBtn.style.display = '';
                prevBtn.title = 'Previous Channel';
            }
            if (nextBtn) {
                nextBtn.style.display = '';
                nextBtn.title = 'Next Channel';
            }
            if (rwBtn) rwBtn.style.display = 'none';
            if (ffBtn) ffBtn.style.display = 'none';
        } else if (this.currentItem && this.currentItem.type === 'series') {
            if (channelsBtn) channelsBtn.style.display = 'none';
            if (rwBtn) rwBtn.style.display = '';
            if (ffBtn) ffBtn.style.display = '';

            const { hasPrev, hasNext } = this._getSeriesAdjacentEpisodes();
            if (prevBtn) {
                prevBtn.style.display = hasPrev ? '' : 'none';
                prevBtn.title = 'Previous Episode';
            }
            if (nextBtn) {
                nextBtn.style.display = hasNext ? '' : 'none';
                nextBtn.title = 'Next Episode';
            }
        } else {
            // Movie
            if (channelsBtn) channelsBtn.style.display = 'none';
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
        const isFav = this.app.isFavorite(this.currentItem);
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
        if (this.isChannelDrawerOpen) return;
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
        // Execute initial seek on resume when seekable ranges become ready
        this._checkPendingInitialSeek();

        // Throttled watch progress save
        this._throttledSaveProgress();

        if (!this.video || !this.isOSDVisible()) return;

        const els = this._osdEls();
        const bar = els.bar;
        const fill = els.fill;
        const thumb = els.thumb;
        const cur = els.cur;
        const dur = els.dur;

        const isLive = this.isLiveStream();
        if (isLive) {
            if (fill) fill.style.width = '100%';
            if (thumb) thumb.style.left = '100%';
            if (cur) cur.textContent = 'LIVE';
            if (dur) {
                dur.innerHTML = (window.IPTV && window.IPTV.Icons)
                    ? window.IPTV.Icons.get('liveDot', 'osd-live-svg') + '<span>LIVE</span>'
                    : 'LIVE';
            }
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

        if (!this.canSeek()) {
            // Still loading duration or seekable range from network
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
    },

    // ---- Series Adjacent Episode Navigation & Autoplay ----
    _getSeriesAdjacentEpisodes() {
        if (!this.seriesContext || !this.seriesContext.seasonsData) {
            return { hasPrev: false, hasNext: false };
        }
        const sc = this.seriesContext;
        const seasons = sc.seasonsData;
        const seasonKeys = Object.keys(seasons).sort((a, b) => Number(a) - Number(b));
        if (seasonKeys.length === 0) {
            return { hasPrev: false, hasNext: false };
        }

        // Single synthetic episode check (e.g. M3U single-episode series)
        const totalEpisodes = seasonKeys.reduce((acc, k) => acc + (seasons[k] ? seasons[k].length : 0), 0);
        if (totalEpisodes <= 1) {
            return { hasPrev: false, hasNext: false };
        }

        const curSeasonStr = String(sc.currentSeason || seasonKeys[0]);
        const curSeasonIdx = seasonKeys.indexOf(curSeasonStr);
        const curEpisodes = seasons[curSeasonStr] || [];
        const curEpIdx = typeof sc.currentEpisodeIndex === 'number'
            ? sc.currentEpisodeIndex
            : curEpisodes.findIndex(e => String(e.id) === String(sc.currentEpisodeId));

        let hasPrev = false;
        let prevSeason = null;
        let prevIndex = -1;

        if (curEpIdx > 0) {
            hasPrev = true;
            prevSeason = curSeasonStr;
            prevIndex = curEpIdx - 1;
        } else if (curSeasonIdx > 0) {
            const prevSeasonKey = seasonKeys[curSeasonIdx - 1];
            const prevEpisodes = seasons[prevSeasonKey] || [];
            if (prevEpisodes.length > 0) {
                hasPrev = true;
                prevSeason = prevSeasonKey;
                prevIndex = prevEpisodes.length - 1;
            }
        }

        let hasNext = false;
        let nextSeason = null;
        let nextIndex = -1;

        if (curEpIdx < curEpisodes.length - 1) {
            hasNext = true;
            nextSeason = curSeasonStr;
            nextIndex = curEpIdx + 1;
        } else if (curSeasonIdx >= 0 && curSeasonIdx < seasonKeys.length - 1) {
            const nextSeasonKey = seasonKeys[curSeasonIdx + 1];
            const nextEpisodes = seasons[nextSeasonKey] || [];
            if (nextEpisodes.length > 0) {
                hasNext = true;
                nextSeason = nextSeasonKey;
                nextIndex = 0;
            }
        }

        return {
            hasPrev,
            hasNext,
            prevSeason,
            prevIndex,
            nextSeason,
            nextIndex
        };
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
            this.app.toast('No next episode available');
            return;
        }

        // Save progress before advancing
        this._recordWatchProgress(true);

        const nextPlayItem = this.app.seriesDetailView.buildEpisodePlayItem(
            this.app.connection,
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
            this.app.toast(`Next: ${nextPlayItem.name}`);
        }
    },

    prevEpisode() {
        const { hasPrev, prevSeason, prevIndex } = this._getSeriesAdjacentEpisodes();
        if (!hasPrev || !this.app || !this.app.seriesDetailView || !this.seriesContext) {
            this.app.toast('No previous episode available');
            return;
        }

        this._recordWatchProgress();

        const prevPlayItem = this.app.seriesDetailView.buildEpisodePlayItem(
            this.app.connection,
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
            this.app.toast(`Previous: ${prevPlayItem.name}`);
        }
    },

    // ---- In-Player Side Channel List Drawer (Live TV) ----
    toggleChannelDrawer() {
        if (this.isChannelDrawerOpen) {
            this.closeChannelDrawer();
        } else {
            this.openChannelDrawer();
        }
    },

    openChannelDrawer() {
        if (!this.isLiveStream()) return;
        this.isChannelDrawerOpen = true;
        this.hideOSD();

        const drawer = document.getElementById('player-channel-drawer');
        const backdrop = document.getElementById('player-drawer-backdrop');
        if (drawer) drawer.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');

        // Always default to 'All Channels' category selected when opening
        this.selectedDrawerCategory = null;

        this.renderDrawerCategories();
        this.renderDrawerChannels();

        // Focus active playing channel and scroll into view
        setTimeout(() => {
            if (!drawer) return;
            const activeCh = drawer.querySelector('.drawer-channel-item.active-playing, .drawer-channel-item');
            if (activeCh) {
                this._focusDrawerItem(activeCh);
            }
        }, 50);
    },

    closeChannelDrawer() {
        if (!this.isChannelDrawerOpen) return;
        this.isChannelDrawerOpen = false;

        const drawer = document.getElementById('player-channel-drawer');
        const backdrop = document.getElementById('player-drawer-backdrop');
        if (drawer) drawer.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');

        this.showOSD();
        const chBtn = document.getElementById('osd-channels-btn');
        if (chBtn) {
            if (window.IPTV.SpatialNav) {
                window.IPTV.SpatialNav.focusElement(chBtn);
            } else {
                chBtn.focus();
            }
        }
    },

    renderDrawerCategories() {
        const catBar = document.getElementById('drawer-categories-bar');
        if (!catBar) return;
        catBar.innerHTML = '';

        const cats = (this.app && this.app.categories && Array.isArray(this.app.categories.live))
            ? this.app.categories.live
            : [];

        // All Channels pill
        const allBtn = document.createElement('button');
        allBtn.className = `drawer-cat-btn ${!this.selectedDrawerCategory ? 'active' : ''}`;
        allBtn.textContent = 'All Channels';
        allBtn.tabIndex = 0;
        allBtn.addEventListener('click', () => {
            this.selectedDrawerCategory = null;
            catBar.querySelectorAll('.drawer-cat-btn').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            this.renderDrawerChannels();
        });
        catBar.appendChild(allBtn);

        cats.forEach(cat => {
            const catName = typeof cat === 'string' ? cat : (cat.category_name || cat.name || '');
            if (!catName) return;
            const btn = document.createElement('button');
            const isActive = this.selectedDrawerCategory === catName;
            btn.className = `drawer-cat-btn ${isActive ? 'active' : ''}`;
            btn.textContent = catName;
            btn.tabIndex = 0;
            btn.addEventListener('click', () => {
                this.selectedDrawerCategory = catName;
                catBar.querySelectorAll('.drawer-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderDrawerChannels();
            });
            catBar.appendChild(btn);
            if (isActive) {
                setTimeout(() => {
                    try { btn.scrollIntoView({ inline: 'center' }); } catch(e) {}
                }, 40);
            }
        });
    },

    renderDrawerChannels() {
        const listEl = document.getElementById('drawer-channel-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        const allChannels = (this.app && Array.isArray(this.app.liveChannels)) ? this.app.liveChannels : [];
        const selCat = this.selectedDrawerCategory;

        this.drawerFilteredChannels = allChannels.filter(ch => {
            if (selCat) {
                const chCat = ch.category || ch.category_name || '';
                if (chCat !== selCat) return false;
            }
            return true;
        });

        if (this.drawerFilteredChannels.length === 0) {
            listEl.innerHTML = '<p class="empty-state" style="padding:32px 0;">No channels in this category.</p>';
            this.drawerRenderedCount = 0;
            return;
        }

        this.drawerRenderedCount = 0;

        // Find playing channel index in the filtered list
        let currentIdx = -1;
        if (this.currentItem) {
            currentIdx = this.drawerFilteredChannels.findIndex(ch =>
                ch.id === this.currentItem.id || (ch._idx !== undefined && ch._idx === this.currentItem._idx)
            );
        }

        // Render initial chunk (at least 35, or up through current channel)
        const initialChunk = Math.min(
            this.drawerFilteredChannels.length,
            Math.max(35, currentIdx >= 0 ? currentIdx + 15 : 35)
        );

        this._appendDrawerChannelChunk(initialChunk);

        // Bind scroll listener for lazy pagination
        if (!this._drawerScrollBound) {
            this._drawerScrollBound = true;
            listEl.addEventListener('scroll', () => {
                if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 250) {
                    this._appendDrawerChannelChunk(25);
                }
            });
        }
    },

    _appendDrawerChannelChunk(chunkSize) {
        const listEl = document.getElementById('drawer-channel-list');
        if (!listEl || !this.drawerFilteredChannels) return;

        const start = this.drawerRenderedCount;
        const end = Math.min(this.drawerFilteredChannels.length, start + chunkSize);
        if (start >= end) return;

        const frag = document.createDocumentFragment();
        for (let i = start; i < end; i++) {
            const ch = this.drawerFilteredChannels[i];
            const itemEl = document.createElement('div');
            const isCurrent = this.currentItem && (ch.id === this.currentItem.id || (ch._idx !== undefined && ch._idx === this.currentItem._idx));
            itemEl.className = `drawer-channel-item ${isCurrent ? 'active-playing' : ''}`;
            itemEl.tabIndex = 0;
            itemEl.setAttribute('data-index', i);

            const chNum = ch.num ? String(ch.num) : String(i + 1);
            const numSpan = document.createElement('span');
            numSpan.className = 'drawer-ch-num';
            numSpan.textContent = chNum;
            itemEl.appendChild(numSpan);

            const nameEl = document.createElement('span');
            nameEl.className = 'drawer-ch-name';
            nameEl.textContent = ch.name || 'Channel';
            itemEl.appendChild(nameEl);

            if (isCurrent) {
                const badge = document.createElement('span');
                badge.className = 'drawer-playing-badge';
                badge.textContent = 'PLAYING';
                itemEl.appendChild(badge);
            }

            itemEl.addEventListener('click', () => {
                this.closeChannelDrawer();
                this.app.onItemClick(ch, 'live');
            });

            frag.appendChild(itemEl);
        }

        listEl.appendChild(frag);
        this.drawerRenderedCount = end;
    },

    // ---- Watch Progress Persistence (Movies & Series) ----
    _recordWatchProgress(isCompleted = false) {
        if (!this.currentItem || this.isLiveStream()) return;
        if (!this.video) return;

        const duration = this.video.duration;
        const currentTime = this.video.currentTime || 0;

        if (!duration || isNaN(duration) || duration <= 0 || !isFinite(duration)) return;

        const pct = currentTime / duration;
        const conn = this.app ? this.app.connection : null;
        if (!conn || !window.IPTV.Storage) return;

        const isSeries = this.currentItem.type === 'series';
        const sc = isSeries ? this.currentItem.seriesContext : null;
        const seriesId = sc ? sc.seriesId : (isSeries ? (this.currentItem.seriesId || this.currentItem.id) : null);
        const recordId = seriesId ? `series_${seriesId}` : String(this.currentItem.id);

        // Auto-cleanup / advance to next episode when >= 95% or completed
        if (pct >= 0.95 || isCompleted) {
            if (isSeries) {
                const adjacent = this._getSeriesAdjacentEpisodes();
                if (adjacent && adjacent.hasNext && adjacent.nextEpisode) {
                    const nextEp = adjacent.nextEpisode;
                    const nextRecord = {
                        id: recordId,
                        type: 'series',
                        name: (sc && sc.seriesName) || this.currentItem.name,
                        poster: (sc && sc.poster) || this.currentItem.logo || this.currentItem.poster || '',
                        position: 0,
                        duration: 0,
                        updatedAt: Date.now(),
                        seriesId: seriesId,
                        seriesName: (sc && sc.seriesName) || this.currentItem.name,
                        seasonNum: adjacent.nextSeason,
                        episodeNum: adjacent.nextIndex + 1,
                        episodeId: nextEp.id || nextEp.episode_num || null,
                        episodeTitle: nextEp.title || nextEp.name || `Episode ${adjacent.nextIndex + 1}`
                    };
                    window.IPTV.Storage.saveWatchProgressItem(conn, nextRecord);
                    return;
                }
            }
            window.IPTV.Storage.removeWatchProgress(conn, recordId);
            return;
        }

        // Do not record trivial scrubbing at start (< 5s)
        if (currentTime < 5) return;

        const record = {
            id: recordId,
            type: this.currentItem.type || 'movie',
            name: (sc && sc.seriesName) || this.currentItem.name,
            poster: (sc && sc.poster) || this.currentItem.logo || this.currentItem.poster || '',
            position: Math.floor(currentTime),
            duration: Math.floor(duration),
            updatedAt: Date.now()
        };

        if (isSeries) {
            record.seriesId = seriesId;
            record.seriesName = (sc && sc.seriesName) || this.currentItem.name;
            record.seasonNum = sc ? sc.currentSeason : (this.currentItem.seasonNum || 1);
            record.episodeNum = sc ? sc.currentEpisodeNum : (this.currentItem.episodeNum || 1);
            record.episodeId = sc ? sc.currentEpisodeId : (this.currentItem.episodeId || this.currentItem.id);
            record.episodeTitle = sc ? sc.currentEpisodeTitle : (this.currentItem.episodeTitle || this.currentItem.name);
        }

        try {
            window.IPTV.Storage.saveWatchProgressItem(conn, record);
        } catch(err) {
            // Failure handling: quota or write errors are caught and ignored so saving can never interrupt playback
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
