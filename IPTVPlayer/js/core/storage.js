/* ============================================================
   IPTV Player — Storage Service
   Unified LocalStorage persistence with legacy migrations
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.Storage = {
    KEYS: {
        PROFILES: 'iptv_saved_profiles',
        CONNECTION: 'iptv_connection',
        FAVORITES: 'iptv_favs',
        SETTINGS: 'iptv_settings',
        VIEW_MODE: 'iptv_view_mode',
        MIGRATED: 'iptv_profiles_migrated',
        STREAM_STRATEGIES: 'iptv_stream_strategies'
    },

    // ---- Profiles ----
    getProfiles() {
        let profiles = [];
        try {
            const raw = localStorage.getItem(this.KEYS.PROFILES);
            if (raw) profiles = JSON.parse(raw);
        } catch(e) {}

        // Auto-migrate legacy single connection ONLY ONCE on very first launch
        const alreadyMigrated = localStorage.getItem(this.KEYS.MIGRATED) === 'true';
        if (!alreadyMigrated && (!Array.isArray(profiles) || profiles.length === 0)) {
            const legacy = this.getConnection();
            if (legacy && (legacy.server || legacy.url)) {
                let name = 'Saved Server';
                if (legacy.type === 'xtream' && legacy.server) {
                    name = legacy.server.replace(/^https?:\/\//i, '').split('/')[0] || 'Xtream Server';
                } else if (legacy.url) {
                    name = 'M3U Playlist';
                }
                const profile = {
                    id: 'prof_migrated_' + Date.now(),
                    name: name,
                    type: legacy.type || 'xtream',
                    server: legacy.server || '',
                    user: legacy.user || '',
                    pass: legacy.pass || '',
                    url: legacy.url || ''
                };
                profiles = [profile];
                this.saveProfiles(profiles);
            }
            try {
                localStorage.setItem(this.KEYS.MIGRATED, 'true');
            } catch(e) {}
        }
        return Array.isArray(profiles) ? profiles : [];
    },

    saveProfiles(profiles) {
        try {
            localStorage.setItem(this.KEYS.PROFILES, JSON.stringify(profiles));
            localStorage.setItem(this.KEYS.MIGRATED, 'true');
        } catch(e) {
            console.error('Failed to save profiles to localStorage', e);
        }
    },

    saveProfile(profile) {
        const profiles = this.getProfiles();
        const existingIdx = profile.type === 'xtream'
            ? profiles.findIndex(p => p.server === profile.server && p.user === profile.user)
            : profiles.findIndex(p => p.url === profile.url);

        if (existingIdx !== -1) {
            profiles[existingIdx] = profile;
        } else {
            profiles.push(profile);
        }
        this.saveProfiles(profiles);
    },

    deleteProfile(id) {
        // Prevent auto-migration from ever re-creating deleted profile
        try {
            localStorage.setItem(this.KEYS.MIGRATED, 'true');
        } catch(e) {}

        const allProfiles = this.getProfiles();
        const target = allProfiles.find(p => p.id === id);
        const remaining = allProfiles.filter(p => p.id !== id);

        this.saveProfiles(remaining);
        if (target && window.IPTV.CatalogCache) {
            window.IPTV.CatalogCache.remove(target);
        }

        // If the deleted profile matches current active connection, clear it
        const current = this.getConnection();
        if (current && target) {
            const matches = target.type === 'xtream'
                ? (current.server === target.server && current.user === target.user)
                : (current.url === target.url);
            if (matches || remaining.length === 0) {
                this.clearConnection();
            }
        } else if (remaining.length === 0) {
            this.clearConnection();
        }

        return remaining;
    },

    // ---- Active Connection ----
    getConnection() {
        try {
            const s = localStorage.getItem(this.KEYS.CONNECTION);
            return s ? JSON.parse(s) : null;
        } catch(e) {
            return null;
        }
    },

    saveConnection(conn) {
        try {
            localStorage.setItem(this.KEYS.CONNECTION, JSON.stringify(conn));
        } catch(e) {}
    },

    clearConnection() {
        try {
            localStorage.removeItem(this.KEYS.CONNECTION);
        } catch(e) {}
    },

    // ---- Favorites ----
    getFavorites() {
        try {
            const f = localStorage.getItem(this.KEYS.FAVORITES);
            return f ? new Set(JSON.parse(f)) : new Set();
        } catch(e) {
            return new Set();
        }
    },

    saveFavorites(favoritesSet) {
        try {
            localStorage.setItem(this.KEYS.FAVORITES, JSON.stringify([...favoritesSet]));
        } catch(e) {}
    },

    // ---- Settings ----
    getSettings() {
        try {
            const s = localStorage.getItem(this.KEYS.SETTINGS);
            return s ? JSON.parse(s) : { quality: 'auto', buffer: 'medium', autoplay: true };
        } catch(e) {
            return { quality: 'auto', buffer: 'medium', autoplay: true };
        }
    },

    saveSettings(settings) {
        try {
            localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
        } catch(e) {}
    },

    // ---- Stream Strategy Memory (Fast Channel Zapping) ----
    _serverKey(conn) {
        if (!conn) return '';
        return conn.type === 'xtream' ? String(conn.server || '') : String(conn.url || '');
    },

    getStreamStrategy(conn) {
        const key = this._serverKey(conn);
        if (!key) return null;
        try {
            const raw = localStorage.getItem(this.KEYS.STREAM_STRATEGIES);
            const map = raw ? JSON.parse(raw) : {};
            return map[key] || null;
        } catch(e) {
            return null;
        }
    },

    saveStreamStrategy(conn, strategy) {
        const key = this._serverKey(conn);
        if (!key || !strategy) return;
        try {
            const raw = localStorage.getItem(this.KEYS.STREAM_STRATEGIES);
            const map = raw ? JSON.parse(raw) : {};
            if (map[key] === strategy) return;
            map[key] = strategy;
            localStorage.setItem(this.KEYS.STREAM_STRATEGIES, JSON.stringify(map));
        } catch(e) {}
    }
};

/* ============================================================
   IPTV Player — IndexedDB Catalog Cache (Stale-While-Revalidate)
   Provides < 300ms instant startup on repeat launches for 50k+ items
   ============================================================ */
