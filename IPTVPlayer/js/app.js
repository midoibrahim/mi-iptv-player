/* ============================================================
   IPTV Player — Main Application Controller (Mediator)
   Orchestrates core engines, services, reusable components & views
   Target: LG webOS TV / Modern CTV
   ============================================================ */

window.IPTV = window.IPTV || {};

class IPTVApp {
    constructor() {
        this.connection = null;
        this.liveChannels = [];
        this.movies = [];
        this.series = [];
        this.categories = { live: [], movies: [], series: [] };
        this.favorites = new Set();
        this.currentSection = 'home';
        this.currentChannelIndex = -1;
        this.sectionHistory = [];

        // Subsystems & Views
        this.playerService = window.IPTV.PlayerService;
        this.loginView = window.IPTV.LoginView;
        this.homeView = window.IPTV.HomeView;
        this.seriesDetailView = window.IPTV.SeriesDetailView;
        this.searchView = window.IPTV.SearchView;
        this.settingsView = window.IPTV.SettingsView;

        // Reusable Browse Views
        this.browseViews = {};

        this._init();
    }

    _init() {
        // 1. Initialize Theme & Settings
        window.IPTV.ThemeManager.init();
        this.favorites = window.IPTV.Storage.getFavorites();

        // 2. Initialize Subsystems
        this.playerService.init(this);
        this.seriesDetailView.init(this);
        this.searchView.init(this);
        this.settingsView.init(this);
        this.homeView.init(this);
        if (window.IPTV.DownloadManager) {
            window.IPTV.DownloadManager.init(this);
        }

        // 3. Initialize Reusable Browse Views (Live TV, Movies, Series)
        this.browseViews.live = new window.IPTV.BrowseView('live', {
            title: 'Live TV',
            cardType: 'live',
            unitName: 'channels',
            app: this
        });

        this.browseViews.movies = new window.IPTV.BrowseView('movies', {
            title: 'Movies',
            cardType: 'movie',
            unitName: 'movies',
            app: this
        });

        this.browseViews.series = new window.IPTV.BrowseView('series', {
            title: 'Series',
            cardType: 'series',
            unitName: 'series',
            app: this
        });

        // 4. Initialize Navigation & Remote Controls
        this._bindNavigation();
        window.IPTV.KeyHandler.init(this);

        // 5. Initialize Login/Profiles View
        if (window.IPTV.TvServer) {
            window.IPTV.TvServer.stop();
        }
        this.loginView.init(this);
    }

