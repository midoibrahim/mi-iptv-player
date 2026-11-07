/* ============================================================
   IPTV Player — Download State & Action Store (Windows Desktop)
   Owns active download tasks, completed history, settings,
   lookup queries, and episode/movie download payload builders.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.DownloadStore = {
    activeTasks: new Map(),
    history: [],
    settings: {
        saveDirectory: '',
        askEveryTime: false
    },

    isDesktop() {
        return Boolean(
            window.IPTV.Platform
                ? window.IPTV.Platform.hasDownloads()
                : (typeof window !== 'undefined' && window.electronDesktop && window.electronDesktop.downloads)
        );
    },

    applySnapshot(data) {
        if (!data) return;
        this.settings = data.settings || this.settings;
        this.history = data.history || [];
        this.activeTasks.clear();
        if (Array.isArray(data.active)) {
            data.active.forEach(t => this.activeTasks.set(t.id, t));
        }
    },

    isDownloading(urlOrId) {
        if (!urlOrId) return false;
        const target = String(urlOrId);
        const normTarget = target.replace(/^series_/, 'ep_');
        for (const task of this.activeTasks.values()) {
            const taskItemId = task.itemId ? String(task.itemId) : '';
            const normTaskItemId = taskItemId.replace(/^series_/, 'ep_');
            if (
                task.id === target ||
                taskItemId === target ||
                (normTaskItemId && normTaskItemId === normTarget) ||
                (taskItemId && taskItemId.endsWith('_' + target)) ||
                task.url === target
            ) {
                return true;
            }
        }
        return false;
    },

    getDownloadedItem(target) {
        if (!this.isDesktop() || !target) return null;
        if (typeof target === 'string') {
            const targetStr = String(target);
            const normTarget = targetStr.replace(/^series_/, 'ep_');
            return this.history.find(h => {
                if (!h.existsOnDisk || !h.filePath) return false;
                const hItemId = h.itemId ? String(h.itemId) : '';
                const normHItemId = hItemId.replace(/^series_/, 'ep_');
                return (
                    h.id === targetStr ||
                    hItemId === targetStr ||
                    (normHItemId && normHItemId === normTarget) ||
                    (hItemId && hItemId.endsWith('_' + targetStr)) ||
                    h.url === targetStr ||
                    h.filePath === targetStr
                );
            }) || null;
        }

        const targetUrl = target.url || target.hlsUrl;
        const targetId = target.id ? String(target.id) : '';
        const normTargetId = targetId.replace(/^series_/, 'ep_');
        const targetItemId = target.itemId ? String(target.itemId) : '';
        const normTargetItemId = targetItemId.replace(/^series_/, 'ep_');
        const targetSeriesContext = target.seriesContext;

        return this.history.find(h => {
            if (!h.existsOnDisk || !h.filePath) return false;

            const hItemId = h.itemId ? String(h.itemId) : '';
            const normHItemId = hItemId.replace(/^series_/, 'ep_');

            if (targetUrl && h.url === targetUrl) return true;
            if (targetId && (h.id === targetId || hItemId === targetId || (normHItemId && normHItemId === normTargetId) || (hItemId && hItemId.endsWith('_' + targetId)))) return true;
            if (targetItemId && (h.id === targetItemId || hItemId === targetItemId || (normHItemId && normHItemId === normTargetItemId))) return true;

            if (target.seriesName && target.season != null && target.episode != null && h.seriesName) {
                const sameSeries = h.seriesName.trim().toLowerCase() === String(target.seriesName).trim().toLowerCase();
                const sameSeason = String(h.seasonNum || h.season) === String(target.season);
                const sameEp = String(h.episodeNum || h.episode) === String(target.episode);
                if (sameSeries && sameSeason && sameEp) return true;
            }

            if (targetSeriesContext && h.type === 'series') {
                const sameSeries = h.seriesName && targetSeriesContext.seriesName &&
                    h.seriesName.trim().toLowerCase() === targetSeriesContext.seriesName.trim().toLowerCase();
                const sameSeason = String(h.seasonNum || h.season) === String(targetSeriesContext.currentSeason);
                const sameEp = String(h.episodeNum || h.episode) === String(targetSeriesContext.currentEpisodeNum || (targetSeriesContext.currentEpisodeIndex + 1));
                if (sameSeries && sameSeason && sameEp) return true;
            }

            return false;
        }) || null;
    },

    isCompleted(target) {
        return Boolean(this.getDownloadedItem(target));
    },

    buildEpisodePayload(seriesInfo, seasonNum, ep, epIndex) {
        if (!seriesInfo || !ep) return null;
        const conn = window.IPTV.CatalogStore ? window.IPTV.CatalogStore.getConnection() : null;
        const streamUrl = window.IPTV.XtreamService
            ? window.IPTV.XtreamService.resolveEpisodeUrl(conn, ep)
            : (ep.url || '');
        if (!streamUrl) return null;

        const epNum = ep.episode_num || ep.episode || (epIndex + 1);
        const epTitle = (window.IPTV.SeriesDetailView && window.IPTV.SeriesDetailView._formatEpisodeTitle)
            ? window.IPTV.SeriesDetailView._formatEpisodeTitle(ep.title, seriesInfo.name, seasonNum, epNum)
            : (ep.title || `Episode ${epNum}`);
        const thumb = (ep.info && ep.info.movie_image) || (ep.info && ep.info.cover) || seriesInfo.poster || '';

        return {
            id: `ep_${seriesInfo.id}_${ep.id}`,
            title: epTitle,
            seriesName: seriesInfo.name,
            season: seasonNum,
            episode: epNum,
            url: streamUrl,
            poster: thumb,
            type: 'series'
        };
    },

    collectPendingEpisodes(seriesInfo, seasonNum, episodes) {
        if (!Array.isArray(episodes)) return [];
        const list = [];
        episodes.forEach((ep, epIndex) => {
            const payload = this.buildEpisodePayload(seriesInfo, seasonNum, ep, epIndex);
            if (!payload) return;
            if (this.isDownloading(payload.url) || this.isDownloading(payload.id) || this.isCompleted(payload)) {
                return;
            }
            list.push(payload);
        });
        return list;
    }
};

