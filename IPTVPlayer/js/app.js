/* ============================================================
   IPTV Player — Main Application Controller (Mediator)
   Orchestrates core engines, services, reusable components & views
   Target: LG webOS TV / Modern CTV
   ============================================================ */

window.IPTV = window.IPTV || {};

class IPTVApp {
    constructor() {
        this.store = window.IPTV.CatalogStore;
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

        // Reusable Browse Views & Section Lifecycle Hooks
        this.browseViews = {};
        this.sectionHooks = {};

        this._init();
    }

    _init() {
        if (window.IPTV.EventBus) {
            window.IPTV.EventBus.on('ui:toast', ({ message, duration }) => this.toast(message, duration));
        }
        if (window.IPTV.EventBus) {
            window.IPTV.EventBus.on('session:disconnect', () => this.disconnect());
        }
        // 1. Initialize Platform, Theme & Settings
        if (window.IPTV.Platform) {
            window.IPTV.Platform.init();
        }
        window.IPTV.ThemeManager.init();
        if (this.store) {
            this.store.init();
        }

        // Initialize Desktop Download Manager early so isDesktop is true for all views
        if (window.IPTV.DownloadManager) {
            window.IPTV.DownloadManager.init(this);
        }

        // 2. Initialize Subsystems
        this.playerService.init(this);
        this.seriesDetailView.init(this);
        this.searchView.init(this);
        this.settingsView.init(this);
        this.homeView.init(this);

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

        // Register section lifecycle hooks (OCP)
        ['live', 'movies', 'series'].forEach(sec => {
            this.registerSectionHook(sec, () => {
                if (this.browseViews[sec]) this.browseViews[sec].ensureRendered();
            });
        });
        this.registerSectionHook('favorites', () => this.renderFavorites());
        this.registerSectionHook('downloads', () => {
            if (window.IPTV.DownloadManager) window.IPTV.DownloadManager._refreshData();
        });

        // 4. Initialize Navigation, BackStack & Remote Controls
        this._bindNavigation();
        this._registerBackGuards();
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

    registerSectionHook(section, onActivate) {
        if (section && typeof onActivate === 'function') {
            this.sectionHooks[section] = onActivate;
        }
    }

    navigateTo(section, pushHistory = true) {
        const contentArea = document.getElementById('content-area');
        const prevSec = this.currentSection ? document.getElementById(`section-${this.currentSection}`) : null;
        if (prevSec && contentArea) {
            prevSec._savedScrollTop = contentArea.scrollTop;
        }

        if (pushHistory && this.currentSection && this.currentSection !== section) {
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

            if (typeof this.sectionHooks[section] === 'function') {
                this.sectionHooks[section]();
            }

            // Restore section scroll position (or default to top)
            if (contentArea) {
                contentArea.scrollTop = typeof sec._savedScrollTop === 'number' ? sec._savedScrollTop : 0;
            }

            // Restore last focused item in section or focus first non-input focusable item
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

    _registerBackGuards() {
        const bs = window.IPTV.BackStack;
        if (!bs) return;

        bs.register({
            id: 'continue-watching-modal',
            priority: 60,
            isActive: () => {
                const m = document.getElementById('continue-watching-modal');
                return Boolean(m && !m.classList.contains('hidden'));
            },
            onBack: () => {
                if (this.homeView && typeof this.homeView.closeResumeModal === 'function') {
                    this.homeView.closeResumeModal();
                } else {
                    const m = document.getElementById('continue-watching-modal');
                    if (m) m.classList.add('hidden');
                }
            }
        });

        bs.register({
            id: 'profile-delete-modal',
            priority: 50,
            isActive: () => {
                const m = document.getElementById('profile-delete-modal');
                return Boolean(m && !m.classList.contains('hidden'));
            },
            onBack: () => {
                if (this.loginView && typeof this.loginView.closeDeleteModal === 'function') {
                    this.loginView.closeDeleteModal();
                } else {
                    const m = document.getElementById('profile-delete-modal');
                    if (m) m.classList.add('hidden');
                }
            }
        });

        bs.register({
            id: 'player-screen',
            priority: 40,
            isActive: () => {
                const playerScreen = document.getElementById('player-screen');
                return Boolean(
                    (this.playerService && this.playerService.isVisible()) ||
                    (playerScreen && playerScreen.classList.contains('active')) ||
                    document.body.classList.contains('player-active')
                );
            },
            onBack: () => {
                if (this.playerService && this.playerService.isChannelDrawerOpen) {
                    this.playerService.closeChannelDrawer();
                    return;
                }
                if (this.playerService) {
                    this.playerService.close();
                } else {
                    const playerScreen = document.getElementById('player-screen');
                    if (playerScreen) playerScreen.classList.remove('active');
                    document.body.classList.remove('player-active');
                }
            }
        });

        bs.register({
            id: 'series-detail-screen',
            priority: 30,
            isActive: () => {
                const s = document.getElementById('series-detail-screen');
                return Boolean(s && s.classList.contains('active'));
            },
            onBack: () => {
                this.seriesDetailView.close();
            }
        });

        bs.register({
            id: 'login-form-page',
            priority: 20,
            isActive: () => {
                const f = document.getElementById('login-form-page');
                return Boolean(f && f.classList.contains('active'));
            },
            onBack: () => {
                this.loginView.showProfilesPage();
            }
        });

        bs.register({
            id: 'main-shell',
            priority: 10,
            isActive: () => {
                const m = document.getElementById('main-shell');
                return Boolean(m && m.classList.contains('active'));
            },
            onBack: () => {
                if (this.currentSection !== 'home') {
                    this.sectionHistory = [];
                    this.navigateTo('home', false);
                    return;
                }
                if (this.loginView) {
                    this.loginView.showProfilesPage();
                }
                const mainShell = document.getElementById('main-shell');
                if (mainShell) mainShell.classList.remove('active');
                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) {
                    loginScreen.classList.add('active');
                    setTimeout(() => {
                        const first = loginScreen.querySelector('.profile-card, .add-profile-card, button');
                        if (first) first.focus();
                    }, 100);
                }
            }
        });
    }

    goBack() {
        if (window.IPTV.BackStack && window.IPTV.BackStack.handleBack()) {
            return true;
        }
        window.IPTV.KeyHandler.exitApp();
        return false;
    }

    disconnect() {
        window.IPTV.Storage.clearConnection();
        this.store.clear();
        const mainShell = document.getElementById('main-shell');
        const loginScreen = document.getElementById('login-screen');
        if (mainShell) mainShell.classList.remove('active');
        if (loginScreen) loginScreen.classList.add('active');
        if (this.loginView) this.loginView.renderProfiles();
        this.toast('Disconnected from server');
    }

    _applyCatalogData(conn, data, navigateHome = true) {
        this.store.setCatalog(conn, data);

        const navUser = document.getElementById('nav-user-info');
        if (navUser) {
            navUser.textContent = (data.userInfo && data.userInfo.username) ? data.userInfo.username : (conn.name || '');
        }

        // Switch to main shell
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('main-shell').classList.add('active');

        // Populate Sub-views
        this.homeView.render(this.store.getLive(), this.store.getMovies(), this.store.getSeries());
        this._refreshBrowseViews();
        this.settingsView.updateInfo(conn);

        if (navigateHome) {
            this.navigateTo('home');
        }
    }

    _refreshBrowseViews() {
        const cats = this.store.getCategories();
        this.browseViews.live.setData(this.store.getLive(), cats.live);
        this.browseViews.movies.setData(this.store.getMovies(), cats.movies);
        this.browseViews.series.setData(this.store.getSeries(), cats.series);
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
        this.store.setConnection(conn);
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
                    if (this.store.getConnection() !== conn || !freshData) return;
                    if (window.IPTV.CatalogCache) {
                        window.IPTV.CatalogCache.set(conn, freshData);
                    }
                    this.store.setCatalog(conn, freshData);
                    this._refreshBrowseViews();
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
        } else {
            const idx = this.store.getLive().findIndex(c => c === item || c.id === item.id);
            if (idx >= 0) this.currentChannelIndex = idx;
        }
        this.playerService.play(item);
    }

    _stepChannel(delta) {
        const channels = this.store.getLive();
        if (channels.length === 0) return;
        // Do NOT switch live channels if playing a movie or series
        if (this.playerService && this.playerService.currentItem && this.playerService.currentItem.type !== 'live') {
            return;
        }
        if (this.currentChannelIndex < 0 && this.playerService && this.playerService.currentItem) {
            const cur = this.playerService.currentItem;
            this.currentChannelIndex = (typeof cur._idx === 'number')
                ? cur._idx
                : channels.findIndex(c => c === cur || (c.type === 'live' && c.id === cur.id));
        }
        const len = channels.length;
        if (delta < 0) {
            this.currentChannelIndex = this.currentChannelIndex <= 0 ? len - 1 : this.currentChannelIndex - 1;
        } else {
            this.currentChannelIndex = (this.currentChannelIndex < 0 || this.currentChannelIndex >= len - 1) ? 0 : this.currentChannelIndex + 1;
        }
        const item = channels[this.currentChannelIndex];
        if (item && this.playerService) this.playerService.play(item);
    }

    prevChannel() {
        this._stepChannel(-1);
    }

    nextChannel() {
        this._stepChannel(1);
    }


    // ---- Favorites ----
    renderFavorites() {
        const container = document.getElementById('favorites-content');
        if (!container) return;

        const favItems = this.store.getFavoriteItems();

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