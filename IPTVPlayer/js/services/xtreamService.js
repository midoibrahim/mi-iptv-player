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

        // 3. Streams (fetch & normalize sequentially so raw server JSON arrays are released before the next section)
        if (onProgress) onProgress('Loading live channels...');
        let rawLive = await this.fetchJson(`${base}/player_api.php?${auth}&action=get_live_streams`).catch(() => []);
        const liveArr = Array.isArray(rawLive) ? rawLive : [];
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
        rawLive = null;

        // Map movies (VOD)
        if (onProgress) onProgress('Loading movies...');
        let rawVod = await this.fetchJson(`${base}/player_api.php?${auth}&action=get_vod_streams`).catch(() => []);
        const vodArr = Array.isArray(rawVod) ? rawVod : [];
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
        rawVod = null;

        // Map series
        if (onProgress) onProgress('Loading series...');
        let rawSer = await this.fetchJson(`${base}/player_api.php?${auth}&action=get_series`).catch(() => []);
        const serArr = Array.isArray(rawSer) ? rawSer : [];
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
        rawSer = null;

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
    },

    formatEpisodeTitle(rawTitle, seriesName, seasonNum, epNum) {
        const fallback = `Episode ${epNum || ''}`.trim();
        if (!rawTitle) return fallback;
        let t = String(rawTitle).trim();

        // Strip leading series name if prefixed (e.g., "Lupin - S04E01" or "Lupin: S04E01 - Pilot")
        if (seriesName) {
            const baseSeries = String(seriesName).replace(/\s*\(.*?\)\s*$/, '').trim();
            if (baseSeries && t.toLowerCase().indexOf(baseSeries.toLowerCase()) === 0) {
                t = t.slice(baseSeries.length).replace(/^[\s\-_:|.]+/, '').trim();
            }
        }

        // If title starts with SxxExx followed by a separator and a real episode name, keep the real name
        const prefixMatch = t.match(/^S0*\d+\s*[._\-]?\s*E0*\d+\s*[\-_:|\s]+(.+)$/i);
        if (prefixMatch && prefixMatch[1]) {
            t = prefixMatch[1].trim();
        }

        // If the remaining title is just a raw season/episode code (e.g. "S04E01", "S4 E1", "E01"), use clean "Episode X"
        if (!t || /^S0*\d+\s*[._\-]?\s*E0*\d+$/i.test(t) || /^E0*\d+$/i.test(t) || /^Episode\s*0*\d+$/i.test(t)) {
            return fallback;
        }
        return t;
    },

    buildEpisodePlayItem(connection, seriesInfo, seasonsData, seasonNum, epIndex) {
        const seasonStr = String(seasonNum);
        const episodes = (seasonsData && seasonsData[seasonStr]) ? seasonsData[seasonStr] : null;
        if (!episodes || !episodes[epIndex] || !seriesInfo) return null;
        const ep = episodes[epIndex];

        const streamUrl = this.resolveEpisodeUrl(connection, ep);
        if (!streamUrl) return null;

        const epNum = ep.episode_num || ep.episode || (epIndex + 1);
        const epTitle = this.formatEpisodeTitle(ep.title, seriesInfo.name, seasonNum, epNum);
        const epNumStr = `S${seasonNum} E${epNum}`;
        const thumb = (ep.info && ep.info.movie_image) || (ep.info && ep.info.cover) || seriesInfo.poster || '';

        return {
            id: `series_${seriesInfo.id || ''}_${ep.id || ''}`,
            name: `${seriesInfo.name} - ${epNumStr}: ${epTitle}`,
            type: 'series',
            url: streamUrl,
            logo: thumb || seriesInfo.poster,
            category: seriesInfo.name,
            seriesContext: {
                seriesId: seriesInfo.id,
                seriesName: seriesInfo.name,
                poster: seriesInfo.poster,
                plot: seriesInfo.plot,
                seasonsData: seasonsData,
                currentSeason: seasonStr,
                currentEpisodeIndex: epIndex,
                currentEpisodeId: ep.id,
                currentEpisodeNum: epNum,
                currentEpisodeTitle: epTitle
            }
        };
    },

    async loadSeriesSeasons(connection, item) {
        let seasonsData = {};
        const seriesInfo = { ...item };

        if (connection && connection.type === 'xtream') {
            const resp = await this.getSeriesInfo(connection, item.id);
            if (resp) {
                if (resp.info) {
                    seriesInfo.name = resp.info.name || item.name;
                    seriesInfo.poster = resp.info.cover || resp.info.movie_image || item.poster;
                    seriesInfo.plot = resp.info.plot || item.plot;
                    seriesInfo.rating = resp.info.rating || item.rating;
                    seriesInfo.year = resp.info.releaseDate || resp.info.year || item.year;
                    seriesInfo.category = resp.info.genre || item.category;
                }
                if (resp.episodes && typeof resp.episodes === 'object') {
                    seasonsData = resp.episodes;
                }
            }
        }

        // Fallback if no episodes data from API (e.g. M3U playlist)
        if (Object.keys(seasonsData).length === 0 && item && item.url) {
            seasonsData['1'] = [{
                id: item.id,
                episode_num: 1,
                title: item.name,
                url: item.url,
                info: { movie_image: item.poster, plot: item.plot }
            }];
        }

        return { seriesInfo, seasonsData };
    }
};
