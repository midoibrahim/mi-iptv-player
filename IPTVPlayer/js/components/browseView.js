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
        this._batchSize = 36; // Fast 36-card batch per page

        this.sectionEl = document.getElementById(`section-${sectionId}`);
    }

    setData(items, categories) {
        this.items = items || [];
        this.categories = categories || [];
        this.selectedCategory = 'all';
        this._isRendered = false;

        // Only render immediately if this section is currently visible on screen
        if (this.sectionEl && this.sectionEl.classList.contains('active')) {
            this.ensureRendered();
        }
    }

    ensureRendered() {
        if (this._isRendered) return;
        this._isRendered = true;
        this.render();
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
            searchInput.readOnly = true;

            const activateSearch = () => {
                if (searchInput.readOnly) {
                    searchInput.readOnly = false;
                    searchInput.focus();
                    try { searchInput.select(); } catch(err) {}
                }
            };

            const deactivateSearch = () => {
                searchInput.readOnly = true;
            };

            searchInput.addEventListener('click', activateSearch);

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    if (searchInput.readOnly) {
                        e.preventDefault();
                        e.stopPropagation();
                        activateSearch();
                    }
                } else if (e.key === 'Escape' || e.keyCode === 27) {
                    deactivateSearch();
                    searchInput.blur();
                }
            });

            searchInput.addEventListener('blur', deactivateSearch);

            if (catList) {
                searchInput.addEventListener('input', () => {
                    this._flushRemainingCategories();
                    const q = searchInput.value.toLowerCase().trim();
                    catList.querySelectorAll('.category-item').forEach(li => {
                        const text = li.textContent.toLowerCase();
                        li.style.display = text.includes(q) ? 'flex' : 'none';
                    });
                });
            }
        }

        // Progressive scroll pagination on browse-content
        if (contentEl) {
            const checkLoadMore = () => {
                if (this.viewMode !== 'grid') return;
                if (this._renderedCount >= this._filteredItems.length) return;
                if (contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 450) {
                    this._appendNextGridBatch(contentEl);
                }
            };
            contentEl._onScrollCheck = checkLoadMore;
            contentEl.addEventListener('scroll', checkLoadMore);
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

    _renderCategories() {
        const list = this.sectionEl.querySelector('.category-list');
        if (!list) return;
        if (this._catChunkTimer) {
            clearTimeout(this._catChunkTimer);
            this._catChunkTimer = null;
        }
        list.innerHTML = '';

        // Single pass: pre-bucket items by category for O(1) category switching & row view
        const byCat = {};
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const cat = item.category || 'Uncategorized';
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(item);
        }
        this._byCategory = byCat;

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
        if (!content) return;

        // O(1) category lookup via pre-built _byCategory bucket
        this._filteredItems = this.selectedCategory === 'all'
            ? this.items
            : ((this._byCategory && this._byCategory[this.selectedCategory]) || []);

        if (countHeader) {
            countHeader.textContent = `${this._filteredItems.length} ${this.unitName}`;
        }

        content.className = `browse-content ${this.viewMode === 'grid' ? 'grid-view' : 'rows-view'}`;
        content.scrollTop = 0;

        if (this.viewMode === 'rows') {
            this._renderRows(content, this._filteredItems);
        } else {
            this._renderGrid(content, this._filteredItems);
        }
    }

    _renderGrid(container, items) {
        container.innerHTML = '';
        this._renderedCount = 0;

        if (items.length === 0) {
            container.innerHTML = '<p class="empty-state">No content available in this category.</p>';
            return;
        }

        this._appendNextGridBatch(container);
    }

    _appendNextGridBatch(container) {
        const start = this._renderedCount;
        const end = Math.min(start + this._batchSize, this._filteredItems.length);
        if (start >= end) return;

        const frag = document.createDocumentFragment();
        for (let i = start; i < end; i++) {
            const item = this._filteredItems[i];
            const card = window.IPTV.Card.create(item, this.cardType, {
                isFavorite: this.app.isFavorite(item),
                onClick: (selectedItem, type) => this.app.onItemClick(selectedItem, type)
            });
            frag.appendChild(card);
        }
        container.appendChild(frag);
        this._renderedCount = end;
    }

    _renderRows(container, items) {
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<p class="empty-state">No content available in this category.</p>';
            return;
        }

        const groups = {};
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const cat = item.category || 'Uncategorized';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
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
                    isFavorite: this.app.isFavorite(item),
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
