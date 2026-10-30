/* ============================================================
   IPTV Player — Unified Media Card Component
   Renders cards for Live Channels, Movies, Series, and Episodes
   Optimized for High-Speed Batch Creation on Smart TVs
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.Card = {
    _iconCache: {},

    _getIcon(key, cls) {
        const cacheKey = key + ':' + cls;
        if (!this._iconCache[cacheKey]) {
            this._iconCache[cacheKey] = window.IPTV.Icons ? window.IPTV.Icons.get(key, cls) : '★';
        }
        return this._iconCache[cacheKey];
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
            img.src = posterSrc;
            img.alt = '';
            img.decoding = 'async';
            img.loading = 'lazy';
            img.onerror = function() {
                this.replaceWith(createFallback());
            };
            card.appendChild(img);
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
                const nowFav = window.app.isFavorite(item.id);
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
