/* ============================================================
   IPTV Player — Home View Component
   Hero Banner & Curated Horizontal Rows
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.HomeView = {
    init(app) {
        this.app = app;
        this.rowsContainer = document.getElementById('home-rows');
    },

    render(liveChannels, movies, series) {
        if (!this.rowsContainer) return;
        this.rowsContainer.innerHTML = '';

        // Hero Item
        const heroItem = movies[0] || liveChannels[0] || series[0];
        if (heroItem) {
            const banner = document.getElementById('hero-banner');
            const poster = heroItem.poster || heroItem.logo;
            if (banner && poster) {
                banner.style.backgroundImage = `url(${poster})`;
                banner.style.backgroundSize = 'cover';
                banner.style.backgroundPosition = 'center';
            }
            const titleEl = document.getElementById('hero-title');
            if (titleEl) titleEl.textContent = heroItem.name || '';

            const descEl = document.getElementById('hero-desc');
            if (descEl) descEl.textContent = heroItem.plot || heroItem.category || '';

            const playBtn = document.getElementById('hero-play');
            if (playBtn) playBtn.onclick = () => this.app.onItemClick(heroItem, heroItem.type || 'movie');

            const favBtn = document.getElementById('hero-fav');
            if (favBtn) {
                const updateHeroFav = () => {
                    const isFav = this.app.isFavorite(heroItem);
                    favBtn.classList.toggle('active', isFav);
                    const iconSpan = favBtn.querySelector('.btn-icon');
                    const label = isFav ? ' Favorited' : ' Add to Favorites';
                    if (iconSpan) {
                        while (iconSpan.nextSibling) {
                            favBtn.removeChild(iconSpan.nextSibling);
                        }
                        favBtn.appendChild(document.createTextNode(label));
                    } else {
                        favBtn.textContent = isFav ? '★ Favorited' : '☆ Add to Favorites';
                    }
                };
                updateHeroFav();
                favBtn.onclick = () => {
                    this.app.toggleFavorite(heroItem);
                    updateHeroFav();
                };
            }
        }

        // Live TV Row (first 25 channels)
        if (liveChannels && liveChannels.length > 0) {
            this._addRow('Live Channels', liveChannels.slice(0, 25), 'live');
        }

        // Popular Movies Row (first 25 movies)
        if (movies && movies.length > 0) {
            this._addRow('Popular Movies', movies.slice(0, 25), 'movie');
        }

        // Trending Series Row (first 25 series)
        if (series && series.length > 0) {
            this._addRow('Trending Series', series.slice(0, 25), 'series');
        }
    },

    _addRow(title, items, type) {
        const row = document.createElement('div');
        row.className = 'content-row';

        const h = document.createElement('h3');
        h.textContent = title;
        row.appendChild(h);

        const scroll = document.createElement('div');
        scroll.className = 'row-scroll';

        const frag = document.createDocumentFragment();
        items.forEach(item => {
            const card = window.IPTV.Card.create(item, type, {
                isFavorite: this.app.isFavorite(item),
                onClick: (selectedItem, itemType) => this.app.onItemClick(selectedItem, itemType)
            });
            frag.appendChild(card);
        });
        scroll.appendChild(frag);

        row.appendChild(scroll);
        this.rowsContainer.appendChild(row);
    }
};
