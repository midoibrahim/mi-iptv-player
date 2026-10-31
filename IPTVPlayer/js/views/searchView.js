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
        const pools = [
            this.app.liveChannels || [],
            this.app.movies || [],
            this.app.series || []
        ];

        const matches = [];
        const maxResults = 100;

        for (let p = 0; p < pools.length && matches.length < maxResults; p++) {
            const arr = pools[p];
            for (let i = 0; i < arr.length && matches.length < maxResults; i++) {
                const item = arr[i];
                const hit = item._q
                    ? item._q.indexOf(q) !== -1
                    : ((item.name && item.name.toLowerCase().indexOf(q) !== -1) ||
                       (item.category && item.category.toLowerCase().indexOf(q) !== -1));
                if (hit) {
                    matches.push(item);
                }
            }
        }

        this.resultsContainer.innerHTML = '';
        if (matches.length === 0) {
            const emptyP = document.createElement('p');
            emptyP.className = 'empty-state';
            emptyP.textContent = `No results found for "${query}".`;
            this.resultsContainer.appendChild(emptyP);
            return;
        }

        const frag = document.createDocumentFragment();
        for (let i = 0; i < matches.length; i++) {
            const item = matches[i];
            const type = item.type || 'live';
            const card = window.IPTV.Card.create(item, type, {
                isFavorite: this.app.isFavorite(item),
                onClick: (selectedItem, itemType) => this.app.onItemClick(selectedItem, itemType)
            });
            frag.appendChild(card);
        }
        this.resultsContainer.appendChild(frag);
    }
};
