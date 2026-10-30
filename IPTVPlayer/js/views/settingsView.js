/* ============================================================
   IPTV Player — Settings View Component
   Server info, Theme Selector, Quality & Buffer controls
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
        this._bindUI();
        this._loadSettings();
    },

    _setupThemeSelector() {
        // Find or create Theme selection row in Settings
        const panel = document.querySelector('.settings-panel');
        if (!panel) return;

        let themeGroup = document.getElementById('settings-theme-group');
        if (!themeGroup) {
            themeGroup = document.createElement('div');
            themeGroup.id = 'settings-theme-group';
            themeGroup.className = 'settings-group';

            const themes = window.IPTV.ThemeManager.getThemes();
            const currentTheme = window.IPTV.ThemeManager.getSavedTheme();

            let optionsHtml = themes.map(t =>
                `<option value="${t.id}" ${t.id === currentTheme ? 'selected' : ''}>${t.name}</option>`
            ).join('');

            themeGroup.innerHTML = `
                <h3>Appearance & Theme</h3>
                <div class="setting-row">
                    <span>Color Palette</span>
                    <select id="setting-theme" tabindex="0">
                        ${optionsHtml}
                    </select>
                </div>
            `;

            panel.insertBefore(themeGroup, panel.firstChild);

            const themeSelect = document.getElementById('setting-theme');
            if (themeSelect) {
                themeSelect.addEventListener('change', (e) => {
                    window.IPTV.ThemeManager.applyTheme(e.target.value);
                    this.app.toast(`Theme updated: ${e.target.selectedOptions[0].text}`);
                });
            }
        }
    },

    _bindUI() {
        if (this.disconnectBtn) {
            this.disconnectBtn.addEventListener('click', () => {
                window.IPTV.Storage.clearConnection();
                this.app.liveChannels = [];
                this.app.movies = [];
                this.app.series = [];
                document.getElementById('main-shell').classList.remove('active');
                document.getElementById('login-screen').classList.add('active');
                this.app.toast('Disconnected from server');
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
