/* ============================================================
   IPTV Player — Xtream Codes API Service
   Authentication, Categories, Live/VOD Streams, Series Info
   Optimized with O(1) Category Map for Instant 50,000+ Stream Parsing
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.XtreamService = {
    _yieldToMain() {
        return new Promise((resolve) => setTimeout(resolve, 0));
    },

    streamUrl(conn, kind, streamId, ext) {
        if (!conn || conn.type !== 'xtream' || !conn.server || streamId === undefined || streamId === null) {
            return '';
        }
        const base = conn.server.replace(/\/+$/, '');
        if (kind === 'raw') {
            return `${base}/${conn.user}/${conn.pass}/${streamId}`;
        }
        const defaultExt = kind === 'live' ? 'ts' : 'mp4';
        const cleanExt = ext || defaultExt;
        return `${base}/${kind}/${conn.user}/${conn.pass}/${streamId}.${cleanExt}`;
    },

    resolveEpisodeUrl(conn, ep) {
        if (!ep) return '';
        if (ep.url) return ep.url;
        return this.streamUrl(conn, 'series', ep.id, ep.container_extension || 'mp4');
    },

    async fetchJson(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    },

    buildCatMap(cats) {
        const map = {};
        if (Array.isArray(cats)) {
            for (let i = 0; i < cats.length; i++) {
                const c = cats[i];
                if (c && c.category_id !== undefined) {
                    map[String(c.category_id)] = c.category_name || 'Uncategorized';
                }
            }
        }
        return map;
    },

    async loadAll(conn, onProgress) {
        const base = conn.server.replace(/\/+$/, '');
        const auth = `username=${encodeURIComponent(conn.user)}&password=${encodeURIComponent(conn.pass)}`;

        // 1. Authenticate
        if (onProgress) onProgress('Authenticating credentials...');
        const authResp = await this.fetchJson(`${base}/player_api.php?${auth}`);
        if (!authResp || !authResp.user_info) throw new Error('Authentication failed');

        // 2. Categories
        if (onProgress) onProgress('Loading categories...');
        const [liveCats, vodCats, serCats] = await Promise.all([
            this.fetchJson(`${base}/player_api.php?${auth}&action=get_live_categories`).catch(() => []),
            this.fetchJson(`${base}/player_api.php?${auth}&action=get_vod_categories`).catch(() => []),
            this.fetchJson(`${base}/player_api.php?${auth}&action=get_series_categories`).catch(() => [])
        ]);

        const categories = {
            live: Array.isArray(liveCats) ? liveCats : [],
            movies: Array.isArray(vodCats) ? vodCats : [],
            series: Array.isArray(serCats) ? serCats : []
        };

        // Pre-build O(1) category lookup maps
        const liveCatMap = this.buildCatMap(categories.live);
        const movieCatMap = this.buildCatMap(categories.movies);
        const seriesCatMap = this.buildCatMap(categories.series);

        // 3. Streams
        if (onProgress) onProgress('Loading streams and channels...');
        const [liveStreams, vodStreams, serStreams] = await Promise.all([
            this.fetchJson(`${base}/player_api.php?${auth}&action=get_live_streams`).catch(() => []),
            this.fetchJson(`${base}/player_api.php?${auth}&action=get_vod_streams`).catch(() => []),
            this.fetchJson(`${base}/player_api.php?${auth}&action=get_series`).catch(() => [])
        ]);

        // Map live channels with O(1) category lookup + periodic UI yield for smooth spinner
        const liveArr = Array.isArray(liveStreams) ? liveStreams : [];
        if (onProgress && liveArr.length > 0) onProgress(`Indexing ${liveArr.length} live channels...`);
        await this._yieldToMain();
        const liveChannels = new Array(liveArr.length);
        for (let i = 0; i < liveArr.length; i++) {
            if (i > 0 && (i & 8191) === 0) await this._yieldToMain();
            const ch = liveArr[i];
            const sid = ch.stream_id;
            const cid = String(ch.category_id);
            const name = ch.name || 'Unknown';
            const catName = liveCatMap[cid] || 'Uncategorized';
            liveChannels[i] = {
                id: String(sid),
                name: name,
                type: 'live',
                _idx: i,
                logo: ch.stream_icon || '',
                category: catName,
                categoryId: ch.category_id,
                url: this.streamUrl(conn, 'live', sid, 'ts'),
                hlsUrl: this.streamUrl(conn, 'live', sid, 'm3u8'),
                fallbackUrl: this.streamUrl(conn, 'raw', sid),
                hd: /hd|fhd|uhd|4k/i.test(name)
            };
        }

        // Map movies (VOD)
        const vodArr = Array.isArray(vodStreams) ? vodStreams : [];
        if (onProgress && vodArr.length > 0) onProgress(`Indexing ${vodArr.length} movies...`);
        await this._yieldToMain();
        const movies = new Array(vodArr.length);
        for (let i = 0; i < vodArr.length; i++) {
            if (i > 0 && (i & 8191) === 0) await this._yieldToMain();
            const m = vodArr[i];
            const sid = m.stream_id;
            const cid = String(m.category_id);
            const name = m.name || 'Unknown';
            const catName = movieCatMap[cid] || 'Uncategorized';
            movies[i] = {
                id: String(sid),
                name: name,
                type: 'movie',
                poster: m.stream_icon || '',
                category: catName,
                categoryId: m.category_id,
                url: this.streamUrl(conn, 'movie', sid, m.container_extension || 'mp4'),
                plot: i < 15 ? (m.plot || '') : '',
                rating: m.rating || '',
                year: m.year || ''
            };
        }

        // Map series
        const serArr = Array.isArray(serStreams) ? serStreams : [];
        if (onProgress && serArr.length > 0) onProgress(`Indexing ${serArr.length} series...`);
        await this._yieldToMain();
        const series = new Array(serArr.length);
        for (let i = 0; i < serArr.length; i++) {
            if (i > 0 && (i & 8191) === 0) await this._yieldToMain();
            const s = serArr[i];
            const cid = String(s.category_id);
            const name = s.name || 'Unknown';
            const catName = seriesCatMap[cid] || 'Uncategorized';
            series[i] = {
                id: String(s.series_id),
                name: name,
                type: 'series',
                poster: s.cover || '',
                category: catName,
                categoryId: s.category_id,
                plot: i < 15 ? (s.plot || '') : '',
                rating: s.rating || '',
                year: s.year || ''
            };
        }

        return {
            userInfo: authResp.user_info,
            categories,
            liveChannels,
            movies,
            series
        };
    },

    async getSeriesInfo(conn, seriesId) {
        const base = conn.server.replace(/\/+$/, '');
        const auth = `username=${encodeURIComponent(conn.user)}&password=${encodeURIComponent(conn.pass)}`;
        return this.fetchJson(`${base}/player_api.php?${auth}&action=get_series_info&series_id=${seriesId}`);
    }
};
