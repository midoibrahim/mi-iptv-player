/* ============================================================
   IPTV Player - Ephemeral Pairing Relay Client
   Enables smartphone QR-code credential setup on platforms without
   an on-device HTTP server (such as Samsung Tizen OS) via an
   end-to-end encrypted ephemeral relay.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.PairingRelay = {
    RELAY_ENDPOINT: 'https://api.restful-api.dev/objects',
    DEFAULT_PORTAL_URL: 'https://midoibrahim.github.io/mi-iptv-player/setup.html',
    _sessionId: null,
    _secretKey: null,
    _active: false,
    _polling: false,

    /**
     * Symmetric XOR encryption with URI-escaped base64 encoding (Unicode-safe).
     * Guarantees zero plaintext credentials pass through the public relay.
     */
    encrypt(text, key) {
        if (!text || !key) return '';
        var safeText = encodeURIComponent(text);
        var out = '';
        for (var i = 0; i < safeText.length; i++) {
            out += String.fromCharCode(safeText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return (typeof btoa === 'function') ? btoa(out) : out;
    },

    /**
     * Symmetric XOR decryption from base64 (Unicode-safe).
     */
    decrypt(b64, key) {
        if (!b64 || !key) return '';
        var text = (typeof atob === 'function') ? atob(b64) : b64;
        var out = '';
        for (var i = 0; i < text.length; i++) {
            out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        try {
            return decodeURIComponent(out);
        } catch (e) {
            return out;
        }
    },

    /**
     * Generates a random alphanumeric secret key for this session.
     */
    _generateKey() {
        return Math.random().toString(36).slice(2, 10).toUpperCase();
    },

    /**
     * Creates an ephemeral pairing session on the relay.
     * Returns { sessionId, secretKey, pairUrl } or null on network failure.
     */
    async createSession(portalUrl) {
        this.stop();
        this._secretKey = this._generateKey();
        var basePortal = portalUrl || this.DEFAULT_PORTAL_URL;

        try {
            var res = await fetch(this.RELAY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'mi-pairing-session',
                    data: { status: 'waiting', createdAt: Date.now() }
                })
            });

            if (!res || !res.ok) {
                console.warn('[PairingRelay] failed to create session on relay:', res ? res.status : 'network error');
                return null;
            }

            var obj = await res.json();
            if (!obj || !obj.id) return null;

            this._sessionId = obj.id;
            this._active = true;

            var pairUrl = basePortal + '?session=' + encodeURIComponent(this._sessionId) + '&key=' + encodeURIComponent(this._secretKey);
            return {
                sessionId: this._sessionId,
                secretKey: this._secretKey,
                pairUrl: pairUrl
            };
        } catch (e) {
            console.warn('[PairingRelay] error creating session:', e);
            return null;
        }
    },

    /**
     * Polls the relay for credentials submitted from the smartphone.
     * Returns the credentials object if available, or null.
     */
    async pollSession() {
        if (!this._active || !this._sessionId || !this._secretKey || this._polling) return null;
        this._polling = true;

        try {
            var res = await fetch(this.RELAY_ENDPOINT + '/' + this._sessionId);
            if (!res || !res.ok) return null;

            var obj = await res.json();
            if (obj && obj.data && obj.data.status === 'ready' && obj.data.payload) {
                var decryptedText = this.decrypt(obj.data.payload, this._secretKey);
                var creds = JSON.parse(decryptedText);

                var idToDelete = this._sessionId;
                this._active = false;
                this._sessionId = null;
                this._secretKey = null;

                // Immediately erase the session from the relay to leave zero trace
                this.deleteSession(idToDelete);
                return creds;
            }
        } catch (e) {
            // Silently ignore temporary polling drops
        } finally {
            this._polling = false;
        }
        return null;
    },

    /**
     * Erases the session object from the public relay.
     */
    async deleteSession(sessionId) {
        var id = sessionId || this._sessionId;
        if (!id) return;
        try {
            await fetch(this.RELAY_ENDPOINT + '/' + id, { method: 'DELETE' });
        } catch (e) {}
    },

    /**
     * Stops the pairing session and cleans up remote data.
     */
    stop() {
        if (this._sessionId) {
            this.deleteSession(this._sessionId);
        }
        this._sessionId = null;
        this._secretKey = null;
        this._active = false;
    }
};
