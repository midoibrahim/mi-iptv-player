/* ============================================================
   IPTV Player — Download Manager Component (Windows Desktop)
   Integrates with Electron backend for background downloading,
   folder selection, real-time progress, and media management.
   Gracefully deactivated on Smart TVs (webOS/Tizen).
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.DownloadManager = {
    app: null,
    isDesktop: false,
    activeTasks: new Map(), // id -> task
    history: [],
    settings: {
        saveDirectory: '',
        askEveryTime: false
    },
    sectionEl: null,
    badgeEl: null,

    init(app) {
        this.app = app;
        // Verify Electron Desktop Download API is available
        if (!window.electronDesktop || !window.electronDesktop.downloads) {
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
                    <!-- Active Downloads Group -->
                    <div class="downloads-group" id="dl-active-group">
                        <h3 class="downloads-group-title">Active Downloads</h3>
                        <div class="downloads-list" id="dl-active-list"></div>
                    </div>

                    <!-- Completed Downloads Group -->
                    <div class="downloads-group" id="dl-completed-group">
                        <h3 class="downloads-group-title">Completed</h3>
                        <div class="downloads-list" id="dl-completed-list"></div>
                    </div>

                    <!-- Empty State -->
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
                const res = await window.electronDesktop.downloads.selectDirectory();
                if (!res.canceled && res.path) {
                    this.settings.saveDirectory = res.path;
                    this._updatePathDisplay();
                    if (this.app) this.app.toast('Downloads folder updated');
                }
            });
        }

        const btnOpenFolder = this.sectionEl.querySelector('#dl-btn-open-folder');
        if (btnOpenFolder) {
            btnOpenFolder.addEventListener('click', () => {
                window.electronDesktop.downloads.openFolder(this.settings.saveDirectory);
            });
        }

        const btnClear = this.sectionEl.querySelector('#dl-btn-clear-history');
        if (btnClear) {
            btnClear.addEventListener('click', async () => {
                await window.electronDesktop.downloads.clearHistory();
                this.history = [];
                this._render();
                if (this.app) this.app.toast('Download history cleared');
            });
        }

        const checkAutoMp4 = this.sectionEl.querySelector('#dl-check-auto-mp4');
        if (checkAutoMp4) {
            checkAutoMp4.addEventListener('change', async (e) => {
                const val = Boolean(e.target.checked);
                this.settings.autoConvertToMp4 = val;
                await window.electronDesktop.downloads.updateSettings({ autoConvertToMp4: val });
                if (this.app) this.app.toast(val ? 'Universal TV Compatibility enabled (MP4 + AAC 48kHz)' : 'Universal TV Compatibility disabled');
            });
        }

        const checkAsk = this.sectionEl.querySelector('#dl-check-ask-everytime');
        if (checkAsk) {
            checkAsk.addEventListener('change', async (e) => {
                const val = Boolean(e.target.checked);
                this.settings.askEveryTime = val;
                await window.electronDesktop.downloads.updateSettings({ askEveryTime: val });
            });
        }
    },

    _bindEvents() {
        const api = window.electronDesktop.downloads;
        if (!api) return;

        api.onStarted((task) => {
            this.activeTasks.set(task.id, task);
            this._updateBadge();
            this._render();
            if (this.app) this.app.toast(`Downloading: ${task.title}`);
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
            if (this.app) this.app.toast(`Download complete: ${historyItem.title}`);
        });

        api.onFailed((task) => {
            this.activeTasks.delete(task.id);
            this._updateBadge();
            this._render();
            if (this.app) this.app.toast(`Download failed: ${task.title} (${task.error || 'Network error'})`);
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
        });
    },

    async _refreshData() {
        if (!this.isDesktop) return;
        try {
            const data = await window.electronDesktop.downloads.getAll();
            if (data) {
                this.settings = data.settings || this.settings;
                this.history = data.history || [];
                this.activeTasks.clear();
                if (Array.isArray(data.active)) {
                    data.active.forEach(t => this.activeTasks.set(t.id, t));
                }
            }
            this._updatePathDisplay();
            this._updateBadge();
            this._render();
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

        // Render Active List
        if (activeList) {
            activeList.innerHTML = '';
            activeArray.forEach(task => {
                activeList.appendChild(this._createActiveCard(task));
            });
        }

        // Render Completed List
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
        const posterSrc = task.poster || '';

        card.innerHTML = `
            <div class="dl-card-thumb">
                ${posterSrc ? `<img src="${posterSrc}" alt="" onerror="this.style.display='none'">` : ''}
                <div class="dl-type-badge">${task.type === 'series' ? 'EPISODE' : 'MOVIE'}</div>
            </div>
            <div class="dl-card-main">
                <div class="dl-card-header">
                    <h4 class="dl-card-title" title="${task.title}">${task.title}</h4>
                    <span class="dl-card-status ${isPaused ? 'paused' : 'downloading'}">${isPaused ? 'Paused' : 'Downloading'}</span>
                </div>
                <div class="dl-progress-wrapper">
                    <div class="dl-progress-bar">
                        <div class="dl-progress-fill" style="width: ${task.percent || 0}%"></div>
                    </div>
                </div>
                <div class="dl-card-meta">
                    <span class="dl-meta-stats">${task.receivedFormatted || '0 B'} / ${task.totalFormatted || 'Unknown'} (${task.percent || 0}%)</span>
                    <span class="dl-meta-speed">${isPaused ? 'Paused' : (task.speedFormatted || '0 B/s')}</span>
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
                window.electronDesktop.downloads.resume(task.id);
            } else {
                window.electronDesktop.downloads.pause(task.id);
            }
        });

        const cancelBtn = card.querySelector('.dl-btn-cancel');
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.electronDesktop.downloads.cancel(task.id);
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
                    // Play in the app player using local file path
                    this.app.playerService.play({
                        id: item.itemId || item.id,
                        name: item.title,
                        type: item.type || 'movie',
                        url: `file:///${item.filePath.replace(/\\/g, '/')}`,
                        logo: item.poster
                    });
                } else {
                    window.electronDesktop.downloads.openFile(item.filePath);
                }
            });
        }

        const showBtn = card.querySelector('.dl-btn-show');
        if (showBtn) {
            showBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.electronDesktop.downloads.showInFolder(item.filePath);
            });
        }

        const convertBtn = card.querySelector('.dl-btn-convert');
        if (convertBtn) {
            convertBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                convertBtn.textContent = 'Converting...';
                convertBtn.disabled = true;
                if (this.app) this.app.toast('Remuxing to Universal MP4 (AAC 48kHz)...');
                const res = await window.electronDesktop.downloads.convertToMp4(item.id);
                if (res && res.success) {
                    if (this.app) this.app.toast('Successfully converted to Universal TV MP4!');
                } else {
                    if (this.app) this.app.toast('Conversion failed: ' + (res ? res.error : 'Unknown error'));
                    convertBtn.textContent = 'Convert to TV MP4';
                    convertBtn.disabled = false;
                }
            });
        }

        const deleteBtn = card.querySelector('.dl-btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await window.electronDesktop.downloads.deleteFile(item.id);
                if (this.app) this.app.toast('Download deleted');
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
        if (!urlOrId) return false;
        for (const task of this.activeTasks.values()) {
            if (task.id === urlOrId || task.itemId === urlOrId || task.url === urlOrId) {
                return true;
            }
        }
        return false;
    },

    isCompleted(urlOrId) {
        if (!urlOrId) return false;
        return this.history.some(h => (h.id === urlOrId || h.itemId === urlOrId || h.url === urlOrId) && h.existsOnDisk);
    },

    /**
     * Download a Movie
     */
    async downloadMovie(movieItem) {
        if (!this.isDesktop) return;
        if (!movieItem || !movieItem.url) {
            if (this.app) this.app.toast('Unable to download: Stream URL unavailable');
            return;
        }

        if (this.isDownloading(movieItem.url)) {
            if (this.app) this.app.toast('Already downloading this movie');
            return;
        }

        try {
            await window.electronDesktop.downloads.start({
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
            if (this.app) this.app.toast('Failed to start download');
        }
    },

    /**
     * Download a Series Episode
     */
    async downloadEpisode(seriesInfo, episode, seasonNum, epIndex) {
        if (!this.isDesktop) return;

        let streamUrl = episode.url;
        const conn = this.app ? this.app.connection : null;
        if (!streamUrl && conn && conn.type === 'xtream') {
            const base = conn.server.replace(/\/+$/, '');
            const ext = episode.container_extension || 'mp4';
            streamUrl = `${base}/series/${conn.user}/${conn.pass}/${episode.id}.${ext}`;
        }

        if (!streamUrl) {
            if (this.app) this.app.toast('Unable to download episode: stream URL unavailable');
            return;
        }

        if (this.isDownloading(streamUrl)) {
            if (this.app) this.app.toast('Already downloading this episode');
            return;
        }

        const epNum = episode.episode_num || episode.episode || (epIndex + 1);
        const epTitle = (window.IPTV.SeriesDetailView && window.IPTV.SeriesDetailView._formatEpisodeTitle)
            ? window.IPTV.SeriesDetailView._formatEpisodeTitle(episode.title, seriesInfo.name, seasonNum, epNum)
            : (episode.title || `Episode ${epNum}`);

        const thumb = (episode.info && episode.info.movie_image) || (episode.info && episode.info.cover) || seriesInfo.poster || '';

        try {
            await window.electronDesktop.downloads.start({
                id: `ep_${seriesInfo.id}_${episode.id}`,
                title: epTitle,
                seriesName: seriesInfo.name,
                season: seasonNum,
                episode: epNum,
                url: streamUrl,
                poster: thumb,
                type: 'series'
            });
        } catch (err) {
            console.error('[DownloadManager] Download episode error:', err);
            if (this.app) this.app.toast('Failed to start episode download');
        }
    }
};

