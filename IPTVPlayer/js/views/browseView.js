/* ============================================================
   IPTV Player — Reusable Browse Layout Component
   Shared by Live TV, Movies, and Series sections
   Optimized with Lazy Rendering, DocumentFragment Batching & Progressive Pagination
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.BrowseView = class {
    constructor(sectionId, options = {}) {
        this.sectionId = sectionId;     // 'live' | 'movies' | 'series'
        this.title = options.title || 'Browse';
        this.cardType = options.cardType || 'movie';
        this.unitName = options.unitName || 'items';
        this.app = options.app;

        this.items = [];
        this.categories = [];
        this.selectedCategory = 'all';
        this.viewMode = 'grid'; // 'grid' | 'rows'
        this._isRendered = false;
        this._filteredItems = [];
        this._renderedCount = 0;
        this._batchSize = 36; // Used for fallback non-windowed mode
        this._winStartRow = -1;
        this._winEndRow = -1;
        this._mountedCards = new Map();
        this._winRaf = null;
        this._contentReleased = false;
        this._savedContentScrollTop = 0;

        this.sectionEl = document.getElementById(`section-${sectionId}`);
    }

    setData(items, categories, options = {}) {
        this.items = items || [];
        this.categories = categories || [];

        if (options && options.preserveState) {
            if (this._isRendered) {
                this._rebuildCategoryBuckets();
                this._filteredItems = this.selectedCategory === 'all'
                    ? this.items
                    : ((this._byCategory && this._byCategory[this.selectedCategory]) || []);
                if (!this.sectionEl || !this.sectionEl.classList.contains('active')) {
                    this._isRendered = false;
                }
            }
            return;
        }

        this.selectedCategory = 'all';
        this._isRendered = false;

        // Only render immediately if this section is currently visible on screen
        if (this.sectionEl && this.sectionEl.classList.contains('active')) {
            this.ensureRendered();
        }
    }

    clear() {
        if (this._catChunkTimer) {
            clearTimeout(this._catChunkTimer);
            this._catChunkTimer = null;
        }
        this.items = [];
        this.categories = [];
        this.selectedCategory = 'all';
        this._filteredItems = [];
        this._byCategory = null;
        this._renderedCount = 0;
        this._renderedCatCount = 0;
        this._winStartRow = -1;
        this._winEndRow = -1;
        if (this._mountedCards) this._mountedCards.clear();
        if (this._winRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._winRaf);
            this._winRaf = null;
        }
        this._contentReleased = false;
        this._savedContentScrollTop = 0;
        this._isRendered = false;
        if (this.sectionEl) {
            this.sectionEl._lastFocusedEl = null;
            this.sectionEl._lastFocusedCard = null;
            this.sectionEl._lastFocusedCategory = null;
            this.sectionEl.innerHTML = '';
        }
    }

    ensureRendered() {
        if (this._isRendered) {
            if (this._contentReleased) {
                this.hydrateContentDom();
            }
            return;
        }
        this._isRendered = true;
        this.render();
    }

    releaseContentDom() {
        if (!this._isRendered || !this.sectionEl || this._contentReleased) return;
        const content = this.sectionEl.querySelector('.browse-content');
        if (!content) return;
        this._savedContentScrollTop = content.scrollTop || 0;
        if (this.sectionEl._lastFocusedCard && this.sectionEl._lastFocusedCard.dataset && this.sectionEl._lastFocusedCard.dataset.gridIdx !== undefined) {
            this.sectionEl._lastFocusedIndex = Number(this.sectionEl._lastFocusedCard.dataset.gridIdx);
        }
        this._contentReleased = true;
        this._winStartRow = -1;
        this._winEndRow = -1;
        this._gridStage = null;
        if (this._mountedCards) this._mountedCards.clear();
        if (content.classList) content.classList.remove('is-windowed');
        if (content.style) {
            content.style.paddingTop = '';
            content.style.paddingBottom = '';
        }
        content.innerHTML = '';
    }

    hydrateContentDom() {
        if (!this._contentReleased || !this.sectionEl) return;
        this._contentReleased = false;
        const content = this.sectionEl.querySelector('.browse-content');
        if (!content) return;
        const savedScroll = this._savedContentScrollTop || 0;
        if (this.viewMode === 'rows') {
            this._renderRows(content, this._filteredItems);
            content.scrollTop = savedScroll;
        } else {
            this._renderGrid(content, this._filteredItems, savedScroll);
            if (typeof this.sectionEl._lastFocusedIndex === 'number' && this._mountedCards && this._mountedCards.has(this.sectionEl._lastFocusedIndex)) {
                const card = this._mountedCards.get(this.sectionEl._lastFocusedIndex);
                this.sectionEl._lastFocusedCard = card;
                this.sectionEl._lastFocusedEl = card;
            }
        }
    }

    render() {
        if (!this.sectionEl) return;

        this.sectionEl.innerHTML = `
            <aside class="category-sidebar">
                <div class="category-sidebar-header">
                    <h3>Categories</h3>
                    <span class="cat-badge">${this.categories.length}</span>
                </div>
                <div class="category-search">
                    <input type="text" placeholder="Search categories (Press OK)..." tabindex="0" class="cat-search-input" readonly>
                </div>
                <ul class="category-list"></ul>
            </aside>
            <div class="browse-main-content">
                <div class="section-header">
                    <div class="header-info">
                        <h2>${this.title}</h2>
                        <span class="header-category">All</span>
                        <span class="header-count">0 ${this.unitName}</span>
                    </div>
                    <div class="section-controls">
                        <div class="view-toggle">
                            <button class="view-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid" tabindex="0" title="Grid View">${window.IPTV.Icons ? window.IPTV.Icons.get('grid', 'view-btn-svg') : 'Grid'}</button>
                            <button class="view-btn ${this.viewMode === 'rows' ? 'active' : ''}" data-view="rows" tabindex="0" title="Row View">${window.IPTV.Icons ? window.IPTV.Icons.get('list', 'view-btn-svg') : 'Rows'}</button>
                        </div>
                    </div>
                </div>
                <div class="browse-content ${this.viewMode === 'grid' ? 'grid-view' : 'rows-view'}" id="${this.sectionId}-content"></div>
            </div>
        `;

        this._bindControls();
        this._renderCategories();
        this._refreshContent();
    }

    _bindControls() {
        const searchInput = this.sectionEl.querySelector('.cat-search-input');
        const catList = this.sectionEl.querySelector('.category-list');
        const contentEl = this.sectionEl.querySelector('.browse-content');

        if (searchInput) {
            if (window.IPTV.Platform && typeof window.IPTV.Platform.bindTvInput === 'function') {
                window.IPTV.Platform.bindTvInput(searchInput);
            } else {
                searchInput.readOnly = true;
            }

            if (catList) {
                let catFilterTimer = null;
                searchInput.addEventListener('input', () => {
                    clearTimeout(catFilterTimer);
                    catFilterTimer = setTimeout(() => {
                        this._flushRemainingCategories();
                        const q = searchInput.value.toLowerCase().trim();
                        const items = catList.children;
                        for (let i = 0; i < items.length; i++) {
                            const li = items[i];
                            const text = li.textContent.toLowerCase();
                            li.style.display = text.indexOf(q) !== -1 ? 'flex' : 'none';
                        }
                    }, 90);
                });
            }
        }

        // Row-windowed scroll updater on browse-content (caps DOM cards on large playlists)
        if (contentEl) {
            const checkLoadMore = () => {
                if (this.viewMode !== 'grid') return;
                if (this._isWindowedGrid()) {
                    this._scheduleGridWindowUpdate(contentEl);
                    return;
                }
                if (this._renderedCount >= this._filteredItems.length) return;
                if (contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 450) {
                    this._appendNextGridBatch(contentEl);
                }
            };
            contentEl._onScrollCheck = checkLoadMore;
            contentEl._syncWindowNow = () => {
                if (this.viewMode === 'grid' && this._isWindowedGrid() && !this._contentReleased) {
                    this._updateGridWindow(contentEl, false);
                }
            };
            contentEl.addEventListener('scroll', checkLoadMore, { passive: true });
        }

        // View Mode Toggles
        this.sectionEl.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.sectionEl.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.viewMode = btn.dataset.view;
                this._refreshContent();
            });
        });
    }

    _createCategoryLi(catName, cnt) {
        const li = document.createElement('li');
        li.className = `category-item ${this.selectedCategory === catName ? 'active' : ''}`;
        li.tabIndex = 0;
        li.dataset.cat = catName;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = catName;
        const countSpan = document.createElement('span');
        countSpan.className = 'category-item-count';
        countSpan.textContent = String(cnt);

        li.appendChild(nameSpan);
        li.appendChild(countSpan);
        return li;
    }

    _flushRemainingCategories() {
        if (this._catChunkTimer) {
            clearTimeout(this._catChunkTimer);
            this._catChunkTimer = null;
        }
        const list = this.sectionEl && this.sectionEl.querySelector('.category-list');
        if (!list || !this._byCategory || this._renderedCatCount >= this.categories.length) return;

        const frag = document.createDocumentFragment();
        for (let i = this._renderedCatCount; i < this.categories.length; i++) {
            const c = this.categories[i];
            const catName = c.category_name || c.category_id || 'Unknown';
            const cnt = this._byCategory[catName] ? this._byCategory[catName].length : 0;
            frag.appendChild(this._createCategoryLi(catName, cnt));
        }
        list.appendChild(frag);
        this._renderedCatCount = this.categories.length;
    }

    _rebuildCategoryBuckets() {
        const byCat = {};
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const cat = item.category || 'Uncategorized';
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(item);
        }
        this._byCategory = byCat;
        return byCat;
    }

    _renderCategories() {
        const list = this.sectionEl.querySelector('.category-list');
        if (!list) return;
        if (this._catChunkTimer) {
            clearTimeout(this._catChunkTimer);
            this._catChunkTimer = null;
        }
        list.innerHTML = '';

        // Single pass: pre-bucket items by category for O(1) category switching & row view
        const byCat = this._rebuildCategoryBuckets();

        const frag = document.createDocumentFragment();

        // "All Categories" Item
        const allLi = document.createElement('li');
        allLi.className = `category-item ${this.selectedCategory === 'all' ? 'active' : ''}`;
        allLi.tabIndex = 0;
        allLi.dataset.cat = 'all';
        allLi.innerHTML = `
            <span>All Categories</span>
            <span class="category-item-count">${this.items.length}</span>
        `;
        frag.appendChild(allLi);

        // Render first 45 categories immediately for instant section paint
        const initialCap = Math.min(45, this.categories.length);
        for (let i = 0; i < initialCap; i++) {
            const c = this.categories[i];
            const catName = c.category_name || c.category_id || 'Unknown';
            const cnt = byCat[catName] ? byCat[catName].length : 0;
            frag.appendChild(this._createCategoryLi(catName, cnt));
        }

        list.appendChild(frag);
        this._renderedCatCount = initialCap;

        // Progressive background chunking for remaining categories (60 per tick)
        if (this._renderedCatCount < this.categories.length) {
            const appendCatChunk = () => {
                if (!this.sectionEl || !list.parentNode) return;
                const start = this._renderedCatCount;
                const end = Math.min(start + 60, this.categories.length);
                const chunkFrag = document.createDocumentFragment();
                for (let i = start; i < end; i++) {
                    const c = this.categories[i];
                    const catName = c.category_name || c.category_id || 'Unknown';
                    const cnt = byCat[catName] ? byCat[catName].length : 0;
                    chunkFrag.appendChild(this._createCategoryLi(catName, cnt));
                }
                list.appendChild(chunkFrag);
                this._renderedCatCount = end;
                if (this._renderedCatCount < this.categories.length) {
                    this._catChunkTimer = setTimeout(appendCatChunk, 20);
                } else {
                    this._catChunkTimer = null;
                }
            };
            this._catChunkTimer = setTimeout(appendCatChunk, 20);
        }

        // Single delegated click listener on category list
        list.onclick = (e) => {
            const li = e.target.closest('.category-item');
            if (!li) return;
            this.selectedCategory = li.dataset.cat || 'all';
            if (this.sectionEl) {
                this.sectionEl._lastFocusedCard = null;
                this.sectionEl._lastFocusedCategory = li;
            }
            const prev = list.querySelector('.category-item.active');
            if (prev) prev.classList.remove('active');
            li.classList.add('active');
            this._refreshContent();
        };
    }

    _refreshContent() {
        const content = this.sectionEl.querySelector('.browse-content');
        const countHeader = this.sectionEl.querySelector('.header-count');
        const catHeader = this.sectionEl.querySelector('.header-category');
        if (!content) return;

        const catLabel = (!this.selectedCategory || this.selectedCategory === 'all')
            ? 'All'
            : this.selectedCategory;
        if (catHeader) {
            catHeader.textContent = catLabel;
            catHeader.title = catLabel;
        }

        // O(1) category lookup via pre-built _byCategory bucket
        this._filteredItems = this.selectedCategory === 'all'
            ? this.items
            : ((this._byCategory && this._byCategory[this.selectedCategory]) || []);

        if (countHeader) {
            countHeader.textContent = `${this._filteredItems.length} ${this.unitName}`;
        }

        content.className = `browse-content ${this.viewMode === 'grid' ? 'grid-view' : 'rows-view'}`;
        content.scrollTop = 0;

        if (window.IPTV.Card && window.IPTV.Card.clearLazyQueue) {
            window.IPTV.Card.clearLazyQueue();
        }

        if (this.viewMode === 'rows') {
            this._renderRows(content, this._filteredItems);
        } else {
            this._renderGrid(content, this._filteredItems);
        }
    }

    _getGridMetrics(container) {
        const isLive = this.cardType === 'live' || this.cardType === 'channel';
        const P = window.IPTV && window.IPTV.Platform;
        const isTv = Boolean(P && ((typeof P.isWebOS === 'function' && P.isWebOS()) || (typeof P.isTizen === 'function' && P.isTizen())));
        const cols = isLive ? 4 : 5;
        const rowHeight = isLive ? 268 : 414;
        const viewportHeight = (container && container.clientHeight > 0) ? container.clientHeight : 760;
        return {
            cols,
            rowHeight,
            viewportHeight,
            basePadTop: 14,
            basePadBottom: 56,
            overscanBefore: isTv ? 2 : 3,
            overscanAfter: isTv ? 3 : 4
        };
    }

    _isWindowedGrid() {
        return this.viewMode === 'grid' && Array.isArray(this._filteredItems) && this._filteredItems.length > 60;
    }

    _scheduleGridWindowUpdate(container) {
        if (this._winRaf) return;
        const run = () => {
            this._winRaf = null;
            if (!this._contentReleased && this._isWindowedGrid()) {
                this._updateGridWindow(container, false);
            }
        };
        if (typeof requestAnimationFrame === 'function') {
            this._winRaf = requestAnimationFrame(run);
        } else {
            run();
        }
    }

    _createGridCard(index) {
        const item = this._filteredItems[index];
        const card = window.IPTV.Card.create(item, this.cardType, {
            isFavorite: window.IPTV.CatalogStore.isFavorite(item),
            onClick: (selectedItem, type) => this.app.onItemClick(selectedItem, type)
        });
        if (card && card.dataset) {
            card.dataset.gridIdx = String(index);
        }
        return card;
    }

    _renderGrid(container, items, initialScrollTop = 0) {
        if (this._winRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._winRaf);
            this._winRaf = null;
        }
        container.innerHTML = '';
        this._renderedCount = 0;
        this._winStartRow = -1;
        this._winEndRow = -1;
        this._gridStage = null;
        if (this._mountedCards) this._mountedCards.clear();
        if (container.style) {
            container.style.paddingTop = '';
            container.style.paddingBottom = '';
        }

        if (items.length === 0) {
            if (container.classList) container.classList.remove('is-windowed');
            container.innerHTML = '<p class="empty-state">No content available in this category.</p>';
            return;
        }

        if (this._isWindowedGrid()) {
            if (container.classList) container.classList.add('is-windowed');
            const stage = document.createElement('div');
            stage.className = 'browse-grid-stage';
            container.appendChild(stage);
            this._gridStage = stage;
            container.scrollTop = initialScrollTop || 0;
            this._updateGridWindow(container, true);
            return;
        }

        if (container.classList) container.classList.remove('is-windowed');
        this._appendNextGridBatch(container);
        if (initialScrollTop > 0) {
            container.scrollTop = initialScrollTop;
        }
    }

    _updateGridWindow(container, force = false) {
        if (!container || !this._filteredItems || this._filteredItems.length === 0) return;

        let stage = this._gridStage;
        if (!stage || stage.parentNode !== container) {
            stage = document.createElement('div');
            stage.className = 'browse-grid-stage';
            container.innerHTML = '';
            container.appendChild(stage);
            this._gridStage = stage;
            this._mountedCards.clear();
            this._winStartRow = -1;
            this._winEndRow = -1;
            force = true;
        }

        const m = this._getGridMetrics(container);
        const totalItems = this._filteredItems.length;
        const totalRows = Math.ceil(totalItems / m.cols);
        const scrollTop = Math.max(0, (container.scrollTop || 0) - m.basePadTop);
        const firstVisibleRow = Math.floor(scrollTop / m.rowHeight);
        const visibleRows = Math.max(1, Math.ceil(m.viewportHeight / m.rowHeight));

        const startRow = Math.max(0, firstVisibleRow - m.overscanBefore);
        const endRow = Math.min(totalRows - 1, firstVisibleRow + visibleRows + m.overscanAfter - 1);

        if (!force && startRow === this._winStartRow && endRow === this._winEndRow) {
            return;
        }

        const startIdx = startRow * m.cols;
        const endIdx = Math.min(totalItems - 1, ((endRow + 1) * m.cols) - 1);

        const prevStartRow = this._winStartRow;
        const prevEndRow = this._winEndRow;
        const prevStartIdx = prevStartRow >= 0 ? prevStartRow * m.cols : -1;
        const prevEndIdx = prevEndRow >= 0 ? Math.min(totalItems - 1, ((prevEndRow + 1) * m.cols) - 1) : -1;
        const hasOverlap = !force && prevStartRow >= 0 && startIdx <= prevEndIdx && endIdx >= prevStartIdx;

        if (hasOverlap) {
            // 1. Detach cards that scrolled out of the window & abort in-flight image decodes
            for (const [idx, card] of this._mountedCards.entries()) {
                if (idx < startIdx || idx > endIdx) {
                    if (card._img) {
                        card._img.onerror = null;
                        if (typeof card._img.removeAttribute === 'function') {
                            card._img.removeAttribute('src');
                        }
                    }
                    if (card.parentNode === stage) {
                        stage.removeChild(card);
                    }
                    this._mountedCards.delete(idx);
                }
            }
            // 2. Prepend newly visible rows above previous window
            if (startIdx < prevStartIdx) {
                const prependFrag = document.createDocumentFragment();
                const prependEnd = Math.min(endIdx, prevStartIdx - 1);
                for (let i = startIdx; i <= prependEnd; i++) {
                    const card = this._createGridCard(i);
                    this._mountedCards.set(i, card);
                    prependFrag.appendChild(card);
                }
                stage.insertBefore(prependFrag, stage.firstChild);
            }
            // 3. Append newly visible rows below previous window
            if (endIdx > prevEndIdx) {
                const appendFrag = document.createDocumentFragment();
                const appendStart = Math.max(startIdx, prevEndIdx + 1);
                for (let i = appendStart; i <= endIdx; i++) {
                    const card = this._createGridCard(i);
                    this._mountedCards.set(i, card);
                    appendFrag.appendChild(card);
                }
                stage.appendChild(appendFrag);
            }
        } else {
            stage.innerHTML = '';
            this._mountedCards.clear();
            const frag = document.createDocumentFragment();
            for (let i = startIdx; i <= endIdx; i++) {
                const card = this._createGridCard(i);
                this._mountedCards.set(i, card);
                frag.appendChild(card);
            }
            stage.appendChild(frag);
        }

        if (stage.style) {
            stage.style.paddingTop = `${startRow * m.rowHeight}px`;
            stage.style.paddingBottom = `${Math.max(0, totalRows - 1 - endRow) * m.rowHeight}px`;
        }

        this._winStartRow = startRow;
        this._winEndRow = endRow;
        this._renderedCount = endIdx + 1;
    }

    _appendNextGridBatch(container) {
        const start = this._renderedCount;
        const end = Math.min(start + this._batchSize, this._filteredItems.length);
        if (start >= end) return;

        const frag = document.createDocumentFragment();
        for (let i = start; i < end; i++) {
            const card = this._createGridCard(i);
            if (this._mountedCards) this._mountedCards.set(i, card);
            frag.appendChild(card);
        }
        container.appendChild(frag);
        this._renderedCount = end;
    }

    _renderRows(container, items) {
        this._gridStage = null;
        if (container.classList) container.classList.remove('is-windowed');
        if (container.style) {
            container.style.paddingTop = '';
            container.style.paddingBottom = '';
        }
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<p class="empty-state">No content available in this category.</p>';
            return;
        }

        let groups;
        if (this.selectedCategory === 'all' && this._byCategory) {
            groups = this._byCategory;
        } else if (this.selectedCategory && this.selectedCategory !== 'all') {
            groups = { [this.selectedCategory]: items };
        } else {
            groups = {};
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const cat = item.category || 'Uncategorized';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(item);
            }
        }

        const frag = document.createDocumentFragment();
        // Limit to first 15 category rows initially for smooth rendering
        const cats = Object.keys(groups).slice(0, 15);
        for (let c = 0; c < cats.length; c++) {
            const cat = cats[c];
            const row = document.createElement('div');
            row.className = 'browse-row';

            const h = document.createElement('h3');
            h.textContent = cat;
            row.appendChild(h);

            const scroll = document.createElement('div');
            scroll.className = 'row-scroll';

            const rowItems = groups[cat].slice(0, 24);
            for (let j = 0; j < rowItems.length; j++) {
                const item = rowItems[j];
                const card = window.IPTV.Card.create(item, this.cardType, {
                    isFavorite: window.IPTV.CatalogStore.isFavorite(item),
                    onClick: (selectedItem, type) => this.app.onItemClick(selectedItem, type)
                });
                scroll.appendChild(card);
            }

            row.appendChild(scroll);
            frag.appendChild(row);
        }
        container.appendChild(frag);
    }
};