    _bindNavigation() {
        // Side rail navigation items
        document.querySelectorAll('.nav-item[data-section]').forEach(item => {
            item.addEventListener('click', () => {
                this.navigateTo(item.dataset.section);
            });
        });

        // Mouse wheel scroll support for content area
        const contentArea = document.getElementById('content-area');
        if (contentArea) {
            contentArea.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    contentArea.scrollTop += e.deltaY;
                }
            }, { passive: true });
        }
    }

    navigateTo(section, pushHistory = true) {
        const contentArea = document.getElementById('content-area');
        const prevSec = this.currentSection ? document.getElementById(`section-${this.currentSection}`) : null;
        if (prevSec && contentArea) {
            prevSec._savedScrollTop = contentArea.scrollTop;
        }

        if (pushHistory && this.currentSection && this.currentSection !== section) {
            // Push previous section to history stack
            this.sectionHistory.push(this.currentSection);
        }

        this.currentSection = section;

        // Update nav items
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
        if (navItem) navItem.classList.add('active');

        // Update active section
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const sec = document.getElementById(`section-${section}`);
        if (sec) {
            sec.classList.add('active');

            // Ensure lazy-rendered browse view is populated when navigated to
            if (this.browseViews[section]) {
                this.browseViews[section].ensureRendered();
            }

            // If navigating to favorites, refresh favorites list
            if (section === 'favorites') {
                this.renderFavorites();
            }

            if (section === 'downloads' && window.IPTV.DownloadManager) {
                window.IPTV.DownloadManager._refreshData();
            }

            // Restore section scroll position (or default to top)
            if (contentArea) {
                contentArea.scrollTop = typeof sec._savedScrollTop === 'number' ? sec._savedScrollTop : 0;
            }

            // Restore last focused item in section or focus first non-input focusable item
            // NEVER auto-focus input elements so the TV virtual keyboard never pops up automatically
            setTimeout(() => {
                const activeRoot = window.IPTV.SpatialNav ? window.IPTV.SpatialNav.getActiveRoot() : document.body;
                let target = null;
                if (sec._lastFocusedEl && document.contains(sec._lastFocusedEl) && sec._lastFocusedEl.tagName !== 'INPUT' &&
                    (!window.IPTV.SpatialNav || window.IPTV.SpatialNav.isFocusable(sec._lastFocusedEl, activeRoot))) {
                    target = sec._lastFocusedEl;
                }
                if (!target) {
                    target = sec.querySelector('.category-item.active, .category-item, .card, .theme-swatch-card.active, .btn-primary, button:not([disabled])')
                        || Array.from(sec.querySelectorAll('[tabindex="0"], button, select')).find(el => el.tagName !== 'INPUT');
                }
                if (target) {
                    if (window.IPTV.SpatialNav) {
                        window.IPTV.SpatialNav.focusElement(target);
                    } else {
                        target.focus();
                    }
                }
            }, 60);
        }
    }

    goBack() {
        // -1. If Continue Watching resume modal is open, close it and restore focus
        const cwModal = document.getElementById('continue-watching-modal');
        if (cwModal && !cwModal.classList.contains('hidden')) {
            if (this.homeView && typeof this.homeView.closeResumeModal === 'function') {
                this.homeView.closeResumeModal();
            } else {
                cwModal.classList.add('hidden');
            }
            return true;
        }

        // 0. If profile delete confirmation modal is open, close it and restore focus
        const confirmModal = document.getElementById('profile-delete-modal');
        if (confirmModal && !confirmModal.classList.contains('hidden')) {
            if (this.loginView && typeof this.loginView.closeDeleteModal === 'function') {
                this.loginView.closeDeleteModal();
            } else {
                confirmModal.classList.add('hidden');
            }
            return true;
        }

        // 1. If video player is visible, exit drawer or player back to the originating screen
        const playerScreen = document.getElementById('player-screen');
        const isPlayerOpen = (this.playerService && this.playerService.isVisible()) ||
                             (playerScreen && playerScreen.classList.contains('active')) ||
                             document.body.classList.contains('player-active');
        if (isPlayerOpen) {
            if (this.playerService && this.playerService.isChannelDrawerOpen) {
                this.playerService.closeChannelDrawer();
                return true;
            }
            if (this.playerService) {
                this.playerService.close();
            } else {
                if (playerScreen) playerScreen.classList.remove('active');
                document.body.classList.remove('player-active');
            }
            return true;
        }

        // 2. If series detail screen is active, close series detail back to browsing
        const seriesScreen = document.getElementById('series-detail-screen');
        if (seriesScreen && seriesScreen.classList.contains('active')) {
            this.seriesDetailView.close();
            return true;
        }

        // 3. If login form page is active, go back to saved profiles
        const formPage = document.getElementById('login-form-page');
        if (formPage && formPage.classList.contains('active')) {
            this.loginView.showProfilesPage();
            return true;
        }

        // 4. Any page/section other than home in main-shell returns directly to home
        const mainShell = document.getElementById('main-shell');
        if (mainShell && mainShell.classList.contains('active')) {
            if (this.currentSection !== 'home') {
                this.sectionHistory = [];
                this.navigateTo('home', false);
                return true;
            } else {
                // If already at Home screen: return to saved playlist profiles
                if (this.loginView) {
                    this.loginView.showProfilesPage();
                }
                mainShell.classList.remove('active');
                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) {
                    loginScreen.classList.add('active');
                    setTimeout(() => {
                        const first = loginScreen.querySelector('.profile-card, .add-profile-card, button');
                        if (first) first.focus();
                    }, 100);
                }
                return true;
            }
        }

        // 5. At login screen profiles (root level): Exit app
        window.IPTV.KeyHandler.exitApp();
        return false;
    }

    _applyCatalogData(conn, data, navigateHome = true) {
        this.liveChannels = data.liveChannels || [];
        this.movies = data.movies || [];
        this.series = data.series || [];
        this.categories = data.categories || { live: [], movies: [], series: [] };

        const navUser = document.getElementById('nav-user-info');
        if (navUser) {
            navUser.textContent = (data.userInfo && data.userInfo.username) ? data.userInfo.username : (conn.name || '');
        }

        // Switch to main shell
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('main-shell').classList.add('active');

        // Populate Sub-views
        this.homeView.render(this.liveChannels, this.movies, this.series);
        this.browseViews.live.setData(this.liveChannels, this.categories.live);
        this.browseViews.movies.setData(this.movies, this.categories.movies);
        this.browseViews.series.setData(this.series, this.categories.series);
        this.settingsView.updateInfo(conn);

        if (navigateHome) {
            this.navigateTo('home');
        }
    }

    async _fetchCatalogFromNetwork(conn, onProgress) {
        if (conn.type === 'xtream') {
            return window.IPTV.XtreamService.loadAll(conn, onProgress);
        }
        return window.IPTV.M3UParser.load(conn.url, onProgress);
    }

    async connect(conn) {
        // Leaving the QR setup screen: stop remote polling and terminate the local setup server
        if (this.loginView && typeof this.loginView.stopRemotePolling === 'function') {
            this.loginView.stopRemotePolling();
        }
        this.connection = conn;
        this.showLoading('Connecting...');

        try {
            // 1. Check IndexedDB CatalogCache for instant (< 300ms) startup on repeat launches
            const cached = window.IPTV.CatalogCache ? await window.IPTV.CatalogCache.get(conn) : null;
            const hasCachedStreams = cached && (
                (cached.liveChannels && cached.liveChannels.length > 0) ||
                (cached.movies && cached.movies.length > 0) ||
                (cached.series && cached.series.length > 0)
            );

            if (hasCachedStreams) {
                window.IPTV.Storage.saveConnection(conn);
                this.hideLoading();
                this._applyCatalogData(conn, cached, true);

                // Silently revalidate in the background without blocking UI
                this._fetchCatalogFromNetwork(conn, null).then((freshData) => {
                    if (this.connection !== conn || !freshData) return;
                    if (window.IPTV.CatalogCache) {
                        window.IPTV.CatalogCache.set(conn, freshData);
                    }
                    this.liveChannels = freshData.liveChannels || [];
                    this.movies = freshData.movies || [];
                    this.series = freshData.series || [];
                    this.categories = freshData.categories || { live: [], movies: [], series: [] };
                    this.browseViews.live.setData(this.liveChannels, this.categories.live);
                    this.browseViews.movies.setData(this.movies, this.categories.movies);
                    this.browseViews.series.setData(this.series, this.categories.series);
                }).catch((bgErr) => {
                    console.warn('Background catalog refresh skipped:', bgErr);
                });
                return;
            }

            // 2. Cold connect: fetch from network and populate cache
            const data = await this._fetchCatalogFromNetwork(conn, (msg) => this.setLoadingText(msg));
            window.IPTV.Storage.saveConnection(conn);
            if (window.IPTV.CatalogCache) {
                window.IPTV.CatalogCache.set(conn, data);
            }
            this.hideLoading();
            this._applyCatalogData(conn, data, true);
        } catch(err) {
            this.hideLoading();
            this.toast('Connection failed: ' + (err.message || 'Unknown error'));
            console.error('Connection error:', err);
        }
    }

    onItemClick(item, type) {
        if (!item) return;
        const resolvedType = type || item.type || (item.series_id ? 'series' : 'live');

        // 1. Series check (O(1))
        if (resolvedType === 'series') {
            item.type = 'series';
            this.seriesDetailView.open(item);
            return;
        }

        // 2. Movie check (O(1))
        if (resolvedType === 'movies' || resolvedType === 'movie') {
            item.type = 'movie';
            this.playerService.play(item);
            return;
        }

        // 3. Live channel check (O(1) index via item._idx)
        item.type = 'live';
        if (typeof item._idx === 'number') {
            this.currentChannelIndex = item._idx;
        } else if (this.liveChannels && this.liveChannels.length > 0) {
            const idx = this.liveChannels.findIndex(c => c === item || c.id === item.id);
            if (idx >= 0) this.currentChannelIndex = idx;
        }
        this.playerService.play(item);
    }

    prevChannel() {
        if (!this.liveChannels || this.liveChannels.length === 0) return;
        // Do NOT switch live channels if playing a movie or series
        if (this.playerService && this.playerService.currentItem && this.playerService.currentItem.type !== 'live') {
            return;
        }
        if (this.currentChannelIndex < 0 && this.playerService && this.playerService.currentItem) {
            const cur = this.playerService.currentItem;
            this.currentChannelIndex = (typeof cur._idx === 'number')
                ? cur._idx
                : this.liveChannels.findIndex(c => c === cur || (c.type === 'live' && c.id === cur.id));
        }
        if (this.currentChannelIndex <= 0) {
            this.currentChannelIndex = this.liveChannels.length - 1;
        } else {
            this.currentChannelIndex--;
        }
        const item = this.liveChannels[this.currentChannelIndex];
        if (item && this.playerService) this.playerService.play(item);
    }

    nextChannel() {
        if (!this.liveChannels || this.liveChannels.length === 0) return;
        // Do NOT switch live channels if playing a movie or series
        if (this.playerService && this.playerService.currentItem && this.playerService.currentItem.type !== 'live') {
            return;
        }
        if (this.currentChannelIndex < 0 && this.playerService && this.playerService.currentItem) {
            const cur = this.playerService.currentItem;
            this.currentChannelIndex = (typeof cur._idx === 'number')
                ? cur._idx
                : this.liveChannels.findIndex(c => c === cur || (c.type === 'live' && c.id === cur.id));
        }
        if (this.currentChannelIndex < 0 || this.currentChannelIndex >= this.liveChannels.length - 1) {
            this.currentChannelIndex = 0;
        } else {
            this.currentChannelIndex++;
        }
        const item = this.liveChannels[this.currentChannelIndex];
        if (item && this.playerService) this.playerService.play(item);
    }


    // ---- Favorites Management ----
    _favKey(item) {
        if (!item) return '';
        if (typeof item === 'string' || typeof item === 'number') return String(item);
        const t = item.type || 'live';
        return `${t}:${item.id}`;
    }

    isFavorite(itemOrId) {
        if (!itemOrId) return false;
        if (typeof itemOrId === 'object') {
            return this.favorites.has(this._favKey(itemOrId)) || this.favorites.has(String(itemOrId.id));
        }
        return this.favorites.has(String(itemOrId));
    }

    toggleFavorite(item) {
        if (!item) return;
        const key = this._favKey(item);
        const rawId = String(item.id);
        if (this.favorites.has(key) || this.favorites.has(rawId)) {
            this.favorites.delete(key);
            this.favorites.delete(rawId);
            this.toast('Removed from favorites');
        } else {
            this.favorites.add(key);
            this.toast('Added to favorites');
        }
        window.IPTV.Storage.saveFavorites(this.favorites);
    }

    renderFavorites() {
        const container = document.getElementById('favorites-content');
        if (!container) return;

        const allItems = [...this.liveChannels, ...this.movies, ...this.series];
        const favItems = allItems.filter(i => this.isFavorite(i));

        container.innerHTML = '';
        if (favItems.length === 0) {
            container.innerHTML = '<p class="empty-state">No favorites saved yet.</p>';
            return;
        }

        const frag = document.createDocumentFragment();
        favItems.forEach(item => {
            const type = item.type || 'live';
            const card = window.IPTV.Card.create(item, type, {
                isFavorite: true,
                onClick: (selectedItem, itemType) => this.onItemClick(selectedItem, itemType)
            });
            frag.appendChild(card);
        });
        container.appendChild(frag);
    }

    // ---- UI Helpers ----
    showLoading(text) {
        const el = document.getElementById('loading-text');
        if (el) el.textContent = text || 'Loading...';
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('visible');
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('visible');
    }

    setLoadingText(text) {
        const el = document.getElementById('loading-text');
        if (el) el.textContent = text;
    }

    toast(msg, duration = 2500) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => el.classList.remove('show'), duration);
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.app = new IPTVApp();
});