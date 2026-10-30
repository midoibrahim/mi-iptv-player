/* ============================================================
   IPTV Player - On-TV Companion Server Launcher
   Starts the bundled webOS JS service (com.miiptv.player.service)
   ONLY while the QR code setup screen is displayed, and terminates
   it immediately when leaving the QR setup screen.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.TvServer = {
    SERVICE_URI: 'luna://com.miiptv.player.service',
    _promise: null,
    _request: null,
    _running: false,
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
     * Immediately stops the HTTP server on port 8089 and cancels the Luna subscription
     * when the user leaves the QR code setup screen.
     */
    stop() {
        this._running = false;
        this._promise = null;
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
