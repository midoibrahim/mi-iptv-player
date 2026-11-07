/* ============================================================
   IPTV Player — Search View Component
   Debounced multi-category live search engine
   Groups results by type: Live Channels, Movies, Series
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

    _collectPoolMatches(arr, q, maxPerGroup) {
        const matches = [];
        if (!arr || !arr.length) return matches;
        for (let i = 0; i < arr.length && matches.length < maxPerGroup; i++) {
            const item = arr[i];
            const hit = item._q
                ? item._q.indexOf(q) !== -1
                : ((item.name && item.name.toLowerCase().indexOf(q) !== -1) ||
                   (item.category && item.category.toLowerCase().indexOf(q) !== -1));
            if (hit) {
                matches.push(item);
            }
        }
        return matches;
    },

    search(query) {
        if (!this.resultsContainer) return;

        if (!query) {
            this.resultsContainer.className = 'browse-content grid-view';
            this.resultsContainer.innerHTML = '<p class="empty-state">Type to search across channels, movies, and series.</p>';
            return;
        }

        const q = query.toLowerCase();
        const maxPerGroup = 36;

        const groups = [
            { title: 'Live Channels', type: 'live', items: this._collectPoolMatches(window.IPTV.CatalogStore.getLive(), q, maxPerGroup) },
            { title: 'Movies',        type: 'movie', items: this._collectPoolMatches(window.IPTV.CatalogStore.getMovies(), q, maxPerGroup) },
            { title: 'Series',        type: 'series', items: this._collectPoolMatches(window.IPTV.CatalogStore.getSeries(), q, maxPerGroup) }
        ].filter(g => g.items.length > 0);

        if (window.IPTV.Card && window.IPTV.Card.clearLazyQueue) {
            window.IPTV.Card.clearLazyQueue();
        }
        this.resultsContainer.innerHTML = '';

        if (groups.length === 0) {
            this.resultsContainer.className = 'browse-content grid-view';
            const emptyP = document.createElement('p');
            emptyP.className = 'empty-state';
            emptyP.textContent = `No results found for "${query}".`;
            this.resultsContainer.appendChild(emptyP);
            return;
        }

        this.resultsContainer.className = 'browse-content search-groups-wrapper';
        const frag = document.createDocumentFragment();

        for (let g = 0; g < groups.length; g++) {
            const grp = groups[g];
            const sectionEl = document.createElement('div');
            sectionEl.className = 'search-group';
            sectionEl.dataset.groupType = grp.type;

            const headerEl = document.createElement('div');
            headerEl.className = 'search-group-header';

            const titleEl = document.createElement('h3');
            titleEl.className = 'search-group-title';
            titleEl.textContent = grp.title;

            const countEl = document.createElement('span');
            countEl.className = 'search-group-count';
            countEl.textContent = String(grp.items.length);

            headerEl.appendChild(titleEl);
            headerEl.appendChild(countEl);
            sectionEl.appendChild(headerEl);

            const gridEl = document.createElement('div');
            gridEl.className = 'search-group-grid';

            for (let i = 0; i < grp.items.length; i++) {
                const item = grp.items[i];
                const card = window.IPTV.Card.create(item, grp.type, {
                    isFavorite: window.IPTV.CatalogStore.isFavorite(item),
                    onClick: (selectedItem, itemType) => this.app.onItemClick(selectedItem, itemType)
                });
                gridEl.appendChild(card);
            }

            sectionEl.appendChild(gridEl);
            frag.appendChild(sectionEl);
        }

        this.resultsContainer.appendChild(frag);
    }
};
