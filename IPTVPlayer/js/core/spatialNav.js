/* ============================================================
   IPTV Player — 2D Cartesian Spatial Navigation Engine
   Adheres to TV Navigation Architecture Standards
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
        // expands and collapses the side drawer reliably.
        nav.addEventListener('focusin', () => {
            nav.classList.add('expanded');
        });
        nav.addEventListener('focusout', (e) => {
            const next = e.relatedTarget;
            if (!next || !nav.contains(next)) {
                nav.classList.remove('expanded');
            }
        });
    },

    getActiveRoot() {
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

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

        if (activeRoot && !activeRoot.contains(el)) return false;
        return true;
    },

    focusElement(el) {
        if (!el) return false;
        this._ensureSideNavBinding();
        const nav = document.getElementById('side-nav');
        if (nav) {
            if (nav.contains(el)) nav.classList.add('expanded');
            else nav.classList.remove('expanded');
        }
        el.focus();
        this.ensureVisible(el);
        return true;
    },

    navigate(dir) {
        this._ensureSideNavBinding();

        // If player is active, playerService handles its own OSD controls
        if (document.body.classList.contains('player-active')) {
            return false;
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

        // ---- 1. Dedicated 1D Side Navigation Rail Traversal ----
        if (current.classList.contains('nav-item')) {
            const navItems = Array.from(document.querySelectorAll('#side-nav .nav-item'))
                .filter(el => this.isFocusable(el, activeRoot));
            const idx = navItems.indexOf(current);

            if (dir === 'down') {
                if (idx >= 0 && idx < navItems.length - 1) {
                    return this.focusElement(navItems[idx + 1]);
                }
                return true; // Clamp at bottom
            } else if (dir === 'up') {
                if (idx > 0) {
                    return this.focusElement(navItems[idx - 1]);
                }
                return true; // Clamp at top
            } else if (dir === 'right') {
                const activeSec = document.querySelector('#main-shell .section.active');
                if (activeSec) {
                    const target = activeSec.querySelector('.category-item.active, .category-item, .card, .btn-primary, button:not([disabled]), select, [tabindex="0"]');
                    if (target && this.isFocusable(target, activeRoot)) {
                        return this.focusElement(target);
                    }
                }
                return true;
            } else if (dir === 'left') {
                return true; // Clamp at left edge
            }
        }

        // ---- 2. Dedicated 1D Category Sidebar List Traversal ----
        const catSidebar = current.closest('.category-sidebar');
        if (catSidebar) {
            const catItems = Array.from(catSidebar.querySelectorAll('.category-item'))
                .filter(el => this.isFocusable(el, activeRoot));
            const searchInput = catSidebar.querySelector('.cat-search-input');

            if (current.classList.contains('category-item')) {
                const idx = catItems.indexOf(current);
                if (dir === 'down') {
                    if (idx >= 0 && idx < catItems.length - 1) {
                        return this.focusElement(catItems[idx + 1]);
                    }
                    return true; // Clamp at bottom of category list
                } else if (dir === 'up') {
                    if (idx > 0) {
                        return this.focusElement(catItems[idx - 1]);
                    } else if (searchInput && this.isFocusable(searchInput, activeRoot)) {
                        return this.focusElement(searchInput);
                    }
                    return true;
                } else if (dir === 'left') {
                    const nav = document.getElementById('side-nav');
                    const activeNav = nav && (nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item'));
                    if (activeNav) return this.focusElement(activeNav);
                    return true;
                } else if (dir === 'right') {
                    const sec = catSidebar.closest('.section');
                    if (sec) {
                        const firstCard = sec.querySelector('.browse-content .card, .view-btn.active, .view-btn');
                        if (firstCard && this.isFocusable(firstCard, activeRoot)) {
                            return this.focusElement(firstCard);
                        }
                    }
                }
            } else if (current === searchInput) {
                if (dir === 'down' && catItems.length > 0) {
                    const activeCat = catSidebar.querySelector('.category-item.active');
                    return this.focusElement((activeCat && this.isFocusable(activeCat, activeRoot)) ? activeCat : catItems[0]);
                } else if (dir === 'left') {
                    const nav = document.getElementById('side-nav');
                    const activeNav = nav && (nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item'));
                    if (activeNav) return this.focusElement(activeNav);
                    return true;
                }
            }
        }

        // ---- 3. Horizontal Rail (.row-scroll / .seasons-tabs-container) 1D Left/Right Traversal ----
        const horizRail = current.closest('.row-scroll, .seasons-tabs-container');
        if (horizRail && (dir === 'left' || dir === 'right')) {
            const items = Array.from(horizRail.children).filter(el => this.isFocusable(el, activeRoot));
            const idx = items.indexOf(current);
            if (idx >= 0) {
                if (dir === 'right') {
                    if (idx < items.length - 1) {
                        return this.focusElement(items[idx + 1]);
                    }
                    return true; // Clamp at right end of rail (never wrap)
                } else if (dir === 'left') {
                    if (idx > 0) {
                        return this.focusElement(items[idx - 1]);
                    }
                    // Leftmost item in horizontal rail: escape to category sidebar or side-nav
                    const sec = horizRail.closest('.section');
                    const sidebar = sec && sec.querySelector('.category-sidebar');
                    if (sidebar) {
                        const activeCat = sidebar.querySelector('.category-item.active') || sidebar.querySelector('.category-item');
                        if (activeCat && this.isFocusable(activeCat, activeRoot)) {
                            return this.focusElement(activeCat);
                        }
                    }
                    const nav = document.getElementById('side-nav');
                    if (nav && activeRoot.contains(nav)) {
                        const activeNav = nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item');
                        if (activeNav && this.isFocusable(activeNav, activeRoot)) {
                            return this.focusElement(activeNav);
                        }
                    }
                    return true;
                }
            }
        }

        // ---- 4. Scoped 2D Cartesian Spatial Navigation ----
        const currentRect = current.getBoundingClientRect();
        const cX = currentRect.left + currentRect.width / 2;
        const cY = currentRect.top + currentRect.height / 2;

        // Scope query to active section or active screen to keep DOM query tiny (< 60 elements)
        const queryScope = (activeRoot.id === 'main-shell')
            ? (activeRoot.querySelector('.section.active') || activeRoot)
            : activeRoot;

        const selector = 'button, input, select, [tabindex="0"], .card, .category-item, .season-tab-btn, .episode-card, .profile-card, .add-profile-card';
        const candidates = Array.from(queryScope.querySelectorAll(selector))
            .filter(el => el !== current && this.isFocusable(el, activeRoot));

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

            // Primary bounding edge checks
            if (dir === 'left' && rect.right <= currentRect.left + 18) isDirectionMatch = true;
            else if (dir === 'right' && rect.left >= currentRect.right - 18) isDirectionMatch = true;
            else if (dir === 'up' && rect.bottom <= currentRect.top + 18) isDirectionMatch = true;
            else if (dir === 'down' && rect.top >= currentRect.bottom - 18) isDirectionMatch = true;

            // Secondary direction cone check
            if (!isDirectionMatch) {
                if (dir === 'left' && dx < -24 && Math.abs(dy) <= Math.abs(dx) * 1.35) isDirectionMatch = true;
                else if (dir === 'right' && dx > 24 && Math.abs(dy) <= Math.abs(dx) * 1.35) isDirectionMatch = true;
                else if (dir === 'up' && dy < -24 && Math.abs(dx) <= Math.abs(dy) * 1.35) isDirectionMatch = true;
                else if (dir === 'down' && dy > 24 && Math.abs(dx) <= Math.abs(dy) * 1.35) isDirectionMatch = true;
            }

            if (isDirectionMatch) {
                let score = 0;
                if (dir === 'left' || dir === 'right') {
                    // Strongly prefer items on the same visual row
                    score = Math.abs(dx) + Math.abs(dy) * 3.2;
                } else {
                    // Strongly prefer items aligned in the same column
                    score = Math.abs(dy) + Math.abs(dx) * 2.4;
                }

                if (score < bestScore) {
                    bestScore = score;
                    bestCandidate = cand;
                }
            }
        }

        // Edge Escape to Left Navigation Rail when moving left from leftmost content
        if (!bestCandidate && dir === 'left') {
            const nav = document.getElementById('side-nav');
            if (nav && !nav.contains(current) && activeRoot.contains(nav)) {
                const activeNav = nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item');
                if (activeNav && this.isFocusable(activeNav, activeRoot)) {
                    bestCandidate = activeNav;
                }
            }
        }

        if (bestCandidate) {
            return this.focusElement(bestCandidate);
        }

        return false;
    },

    _findFirstFocusable(root) {
        if (!root) return null;
        const scope = (root.id === 'main-shell')
            ? (root.querySelector('.section.active') || root)
            : root;
        const preferred = scope.querySelector('.profile-card, .add-profile-card, .category-item.active, .card, .btn-primary, button:not([disabled]), input, [tabindex="0"]');
        if (preferred && this.isFocusable(preferred, root)) return preferred;

        const all = scope.querySelectorAll('[tabindex="0"], button, input, select');
        for (let i = 0; i < all.length; i++) {
            if (this.isFocusable(all[i], root)) return all[i];
        }
        return null;
    },

    ensureVisible(el) {
        if (!el) return;

        // 1. Horizontal scroll containers (.row-scroll, .seasons-tabs-container)
        const rowScroll = el.closest('.row-scroll, .seasons-tabs-container');
        if (rowScroll) {
            const rRect = rowScroll.getBoundingClientRect();
            const eRect = el.getBoundingClientRect();
            const pad = 36;
            if (eRect.left < rRect.left + pad) {
                rowScroll.scrollLeft = Math.max(0, rowScroll.scrollLeft - (rRect.left + pad - eRect.left));
            } else if (eRect.right > rRect.right - pad) {
                rowScroll.scrollLeft += (eRect.right - (rRect.right - pad));
            }
        }

        // 2. Vertical scroll containers (.category-list, .browse-content, #content-area, #series-detail-screen, .login-page-view)
        const vScroll = el.closest('.category-list, .browse-main-content .browse-content, #series-detail-screen, .login-page-view')
            || document.getElementById('content-area');

        if (vScroll && vScroll.contains(el)) {
            const cRect = vScroll.getBoundingClientRect();
            const eRect = el.getBoundingClientRect();
            const margin = 80; // 10-foot safe margin

            if (eRect.top < cRect.top + margin) {
                vScroll.scrollTop = Math.max(0, vScroll.scrollTop - (cRect.top + margin - eRect.top));
            } else if (eRect.bottom > cRect.bottom - margin) {
                vScroll.scrollTop += (eRect.bottom - (cRect.bottom - margin));
            }

            // Trigger progressive load if scrolling near bottom of browse-content
            if (vScroll.classList && vScroll.classList.contains('browse-content') && vScroll._onScrollCheck) {
                vScroll._onScrollCheck();
            }
        }
    }
};
