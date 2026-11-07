/* ============================================================
   IPTV Player - Companion Setup Server Client & Launcher
   Manages the bundled webOS JS service (com.miiptv.player.service)
   and HTTP communication (/api/info, /api/credentials) across
   webOS TV, Electron Desktop, and Browser runtimes.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.TvServer = {
    SERVICE_URI: 'luna://com.miiptv.player.service',
    _promise: null,
    _request: null,
    _running: false,
    _apiBase: null,
    info: null,

    isWebOS() {
        return !!(window.webOS && window.webOS.service && typeof window.webOS.service.request === 'function');
    },

    isRunning() {
        return !!this._running;
    },

    /**
     * Starts the on-TV HTTP server on port 8089 for QR code phone setup.
     * Resolves with { ip, port, setupUrl } once listening, or null on failure.
     */
    ensureStarted() {
        if (this._promise) return this._promise;
        if (!this.isWebOS()) {
            this._promise = Promise.resolve(null);
            return this._promise;
        }

        this._promise = new Promise((resolve) => {
            let settled = false;
            const done = (val) => {
                if (settled) return;
                settled = true;
                resolve(val);
            };
            const timer = setTimeout(() => {
                console.warn('[TvServer] service start timed out');
                done(null);
            }, 8000);

            this._request = window.webOS.service.request(this.SERVICE_URI, {
                method: 'start',
                parameters: { subscribe: true },
                subscribe: true,
                resubscribe: false,
                onSuccess: (res) => {
                    clearTimeout(timer);
                    this._running = true;
                    this.info = { ip: res.ip, port: res.port, setupUrl: res.setupUrl };
                    console.log('[TvServer] running at ' + res.setupUrl);
                    done(this.info);
                },
                onFailure: (err) => {
                    clearTimeout(timer);
                    this._running = false;
                    console.warn('[TvServer] failed to start: ' + (err && (err.errorText || err.errorCode)));
                    done(null);
                }
            });
        });

        this._promise.then((info) => { if (!info) this._promise = null; });
        return this._promise;
    },

    /**
     * Probes local companion HTTP server candidates and caches the active base URL + info.
     */
    async resolveApiBase() {
        if (this._apiBase) return this._apiBase;

        const candidates = [];
        if (window.location && window.location.protocol && window.location.protocol.startsWith('http') &&
            window.location.origin && window.location.origin !== 'null') {
            candidates.push(window.location.origin);
        }
        candidates.push('http://127.0.0.1:8089');
        candidates.push('http://localhost:8089');

        for (let i = 0; i < candidates.length; i++) {
            const base = candidates[i];
            try {
                let signal;
                let timeoutId;
                if (typeof AbortController !== 'undefined') {
                    const controller = new AbortController();
                    signal = controller.signal;
                    timeoutId = setTimeout(() => controller.abort(), 1200);
                }
                const res = await fetch(`${base}/api/info`, signal ? { signal } : undefined);
                if (timeoutId) clearTimeout(timeoutId);
                if (res && res.ok) {
                    this._apiBase = base;
                    try {
                        const data = await res.json();
                        if (data && data.setupUrl) {
                            this.info = data;
                        }
                    } catch (e) {}
                    return base;
                }
            } catch (e) {}
        }
        return null;
    },

    /**
     * Starts the companion server (if on webOS) and returns { setupUrl, apiBase }.
     */
    async getSetupInfo(isStillActive) {
        await this.ensureStarted();
        if (typeof isStillActive === 'function' && !isStillActive()) {
            this.stop();
            return null;
        }

        if (this.info && this.info.setupUrl) {
            return { setupUrl: this.info.setupUrl, apiBase: this._apiBase || 'http://127.0.0.1:8089' };
        }

        const apiBase = await this.resolveApiBase();
        if (typeof isStillActive === 'function' && !isStillActive()) {
            this.stop();
            return null;
        }

        if (this.info && this.info.setupUrl) {
            return { setupUrl: this.info.setupUrl, apiBase };
        }

        if (apiBase) {
            try {
                const res = await fetch(`${apiBase}/api/info`);
                if (res && res.ok) {
                    const data = await res.json();
                    if (data && data.setupUrl) {
                        this.info = data;
                        return { setupUrl: data.setupUrl, apiBase };
                    }
                }
            } catch (e) {
                console.warn('API info fetch error:', e);
            }
        }

        const fallbackUrl = (window.location && window.location.protocol && window.location.protocol.startsWith('http') && window.location.host)
            ? `${window.location.origin}/setup.html`
            : 'http://127.0.0.1:8089/setup.html';

        return { setupUrl: fallbackUrl, apiBase };
    },

    /**
     * Polls the companion server for credentials submitted from the phone web UI.
     */
    async pollCredentials() {
        const apiBase = (await this.resolveApiBase()) ||
            ((window.location && window.location.protocol && window.location.protocol.startsWith('http')) ? '' : 'http://127.0.0.1:8089');
        const res = await fetch(`${apiBase}/api/credentials`);
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (data && data.status === 'available' && data.credentials) {
            return data.credentials;
        }
        return null;
    },

    /**
     * Immediately stops the HTTP server on port 8089 and cancels the Luna subscription
     * when the user leaves the QR code setup screen.
     */
    stop() {
        this._running = false;
        this._promise = null;
        this._apiBase = null;
        this.info = null;

        if (this._request && typeof this._request.cancel === 'function') {
            try { this._request.cancel(); } catch (e) {}
        }
        this._request = null;

        if (this.isWebOS()) {
            try {
                window.webOS.service.request(this.SERVICE_URI, {
                    method: 'stop',
                    parameters: {},
                    onSuccess: () => console.log('[TvServer] stopped'),
                    onFailure: () => {}
                });
            } catch (e) {}
        }
    }
};
