/* ============================================================
   IPTV Player — Cross-Platform Runtime Adapter
   Centralizes capability detection (webOS, Electron Desktop,
   Tizen, Browser), native lifecycle bridges, and desktop
   viewport/fullscreen controls.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.Platform = {
    SVG_EXPAND: '<svg class="osd-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>',
    SVG_COMPRESS: '<svg class="osd-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6 7 7M10 10V4m0 6H4m6 0L3 3m10 7h6m-6 0V4m0 6 7-7"></path></svg>',

    isDesktop() {
        return !!(window.electronDesktop);
    },

    hasDownloads() {
        return !!(window.electronDesktop && window.electronDesktop.downloads);
    },

    isWebOS() {
        return !!(window.webOS || window.PalmSystem || window.webOSSystem);
    },

    isTizen() {
        return !!(window.tizen && window.tizen.application);
    },

    get downloads() {
        return (window.electronDesktop && window.electronDesktop.downloads) || null;
    },

    toggleFullScreen() {
        if (window.electronDesktop && typeof window.electronDesktop.toggleFullScreen === 'function') {
            window.electronDesktop.toggleFullScreen();
        }
    },

    setFullScreen(flag) {
        if (window.electronDesktop && typeof window.electronDesktop.setFullScreen === 'function') {
            window.electronDesktop.setFullScreen(Boolean(flag));
        }
    },

    isFullScreen() {
        if (window.electronDesktop && typeof window.electronDesktop.isFullScreen === 'function') {
            return window.electronDesktop.isFullScreen();
        }
        return Promise.resolve(false);
    },

    exitApp() {
        try {
            if (window.webOS && typeof window.webOS.platformBack === 'function') {
                window.webOS.platformBack();
                return;
            }
            if (window.PalmSystem && typeof window.PalmSystem.platformBack === 'function') {
                window.PalmSystem.platformBack();
                return;
            }
            if (window.webOSSystem && typeof window.webOSSystem.close === 'function') {
                window.webOSSystem.close();
                return;
            }
            if (window.tizen && window.tizen.application) {
                window.tizen.application.getCurrentApplication().exit();
                return;
            }
            window.close();
        } catch (err) {
            console.warn('[Platform] Exit app fallback:', err);
        }
    },

    init() {
        if (!this.isDesktop()) return;
        this._initDesktopViewportAndFullscreen();
    },

    _initDesktopViewportAndFullscreen() {
        const fitWindow = () => {
            const app = document.getElementById('app');
            if (!app) return;
            const scaleX = window.innerWidth / 1920;
            const scaleY = window.innerHeight / 1080;
            app.style.transform = `scale(${scaleX}, ${scaleY})`;
        };

        window.addEventListener('resize', fitWindow);
        fitWindow();
        setTimeout(fitWindow, 50);
        setTimeout(fitWindow, 250);

        const injectPlayerFullscreenBtn = () => {
            const osdTop = document.querySelector('.osd-top');
            const osdClock = document.getElementById('osd-clock');
            if (!osdTop || document.getElementById('osd-fullscreen-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'osd-fullscreen-btn';
            btn.className = 'osd-btn';
            btn.tabIndex = 0;
            btn.title = 'Full Screen (F11 / Double-Click / F)';
            btn.innerHTML = this.SVG_EXPAND;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFullScreen();
            });

            if (osdClock) {
                osdTop.insertBefore(btn, osdClock);
            } else {
                osdTop.appendChild(btn);
            }
        };

        const injectDesktopFullscreenBtn = () => {
            if (!document.body || document.getElementById('desktop-fullscreen-btn')) return;
            const btn = document.createElement('button');
            btn.id = 'desktop-fullscreen-btn';
            btn.className = 'desktop-fs-btn';
            btn.tabIndex = 0;
            btn.title = 'Toggle Full Screen (F11 / F)';
            btn.innerHTML = this.SVG_EXPAND;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFullScreen();
            });

            document.body.appendChild(btn);
        };

        const playerScreen = document.getElementById('player-screen');
        if (playerScreen) {
            playerScreen.addEventListener('dblclick', (e) => {
                if (e.target && typeof e.target.closest === 'function' &&
                    e.target.closest('button, input, .progress-bar, #player-channel-drawer, .drawer-header, .drawer-channel-list')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                this.toggleFullScreen();
            });
        }

        window.addEventListener('keydown', (e) => {
            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                this.toggleFullScreen();
            } else if (e.key === 'Escape') {
                this.isFullScreen().then((isFs) => {
                    if (isFs) this.setFullScreen(false);
                });
            } else if (e.key === 'ArrowRight' && document.activeElement && document.activeElement.id === 'osd-fav') {
                const fsBtn = document.getElementById('osd-fullscreen-btn');
                if (fsBtn) {
                    e.stopPropagation();
                    fsBtn.focus();
                }
            } else if (e.key === 'ArrowLeft' && document.activeElement && document.activeElement.id === 'osd-fullscreen-btn') {
                const favBtn = document.getElementById('osd-fav');
                if (favBtn) {
                    e.stopPropagation();
                    favBtn.focus();
                }
            } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement && document.activeElement.id === 'osd-fullscreen-btn') {
                const pp = document.getElementById('osd-playpause');
                if (pp) {
                    e.stopPropagation();
                    pp.focus();
                }
            }
        }, true);

        if (window.electronDesktop && typeof window.electronDesktop.onFullScreenChange === 'function') {
            window.electronDesktop.onFullScreenChange((isFs) => {
                const osdBtn = document.getElementById('osd-fullscreen-btn');
                const deskBtn = document.getElementById('desktop-fullscreen-btn');
                const icon = isFs ? this.SVG_COMPRESS : this.SVG_EXPAND;
                const title = isFs ? 'Exit Full Screen (F11 / Esc / F)' : 'Full Screen (F11 / Double-Click / F)';
                if (osdBtn) {
                    osdBtn.innerHTML = icon;
                    osdBtn.title = title;
                }
                if (deskBtn) {
                    deskBtn.innerHTML = icon;
                    deskBtn.title = title;
                }
                fitWindow();
            });
        }

        injectPlayerFullscreenBtn();
        injectDesktopFullscreenBtn();
    }
};

