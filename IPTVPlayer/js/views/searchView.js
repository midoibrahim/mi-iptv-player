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
            if (window.IPTV.Platform && typeof window.IPTV.Platform.bindTvInput === 'function') {
                window.IPTV.Platform.bindTvInput(this.input, {
                    onEnter: (_e, deactivate) => {
                        deactivate();
                        this.input.blur();
                        this.search(this.input.value.trim());
                    }
                });
            } else {
                this.input.readOnly = true;
            }

            this.input.addEventListener('input', () => {
                clearTimeout(this.debounceTimeout);
                this.debounceTimeout = setTimeout(() => this.search(this.input.value.trim()), 280);
            });
        }
    },

    focusInput() {
        if (!this.input) return;
        this.input.readOnly = false;
        this.input.focus();
        try { this.input.select(); } catch(err) {}
    },

    _isTv() {
        const P = window.IPTV && window.IPTV.Platform;
        return Boolean(P && ((typeof P.isWebOS === 'function' && P.isWebOS()) || (typeof P.isTizen === 'function' && P.isTizen())));
    },

    _matchesItem(item, q, cacheQuery) {
        if (!item) return false;
        if (cacheQuery) {
            if (item._q === undefined) {
                item._q = ((item.name || '') + ' ' + (item.category || '')).toLowerCase();
            }
            return item._q.indexOf(q) !== -1;
        }
        const name = item.name ? String(item.name).toLowerCase() : '';
        if (name.indexOf(q) !== -1) return true;
        const cat = item.category ? String(item.category).toLowerCase() : '';
        return cat.indexOf(q) !== -1;
    },

    _collectPoolMatches(arr, q, maxPerGroup) {
        const matches = [];
        if (!arr || !arr.length) return matches;
        const cacheQuery = !this._isTv();
        for (let i = 0; i < arr.length && matches.length < maxPerGroup; i++) {
            if (this._matchesItem(arr[i], q, cacheQuery)) {
                matches.push(arr[i]);
            }
        }
        return matches;
    },

    async _collectPoolMatchesAsync(arr, q, maxPerGroup, gen) {
        const matches = [];
        if (!arr || !arr.length) return matches;
        const cacheQuery = !this._isTv();
        for (let i = 0; i < arr.length && matches.length < maxPerGroup; i++) {
            if (i > 0 && (i & 4095) === 0) {
                await new Promise(r => setTimeout(r, 0));
                if (this._searchGen !== gen) return null;
            }
            if (this._matchesItem(arr[i], q, cacheQuery)) {
                matches.push(arr[i]);
            }
        }
        return matches;
    },

    async search(query) {
        if (!this.resultsContainer) return;
        this._searchGen = (this._searchGen || 0) + 1;
        const gen = this._searchGen;

        if (!query) {
            this.resultsContainer.className = 'browse-content grid-view';
            this.resultsContainer.innerHTML = '<p class="empty-state">Type to search across channels, movies, and series.</p>';
            return;
        }

        const q = query.toLowerCase();
        const maxPerGroup = 36;

        const liveMatches = await this._collectPoolMatchesAsync(window.IPTV.CatalogStore.getLive(), q, maxPerGroup, gen);
        if (liveMatches === null || this._searchGen !== gen) return;
        const movieMatches = await this._collectPoolMatchesAsync(window.IPTV.CatalogStore.getMovies(), q, maxPerGroup, gen);
        if (movieMatches === null || this._searchGen !== gen) return;
        const seriesMatches = await this._collectPoolMatchesAsync(window.IPTV.CatalogStore.getSeries(), q, maxPerGroup, gen);
        if (seriesMatches === null || this._searchGen !== gen) return;

        const groups = [
            { title: 'Live Channels', type: 'live', items: liveMatches },
            { title: 'Movies',        type: 'movie', items: movieMatches },
            { title: 'Series',        type: 'series', items: seriesMatches }
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
