/* ============================================================
   IPTV Player — Unified Media Card Component
   Renders cards for Live Channels, Movies, Series, and Episodes
   Optimized for High-Speed Batch Creation on Smart TVs
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.Card = {
    _iconCache: {},
    _io: null,
    _lazyQueue: [],
    _lazyTimer: null,
    _immediateQuota: 16,
    _quotaResetTimer: null,

    _getIcon(key, cls) {
        const cacheKey = key + ':' + cls;
        if (!this._iconCache[cacheKey]) {
            this._iconCache[cacheKey] = window.IPTV.Icons ? window.IPTV.Icons.get(key, cls) : '★';
        }
        return this._iconCache[cacheKey];
    },

    _scheduleLazyImg(img, src) {
        if (!img || !src) return;

        // First 16 cards in any render burst load immediately (above-the-fold)
        if (this._immediateQuota > 0) {
            this._immediateQuota--;
            clearTimeout(this._quotaResetTimer);
            this._quotaResetTimer = setTimeout(() => { this._immediateQuota = 16; }, 180);
            img.src = src;
            return;
        }

        img.dataset.src = src;

        // Modern TVs (Chromium 51+): use native IntersectionObserver
        if (typeof window.IntersectionObserver === 'function') {
            if (!this._io) {
                this._io = new IntersectionObserver((entries) => {
                    for (let i = 0; i < entries.length; i++) {
                        const entry = entries[i];
                        if (entry.isIntersecting || entry.intersectionRatio > 0) {
                            const target = entry.target;
                            this._io.unobserve(target);
                            if (target.dataset && target.dataset.src) {
                                target.src = target.dataset.src;
                                delete target.dataset.src;
                            }
                        }
                    }
                }, { rootMargin: '360px' });
            }
            this._io.observe(img);
            return;
        }

        // Legacy webOS 3.x (Chromium 38): staggered non-blocking queue that skips detached nodes
        this._lazyQueue.push(img);
        if (!this._lazyTimer) {
            const pump = () => {
                let loaded = 0;
                while (this._lazyQueue.length > 0 && loaded < 6) {
                    const nextImg = this._lazyQueue.shift();
                    if (nextImg && nextImg.dataset && nextImg.dataset.src && document.contains(nextImg)) {
                        nextImg.src = nextImg.dataset.src;
                        delete nextImg.dataset.src;
                        loaded++;
                    }
                }
                if (this._lazyQueue.length > 0) {
                    this._lazyTimer = setTimeout(pump, 55);
                } else {
                    this._lazyTimer = null;
                }
            };
            this._lazyTimer = setTimeout(pump, 55);
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
            img.loading = 'lazy';
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

        // Interactive Favorite Button
        const favBtn = document.createElement('button');
        favBtn.className = isFavorite ? 'card-fav-btn active' : 'card-fav-btn';
        favBtn.tabIndex = -1;
        favBtn.innerHTML = this._getIcon('favorites', 'card-fav-svg');
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.app && window.app.toggleFavorite) {
                window.app.toggleFavorite(item);
                const nowFav = window.app.isFavorite(item);
                favBtn.classList.toggle('active', nowFav);
                card.classList.toggle('is-favorited', nowFav);
            }
        });
        card.appendChild(favBtn);
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

        if (item.category || item.year) {
            const sub = document.createElement('div');
            sub.className = 'card-sub';
            sub.textContent = item.year ? (item.category ? `${item.year} · ${item.category}` : String(item.year)) : item.category;
            info.appendChild(sub);
        }

        card.appendChild(info);

        if (onClick) {
            card.addEventListener('click', () => onClick(item, type));
        }

        return card;
    }
};
