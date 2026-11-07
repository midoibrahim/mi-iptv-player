/* ============================================================
   IPTV Player — Settings View Component
   Server info, Theme Swatch Selector, Quality & Buffer controls
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.SettingsView = {
    init(app) {
        this.app = app;
        this.serverEl = document.getElementById('setting-server');
        this.statusEl = document.getElementById('setting-status');
        this.disconnectBtn = document.getElementById('btn-disconnect');
        this.qualitySelect = document.getElementById('setting-quality');
        this.bufferSelect = document.getElementById('setting-buffer');
        this.autoplayCheck = document.getElementById('setting-autoplay');

        this._setupThemeSelector();
        this._setupDownloadSettings();
        this._bindUI();
        this._loadSettings();
    },

    _setupDownloadSettings() {
        if (!window.IPTV.DownloadManager || !window.IPTV.DownloadManager.isDesktop) return;
        const panel = document.querySelector('.settings-panel');
        if (!panel || document.getElementById('settings-download-group')) return;

        const dlGroup = document.createElement('div');
        dlGroup.id = 'settings-download-group';
        dlGroup.className = 'settings-group';

        const dm = window.IPTV.DownloadManager;
        const currentPath = dm.settings.saveDirectory || 'Default Downloads folder';

        dlGroup.innerHTML = `
            <h3>Desktop Downloads</h3>
            <p class="settings-group-desc">Configure where movies and episodes are saved on this computer.</p>
            <div class="setting-item">
                <label>Destination Folder</label>
                <div class="setting-val" id="setting-dl-path" style="font-family: monospace; font-size: 15px; color: var(--accent); word-break: break-all;">${currentPath}</div>
            </div>
            <div class="setting-item" style="margin-top: 14px;">
                <label for="setting-dl-parallel">Parallel Downloads</label>
                <select id="setting-dl-parallel" class="setting-select" tabindex="0">
                    <option value="1">1 (Sequential - Default)</option>
                    <option value="2">2 Simultaneous</option>
                    <option value="3">3 Simultaneous</option>
                    <option value="4">4 Simultaneous</option>
                    <option value="5">5 Simultaneous</option>
                </select>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap;">
                <button type="button" id="btn-setting-change-folder" class="btn-ghost" tabindex="0">Change Folder</button>
                <button type="button" id="btn-setting-open-folder" class="btn-ghost" tabindex="0">Open in Explorer</button>
            </div>
        `;

        panel.appendChild(dlGroup);

        const btnChange = dlGroup.querySelector('#btn-setting-change-folder');
        if (btnChange) {
            btnChange.addEventListener('click', async () => {
                const res = await window.IPTV.Platform.downloads.selectDirectory();
                if (!res.canceled && res.path) {
                    dm.settings.saveDirectory = res.path;
                    const pathEl = document.getElementById('setting-dl-path');
                    if (pathEl) pathEl.textContent = res.path;
                    dm._updatePathDisplay();
                    window.IPTV.EventBus.toast('Downloads folder updated');
                }
            });
        }

        const btnOpen = dlGroup.querySelector('#btn-setting-open-folder');
        if (btnOpen) {
            btnOpen.addEventListener('click', () => {
                window.IPTV.Platform.downloads.openFolder(dm.settings.saveDirectory);
            });
        }

        const selParallel = dlGroup.querySelector('#setting-dl-parallel');
        if (selParallel) {
            selParallel.value = String(dm.settings.maxConcurrent || 1);
            selParallel.addEventListener('change', async (e) => {
                const val = parseInt(e.target.value, 10) || 1;
                dm.settings.maxConcurrent = val;
                await window.IPTV.Platform.downloads.updateSettings({ maxConcurrent: val });
                dm._updatePathDisplay();
                window.IPTV.EventBus.toast(`Parallel downloads set to ${val}`);
            });
        }
    },

    _setupThemeSelector() {
        const panel = document.querySelector('.settings-panel');
        if (!panel) return;

        let themeGroup = document.getElementById('settings-theme-group');
        if (!themeGroup) {
            themeGroup = document.createElement('div');
            themeGroup.id = 'settings-theme-group';
            themeGroup.className = 'settings-group';
            panel.insertBefore(themeGroup, panel.firstChild);
        }

        const themes = window.IPTV.ThemeManager.getThemes();
        const currentTheme = window.IPTV.ThemeManager.getSavedTheme();

        const swatchesHtml = themes.map(t => {
            const isActive = t.id === currentTheme;
            return `
                <button type="button"
                    class="theme-swatch-card ${isActive ? 'active' : ''}"
                    data-theme-id="${t.id}"
                    tabindex="0"
                    aria-pressed="${isActive ? 'true' : 'false'}">
                    <div class="theme-swatch-preview" style="background:${t.bg}; border-color:${t.focus};">
                        <span class="swatch-rail" style="background:${t.surface};"></span>
                        <span class="swatch-body">
                            <span class="swatch-hero" style="background:${t.card};"></span>
                            <span class="swatch-Accent-row">
                                <span class="swatch-pill" style="background:${t.accent};"></span>
                                <span class="swatch-dot" style="background:${t.text};"></span>
                            </span>
                        </span>
                    </div>
                    <div class="theme-swatch-meta">
                        <div class="theme-swatch-title-row">
                            <span class="theme-swatch-name">${t.name}</span>
                            <span class="theme-swatch-badge">${isActive ? 'Active' : ''}</span>
                        </div>
                        <span class="theme-swatch-sub">${t.subtitle || ''}</span>
                    </div>
                </button>
            `;
        }).join('');

        const optionsHtml = themes.map(t =>
            `<option value="${t.id}" ${t.id === currentTheme ? 'selected' : ''}>${t.name}</option>`
        ).join('');

        themeGroup.innerHTML = `
            <h3>Appearance & Theme</h3>
            <p class="settings-group-desc">Select a 10-foot TV color palette. Changes apply immediately and persist across restarts.</p>
            <div class="theme-swatch-grid" role="radiogroup" aria-label="Color Theme">
                ${swatchesHtml}
            </div>
            <select id="setting-theme" class="sr-only" tabindex="-1" aria-hidden="true">
                ${optionsHtml}
            </select>
        `;

        const selectTheme = (themeId) => {
            const applied = window.IPTV.ThemeManager.applyTheme(themeId);
            const activeObj = themes.find(t => t.id === applied) || { name: applied };

            themeGroup.querySelectorAll('.theme-swatch-card').forEach(btn => {
                const match = btn.dataset.themeId === applied;
                btn.classList.toggle('active', match);
                btn.setAttribute('aria-pressed', match ? 'true' : 'false');
                const badge = btn.querySelector('.theme-swatch-badge');
                if (badge) badge.textContent = match ? 'Active' : '';
            });

            const themeSelect = document.getElementById('setting-theme');
            if (themeSelect) themeSelect.value = applied;

            if (window.IPTV.EventBus) {
                window.IPTV.EventBus.toast(`Theme applied: ${activeObj.name}`);
            }
        };

        themeGroup.querySelectorAll('.theme-swatch-card').forEach(card => {
            card.addEventListener('click', () => {
                selectTheme(card.dataset.themeId);
            });
        });

        const themeSelect = document.getElementById('setting-theme');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                selectTheme(e.target.value);
            });
        }
    },

    _bindUI() {
        if (this.disconnectBtn) {
            this.disconnectBtn.addEventListener('click', () => {
                if (window.IPTV.EventBus) {
                    window.IPTV.EventBus.emit('session:disconnect');
                }
            });
        }

        [this.qualitySelect, this.bufferSelect].forEach(el => {
            if (el) el.addEventListener('change', () => this._saveSettings());
        });

        if (this.autoplayCheck) {
            this.autoplayCheck.addEventListener('change', () => this._saveSettings());
        }
    },

    updateInfo(conn) {
        if (this.serverEl && conn) {
            this.serverEl.textContent = conn.type === 'xtream' ? conn.server : 'M3U Playlist';
        }
        if (this.statusEl) {
            this.statusEl.textContent = 'Connected';
            this.statusEl.className = 'setting-val badge-ok';
        }
    },

    _loadSettings() {
        this._setupDownloadSettings();
        const s = window.IPTV.Storage.getSettings();
        if (this.qualitySelect && s.quality) this.qualitySelect.value = s.quality;
        if (this.bufferSelect && s.buffer) this.bufferSelect.value = s.buffer;
        if (this.autoplayCheck && typeof s.autoplay === 'boolean') this.autoplayCheck.checked = s.autoplay;
    },

    _saveSettings() {
        const settings = {
            quality: this.qualitySelect ? this.qualitySelect.value : 'auto',
            buffer: this.bufferSelect ? this.bufferSelect.value : 'medium',
            autoplay: this.autoplayCheck ? this.autoplayCheck.checked : true
        };
        window.IPTV.Storage.saveSettings(settings);
    }
};
