/* ============================================================
   IPTV Player — Download Manager Component (Windows Desktop)
   Renders the Downloads section, active/completed cards, and
   delegates state & payload construction to DownloadStore.
   Gracefully deactivated on Smart TVs (webOS/Tizen).
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.DownloadManager = {
    app: null,
    isDesktop: Boolean(typeof window !== 'undefined' && window.electronDesktop && window.IPTV.Platform && window.IPTV.Platform.downloads),
    sectionEl: null,
    badgeEl: null,

    get store() {
        return window.IPTV.DownloadStore;
    },
    get activeTasks() {
        return this.store ? this.store.activeTasks : (this._fallbackActive || (this._fallbackActive = new Map()));
    },
    get history() {
        return this.store ? this.store.history : (this._fallbackHistory || []);
    },
    set history(v) {
        if (this.store) this.store.history = v;
        else this._fallbackHistory = v;
    },
    get settings() {
        return this.store ? this.store.settings : (this._fallbackSettings || { saveDirectory: '', askEveryTime: false });
    },
    set settings(v) {
        if (this.store) this.store.settings = v;
        else this._fallbackSettings = v;
    },

    init(app) {
        this.app = app;
        if (!(window.IPTV.Platform ? window.IPTV.Platform.hasDownloads() : (window.electronDesktop && window.IPTV.Platform.downloads))) {
            this.isDesktop = false;
            return;
        }

        this.isDesktop = true;
        this._injectNavigationItem();
        this._injectSectionElement();
        this._bindEvents();
        this._refreshData();
    },

    _injectNavigationItem() {
        const sideNavUl = document.querySelector('#side-nav ul');
        if (!sideNavUl || document.querySelector('.nav-item[data-section="downloads"]')) return;

        const settingsItem = sideNavUl.querySelector('.nav-item[data-section="settings"]');
        const dlLi = document.createElement('li');
        dlLi.className = 'nav-item';
        dlLi.dataset.section = 'downloads';
        dlLi.tabIndex = 0;

        const downloadIcon = window.IPTV.Icons ? window.IPTV.Icons.get('download') : '⬇';
        dlLi.innerHTML = `
            <span class="nav-icon">${downloadIcon}</span>
            <span class="nav-text">Downloads</span>
            <span class="nav-badge hidden" id="nav-downloads-badge">0</span>
        `;

        dlLi.addEventListener('click', () => {
            if (this.app) {
                this.app.navigateTo('downloads');
            }
        });

        if (settingsItem) {
            sideNavUl.insertBefore(dlLi, settingsItem);
        } else {
            sideNavUl.appendChild(dlLi);
        }

        this.badgeEl = dlLi.querySelector('#nav-downloads-badge');
    },

    _injectSectionElement() {
        const contentArea = document.getElementById('content-area');
        if (!contentArea || document.getElementById('section-downloads')) return;

        const section = document.createElement('section');
        section.id = 'section-downloads';
        section.className = 'section downloads-section';
        section.innerHTML = `
            <div class="downloads-container">
                <div class="downloads-header">
                    <div class="downloads-header-info">
                        <h2>Downloads</h2>
                        <span class="downloads-stats" id="dl-header-stats">0 active · 0 completed</span>
                    </div>
                    <div class="downloads-header-actions">
                        <button id="dl-btn-change-folder" class="btn-ghost" tabindex="0">
                            <span class="btn-icon">${window.IPTV.Icons ? window.IPTV.Icons.get('folder') : '📁'}</span> Change Folder
                        </button>
                        <button id="dl-btn-open-folder" class="btn-ghost" tabindex="0">
                            <span class="btn-icon">${window.IPTV.Icons ? window.IPTV.Icons.get('folder') : '📂'}</span> Open in Explorer
                        </button>
                        <button id="dl-btn-clear-history" class="btn-ghost" tabindex="0">
                            <span class="btn-icon">${window.IPTV.Icons ? window.IPTV.Icons.get('trash') : '🗑'}</span> Clear History
                        </button>
                    </div>
                </div>

                <div class="downloads-path-bar">
                    <div class="downloads-path-info">
                        <span class="path-label">Saving to:</span>
                        <span class="path-value" id="dl-current-path">Loading folder...</span>
                    </div>
                    <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                        <label class="downloads-checkbox-label">
                            <span>Parallel downloads:</span>
                            <select id="dl-select-parallel" class="dl-select" tabindex="0">
                                <option value="1">1 (Sequential)</option>
                                <option value="2">2 Simultaneous</option>
                                <option value="3">3 Simultaneous</option>
                            </select>
                        </label>
                        <label class="downloads-checkbox-label">
                            <input type="checkbox" id="dl-check-auto-mp4" tabindex="0">
                            <span title="Automatically copies video to MP4 and converts audio to AAC 48kHz for older receivers & TVs">Universal TV Compatibility (MP4 + AAC 48kHz)</span>
                        </label>
                        <label class="downloads-checkbox-label">
                            <input type="checkbox" id="dl-check-ask-everytime" tabindex="0">
                            <span>Always ask where to save</span>
                        </label>
                    </div>
                </div>

                <div class="downloads-content">
                    <div class="downloads-group" id="dl-active-group">
                        <h3 class="downloads-group-title">Active Downloads</h3>
                        <div class="downloads-list" id="dl-active-list"></div>
                    </div>

                    <div class="downloads-group" id="dl-completed-group">
                        <h3 class="downloads-group-title">Completed</h3>
                        <div class="downloads-list" id="dl-completed-list"></div>
                    </div>

                    <div class="downloads-empty hidden" id="dl-empty-state">
                        <div class="downloads-empty-icon">${window.IPTV.Icons ? window.IPTV.Icons.get('download') : '⬇'}</div>
                        <h3>No Downloads Yet</h3>
                        <p>Click the download icon on any movie or series episode to save it to your computer for offline viewing.</p>
                    </div>
                </div>
            </div>
        `;

        contentArea.appendChild(section);
        this.sectionEl = section;
        this._bindUIControls();
    },

    _bindUIControls() {
        if (!this.sectionEl) return;

        const btnChangeFolder = this.sectionEl.querySelector('#dl-btn-change-folder');
        if (btnChangeFolder) {
            btnChangeFolder.addEventListener('click', async () => {
                const res = await window.IPTV.Platform.downloads.selectDirectory();
                if (!res.canceled && res.path) {
                    this.settings.saveDirectory = res.path;
                    this._updatePathDisplay();
                    window.IPTV.EventBus.toast('Downloads folder updated');
                }
            });
        }

        const btnOpenFolder = this.sectionEl.querySelector('#dl-btn-open-folder');
        if (btnOpenFolder) {
            btnOpenFolder.addEventListener('click', () => {
                window.IPTV.Platform.downloads.openFolder(this.settings.saveDirectory);
            });
        }

        const btnClear = this.sectionEl.querySelector('#dl-btn-clear-history');
        if (btnClear) {
            btnClear.addEventListener('click', async () => {
                await window.IPTV.Platform.downloads.clearHistory();
                this.history = [];
                this._render();
                window.IPTV.EventBus.toast('Download history cleared');
            });
        }

        const checkAutoMp4 = this.sectionEl.querySelector('#dl-check-auto-mp4');
        if (checkAutoMp4) {
            checkAutoMp4.addEventListener('change', async (e) => {
                const val = Boolean(e.target.checked);
                this.settings.autoConvertToMp4 = val;
                await window.IPTV.Platform.downloads.updateSettings({ autoConvertToMp4: val });
                window.IPTV.EventBus.toast(val ? 'Universal TV Compatibility enabled (MP4 + AAC 48kHz)' : 'Universal TV Compatibility disabled');
            });
        }

        const selectParallel = this.sectionEl.querySelector('#dl-select-parallel');
        if (selectParallel) {
            selectParallel.addEventListener('change', async (e) => {
                const val = parseInt(e.target.value, 10) || 1;
                this.settings.maxConcurrent = val;
                await window.IPTV.Platform.downloads.updateSettings({ maxConcurrent: val });
                window.IPTV.EventBus.toast(`Parallel downloads set to ${val}`);
            });
        }

        const checkAsk = this.sectionEl.querySelector('#dl-check-ask-everytime');
        if (checkAsk) {
            checkAsk.addEventListener('change', async (e) => {
                const val = Boolean(e.target.checked);
                this.settings.askEveryTime = val;
                await window.IPTV.Platform.downloads.updateSettings({ askEveryTime: val });
            });
        }
    },

    _bindEvents() {
        const api = window.IPTV.Platform.downloads;
        if (!api) return;

        api.onStarted((task) => {
            this.activeTasks.set(task.id, task);
            this._updateBadge();
            this._render();
            window.IPTV.EventBus.toast(`Downloading: ${task.title}`);
        });

        api.onProgress((task) => {
            this.activeTasks.set(task.id, task);
            this._updateProgressItem(task);
        });

        api.onCompleted((historyItem) => {
            this.activeTasks.delete(historyItem.id);
            this.history.unshift(historyItem);
            this._updateBadge();
            this._render();
            this._refreshVisibleCardStates();
            window.IPTV.EventBus.toast(`Download complete: ${historyItem.title}`);
        });

        api.onFailed((task) => {
            this.activeTasks.delete(task.id);
            this._updateBadge();
            this._render();
            window.IPTV.EventBus.toast(`Download failed: ${task.title} (${task.error || 'Network error'})`);
        });

        api.onPaused((task) => {
            this.activeTasks.set(task.id, task);
            this._updateProgressItem(task);
        });

        api.onResumed((task) => {
            this.activeTasks.set(task.id, task);
            this._updateProgressItem(task);
        });

        api.onCancelled((data) => {
            this.activeTasks.delete(data.id);
            this._updateBadge();
            this._render();
        });

        api.onHistoryUpdated((history) => {
            this.history = history || [];
            this._render();
            this._refreshVisibleCardStates();
        });
    },

    async _refreshData() {
        if (!this.isDesktop) return;
        try {
            const data = await window.IPTV.Platform.downloads.getAll();
            if (this.store) {
                this.store.applySnapshot(data);
            }
            this._updatePathDisplay();
            this._updateBadge();
            this._render();
            this._refreshVisibleCardStates();
        } catch (err) {
            console.error('[DownloadManager] Failed to fetch initial download state:', err);
        }
    },

    _updatePathDisplay() {
        const pathEl = document.getElementById('dl-current-path');
        if (pathEl) {
            pathEl.textContent = this.settings.saveDirectory || 'Default Downloads folder';
            pathEl.title = this.settings.saveDirectory;
        }
        const checkAutoMp4 = document.getElementById('dl-check-auto-mp4');
        if (checkAutoMp4) {
            checkAutoMp4.checked = this.settings.autoConvertToMp4 !== false;
        }

        const selectParallel = document.getElementById('dl-select-parallel');
        if (selectParallel) {
            selectParallel.value = String(this.settings.maxConcurrent || 1);
        }

        const checkAsk = document.getElementById('dl-check-ask-everytime');
        if (checkAsk) {
            checkAsk.checked = Boolean(this.settings.askEveryTime);
        }
    },

    _updateBadge() {
        const count = this.activeTasks.size;
        if (this.badgeEl) {
            this.badgeEl.textContent = String(count);
            this.badgeEl.classList.toggle('hidden', count === 0);
        }
        const statsEl = document.getElementById('dl-header-stats');
        if (statsEl) {
            statsEl.textContent = `${count} active · ${this.history.length} completed`;
        }
    },

    _render() {
        if (!this.sectionEl) return;

        const activeList = this.sectionEl.querySelector('#dl-active-list');
        const completedList = this.sectionEl.querySelector('#dl-completed-list');
        const activeGroup = this.sectionEl.querySelector('#dl-active-group');
        const completedGroup = this.sectionEl.querySelector('#dl-completed-group');
        const emptyState = this.sectionEl.querySelector('#dl-empty-state');

        const activeArray = Array.from(this.activeTasks.values());
        const hasActive = activeArray.length > 0;
        const hasCompleted = this.history.length > 0;

        activeGroup.style.display = hasActive ? 'block' : 'none';
        completedGroup.style.display = hasCompleted ? 'block' : 'none';
        emptyState.classList.toggle('hidden', hasActive || hasCompleted);

        if (activeList) {
            activeList.innerHTML = '';
            activeArray.forEach(task => {
                activeList.appendChild(this._createActiveCard(task));
            });
        }

        if (completedList) {
            completedList.innerHTML = '';
            this.history.forEach(item => {
                completedList.appendChild(this._createCompletedCard(item));
            });
        }
    },

    _createActiveCard(task) {
        const card = document.createElement('div');
        card.className = 'download-card download-card-active';
        card.id = `dl-task-${task.id}`;

        const isPaused = task.status === 'paused';
        const isQueued = task.status === 'queued';
        const isConverting = task.status === 'converting';

        let statusLabel = 'Downloading';
        let statusClass = 'downloading';
        if (isQueued) {
            statusLabel = 'In Queue';
            statusClass = 'queued';
        } else if (isPaused) {
            statusLabel = 'Paused';
            statusClass = 'paused';
        } else if (isConverting) {
            statusLabel = 'Converting';
            statusClass = 'converting';
        }
        const posterSrc = task.poster || '';

        card.innerHTML = `
            <div class="dl-card-thumb">
                ${posterSrc ? `<img src="${posterSrc}" alt="" onerror="this.style.display='none'">` : ''}
                <div class="dl-type-badge">${task.type === 'series' ? 'EPISODE' : 'MOVIE'}</div>
            </div>
            <div class="dl-card-main">
                <div class="dl-card-header">
                    <h4 class="dl-card-title" title="${task.title}">${task.title}</h4>
                    <span class="dl-card-status ${statusClass}">${statusLabel}</span>
                </div>
                <div class="dl-progress-wrapper">
                    <div class="dl-progress-bar">
                        <div class="dl-progress-fill" style="width: ${task.percent || 0}%"></div>
                    </div>
                </div>
                <div class="dl-card-meta">
                    <span class="dl-meta-stats">${task.receivedFormatted || '0 B'} / ${task.totalFormatted || 'Unknown'} (${task.percent || 0}%)</span>
                    <span class="dl-meta-speed">${isQueued ? 'Waiting in queue...' : (isPaused ? 'Paused' : (task.speedFormatted || '0 B/s'))}</span>
                </div>
            </div>
            <div class="dl-card-actions">
                <button class="btn-ghost dl-btn-pause" tabindex="0" title="${isPaused ? 'Resume' : 'Pause'}">
                    ${isPaused ? 'Resume' : 'Pause'}
                </button>
                <button class="btn-ghost dl-btn-cancel" tabindex="0" title="Cancel Download">
                    Cancel
                </button>
            </div>
        `;

        const pauseBtn = card.querySelector('.dl-btn-pause');
        pauseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (task.status === 'paused') {
                window.IPTV.Platform.downloads.resume(task.id);
            } else {
                window.IPTV.Platform.downloads.pause(task.id);
            }
        });

        const cancelBtn = card.querySelector('.dl-btn-cancel');
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.IPTV.Platform.downloads.cancel(task.id);
        });

        return card;
    },

    _createCompletedCard(item) {
        const card = document.createElement('div');
        card.className = 'download-card download-card-completed';
        card.id = `dl-history-${item.id}`;

        const posterSrc = item.poster || '';
        const dateStr = item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '';

        card.innerHTML = `
            <div class="dl-card-thumb">
                ${posterSrc ? `<img src="${posterSrc}" alt="" onerror="this.style.display='none'">` : ''}
                <div class="dl-type-badge">${item.type === 'series' ? 'EPISODE' : 'MOVIE'}</div>
            </div>
            <div class="dl-card-main">
                <div class="dl-card-header">
                    <h4 class="dl-card-title" title="${item.title}">${item.title}</h4>
                    <span class="dl-card-status completed">${item.existsOnDisk ? 'Downloaded' : 'File Removed'}</span>
                </div>
                <div class="dl-card-meta">
                    <span class="dl-meta-size">${item.fileSizeFormatted || 'Ready'}</span>
                    ${dateStr ? `<span class="dl-meta-date">${dateStr}</span>` : ''}
                    ${item.isUniversalMp4 || (item.fileName && item.fileName.toLowerCase().endsWith('.mp4')) ? '<span class="dl-badge-compat" title="Universal H.264 + AAC 48kHz MP4 (Compatible with all TVs & Older Receivers)">✓ TV Compatible</span>' : ''}
                    <span class="dl-meta-path" title="${item.filePath || ''}">${item.fileName || ''}</span>
                </div>
            </div>
            <div class="dl-card-actions">
                ${item.existsOnDisk ? `
                    <button class="btn-primary dl-btn-play" tabindex="0" title="Play Downloaded File">
                        Play
                    </button>
                    <button class="btn-ghost dl-btn-show" tabindex="0" title="Show in File Explorer">
                        Show in Folder
                    </button>
                    ${(!item.isUniversalMp4 && item.fileName && item.fileName.toLowerCase().endsWith('.mkv')) ? `
                    <button class="btn-ghost dl-btn-convert" tabindex="0" title="Convert to Universal MP4 (H.264 + AAC 48kHz) for Older Receivers and Smart TVs">
                        Convert to TV MP4
                    </button>
                    ` : ''}
                ` : ''}
                <button class="btn-ghost dl-btn-delete" tabindex="0" title="Delete Download">
                    Delete
                </button>
            </div>
        `;

        const playBtn = card.querySelector('.dl-btn-play');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.app && this.app.playerService) {
                    this.app.playerService.play({
                        id: item.itemId || item.id,
                        name: item.title,
                        type: item.type || 'movie',
                        url: `file:///${item.filePath.replace(/\\/g, '/')}`,
                        logo: item.poster
                    });
                } else {
                    window.IPTV.Platform.downloads.openFile(item.filePath);
                }
            });
        }

        const showBtn = card.querySelector('.dl-btn-show');
        if (showBtn) {
            showBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.IPTV.Platform.downloads.showInFolder(item.filePath);
            });
        }

        const convertBtn = card.querySelector('.dl-btn-convert');
        if (convertBtn) {
            convertBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                convertBtn.textContent = 'Converting...';
                convertBtn.disabled = true;
                window.IPTV.EventBus.toast('Remuxing to Universal MP4 (AAC 48kHz)...');
                const res = await window.IPTV.Platform.downloads.convertToMp4(item.id);
                if (res && res.success) {
                    window.IPTV.EventBus.toast('Successfully converted to Universal TV MP4!');
                } else {
                    window.IPTV.EventBus.toast('Conversion failed: ' + (res ? res.error : 'Unknown error'));
                    convertBtn.textContent = 'Convert to TV MP4';
                    convertBtn.disabled = false;
                }
            });
        }

        const deleteBtn = card.querySelector('.dl-btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await window.IPTV.Platform.downloads.deleteFile(item.id);
                window.IPTV.EventBus.toast('Download deleted');
            });
        }

        return card;
    },

    _updateProgressItem(task) {
        const card = document.getElementById(`dl-task-${task.id}`);
        if (!card) {
            this._render();
            return;
        }

        const fill = card.querySelector('.dl-progress-fill');
        if (fill) fill.style.width = `${task.percent || 0}%`;

        const stats = card.querySelector('.dl-meta-stats');
        if (stats) stats.textContent = `${task.receivedFormatted || '0 B'} / ${task.totalFormatted || 'Unknown'} (${task.percent || 0}%)`;

        const speed = card.querySelector('.dl-meta-speed');
        const isPaused = task.status === 'paused';
        if (speed) speed.textContent = isPaused ? 'Paused' : (task.speedFormatted || '0 B/s');

        const status = card.querySelector('.dl-card-status');
        if (status) {
            status.className = `dl-card-status ${isPaused ? 'paused' : 'downloading'}`;
            status.textContent = isPaused ? 'Paused' : 'Downloading';
        }

        const pauseBtn = card.querySelector('.dl-btn-pause');
        if (pauseBtn) {
            pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
            pauseBtn.title = isPaused ? 'Resume' : 'Pause';
        }
    },

    isDownloading(urlOrId) {
        return this.store ? this.store.isDownloading(urlOrId) : false;
    },

    getDownloadedItem(target) {
        if (!this.isDesktop) return null;
        return this.store ? this.store.getDownloadedItem(target) : null;
    },

    isCompleted(target) {
        return Boolean(this.getDownloadedItem(target));
    },

    _refreshVisibleCardStates() {
        document.querySelectorAll('.card-download-btn').forEach(btn => {
            const card = btn.closest('.card');
            if (card && card._item && card._type === 'movie') {
                if (this.isCompleted(card._item)) {
                    btn.classList.remove('downloading');
                    btn.classList.add('downloaded');
                    btn.title = 'Downloaded to PC (Click to open Downloads)';
                    if (window.IPTV.Icons) btn.innerHTML = window.IPTV.Icons.get('check', 'card-dl-svg');
                } else if (this.isDownloading(card._item.url || card._item.id)) {
                    btn.classList.add('downloading');
                    btn.classList.remove('downloaded');
                } else {
                    btn.classList.remove('downloading', 'downloaded');
                    if (window.IPTV.Icons) btn.innerHTML = window.IPTV.Icons.get('download', 'card-dl-svg');
                }
            }
        });

        document.querySelectorAll('.episode-card').forEach(card => {
            const epBtn = card.querySelector('.ep-download-btn');
            const epId = card.dataset.episodeId;
            const epRecId = card.dataset.episodeRecordId;
            const epUrl = card.dataset.episodeUrl;
            if (epBtn && (epId || epRecId || epUrl)) {
                const isDone = (epRecId && this.isCompleted(epRecId)) ||
                    (epUrl && this.isCompleted(epUrl)) ||
                    (epId && this.isCompleted(epId));
                const isActive = (epRecId && this.isDownloading(epRecId)) ||
                    (epUrl && this.isDownloading(epUrl)) ||
                    (epId && this.isDownloading(epId));
                if (isDone) {
                    epBtn.classList.remove('downloading');
                    epBtn.classList.add('downloaded');
                    epBtn.title = 'Downloaded to PC';
                    if (window.IPTV.Icons) epBtn.innerHTML = window.IPTV.Icons.get('check');
                } else if (isActive) {
                    epBtn.classList.add('downloading');
                    epBtn.classList.remove('downloaded');
                    epBtn.title = 'Downloading...';
                } else {
                    epBtn.classList.remove('downloading', 'downloaded');
                    epBtn.title = 'Download Episode to PC';
                    if (window.IPTV.Icons) epBtn.innerHTML = window.IPTV.Icons.get('download');
                }
            }
        });
    },

    async downloadMovie(movieItem) {
        if (!this.isDesktop) return;
        if (!movieItem || !movieItem.url) {
            window.IPTV.EventBus.toast('Unable to download: Stream URL unavailable');
            return;
        }

        if (this.isDownloading(movieItem.url) || this.isDownloading(movieItem.id)) {
            window.IPTV.EventBus.toast('Already downloading this movie');
            return;
        }

        if (this.getDownloadedItem(movieItem)) {
            window.IPTV.EventBus.toast('Movie already downloaded to PC! Available in Downloads.');
            this._refreshVisibleCardStates();
            return;
        }

        try {
            await window.IPTV.Platform.downloads.start({
                id: movieItem.id,
                title: movieItem.name || 'Movie',
                name: movieItem.name,
                url: movieItem.url,
                poster: movieItem.poster || movieItem.logo,
                type: 'movie',
                year: movieItem.year
            });
        } catch (err) {
            console.error('[DownloadManager] Download movie error:', err);
            window.IPTV.EventBus.toast('Failed to start download');
        }
    },

    async downloadEntireSeries(seriesInfo, seasonsData) {
        if (!this.isDesktop || !seriesInfo || !seasonsData || !this.store) return;

        const episodesToDownload = [];
        const seasonKeys = Object.keys(seasonsData).sort((a, b) => Number(a) - Number(b));
        seasonKeys.forEach(sNum => {
            episodesToDownload.push(...this.store.collectPendingEpisodes(seriesInfo, sNum, seasonsData[sNum]));
        });

        if (episodesToDownload.length === 0) {
            window.IPTV.EventBus.toast('All episodes are already downloading or downloaded');
            return;
        }

        window.IPTV.EventBus.toast(`Queued ${episodesToDownload.length} episodes of "${seriesInfo.name}"`);
        await window.IPTV.Platform.downloads.startBatch(episodesToDownload);
    },

    async downloadSeason(seriesInfo, seasonNum, episodes) {
        if (!this.isDesktop || !seriesInfo || !Array.isArray(episodes) || !this.store) return;

        const episodesToDownload = this.store.collectPendingEpisodes(seriesInfo, seasonNum, episodes);
        if (episodesToDownload.length === 0) {
            window.IPTV.EventBus.toast(`All episodes in Season ${seasonNum} are already downloading or downloaded`);
            return;
        }

        window.IPTV.EventBus.toast(`Queued ${episodesToDownload.length} episodes of Season ${seasonNum}`);
        await window.IPTV.Platform.downloads.startBatch(episodesToDownload);
    },

    async downloadEpisode(seriesInfo, episode, seasonNum, epIndex) {
        if (!this.isDesktop || !this.store) return;

        const payload = this.store.buildEpisodePayload(seriesInfo, seasonNum, episode, epIndex);
        if (!payload || !payload.url) {
            window.IPTV.EventBus.toast('Unable to download episode: stream URL unavailable');
            return;
        }

        if (this.isDownloading(payload.url) || this.isDownloading(payload.id)) {
            window.IPTV.EventBus.toast('Already downloading this episode');
            return;
        }

        if (this.getDownloadedItem(payload)) {
            window.IPTV.EventBus.toast('Episode already downloaded to PC! Available in Downloads.');
            this._refreshVisibleCardStates();
            return;
        }

        try {
            await window.IPTV.Platform.downloads.start(payload);
        } catch (err) {
            console.error('[DownloadManager] Download episode error:', err);
            window.IPTV.EventBus.toast('Failed to start episode download');
        }
    }
};
