/* ============================================================
   IPTV Player â€” Login & Profile View
   Manages Saved Profiles grid, Delete Confirmation Modal,
   Xtream/M3U input form with inline validation & QR setup
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.LoginView = {
    init(app) {
        this.app = app;
        this.profilesPage = document.getElementById('profiles-page');
        this.formPage = document.getElementById('login-form-page');
        this.profilesGrid = document.getElementById('profiles-grid');
        this.backBtn = document.getElementById('btn-back-to-profiles');
        this.errorEl = document.getElementById('login-form-error');
        this.deleteModal = document.getElementById('profile-delete-modal');
        this._pendingDeleteProfile = null;
        this._deleteTriggerEl = null;

        this._bindUI();
        this.renderProfiles();
    },

    showFormError(msg) {
        if (!this.errorEl) this.errorEl = document.getElementById('login-form-error');
        if (this.errorEl) {
            this.errorEl.textContent = msg;
            this.errorEl.classList.remove('hidden');
        }
        if (window.IPTV.EventBus) {
            window.IPTV.EventBus.toast(msg);
        }
    },

    clearFormError() {
        if (!this.errorEl) this.errorEl = document.getElementById('login-form-error');
        if (this.errorEl) {
            this.errorEl.textContent = '';
            this.errorEl.classList.add('hidden');
        }
    },

    _saveAndConnectProfile(data) {
        const profile = window.IPTV.Storage.createProfile(data);
        window.IPTV.Storage.saveProfile(profile);
        this.renderProfiles();
        this.app.connect(profile);
    },

    openDeleteModal(prof, triggerEl) {
        if (!prof) return;
        this._pendingDeleteProfile = prof;
        this._deleteTriggerEl = triggerEl || document.activeElement;

        if (!this.deleteModal) {
            window.IPTV.Storage.deleteProfile(prof.id);
            this.renderProfiles();
            if (window.IPTV.EventBus) {
                window.IPTV.EventBus.toast('Profile removed');
            }
            return;
        }

        const descEl = document.getElementById('confirm-delete-desc');
        if (descEl) {
            descEl.textContent = `Are you sure you want to remove "${prof.name || 'IPTV Profile'}"?`;
        }
        this.deleteModal.classList.remove('hidden');

        setTimeout(() => {
            const cancelBtn = document.getElementById('btn-cancel-delete-profile');
            if (cancelBtn) {
                if (window.IPTV.SpatialNav) window.IPTV.SpatialNav.focusElement(cancelBtn);
                else cancelBtn.focus();
            }
        }, 50);
    },

    closeDeleteModal() {
        if (this.deleteModal) {
            this.deleteModal.classList.add('hidden');
        }
        const prev = this._deleteTriggerEl;
        this._pendingDeleteProfile = null;
        this._deleteTriggerEl = null;

        if (prev && document.contains(prev)) {
            setTimeout(() => {
                if (window.IPTV.SpatialNav) window.IPTV.SpatialNav.focusElement(prev);
                else prev.focus();
            }, 50);
        }
    },

    _bindUI() {
        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => this.showProfilesPage());
        }

        const cancelDelBtn = document.getElementById('btn-cancel-delete-profile');
        const confirmDelBtn = document.getElementById('btn-confirm-delete-profile');
        if (cancelDelBtn) {
            cancelDelBtn.addEventListener('click', () => this.closeDeleteModal());
        }
        if (confirmDelBtn) {
            confirmDelBtn.addEventListener('click', () => {
                const prof = this._pendingDeleteProfile;
                if (this.deleteModal) this.deleteModal.classList.add('hidden');
                this._pendingDeleteProfile = null;
                this._deleteTriggerEl = null;
                if (prof) {
                    window.IPTV.Storage.deleteProfile(prof.id);
                    this.renderProfiles();
                    if (window.IPTV.EventBus) {
                        window.IPTV.EventBus.toast('Profile removed');
                    }
                }
            });
        }

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
            inp.addEventListener('input', () => this.clearFormError());
        });

        document.querySelectorAll('.login-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.clearFormError();
                document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
                tab.classList.add('active');
                const targetForm = document.getElementById(`tab-${tab.dataset.tab}`);
                if (targetForm) targetForm.classList.add('active');
            });
        });

        const xtreamBtn = document.getElementById('btn-xtream-login');
        if (xtreamBtn) {
            xtreamBtn.addEventListener('click', () => {
                const server = document.getElementById('xtream-server').value.trim();
                const user = document.getElementById('xtream-user').value.trim();
                const pass = document.getElementById('xtream-pass').value.trim();
                const nameInput = document.getElementById('profile-name').value.trim();

                if (!server || !user || !pass) {
                    this.showFormError('Please enter Server URL, Username, and Password to connect.');
                    return;
                }

                this.clearFormError();
                this._saveAndConnectProfile({
                    name: nameInput,
                    type: 'xtream',
                    server,
                    user,
                    pass
                });
            });
        }

        const m3uBtn = document.getElementById('btn-m3u-load');
        if (m3uBtn) {
            m3uBtn.addEventListener('click', () => {
                const url = document.getElementById('m3u-url').value.trim();
                const nameInput = document.getElementById('profile-name').value.trim();

                if (!url) {
                    this.showFormError('Please enter a valid M3U / M3U8 playlist URL.');
                    return;
                }

                this.clearFormError();
                this._saveAndConnectProfile({
                    name: nameInput,
                    type: 'm3u',
                    url
                });
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
                ? (window.IPTV.Icons ? window.IPTV.Icons.get('live', 'profile-svg') : 'ðŸ“º')
                : (window.IPTV.Icons ? window.IPTV.Icons.get('brand', 'profile-svg') : 'ðŸ“„');
            const badgeText = prof.type === 'xtream' ? 'Xtream' : 'M3U';
            const sub = prof.type === 'xtream' ? (prof.user ? `User: ${prof.user}` : prof.server) : prof.url;
            const trashSvg = window.IPTV.Icons ? window.IPTV.Icons.get('trash', 'delete-svg') : 'âœ•';

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

            const delBtn = card.querySelector('.btn-delete-profile');
            if (delBtn) {
                const requestDelete = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openDeleteModal(prof, delBtn);
                };
                delBtn.addEventListener('click', requestDelete);
                delBtn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === 'OK' || e.keyCode === 13) {
                        requestDelete(e);
                    }
                });
            }

            card.addEventListener('keydown', (e) => {
                const code = e.keyCode || e.which;
                if (code === 403 || code === 46 || e.key === 'Delete') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openDeleteModal(prof, card);
                }
            });

            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-profile')) {
                    return;
                }
                this.app.connect(prof);
            });

            this.profilesGrid.appendChild(card);
        });

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
        this.clearFormError();
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

            this.initRemoteSetup();
        }
    },

    showProfilesPage() {
        this.stopRemotePolling();
        this.clearFormError();
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
        if (!this.isQrScreenActive() || !window.IPTV.TvServer) return null;
        return window.IPTV.TvServer.resolveApiBase();
    },

    async initRemoteSetup() {
        if (!this.isQrScreenActive()) return;
        const qrContainer = document.getElementById('qrcode-box');
        const urlText = document.getElementById('remote-url-text');
        if (!qrContainer) return;

        try {
            const info = window.IPTV.TvServer
                ? await window.IPTV.TvServer.getSetupInfo(() => this.isQrScreenActive())
                : null;
            if (!this.isQrScreenActive()) {
                this.stopRemotePolling();
                return;
            }

            // On Samsung Tizen TV (where no local Node HTTP companion server runs on 127.0.0.1:8089),
            // display clean direct-remote instructions instead of an unreachable localhost QR code.
            const hasCompanionServer = Boolean(
                (info && info.apiBase) ||
                (window.IPTV.TvServer && window.IPTV.TvServer.isWebOS())
            );
            if (!hasCompanionServer && window.IPTV.Platform && window.IPTV.Platform.isTizen()) {
                if (urlText) urlText.textContent = 'Samsung Smart TV Direct Input';
                const statusText = document.getElementById('remote-poll-status');
                if (statusText) statusText.textContent = 'Select any field on the left and press OK on your remote';
                qrContainer.innerHTML = '<div style="padding:24px 18px;text-align:center;color:#CBD5E1;font-size:19px;line-height:1.5;">Use your <strong style="color:#fff;">Samsung TV Remote</strong> or USB keyboard to enter your Xtream Codes or M3U URL on the left.</div>';
                return;
            }

            const setupUrl = (info && info.setupUrl) ? info.setupUrl : 'http://127.0.0.1:8089/setup.html';

            if (urlText) {
                urlText.textContent = setupUrl;
            }

            qrContainer.innerHTML = '';
            if (window.QRCode) {
                new window.QRCode(qrContainer, {
                    text: setupUrl,
                    width: 240,
                    height: 240,
                    colorDark: '#ffffff',
                    colorLight: '#131C2E'
                });
            } else {
                qrContainer.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:20px;">Open on phone:<br><strong style="color:#fff;">${setupUrl}</strong></div>`;
            }

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
                if (!window.IPTV.TvServer) return;
                const creds = await window.IPTV.TvServer.pollCredentials();
                if (!this.isQrScreenActive()) return;
                if (creds) {
                    this.handleRemoteCredentials(creds);
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
        if (window.IPTV.TvServer) {
            window.IPTV.TvServer.stop();
        }
    },

    handleRemoteCredentials(creds) {
        this.stopRemotePolling();
        this.clearFormError();
        const statusText = document.getElementById('remote-poll-status');
        if (statusText) statusText.textContent = 'Credentials received! Connecting...';

        window.IPTV.EventBus.toast('Credentials received from phone! Connecting...');

        if (creds.type === 'xtream') {
            document.querySelectorAll('.login-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'xtream'));
            document.querySelectorAll('.login-form').forEach(f => f.classList.toggle('active', f.id === 'tab-xtream'));

            document.getElementById('profile-name').value = creds.name || '';
            document.getElementById('xtream-server').value = creds.server || '';
            document.getElementById('xtream-user').value = creds.username || '';
            document.getElementById('xtream-pass').value = creds.password || '';

            this._saveAndConnectProfile(creds);
        } else if (creds.type === 'm3u') {
            document.querySelectorAll('.login-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'm3u'));
            document.querySelectorAll('.login-form').forEach(f => f.classList.toggle('active', f.id === 'tab-m3u'));

            document.getElementById('profile-name').value = creds.name || '';
            document.getElementById('m3u-url').value = creds.url || '';

            this._saveAndConnectProfile(creds);
        }
    }
};
