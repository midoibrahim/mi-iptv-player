/* ============================================================
   IPTV Player — Unified Media Card Component
   Renders cards for Live Channels, Movies, Series, and Episodes
   Optimized for High-Speed Batch Creation on Smart TVs
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.Card = {
    _iconCache: {},
    _iconNodeCache: {},
    _lazyQueue: [],
    _lazyTimer: null,
    _immediateQuota: 16,
    _quotaResetTimer: null,

    _isTv() {
        const P = window.IPTV && window.IPTV.Platform;
        return Boolean(P && ((typeof P.isWebOS === 'function' && P.isWebOS()) || (typeof P.isTizen === 'function' && P.isTizen())));
    },

    _getIcon(key, cls) {
        const cacheKey = key + ':' + cls;
        if (!this._iconCache[cacheKey]) {
            this._iconCache[cacheKey] = window.IPTV.Icons ? window.IPTV.Icons.get(key, cls) : '★';
        }
        return this._iconCache[cacheKey];
    },

    _appendIcon(container, key, cls) {
        const cacheKey = key + ':' + cls;
        let tpl = this._iconNodeCache[cacheKey];
        if (tpl === undefined) {
            const html = this._getIcon(key, cls);
            try {
                const holder = document.createElement('div');
                holder.innerHTML = html;
                tpl = (holder.firstElementChild && typeof holder.firstElementChild.cloneNode === 'function')
                    ? holder.firstElementChild
                    : null;
            } catch (e) {
                tpl = null;
            }
            this._iconNodeCache[cacheKey] = tpl;
        }
        if (tpl && typeof container.appendChild === 'function') {
            container.appendChild(tpl.cloneNode(true));
        } else {
            container.innerHTML = this._getIcon(key, cls);
        }
    },

    _scheduleLazyImg(img, src) {
        if (!img || !src) return;

        // Desktop: assign immediately (windowed grid already caps mounted cards to ~45)
        if (!this._isTv()) {
            img.src = src;
            return;
        }

        // Smart TVs: first 16 cards in any render burst load immediately (above-the-fold)
        if (this._immediateQuota > 0) {
            this._immediateQuota--;
            clearTimeout(this._quotaResetTimer);
            this._quotaResetTimer = setTimeout(() => { this._immediateQuota = 16; }, 180);
            img.src = src;
            return;
        }

        // Remaining TV cards stagger LIFO (newest visible cards load first!)
        img.dataset.src = src;
        this._lazyQueue.push(img);
        if (!this._lazyTimer) {
            const pump = () => {
                let loaded = 0;
                while (this._lazyQueue.length > 0 && loaded < 8) {
                    const nextImg = this._lazyQueue.pop();
                    if (nextImg && nextImg.dataset && nextImg.dataset.src && (typeof document === 'undefined' || !document.contains || document.contains(nextImg))) {
                        nextImg.src = nextImg.dataset.src;
                        delete nextImg.dataset.src;
                        loaded++;
                    }
                }
                if (this._lazyQueue.length > 0) {
                    this._lazyTimer = setTimeout(pump, 35);
                } else {
                    this._lazyTimer = null;
                }
            };
            this._lazyTimer = setTimeout(pump, 35);
        }
    },

    eagerLoad(cardEl) {
        if (!cardEl) return;
        const img = cardEl._img || (cardEl.querySelector && cardEl.querySelector('img[data-src]'));
        if (img && img.dataset && img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
        }
    },

    clearLazyQueue() {
        this._lazyQueue.length = 0;
        if (this._lazyTimer) {
            clearTimeout(this._lazyTimer);
            this._lazyTimer = null;
        }
    },

    create(item, type, options = {}) {
        const { isFavorite = false, onClick = null } = options;

        const card = document.createElement('div');
        card.className = (type === 'live' ? 'card card-live' : 'card') + (isFavorite ? ' is-favorited' : '');
        card.tabIndex = 0;

        const posterSrc = item.poster || item.logo || '';
        const iconKey = type === 'live' ? 'live' : (type === 'series' ? 'series' : 'movies');
        const fallbackSvg = this._getIcon(iconKey, 'card-fallback-svg');

        const createFallback = () => {
            const fallback = document.createElement('div');
            fallback.className = 'card-poster-fallback';
            const iconSpan = document.createElement('span');
            iconSpan.className = 'fallback-icon';
            iconSpan.innerHTML = fallbackSvg;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'fallback-name';
            nameSpan.textContent = item.name || 'Untitled';
            fallback.appendChild(iconSpan);
            fallback.appendChild(nameSpan);
            return fallback;
        };

        if (posterSrc) {
            const img = document.createElement('img');
            img.className = 'card-poster';
            img.alt = '';
            img.decoding = 'async';
            img.onerror = function() {
                this.replaceWith(createFallback());
            };
            card.appendChild(img);
            card._img = img;
            this._scheduleLazyImg(img, posterSrc);
        } else {
            card.appendChild(createFallback());
        }

        // Badges
        if (type === 'live') {
            const liveBadge = document.createElement('span');
            liveBadge.className = 'card-live-badge';
            liveBadge.textContent = 'LIVE';
            card.appendChild(liveBadge);
        }

        if (item.hd) {
            const hdBadge = document.createElement('span');
            hdBadge.className = 'card-hd-badge';
            hdBadge.textContent = 'HD';
            card.appendChild(hdBadge);
        }

        // Progress Bar on Card (Continue Watching)
        const progressData = options.progress || (item.position && item.duration ? { position: item.position, duration: item.duration } : null);
        if (progressData && progressData.duration > 0) {
            const pct = Math.max(0, Math.min(100, Math.round((progressData.position / progressData.duration) * 100)));
            const barContainer = document.createElement('div');
            barContainer.className = 'card-progress-bar';
            const fill = document.createElement('div');
            fill.className = 'card-progress-fill';
            fill.style.width = `${pct}%`;
            barContainer.appendChild(fill);
            card.appendChild(barContainer);
        }

        // Interactive Favorite Button
        const favBtn = document.createElement('button');
        favBtn.className = isFavorite ? 'card-fav-btn active' : 'card-fav-btn';
        favBtn.tabIndex = -1;
        this._appendIcon(favBtn, 'favorites', 'card-fav-svg');
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const store = window.IPTV.CatalogStore;
            store.toggleFavorite(item);
            const nowFav = store.isFavorite(item);
            favBtn.classList.toggle('active', nowFav);
            card.classList.toggle('is-favorited', nowFav);
        });
        card.appendChild(favBtn);

        // Desktop Download Button for Movies & Series
        if (type !== 'live' && window.IPTV.DownloadManager && window.IPTV.DownloadManager.isDesktop) {
            const dlBtn = document.createElement('button');
            dlBtn.className = 'card-download-btn';
            dlBtn.tabIndex = -1;
            let dlIconKey = 'download';
            dlBtn.title = type === 'series' ? 'Browse Episodes to Download' : 'Download to PC';

            if (type === 'movie' && window.IPTV.DownloadManager) {
                if (window.IPTV.DownloadManager.isCompleted(item)) {
                    dlBtn.classList.add('downloaded');
                    dlBtn.title = 'Downloaded to PC';
                    dlIconKey = 'check';
                } else if (window.IPTV.DownloadManager.isDownloading(item.url || item.id)) {
                    dlBtn.classList.add('downloading');
                    dlBtn.title = 'Downloading...';
                }
            }
            this._appendIcon(dlBtn, dlIconKey, 'card-dl-svg');
            dlBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (type === 'series') {
                    if (onClick) onClick(item, type);
                } else {
                    window.IPTV.DownloadManager.downloadMovie(item);
                }
            });
            card.appendChild(dlBtn);
            card._dlBtn = dlBtn;
        }
        card._item = item;
        card._type = type;
        card._favBtn = favBtn;

        // Info container
        const info = document.createElement('div');
        info.className = 'card-info';

        const titleEl = document.createElement('div');
        titleEl.className = 'card-title';
        titleEl.textContent = item.name || 'Unknown';
        info.appendChild(titleEl);

        const subText = options.subtitle || (item.year ? (item.category ? `${item.year} · ${item.category}` : String(item.year)) : item.category);
        if (subText) {
            const sub = document.createElement('div');
            sub.className = 'card-sub';
            sub.textContent = subText;
            info.appendChild(sub);
        }

        card.appendChild(info);

        if (onClick) {
            card.addEventListener('click', () => onClick(item, type));
        }

        return card;
    }
};