window.IPTV.CatalogCache = {
    DB_NAME: 'mi_iptv_catalog_db',
    STORE_NAME: 'catalogs',
    _dbPromise: null,

    _key(conn) {
        if (!conn) return '';
        if (conn.type === 'xtream') {
            return `xtream:${(conn.server || '').replace(/\/+$/, '')}:${conn.user || ''}`;
        }
        return `m3u:${conn.url || ''}`;
    },

    _open() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve) => {
            const idb = window.indexedDB || window.webkitIndexedDB;
            if (!idb) {
                resolve(null);
                return;
            }
            try {
                const req = idb.open(this.DB_NAME, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        db.createObjectStore(this.STORE_NAME);
                    }
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = () => resolve(null);
            } catch(e) {
                resolve(null);
            }
        });
        return this._dbPromise;
    },

    async get(conn) {
        const key = this._key(conn);
        if (!key) return null;
        const db = await this._open();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch(e) {
                resolve(null);
            }
        });
    },

    async set(conn, data) {
        const key = this._key(conn);
        if (!key || !data) return;
        const db = await this._open();
        if (!db) return;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                store.put({
                    timestamp: Date.now(),
                    userInfo: data.userInfo || null,
                    categories: data.categories || { live: [], movies: [], series: [] },
                    liveChannels: data.liveChannels || [],
                    movies: data.movies || [],
                    series: data.series || []
                }, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch(e) {
                resolve(false);
            }
        });
    },

    async remove(conn) {
        const key = this._key(conn);
        if (!key) return;
        const db = await this._open();
        if (!db) return;
        try {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).delete(key);
        } catch(e) {}
    }
};
