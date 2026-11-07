/* ============================================================
   IPTV Player — Central Catalog & Favorites Store
   Single source of truth for active connection, streams,
   categories, and favorites. Zero DOM dependencies.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.CatalogStore = {
    connection: null,
    liveChannels: [],
    movies: [],
    series: [],
    categories: { live: [], movies: [], series: [] },
    favorites: new Set(),

    init() {
        if (window.IPTV.Storage && typeof window.IPTV.Storage.getFavorites === 'function') {
            this.favorites = window.IPTV.Storage.getFavorites();
        } else {
            this.favorites = new Set();
        }
    },

    setConnection(conn) {
        this.connection = conn || null;
    },

    getConnection() {
        return this.connection;
    },

    setCatalog(conn, data = {}) {
        if (conn !== undefined) {
            this.connection = conn;
        }
        this.liveChannels = data.liveChannels || [];
        this.movies = data.movies || [];
        this.series = data.series || [];
        this.categories = data.categories || { live: [], movies: [], series: [] };

        if (window.IPTV.EventBus) {
            window.IPTV.EventBus.emit('catalog:updated', {
                connection: this.connection,
                liveChannels: this.liveChannels,
                movies: this.movies,
                series: this.series,
                categories: this.categories
            });
        }
    },

    clear() {
        this.connection = null;
        this.liveChannels = [];
        this.movies = [];
        this.series = [];
        this.categories = { live: [], movies: [], series: [] };
        if (window.IPTV.EventBus) {
            window.IPTV.EventBus.emit('catalog:cleared');
        }
    },

    getLive() {
        return this.liveChannels;
    },

    getMovies() {
        return this.movies;
    },

    getSeries() {
        return this.series;
    },

    getCategories() {
        return this.categories;
    },

    favKey(item) {
        if (!item) return '';
        if (typeof item === 'string' || typeof item === 'number') return String(item);
        const t = item.type || 'live';
        return `${t}:${item.id}`;
    },

    isFavorite(itemOrId) {
        if (!itemOrId) return false;
        if (typeof itemOrId === 'object') {
            return this.favorites.has(this.favKey(itemOrId)) || this.favorites.has(String(itemOrId.id));
        }
        return this.favorites.has(String(itemOrId));
    },

    toggleFavorite(item) {
        if (!item) return false;
        const key = this.favKey(item);
        const rawId = String(item.id);
        let added = false;

        if (this.favorites.has(key) || this.favorites.has(rawId)) {
            this.favorites.delete(key);
            this.favorites.delete(rawId);
            if (window.IPTV.EventBus) window.IPTV.EventBus.toast('Removed from favorites');
            added = false;
        } else {
            this.favorites.add(key);
            if (window.IPTV.EventBus) window.IPTV.EventBus.toast('Added to favorites');
            added = true;
        }

        if (window.IPTV.Storage && typeof window.IPTV.Storage.saveFavorites === 'function') {
            window.IPTV.Storage.saveFavorites(this.favorites);
        }
        if (window.IPTV.EventBus) {
            window.IPTV.EventBus.emit('favorites:changed', { item, isFavorite: added });
        }
        return added;
    },

    getFavoriteItems() {
        const allItems = [...this.liveChannels, ...this.movies, ...this.series];
        return allItems.filter(i => this.isFavorite(i));
    }
};

