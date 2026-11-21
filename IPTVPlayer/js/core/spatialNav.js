/* ============================================================
   IPTV Player — 2D Cartesian Spatial Navigation Engine
   Adheres to TV Navigation Architecture Standards
   Includes Rail/Grid/Section Focus Memory & Modal Focus Containment
   Optimized for 60fps on LG webOS 3.x (Chromium 38) through Modern CTV
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.SpatialNav = {
    _boundSideNav: false,

    _ensureSideNavBinding() {
        if (this._boundSideNav) return;
        const nav = document.getElementById('side-nav');
        if (!nav) return;
        this._boundSideNav = true;

        // Explicit .expanded class management so Chromium < 60 (no :focus-within)
        // expands and collapses the side drawer reliably, and Magic Remote cursor works smoothly.
        nav.addEventListener('focusin', () => {
            nav.classList.add('expanded');
        });
        nav.addEventListener('focusout', (e) => {
            const next = e.relatedTarget;
            if (!next || !nav.contains(next)) {
                nav.classList.remove('expanded');
            }
        });
        nav.addEventListener('mouseenter', () => {
            nav.classList.add('expanded');
        });
        nav.addEventListener('mouseleave', () => {
            if (!nav.contains(document.activeElement)) {
                nav.classList.remove('expanded');
            }
        });
        // Collapse side drawer whenever user clicks or touches outside
        document.addEventListener('pointerdown', (e) => {
            if (!nav.contains(e.target)) {
                nav.classList.remove('expanded');
            }
        }, true);
        document.addEventListener('click', (e) => {
            if (!nav.contains(e.target)) {
                nav.classList.remove('expanded');
            }
        }, true);
        let passiveOpt = false;
        try {
            const opts = Object.defineProperty({}, 'passive', {
                get: function() { passiveOpt = { passive: true }; return true; }
            });
            window.addEventListener('testPassive', null, opts);
            window.removeEventListener('testPassive', null, opts);
        } catch (e) {}

        const P = window.IPTV && window.IPTV.Platform;
        const isTv = Boolean(P && ((typeof P.isWebOS === 'function' && P.isWebOS()) || (typeof P.isTizen === 'function' && P.isTizen())));
        if (isTv) {
            window.addEventListener('wheel', (e) => {
                // Support LG Magic Remote scroll wheel on Smart TVs where nested containers don't natively scroll
                const target = e.target && e.target.nodeType === 1 ? e.target : document.activeElement;
                if (!target) return;
                const scroller = target.closest('.browse-content, .category-list, #series-detail-screen, .content-area, .login-page-view');
                if (scroller && scroller.scrollHeight > scroller.clientHeight) {
                    scroller.scrollTop += (e.deltaY > 0 ? 180 : -180);
                }
            }, passiveOpt);
        }
    },

    getActiveRoot() {
        // Modal focus trap for continue watching resume choice
        const cwModal = document.getElementById('continue-watching-modal');
        if (cwModal && !cwModal.classList.contains('hidden')) {
            return cwModal;
        }
        // Modal focus trap for profile delete confirmation
        const confirmModal = document.getElementById('profile-delete-modal');
        if (confirmModal && !confirmModal.classList.contains('hidden')) {
            return confirmModal;
        }
        // Side Channel List drawer focus trap inside player
        const channelDrawer = document.getElementById('player-channel-drawer');
        if (channelDrawer && !channelDrawer.classList.contains('hidden')) {
            return channelDrawer;
        }
        if (document.body.classList.contains('player-active')) {
            return document.getElementById('player-screen');
        }
        const seriesScreen = document.getElementById('series-detail-screen');
        if (seriesScreen && seriesScreen.classList.contains('active')) {
            return seriesScreen;
        }
        const mainShell = document.getElementById('main-shell');
        if (mainShell && mainShell.classList.contains('active')) {
            return mainShell;
        }
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen && loginScreen.classList.contains('active')) {
            return loginScreen;
        }
        return document.body;
    },

    isFocusable(el, activeRoot) {
        if (!el || el.disabled || el.getAttribute('tabindex') === '-1') return false;
        if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
        if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
        if (el.closest('.hidden')) return false;

        // If inside main-shell, ignore elements in inactive sections
        const sec = el.closest('.section');
        if (sec && !sec.classList.contains('active')) return false;

        // If inside login-screen, ignore elements in inactive login subpages
        const loginPage = el.closest('.login-page-view');
        if (loginPage && (loginPage.classList.contains('hidden') || !loginPage.classList.contains('active'))) {
            return false;
        }

        // If inside login form, ignore elements in inactive tabs
        const loginForm = el.closest('.login-form');
        if (loginForm && !loginForm.classList.contains('active')) return false;

        if (activeRoot && !activeRoot.contains(el)) return false;
        return true;
    },

    focusElement(el) {
        if (!el) return false;
        this._ensureSideNavBinding();
        const nav = this._sideNavEl || (this._sideNavEl = document.getElementById('side-nav'));
        if (nav) {
            if (nav.contains(el)) nav.classList.add('expanded');
            else nav.classList.remove('expanded');
        }
        if (window.IPTV.Card && window.IPTV.Card.eagerLoad && el.classList && el.classList.contains('card')) {
            window.IPTV.Card.eagerLoad(el);
            if (el.nextElementSibling) window.IPTV.Card.eagerLoad(el.nextElementSibling);
        }

        // Record focus memory on parent section / containers (never memorize <input> to avoid auto-OSK)
        const sec = el.closest && el.closest('.section');
        if (sec && el.tagName !== 'INPUT') {
            sec._lastFocusedEl = el;
            if (el.classList && el.classList.contains('card') && el.closest('.browse-content')) {
                sec._lastFocusedCard = el;
            } else if (el.classList && el.classList.contains('category-item') && el.closest('.category-sidebar')) {
                sec._lastFocusedCategory = el;
            }
        }

        // Use preventScroll so ensureVisible() performs a single, jitter-free scroll pass
        try {
            el.focus({ preventScroll: true });
        } catch (e) {
            el.focus();
        }
        this.ensureVisible(el);
        return true;
    },

    navigate(dir) {
        this._ensureSideNavBinding();

        // If player is active, playerService handles its own OSD controls unless channel drawer is open
        if (document.body.classList.contains('player-active')) {
            const channelDrawer = document.getElementById('player-channel-drawer');
            if (!channelDrawer || channelDrawer.classList.contains('hidden')) {
                return false;
            }
        }

        const activeRoot = this.getActiveRoot();
        let current = document.activeElement;

        // If nothing valid is focused, focus the first focusable item in the active screen
        if (!current || current === document.body || !this.isFocusable(current, activeRoot)) {
            const first = this._findFirstFocusable(activeRoot);
            if (first) return this.focusElement(first);
            return false;
        }

        // Allow normal input cursor movement only if actively editing (!readOnly)
        if (current.tagName === 'INPUT' && !current.readOnly) {
            const valLen = current.value ? current.value.length : 0;
            if (dir === 'left' && current.selectionStart !== 0) return false;
            if (dir === 'right' && current.selectionEnd !== valLen) return false;
        }

        // ---- Ordered Focus Zone Pipeline (O(1) zones first, 2D Cartesian fallback last) ----
        const zones = [
            this._navSideRail,
            this._navCategorySidebar,
            this._navSeriesDetail,
            this._navHorizontalRail,
            this._navGridView,
            this._navCartesian2D
        ];
        for (let i = 0; i < zones.length; i++) {
            const res = zones[i].call(this, current, dir, activeRoot);
            if (res !== null) return res;
        }
        return false;
    },

    // ---- Zone 1: 1D Side Navigation Rail ----
    _navSideRail(current, dir, activeRoot) {
        if (!current.classList.contains('nav-item')) return null;
        const navItems = Array.from(document.querySelectorAll('#side-nav .nav-item'))
            .filter(el => this.isFocusable(el, activeRoot));
        const idx = navItems.indexOf(current);

        if (dir === 'down') {
            if (idx >= 0 && idx < navItems.length - 1) return this.focusElement(navItems[idx + 1]);
            return true;
        }
        if (dir === 'up') {
            if (idx > 0) return this.focusElement(navItems[idx - 1]);
            return true;
        }
        if (dir === 'right') {
            const activeSec = document.querySelector('#main-shell .section.active');
            if (activeSec) {
                if (activeSec._lastFocusedEl && document.contains(activeSec._lastFocusedEl) && this.isFocusable(activeSec._lastFocusedEl, activeRoot)) {
                    return this.focusElement(activeSec._lastFocusedEl);
                }
                const target = activeSec.querySelector('.category-item.active, .category-item, .card, .theme-swatch-card.active, .theme-swatch-card, .btn-primary, button:not([disabled]), select, [tabindex="0"]');
                if (target && this.isFocusable(target, activeRoot)) return this.focusElement(target);
            }
            return true;
        }
        if (dir === 'left') return true;
        return null;
    },

    // ---- Zone 2: 1D Category Sidebar List (O(1) Sibling Walk) ----
    _navCategorySidebar(current, dir, activeRoot) {
        const catSidebar = current.closest('.category-sidebar');
        if (!catSidebar) return null;
        const searchInput = catSidebar.querySelector('.cat-search-input');

        if (current.classList.contains('category-item')) {
            if (dir === 'down') {
                let next = current.nextElementSibling;
                while (next && next.style.display === 'none') next = next.nextElementSibling;
                return next ? this.focusElement(next) : true;
            }
            if (dir === 'up') {
                let prev = current.previousElementSibling;
                while (prev && prev.style.display === 'none') prev = prev.previousElementSibling;
                if (prev) return this.focusElement(prev);
                if (searchInput && this.isFocusable(searchInput, activeRoot)) return this.focusElement(searchInput);
                return true;
            }
            if (dir === 'left') {
                const nav = this._sideNavEl || (this._sideNavEl = document.getElementById('side-nav'));
                const activeNav = nav && (nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item'));
                return activeNav ? this.focusElement(activeNav) : true;
            }
            if (dir === 'right') {
                const sec = catSidebar.closest('.section');
                if (sec) {
                    if (sec._lastFocusedCard && document.contains(sec._lastFocusedCard) && this.isFocusable(sec._lastFocusedCard, activeRoot)) {
                        return this.focusElement(sec._lastFocusedCard);
                    }
                    const firstCard = sec.querySelector('.browse-content .card, .view-btn.active, .view-btn');
                    if (firstCard && this.isFocusable(firstCard, activeRoot)) return this.focusElement(firstCard);
                }
            }
        } else if (current === searchInput) {
            if (dir === 'down') {
                const activeCat = catSidebar.querySelector('.category-item.active');
                if (activeCat && activeCat.style.display !== 'none') return this.focusElement(activeCat);
                const catList = catSidebar.querySelector('.category-list');
                let firstVis = catList ? catList.firstElementChild : null;
                while (firstVis && firstVis.style.display === 'none') firstVis = firstVis.nextElementSibling;
                if (firstVis) return this.focusElement(firstVis);
            } else if (dir === 'left') {
                const nav = this._sideNavEl || (this._sideNavEl = document.getElementById('side-nav'));
                const activeNav = nav && (nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item'));
                return activeNav ? this.focusElement(activeNav) : true;
            } else if (dir === 'right') {
                const sec = catSidebar.closest('.section');
                const firstCard = sec && sec.querySelector('.browse-content .card, .view-btn.active, .view-btn');
                if (firstCard && this.isFocusable(firstCard, activeRoot)) return this.focusElement(firstCard);
            }
        }
        return null;
    },

    // ---- Zone 3: Series Detail Predictable Focus Order ----
    _navSeriesDetail(current, dir, activeRoot) {
        if (!activeRoot || activeRoot.id !== 'series-detail-screen') return null;

        if (current.id === 'series-back-btn' || current.id === 'series-fav-btn' || current.id === 'series-download-all-btn') {
            if (dir === 'right' && current.id === 'series-back-btn') {
                const favBtn = document.getElementById('series-fav-btn');
                if (favBtn && this.isFocusable(favBtn, activeRoot)) return this.focusElement(favBtn);
            } else if (dir === 'right' && current.id === 'series-fav-btn') {
                const dlAllBtn = document.getElementById('series-download-all-btn');
                if (dlAllBtn && this.isFocusable(dlAllBtn, activeRoot)) return this.focusElement(dlAllBtn);
            } else if (dir === 'left' && current.id === 'series-download-all-btn') {
                const favBtn = document.getElementById('series-fav-btn');
                if (favBtn && this.isFocusable(favBtn, activeRoot)) return this.focusElement(favBtn);
            } else if (dir === 'left' && current.id === 'series-fav-btn') {
                const backBtn = document.getElementById('series-back-btn');
                if (backBtn && this.isFocusable(backBtn, activeRoot)) return this.focusElement(backBtn);
            } else if (dir === 'down') {
                const activeSeason = activeRoot.querySelector('.season-tab-btn.active, .season-tab-btn');
                if (activeSeason && this.isFocusable(activeSeason, activeRoot)) return this.focusElement(activeSeason);
                const firstEp = activeRoot.querySelector('.episode-card');
                if (firstEp && this.isFocusable(firstEp, activeRoot)) return this.focusElement(firstEp);
            }
        } else if (current.classList.contains('season-tab-btn')) {
            if (dir === 'up') {
                const backBtn = document.getElementById('series-back-btn');
                if (backBtn && this.isFocusable(backBtn, activeRoot)) return this.focusElement(backBtn);
            } else if (dir === 'down') {
                const sDlBtn = document.getElementById('season-download-btn');
                if (sDlBtn && this.isFocusable(sDlBtn, activeRoot)) return this.focusElement(sDlBtn);
                const firstEp = activeRoot.querySelector('.episode-card');
                if (firstEp && this.isFocusable(firstEp, activeRoot)) return this.focusElement(firstEp);
            }
        } else if (current.id === 'season-download-btn') {
            if (dir === 'up') {
                const activeSeason = activeRoot.querySelector('.season-tab-btn.active, .season-tab-btn');
                if (activeSeason && this.isFocusable(activeSeason, activeRoot)) return this.focusElement(activeSeason);
            } else if (dir === 'down') {
                const firstEp = activeRoot.querySelector('.episode-card');
                if (firstEp && this.isFocusable(firstEp, activeRoot)) return this.focusElement(firstEp);
            }
        }
        return null;
    },

    // ---- Zone 4: Horizontal Rail (.row-scroll / .seasons-tabs-container / .theme-swatch-grid) ----
    _navHorizontalRail(current, dir, activeRoot) {
        if (dir !== 'left' && dir !== 'right') return null;
        const horizRail = current.closest('.row-scroll, .seasons-tabs-container, .theme-swatch-grid');
        if (!horizRail) return null;

        const items = Array.from(horizRail.children).filter(el => this.isFocusable(el, activeRoot));
        const idx = items.indexOf(current);
        if (idx < 0) return null;

        if (dir === 'right') {
            return (idx < items.length - 1) ? this.focusElement(items[idx + 1]) : true;
        }
        if (idx > 0) return this.focusElement(items[idx - 1]);

        const sec = horizRail.closest('.section');
        const sidebar = sec && sec.querySelector('.category-sidebar');
        if (sidebar) {
            const activeCat = sidebar.querySelector('.category-item.active') || sidebar.querySelector('.category-item');
            if (activeCat && this.isFocusable(activeCat, activeRoot)) return this.focusElement(activeCat);
        }
        const nav = this._sideNavEl || (this._sideNavEl = document.getElementById('side-nav'));
        if (nav && activeRoot.contains(nav)) {
            const activeNav = nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item');
            if (activeNav && this.isFocusable(activeNav, activeRoot)) return this.focusElement(activeNav);
        }
        return true;
    },

    // ---- Zone 5: O(1) Grid Fast Path (.browse-content.grid-view) ----
    _navGridView(current, dir, activeRoot) {
        const gridView = current.closest('.browse-content.grid-view');
        if (!gridView || !current.classList.contains('card')) return null;

        const curTop = current.offsetTop;
        const curLeft = current.offsetLeft;
        const curW = current.offsetWidth || 1;

        if (dir === 'left') {
            const prev = current.previousElementSibling;
            if (prev && prev.classList.contains('card') && Math.abs(prev.offsetTop - curTop) <= 12) {
                return this.focusElement(prev);
            }
            const sec = gridView.closest('.section');
            const sidebar = sec && sec.querySelector('.category-sidebar');
            if (sidebar) {
                const targetCat = (sec._lastFocusedCategory && document.contains(sec._lastFocusedCategory) && this.isFocusable(sec._lastFocusedCategory, activeRoot))
                    ? sec._lastFocusedCategory
                    : (sidebar.querySelector('.category-item.active') || sidebar.querySelector('.category-item'));
                if (targetCat && this.isFocusable(targetCat, activeRoot)) return this.focusElement(targetCat);
            }
            const nav = this._sideNavEl || (this._sideNavEl = document.getElementById('side-nav'));
            if (nav && activeRoot.contains(nav)) {
                const activeNav = nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item');
                if (activeNav && this.isFocusable(activeNav, activeRoot)) return this.focusElement(activeNav);
            }
            return true;
        }

        if (dir === 'right') {
            const next = current.nextElementSibling;
            if (next && next.classList.contains('card') && Math.abs(next.offsetTop - curTop) <= 12) {
                return this.focusElement(next);
            }
            return true;
        }

        if (dir === 'up' || dir === 'down') {
            const findVerticalCard = () => {
                const step = dir === 'up' ? 'previousElementSibling' : 'nextElementSibling';
                let scan = current[step];
                let hops = 0;
                let fallbackInNextRow = null;
                while (scan && hops < 12) {
                    if (scan.classList.contains('card')) {
                        const rowDiff = dir === 'up' ? (curTop - scan.offsetTop) : (scan.offsetTop - curTop);
                        if (rowDiff > 12) {
                            if (Math.abs(scan.offsetLeft - curLeft) < curW * 0.55) return scan;
                            if (dir === 'down' && !fallbackInNextRow) fallbackInNextRow = scan;
                        }
                    }
                    scan = scan[step];
                    hops++;
                }
                return fallbackInNextRow;
            };

            let targetCard = findVerticalCard();
            if (!targetCard && typeof gridView._syncWindowNow === 'function') {
                gridView._syncWindowNow();
                targetCard = findVerticalCard();
            }
            if (targetCard) return this.focusElement(targetCard);
            if (dir === 'up') {
                const sec = gridView.closest('.section');
                const headerBtn = sec && sec.querySelector('.view-btn.active, .view-btn');
                if (headerBtn && this.isFocusable(headerBtn, activeRoot)) return this.focusElement(headerBtn);
            }
            return true;
        }
        return null;
    },

    // ---- Zone 6: Scoped 2D Cartesian Spatial Navigation Fallback ----
    _navCartesian2D(current, dir, activeRoot) {
        const currentRect = current.getBoundingClientRect();
        const cX = currentRect.left + currentRect.width / 2;
        const cY = currentRect.top + currentRect.height / 2;

        const queryScope = (activeRoot.id === 'main-shell')
            ? (activeRoot.querySelector('.section.active') || activeRoot)
            : activeRoot;

        const inBrowseMain = current.closest('.browse-main-content');
        const selector = 'button, input, select, [tabindex="0"], .card, .category-item, .season-tab-btn, .episode-card, .profile-card, .add-profile-card, .theme-swatch-card';
        const candidates = Array.from(queryScope.querySelectorAll(selector))
            .filter(el => {
                if (el === current || !this.isFocusable(el, activeRoot)) return false;
                if (inBrowseMain && dir === 'left' && el.closest('.category-sidebar')) return false;
                return true;
            });

        let bestCandidate = null;
        let bestScore = Infinity;

        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            const rect = cand.getBoundingClientRect();
            const candCX = rect.left + rect.width / 2;
            const candCY = rect.top + rect.height / 2;
            const dx = candCX - cX;
            const dy = candCY - cY;

            let isDirectionMatch = false;
            if (dir === 'left' && rect.right <= currentRect.left + 18) isDirectionMatch = true;
            else if (dir === 'right' && rect.left >= currentRect.right - 18) isDirectionMatch = true;
            else if (dir === 'up' && rect.bottom <= currentRect.top + 18) isDirectionMatch = true;
            else if (dir === 'down' && rect.top >= currentRect.bottom - 18) isDirectionMatch = true;

            if (!isDirectionMatch) {
                if (dir === 'left' && dx < -24 && Math.abs(dy) <= Math.abs(dx) * 1.35) isDirectionMatch = true;
                else if (dir === 'right' && dx > 24 && Math.abs(dy) <= Math.abs(dx) * 1.35) isDirectionMatch = true;
                else if (dir === 'up' && dy < -24 && Math.abs(dx) <= Math.abs(dy) * 1.35) isDirectionMatch = true;
                else if (dir === 'down' && dy > 24 && Math.abs(dx) <= Math.abs(dy) * 1.35) isDirectionMatch = true;
            }

            if (isDirectionMatch) {
                const score = (dir === 'left' || dir === 'right')
                    ? Math.abs(dx) + Math.abs(dy) * 3.2
                    : Math.abs(dy) + Math.abs(dx) * 2.4;
                if (score < bestScore) {
                    bestScore = score;
                    bestCandidate = cand;
                }
            }
        }

        if (!bestCandidate && dir === 'left') {
            if (inBrowseMain) {
                const sec = inBrowseMain.closest('.section');
                const sidebar = sec && sec.querySelector('.category-sidebar');
                if (sidebar) {
                    const targetCat = (sec._lastFocusedCategory && document.contains(sec._lastFocusedCategory) && this.isFocusable(sec._lastFocusedCategory, activeRoot))
                        ? sec._lastFocusedCategory
                        : (sidebar.querySelector('.category-item.active') || sidebar.querySelector('.category-item'));
                    if (targetCat && this.isFocusable(targetCat, activeRoot)) return this.focusElement(targetCat);
                }
            }
            const nav = this._sideNavEl || (this._sideNavEl = document.getElementById('side-nav'));
            if (nav && !nav.contains(current) && activeRoot.contains(nav)) {
                const activeNav = nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item');
                if (activeNav && this.isFocusable(activeNav, activeRoot)) bestCandidate = activeNav;
            }
        }

        if (!bestCandidate && dir === 'up' && current.classList.contains('episode-card') && activeRoot.id === 'series-detail-screen') {
            const activeSeason = activeRoot.querySelector('.season-tab-btn.active, .season-tab-btn');
            if (activeSeason && this.isFocusable(activeSeason, activeRoot)) bestCandidate = activeSeason;
        }

        return bestCandidate ? this.focusElement(bestCandidate) : false;
    },

    _findFirstFocusable(root) {
        if (!root) return null;
        const scope = (root.id === 'main-shell')
            ? (root.querySelector('.section.active') || root)
            : root;
        const preferred = scope.querySelector('.profile-card, .add-profile-card, .category-item.active, .card, .theme-swatch-card.active, .btn-primary, button:not([disabled]), input, [tabindex="0"]');
        if (preferred && this.isFocusable(preferred, root)) return preferred;

        const all = scope.querySelectorAll('[tabindex="0"], button, input, select');
        for (let i = 0; i < all.length; i++) {
            if (this.isFocusable(all[i], root)) return all[i];
        }
        return null;
    },

    ensureVisible(el) {
        if (!el) return;

        // 1. Horizontal scroll containers (.row-scroll, .seasons-tabs-container, .theme-swatch-grid)
        const rowScroll = el.closest('.row-scroll, .seasons-tabs-container, .theme-swatch-grid');
        if (rowScroll) {
            const rRect = rowScroll.getBoundingClientRect();
            const eRect = el.getBoundingClientRect();
            const pad = 36;
            if (eRect.left < rRect.left + pad) {
                const nextLeft = Math.max(0, rowScroll.scrollLeft - (rRect.left + pad - eRect.left));
                if (Math.abs(nextLeft - rowScroll.scrollLeft) >= 2) rowScroll.scrollLeft = nextLeft;
            } else if (eRect.right > rRect.right - pad) {
                const delta = eRect.right - (rRect.right - pad);
                if (delta >= 2) rowScroll.scrollLeft += delta;
            }
        }

        // 2. Vertical scroll containers (.category-list, .browse-content, #content-area, #series-detail-screen, .login-page-view)
        const vScroll = el.closest('.category-list, .browse-main-content .browse-content, #series-detail-screen, .login-page-view')
            || document.getElementById('content-area');

        if (vScroll && vScroll.contains(el)) {
            const cRect = vScroll.getBoundingClientRect();
            const eRect = el.getBoundingClientRect();
            const margin = 80; // 10-foot safe margin
            let scrolled = false;

            if (eRect.top < cRect.top + margin) {
                const nextTop = Math.max(0, vScroll.scrollTop - (cRect.top + margin - eRect.top));
                if (Math.abs(nextTop - vScroll.scrollTop) >= 2) {
                    vScroll.scrollTop = nextTop;
                    scrolled = true;
                }
            } else if (eRect.bottom > cRect.bottom - margin) {
                const delta = eRect.bottom - (cRect.bottom - margin);
                if (delta >= 2) {
                    vScroll.scrollTop += delta;
                    scrolled = true;
                }
            }

            // Trigger progressive/windowed load only when vertical scroll actually changed
            if (scrolled && vScroll.classList && vScroll.classList.contains('browse-content') && vScroll._onScrollCheck) {
                vScroll._onScrollCheck();
            }
        }
    }
};
