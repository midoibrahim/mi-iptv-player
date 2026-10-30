/* ============================================================
   IPTV Player — Search View Component
   Debounced multi-category live search engine
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.SearchView = {
    init(app) {
        this.app = app;
        this.input = document.getElementById('search-input');
        this.resultsContainer = document.getElementById('search-results');
        this.debounceTimeout = null;

        if (this.input) {
            this.input.readOnly = true;

            const activateSearch = () => {
                if (this.input.readOnly) {
                    this.input.readOnly = false;
                    this.input.focus();
                    try { this.input.select(); } catch(err) {}
                }
            };

            const deactivateSearch = () => {
                this.input.readOnly = true;
            };

            this.input.addEventListener('click', activateSearch);

            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    if (this.input.readOnly) {
                        e.preventDefault();
                        e.stopPropagation();
                        activateSearch();
                    } else {
                        deactivateSearch();
                        this.input.blur();
                        this.search(this.input.value.trim());
                    }
                } else if (e.key === 'Escape' || e.keyCode === 27) {
                    deactivateSearch();
                    this.input.blur();
                }
            });

            this.input.addEventListener('blur', deactivateSearch);

            this.input.addEventListener('input', () => {
                clearTimeout(this.debounceTimeout);
                this.debounceTimeout = setTimeout(() => this.search(this.input.value.trim()), 280);
            });
        }
    },

    search(query) {
        if (!this.resultsContainer) return;

        if (!query) {
            this.resultsContainer.innerHTML = '<p class="empty-state">Type to search across channels, movies, and series.</p>';
            return;
        }

        const q = query.toLowerCase();
        const allItems = [
            ...(this.app.liveChannels || []),
            ...(this.app.movies || []),
            ...(this.app.series || [])
        ];

        const matches = allItems.filter(i =>
            i.name.toLowerCase().includes(q) ||
            (i.category && i.category.toLowerCase().includes(q))
        );

        this.resultsContainer.innerHTML = '';
        if (matches.length === 0) {
            this.resultsContainer.innerHTML = `<p class="empty-state">No results found for "${query}".</p>`;
            return;
        }

        matches.slice(0, 100).forEach(item => {
            const type = this.app.liveChannels.includes(item)
                ? 'live'
                : (this.app.series.includes(item) ? 'series' : 'movie');

            const card = window.IPTV.Card.create(item, type, {
                isFavorite: this.app.isFavorite(item.id),
                onClick: (selectedItem, itemType) => this.app.onItemClick(selectedItem, itemType)
            });
            this.resultsContainer.appendChild(card);
        });
    }
};
