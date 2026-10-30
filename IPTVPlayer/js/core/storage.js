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
        MIGRATED: 'iptv_profiles_migrated'
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
    }
};
