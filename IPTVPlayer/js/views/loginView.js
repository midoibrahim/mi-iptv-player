/* ============================================================
   IPTV Player — Login & Profile View
   Manages Saved Profiles grid & Xtream/M3U input form
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.LoginView = {
    init(app) {
        this.app = app;
        this.profilesPage = document.getElementById('profiles-page');
        this.formPage = document.getElementById('login-form-page');
        this.profilesGrid = document.getElementById('profiles-grid');
        this.backBtn = document.getElementById('btn-back-to-profiles');

        this._bindUI();
        this.renderProfiles();
    },

    _bindUI() {
        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => this.showProfilesPage());
        }

        // Form inputs in 10-foot TV mode: keep readOnly until user presses OK/Enter
        // so D-pad Up/Down/Left/Right navigates smoothly across form fields without
        // automatically popping up the TV On-Screen Keyboard on focus.
        document.querySelectorAll('#login-form-page input').forEach(inp => {
            inp.readOnly = true;
            const activateInput = () => {
                if (inp.readOnly) {
                    inp.readOnly = false;
                    inp.focus();
                    try { inp.select(); } catch(err) {}
                }
            };
            inp.addEventListener('click', activateInput);
            inp.addEventListener('blur', () => { inp.readOnly = true; });
        });

        // Tabs
        document.querySelectorAll('.login-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
                tab.classList.add('active');
                const targetForm = document.getElementById(`tab-${tab.dataset.tab}`);
                if (targetForm) targetForm.classList.add('active');
            });
        });

        // Xtream connect button
        const xtreamBtn = document.getElementById('btn-xtream-login');
        if (xtreamBtn) {
            xtreamBtn.addEventListener('click', () => {
                const server = document.getElementById('xtream-server').value.trim();
                const user = document.getElementById('xtream-user').value.trim();
                const pass = document.getElementById('xtream-pass').value.trim();
                const nameInput = document.getElementById('profile-name').value.trim();

                if (!server || !user || !pass) {
                    this.app.toast('Please fill all required fields');
                    return;
                }

                const defaultName = server.replace(/^https?:\/\//i, '').split('/')[0] || 'Xtream Service';
                const profile = {
                    id: 'prof_' + Date.now(),
                    name: nameInput || defaultName,
                    type: 'xtream',
                    server, user, pass
                };

                window.IPTV.Storage.saveProfile(profile);
                this.renderProfiles();
                this.app.connect(profile);
            });
        }

        // M3U connect button
        const m3uBtn = document.getElementById('btn-m3u-load');
        if (m3uBtn) {
            m3uBtn.addEventListener('click', () => {
                const url = document.getElementById('m3u-url').value.trim();
                const nameInput = document.getElementById('profile-name').value.trim();

                if (!url) {
                    this.app.toast('Please enter a valid M3U URL');
                    return;
                }

                const profile = {
                    id: 'prof_' + Date.now(),
                    name: nameInput || 'M3U Playlist',
                    type: 'm3u',
                    url
                };

                window.IPTV.Storage.saveProfile(profile);
                this.renderProfiles();
                this.app.connect(profile);
            });
        }
    },

    renderProfiles() {
        const profiles = window.IPTV.Storage.getProfiles();
        if (!this.profilesGrid) return;
        this.profilesGrid.innerHTML = '';

        profiles.forEach(prof => {
            const card = document.createElement('div');
            card.className = 'profile-card';
            card.tabIndex = 0;

            const iconSvg = prof.type === 'xtream' 
                ? (window.IPTV.Icons ? window.IPTV.Icons.get('live', 'profile-svg') : '📺') 
                : (window.IPTV.Icons ? window.IPTV.Icons.get('brand', 'profile-svg') : '📄');
            const badgeText = prof.type === 'xtream' ? 'Xtream' : 'M3U';
            const sub = prof.type === 'xtream' ? (prof.user ? `User: ${prof.user}` : prof.server) : prof.url;
            const trashSvg = window.IPTV.Icons ? window.IPTV.Icons.get('trash', 'delete-svg') : '✕';

            card.innerHTML = `
                <div class="profile-card-top">
                    <span class="profile-icon">${iconSvg}</span>
                    <span class="profile-badge">${badgeText}</span>
                    <button class="btn-delete-profile" tabindex="0" title="Delete Profile">${trashSvg}</button>
                </div>
                <div class="profile-card-info">
                    <div class="profile-name"></div>
                    <div class="profile-sub"></div>
                </div>
            `;
            const nameEl = card.querySelector('.profile-name');
            if (nameEl) nameEl.textContent = prof.name || 'IPTV Profile';
            const subEl = card.querySelector('.profile-sub');
            if (subEl) subEl.textContent = sub || '';

            // Delete profile
            const delBtn = card.querySelector('.btn-delete-profile');
            if (delBtn) {
                const performDelete = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.IPTV.Storage.deleteProfile(prof.id);
                    this.renderProfiles();
                    if (this.app && typeof this.app.toast === 'function') {
                        this.app.toast('Profile removed');
                    }
                };
                delBtn.addEventListener('click', performDelete);
                delBtn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === 'OK' || e.keyCode === 13) {
                        performDelete(e);
                    }
                });
            }

            // Dedicated Red button (TV remote VK_RED) or Delete key shortcut while focused on card
            card.addEventListener('keydown', (e) => {
                const code = e.keyCode || e.which;
                if (code === 403 || code === 46 || e.key === 'Delete') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.IPTV.Storage.deleteProfile(prof.id);
                    this.renderProfiles();
                    if (this.app && typeof this.app.toast === 'function') {
                        this.app.toast('Profile removed');
                    }
                }
            });

            // Connect on click (ignored if clicking delete button)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-profile')) {
                    return;
                }
                this.app.connect(prof);
            });

            this.profilesGrid.appendChild(card);
        });

        // Add "+ Add New Playlist" Card
        const addCard = document.createElement('div');
        addCard.className = 'add-profile-card';
        addCard.tabIndex = 0;
        const plusSvg = window.IPTV.Icons ? window.IPTV.Icons.get('plus', 'add-profile-svg') : '+';
        addCard.innerHTML = `
            <div class="add-profile-icon">${plusSvg}</div>
            <span class="add-profile-text">Add New Playlist</span>
        `;
        addCard.addEventListener('click', () => this.showAddProfileForm());
        this.profilesGrid.appendChild(addCard);

        if (profiles.length === 0) {
            this.showAddProfileForm();
        } else {
            this.showProfilesPage();
        }
    },

    showAddProfileForm() {
        const profiles = window.IPTV.Storage.getProfiles();
        if (this.profilesPage && this.formPage) {
            this.profilesPage.classList.remove('active');
            this.profilesPage.classList.add('hidden');
            this.formPage.classList.remove('hidden');
            this.formPage.classList.add('active');

            if (this.backBtn) {
                this.backBtn.style.display = profiles.length > 0 ? 'inline-flex' : 'none';
            }

            const firstInput = document.getElementById('profile-name') || document.getElementById('xtream-server');
            if (firstInput) setTimeout(() => firstInput.focus(), 100);

            // Setup QR code & remote credentials listener
            this.initRemoteSetup();
        }
    },

    showProfilesPage() {
        this.stopRemotePolling();
        if (this.profilesPage && this.formPage) {
            this.formPage.classList.remove('active');
            this.formPage.classList.add('hidden');
            this.profilesPage.classList.remove('hidden');
            this.profilesPage.classList.add('active');

            const firstTile = this.profilesPage.querySelector('.profile-card, .add-profile-card');
            if (firstTile) setTimeout(() => firstTile.focus(), 100);
        }
    },

    isQrScreenActive() {
        const loginScreen = document.getElementById('login-screen');
        return !!(
            loginScreen &&
            loginScreen.classList.contains('active') &&
            this.formPage &&
            this.formPage.classList.contains('active') &&
            !this.formPage.classList.contains('hidden')
        );
    },

    async _getApiBase() {
        if (!this.isQrScreenActive()) return null;
        if (this._apiBase) return this._apiBase;

        // On a real TV: start the bundled on-TV server (webOS JS service) ONLY while on the QR screen.
        if (window.IPTV.TvServer) {
            await window.IPTV.TvServer.ensureStarted();
            if (!this.isQrScreenActive()) {
                window.IPTV.TvServer.stop();
                return null;
            }
        }

        const candidates = [];
        if (window.location.protocol.startsWith('http') && window.location.origin && window.location.origin !== 'null') {
            candidates.push(window.location.origin);
        }
        candidates.push('http://127.0.0.1:8089');
        candidates.push('http://localhost:8089');

        for (const base of candidates) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1200);
                const res = await fetch(`${base}/api/info`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (res.ok) {
                    this._apiBase = base;
                    return base;
                }
            } catch(e) {}
        }
        return null;
    },

    async initRemoteSetup() {
        if (!this.isQrScreenActive()) return;
        const qrContainer = document.getElementById('qrcode-box');
        const urlText = document.getElementById('remote-url-text');
        const statusText = document.getElementById('remote-poll-status');
        if (!qrContainer) return;

        try {
            // 1. Fetch real local LAN IP and setup URL from local server API (works under file:// and http://)
            const apiBase = await this._getApiBase();
            if (!this.isQrScreenActive()) {
                this.stopRemotePolling();
                return;
            }
            let setupUrl = null;

            if (apiBase) {
                try {
                    const res = await fetch(`${apiBase}/api/info`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.setupUrl) {
                            setupUrl = data.setupUrl;
                        }
                    }
                } catch(e) {
                    console.warn('API info fetch error:', e);
                }
            }

            if (!setupUrl) {
                if (window.location.protocol.startsWith('http') && window.location.host) {
                    setupUrl = `${window.location.origin}/setup.html`;
                } else {
                    setupUrl = 'http://127.0.0.1:8089/setup.html';
                }
            }

            if (urlText) {
                urlText.textContent = setupUrl;
            }

            // 2. Render QR code locally via QRCode.js
            qrContainer.innerHTML = '';
            if (window.QRCode) {
                new window.QRCode(qrContainer, {
                    text: setupUrl,
                    width: 240,
                    height: 240,
                    colorDark: '#ffffff',
                    colorLight: '#181d30'
                });
            } else {
                qrContainer.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">Open on phone:<br><strong style="color:#fff;">${setupUrl}</strong></div>`;
            }

            // 3. Start polling for credentials sent from phone
            this.startRemotePolling();
        } catch(err) {
            console.error('Remote setup init error:', err);
        }
    },

    startRemotePolling() {
        this.stopRemotePolling();
        const statusText = document.getElementById('remote-poll-status');
        if (statusText) statusText.textContent = 'Waiting for credentials from phone...';

        this._pollTimer = setInterval(async () => {
            if (!this.isQrScreenActive()) {
                this.stopRemotePolling();
                return;
            }
            try {
                const apiBase = (await this._getApiBase()) || (window.location.protocol.startsWith('http') ? '' : 'http://127.0.0.1:8089');
                if (!this.isQrScreenActive()) return;
                const res = await fetch(`${apiBase}/api/credentials`);
                if (!res.ok) return;
                const data = await res.json();
                if (data && data.status === 'available' && data.credentials) {
                    this.handleRemoteCredentials(data.credentials);
                }
            } catch(err) {
                // Silently ignore network poll blips
            }
        }, 1500);
    },

    stopRemotePolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        this._apiBase = null;
        if (window.IPTV.TvServer) {
            window.IPTV.TvServer.stop();
        }
    },

    handleRemoteCredentials(creds) {
        this.stopRemotePolling();
        const statusText = document.getElementById('remote-poll-status');
        if (statusText) statusText.textContent = 'Credentials received! Connecting...';

        this.app.toast('Credentials received from phone! Connecting...');

        if (creds.type === 'xtream') {
            // Activate Xtream tab
            document.querySelectorAll('.login-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'xtream'));
            document.querySelectorAll('.login-form').forEach(f => f.classList.toggle('active', f.id === 'tab-xtream'));

            document.getElementById('profile-name').value = creds.name || '';
            document.getElementById('xtream-server').value = creds.server || '';
            document.getElementById('xtream-user').value = creds.username || '';
            document.getElementById('xtream-pass').value = creds.password || '';

            const defaultName = creds.server ? creds.server.replace(/^https?:\/\//i, '').split('/')[0] : 'Xtream Service';
            const profile = {
                id: 'prof_' + Date.now(),
                name: creds.name || defaultName,
                type: 'xtream',
                server: creds.server,
                user: creds.username,
                pass: creds.password
            };

            window.IPTV.Storage.saveProfile(profile);
            this.renderProfiles();
            this.app.connect(profile);
        } else if (creds.type === 'm3u') {
            // Activate M3U tab
            document.querySelectorAll('.login-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'm3u'));
            document.querySelectorAll('.login-form').forEach(f => f.classList.toggle('active', f.id === 'tab-m3u'));

            document.getElementById('profile-name').value = creds.name || '';
            document.getElementById('m3u-url').value = creds.url || '';

            const profile = {
                id: 'prof_' + Date.now(),
                name: creds.name || 'M3U Playlist',
                type: 'm3u',
                url: creds.url
            };

            window.IPTV.Storage.saveProfile(profile);
            this.renderProfiles();
            this.app.connect(profile);
        }
    }
};
