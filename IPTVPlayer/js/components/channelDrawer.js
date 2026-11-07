/* ============================================================
   IPTV Player — In-Player Live Channel Drawer Component
   Encapsulates category pills, progressive channel list rendering,
   and 10-foot D-pad drawer navigation.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.ChannelDrawer = {
    player: null,
    isOpen: false,
    selectedCategory: null,
    filteredChannels: [],
    renderedCount: 0,
    _scrollBound: false,

    init(player) {
        this.player = player;
        this.isOpen = false;
        this.selectedCategory = null;
        this.filteredChannels = [];
        this.renderedCount = 0;
        this._scrollBound = false;
    },

    focusItem(el) {
        if (!el) return;
        if (window.IPTV.SpatialNav) {
            window.IPTV.SpatialNav.focusElement(el);
        } else {
            el.focus();
        }
        try {
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (e) {}
    },

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    open() {
        if (!this.player || !this.player.isLiveStream()) return;
        this.isOpen = true;
        this.player.isChannelDrawerOpen = true;
        this.player.hideOSD();

        const drawer = document.getElementById('player-channel-drawer');
        const backdrop = document.getElementById('player-drawer-backdrop');
        if (drawer) drawer.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');

        this.selectedCategory = null;
        this.renderCategories();
        this.renderChannels();

        setTimeout(() => {
            if (!drawer) return;
            const activeCh = drawer.querySelector('.drawer-channel-item.active-playing, .drawer-channel-item');
            if (activeCh) {
                this.focusItem(activeCh);
            }
        }, 50);
    },

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this.player) {
            this.player.isChannelDrawerOpen = false;
        }

        const drawer = document.getElementById('player-channel-drawer');
        const backdrop = document.getElementById('player-drawer-backdrop');
        if (drawer) drawer.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');

        if (this.player) {
            this.player.showOSD();
        }
        const chBtn = document.getElementById('osd-channels-btn');
        if (chBtn) {
            if (window.IPTV.SpatialNav) {
                window.IPTV.SpatialNav.focusElement(chBtn);
            } else {
                chBtn.focus();
            }
        }
    },

    renderCategories() {
        const catBar = document.getElementById('drawer-categories-bar');
        if (!catBar) return;
        catBar.innerHTML = '';

        const cats = (window.IPTV.CatalogStore && Array.isArray(window.IPTV.CatalogStore.getCategories().live))
            ? window.IPTV.CatalogStore.getCategories().live
            : [];

        const allBtn = document.createElement('button');
        allBtn.className = `drawer-cat-btn ${!this.selectedCategory ? 'active' : ''}`;
        allBtn.textContent = 'All Channels';
        allBtn.tabIndex = 0;
        allBtn.addEventListener('click', () => {
            this.selectedCategory = null;
            catBar.querySelectorAll('.drawer-cat-btn').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            this.renderChannels();
        });
        catBar.appendChild(allBtn);

        cats.forEach(cat => {
            const catName = typeof cat === 'string' ? cat : (cat.category_name || cat.name || '');
            if (!catName) return;
            const btn = document.createElement('button');
            const isActive = this.selectedCategory === catName;
            btn.className = `drawer-cat-btn ${isActive ? 'active' : ''}`;
            btn.textContent = catName;
            btn.tabIndex = 0;
            btn.addEventListener('click', () => {
                this.selectedCategory = catName;
                catBar.querySelectorAll('.drawer-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderChannels();
            });
            catBar.appendChild(btn);
            if (isActive) {
                setTimeout(() => {
                    try { btn.scrollIntoView({ inline: 'center' }); } catch (e) {}
                }, 40);
            }
        });
    },

    renderChannels() {
        const listEl = document.getElementById('drawer-channel-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        const allChannels = window.IPTV.CatalogStore ? window.IPTV.CatalogStore.getLive() : [];
        const selCat = this.selectedCategory;

        this.filteredChannels = allChannels.filter(ch => {
            if (selCat) {
                const chCat = ch.category || ch.category_name || '';
                if (chCat !== selCat) return false;
            }
            return true;
        });

        if (this.filteredChannels.length === 0) {
            listEl.innerHTML = '<p class="empty-state" style="padding:32px 0;">No channels in this category.</p>';
            this.renderedCount = 0;
            return;
        }

        this.renderedCount = 0;

        let currentIdx = -1;
        const currentItem = this.player ? this.player.currentItem : null;
        if (currentItem) {
            currentIdx = this.filteredChannels.findIndex(ch =>
                ch.id === currentItem.id || (ch._idx !== undefined && ch._idx === currentItem._idx)
            );
        }

        const initialChunk = Math.min(
            this.filteredChannels.length,
            Math.max(35, currentIdx >= 0 ? currentIdx + 15 : 35)
        );

        this.appendChunk(initialChunk);

        if (!this._scrollBound) {
            this._scrollBound = true;
            listEl.addEventListener('scroll', () => {
                if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 250) {
                    this.appendChunk(25);
                }
            });
        }
    },

    appendChunk(chunkSize) {
        const listEl = document.getElementById('drawer-channel-list');
        if (!listEl || !this.filteredChannels) return;

        const start = this.renderedCount;
        const end = Math.min(this.filteredChannels.length, start + chunkSize);
        if (start >= end) return;

        const currentItem = this.player ? this.player.currentItem : null;
        const frag = document.createDocumentFragment();

        for (let i = start; i < end; i++) {
            const ch = this.filteredChannels[i];
            const itemEl = document.createElement('div');
            const isCurrent = currentItem && (ch.id === currentItem.id || (ch._idx !== undefined && ch._idx === currentItem._idx));
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
                this.close();
                if (this.player && this.player.app) {
                    this.player.app.onItemClick(ch, 'live');
                }
            });

            frag.appendChild(itemEl);
        }

        listEl.appendChild(frag);
        this.renderedCount = end;
    },

    handleKey(e, keyHandler) {
        if (!keyHandler) return;

        if (keyHandler.isBackKey(e)) {
            this.close();
            return;
        }

        if (keyHandler.isChannelUp(e) || keyHandler.isChannelDown(e)) {
            const listEl = document.getElementById('drawer-channel-list');
            if (listEl) {
                listEl.scrollBy({ top: keyHandler.isChannelDown(e) ? 280 : -280, behavior: 'smooth' });
            }
            return;
        }

        const drawer = document.getElementById('player-channel-drawer');
        if (!drawer) return;

        const dir = keyHandler.getDirection(e);
        if (dir) {
            const active = document.activeElement;

            if (!active || !drawer.contains(active)) {
                const target = drawer.querySelector('.drawer-channel-item.active-playing, .drawer-channel-item, .drawer-cat-btn');
                if (target) {
                    this.focusItem(target);
                    return;
                }
            }

            if (active.classList.contains('drawer-channel-item')) {
                if (dir === 'down') {
                    const idx = parseInt(active.getAttribute('data-index'), 10);
                    if (!isNaN(idx) && idx >= this.renderedCount - 6) {
                        this.appendChunk(25);
                    }
                    const next = active.nextElementSibling;
                    if (next && next.classList.contains('drawer-channel-item')) {
                        this.focusItem(next);
                    }
                    return;
                }
                if (dir === 'up') {
                    const prev = active.previousElementSibling;
                    if (prev && prev.classList.contains('drawer-channel-item')) {
                        this.focusItem(prev);
                        return;
                    }
                    const activeCat = drawer.querySelector('.drawer-cat-btn.active') || drawer.querySelector('.drawer-cat-btn');
                    if (activeCat) {
                        this.focusItem(activeCat);
                    }
                    return;
                }
                if (dir === 'left') {
                    const items = Array.from(drawer.querySelectorAll('.drawer-channel-item'));
                    const curIdx = items.indexOf(active);
                    if (curIdx > 0) {
                        const targetIdx = Math.max(0, curIdx - 5);
                        this.focusItem(items[targetIdx]);
                    }
                    return;
                }
                if (dir === 'right') {
                    const idx = parseInt(active.getAttribute('data-index'), 10);
                    if (!isNaN(idx) && idx >= this.renderedCount - 10) {
                        this.appendChunk(25);
                    }
                    const items = Array.from(drawer.querySelectorAll('.drawer-channel-item'));
                    const curIdx = items.indexOf(active);
                    if (curIdx >= 0 && curIdx < items.length - 1) {
                        const targetIdx = Math.min(items.length - 1, curIdx + 5);
                        this.focusItem(items[targetIdx]);
                    }
                    return;
                }
            }

            if (active.classList.contains('drawer-cat-btn')) {
                if (dir === 'right') {
                    const next = active.nextElementSibling;
                    if (next && next.classList.contains('drawer-cat-btn')) {
                        this.focusItem(next);
                    }
                    return;
                }
                if (dir === 'left') {
                    const prev = active.previousElementSibling;
                    if (prev && prev.classList.contains('drawer-cat-btn')) {
                        this.focusItem(prev);
                    }
                    return;
                }
                if (dir === 'down') {
                    const ch = drawer.querySelector('.drawer-channel-item.active-playing') || drawer.querySelector('.drawer-channel-item');
                    if (ch) this.focusItem(ch);
                    return;
                }
                if (dir === 'up') {
                    const closeBtn = document.getElementById('drawer-close-btn');
                    if (closeBtn) this.focusItem(closeBtn);
                    return;
                }
            }

            if (active.id === 'drawer-close-btn') {
                if (dir === 'down') {
                    const activeCat = drawer.querySelector('.drawer-cat-btn.active') || drawer.querySelector('.drawer-cat-btn');
                    if (activeCat) this.focusItem(activeCat);
                }
                return;
            }

            const handled = window.IPTV.SpatialNav ? window.IPTV.SpatialNav.navigate(dir) : false;
            if (handled) return;
        }

        if (keyHandler.isEnterKey(e)) {
            const active = document.activeElement;
            if (active && typeof active.click === 'function') {
                active.click();
            }
        }
    }
};

