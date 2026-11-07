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
        STREAM_STRATEGIES: 'iptv_stream_strategies',
        WATCH_PROGRESS: 'iptv_watch_progress',
        THEME: 'iptv_theme'
    },

    // ---- Profiles ----
    createProfile(data = {}) {
        const type = data.type === 'm3u' ? 'm3u' : 'xtream';
        const id = data.id || ('prof_' + Date.now());
        if (type === 'm3u') {
            return {
                id,
                name: (data.name && String(data.name).trim()) || 'M3U Playlist',
                type: 'm3u',
                url: String(data.url || '').trim()
            };
        }
        const server = String(data.server || '').trim();
        const defaultName = server.replace(/^https?:\/\//i, '').split('/')[0] || 'Xtream Service';
        return {
            id,
            name: (data.name && String(data.name).trim()) || defaultName,
            type: 'xtream',
            server,
            user: String(data.user !== undefined ? data.user : (data.username || '')).trim(),
            pass: String(data.pass !== undefined ? data.pass : (data.password || '')).trim(),
            url: String(data.url || '')
        };
    },

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
                const profile = this.createProfile({
                    id: 'prof_migrated_' + Date.now(),
                    name: legacy.name || (legacy.type === 'xtream' && legacy.server ? '' : 'Saved Server'),
                    type: legacy.type || (legacy.server ? 'xtream' : 'm3u'),
                    server: legacy.server || '',
                    user: legacy.user || '',
                    pass: legacy.pass || '',
                    url: legacy.url || ''
                });
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
        if (target) {
            const connKey = this.getConnectionKey(target);
            if (connKey) {
                try { localStorage.removeItem(`${this.KEYS.WATCH_PROGRESS}_${connKey}`); } catch(e) {}
            }
        }

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
    },

    // ---- Continue Watching / Watch Progress (Scoped per Connection/Profile) ----
    getConnectionKey(conn) {
        if (!conn) return '';
        if (conn.type === 'xtream') {
            return `xtream:${(conn.server || '').replace(/\/+$/, '')}:${conn.user || ''}`;
        }
        return `m3u:${conn.url || ''}`;
    },

    _deduplicateWatchProgress(list) {
        const seenSeries = new Set();
        const deduplicated = [];
        const source = Array.isArray(list) ? list : [];
        for (const item of source) {
            const sId = item.seriesId || (item.type === 'series' ? (item.id || '').replace(/^series_/, '') : null);
            if (sId) {
                const norm = String(sId);
                if (seenSeries.has(norm)) continue;
                seenSeries.add(norm);
            }
            deduplicated.push(item);
        }
        return deduplicated.slice(0, 10);
    },

    getWatchProgress(conn) {
        const connKey = this.getConnectionKey(conn);
        if (!connKey) return [];
        try {
            const raw = localStorage.getItem(`${this.KEYS.WATCH_PROGRESS}_${connKey}`);
            if (!raw) return [];
            const list = JSON.parse(raw);
            return this._deduplicateWatchProgress(list);
        } catch(e) {
            return [];
        }
    },

    saveWatchProgress(conn, list) {
        const connKey = this.getConnectionKey(conn);
        if (!connKey) return;
        try {
            const capped = this._deduplicateWatchProgress(list);
            localStorage.setItem(`${this.KEYS.WATCH_PROGRESS}_${connKey}`, JSON.stringify(capped));
        } catch(e) {
            console.warn('[Storage] Failed to save watch progress (ignored):', e);
        }
    },

    saveWatchProgressItem(conn, record) {
        if (!conn || !record || !record.id) return;
        try {
            let list = this.getWatchProgress(conn);
            const isSeries = record.type === 'series' || !!record.seriesId;
            const targetSeriesId = record.seriesId || (isSeries ? String(record.id).replace(/^series_/, '') : null);

            const idx = list.findIndex(item => {
                if (isSeries && targetSeriesId) {
                    const itemSeriesId = item.seriesId || (item.type === 'series' ? String(item.id).replace(/^series_/, '') : null);
                    if (itemSeriesId && String(itemSeriesId) === String(targetSeriesId)) {
                        return true;
                    }
                }
                return String(item.id) === String(record.id);
            });

            if (idx >= 0) {
                list.splice(idx, 1);
            }
            list.unshift(record);
            this.saveWatchProgress(conn, list);
        } catch(e) {}
    },

    removeWatchProgress(conn, itemId) {
        if (!conn || !itemId) return;
        try {
            let list = this.getWatchProgress(conn);
            const strId = String(itemId).replace(/^series_/, '');
            const filtered = list.filter(item => {
                const itemSeriesId = item.seriesId || (item.type === 'series' ? String(item.id).replace(/^series_/, '') : null);
                if (itemSeriesId && String(itemSeriesId) === strId) {
                    return false;
                }
                const rawId = String(item.id).replace(/^series_/, '');
                return rawId !== strId;
            });
            this.saveWatchProgress(conn, filtered);
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
        return window.IPTV.Storage ? window.IPTV.Storage.getConnectionKey(conn) : '';
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

                const leanLive = (data.liveChannels || []).map(ch => ({
                    id: ch.id,
                    name: ch.name,
                    type: 'live',
                    logo: ch.logo || '',
                    category: ch.category || '',
                    categoryId: ch.categoryId,
                    url: ch.url || '',
                    hlsUrl: ch.hlsUrl || '',
                    fallbackUrl: ch.fallbackUrl || '',
                    hd: !!ch.hd
                }));

                const leanMovies = (data.movies || []).map(m => ({
                    id: m.id,
                    name: m.name,
                    type: 'movie',
                    poster: m.poster || '',
                    category: m.category || '',
                    categoryId: m.categoryId,
                    url: m.url || '',
                    plot: m.plot || '',
                    rating: m.rating || '',
                    year: m.year || ''
                }));

                const leanSeries = (data.series || []).map(s => ({
                    id: s.id,
                    name: s.name,
                    type: 'series',
                    poster: s.poster || '',
                    category: s.category || '',
                    categoryId: s.categoryId,
                    plot: s.plot || '',
                    rating: s.rating || '',
                    year: s.year || ''
                }));

                store.put({
                    timestamp: Date.now(),
                    userInfo: data.userInfo || null,
                    categories: data.categories || { live: [], movies: [], series: [] },
                    liveChannels: leanLive,
                    movies: leanMovies,
                    series: leanSeries
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
