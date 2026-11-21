/* ============================================================
   IPTV Player — Download State & Action Store (Windows Desktop)
   Owns active download tasks, completed history, settings,
   lookup queries, and episode/movie download payload builders.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.DownloadStore = {
    activeTasks: new Map(),
    history: [],
    _idxSig: '',
    _byUrl: new Map(),
    _byId: new Map(),
    _bySeriesEp: new Map(),
    settings: {
        saveDirectory: '',
        askEveryTime: false
    },

    _seriesEpKey(seriesName, season, ep) {
        if (!seriesName || season == null || ep == null) return '';
        return `${String(seriesName).trim().toLowerCase()}|${String(season)}|${String(ep)}`;
    },

    _ensureHistoryIndex() {
        const len = Array.isArray(this.history) ? this.history.length : 0;
        const first = len > 0 ? this.history[0] : null;
        const last = len > 0 ? this.history[len - 1] : null;
        const sig = `${len}:${first ? (first.id + '|' + first.filePath + '|' + first.existsOnDisk) : ''}:${last ? last.id : ''}`;
        if (this._idxSig === sig) return;
        this._idxSig = sig;
        this._byUrl.clear();
        this._byId.clear();
        this._bySeriesEp.clear();

        for (let i = 0; i < len; i++) {
            const h = this.history[i];
            if (!h || !h.existsOnDisk || !h.filePath) continue;
            if (h.url && !this._byUrl.has(h.url)) this._byUrl.set(h.url, h);
            if (h.filePath && !this._byUrl.has(h.filePath)) this._byUrl.set(h.filePath, h);
            if (h.id && !this._byId.has(String(h.id))) this._byId.set(String(h.id), h);
            if (h.itemId) {
                const rawItemId = String(h.itemId);
                const normItemId = rawItemId.replace(/^series_/, 'ep_');
                if (!this._byId.has(rawItemId)) this._byId.set(rawItemId, h);
                if (normItemId && !this._byId.has(normItemId)) this._byId.set(normItemId, h);
                const lastUnderscore = rawItemId.lastIndexOf('_');
                if (lastUnderscore !== -1) {
                    const tail = rawItemId.slice(lastUnderscore + 1);
                    if (tail && !this._byId.has(tail)) this._byId.set(tail, h);
                }
            }
            const sKey = this._seriesEpKey(h.seriesName, h.seasonNum != null ? h.seasonNum : h.season, h.episodeNum != null ? h.episodeNum : h.episode);
            if (sKey && !this._bySeriesEp.has(sKey)) this._bySeriesEp.set(sKey, h);
        }
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
        this._idxSig = '';
        this._ensureHistoryIndex();
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
        this._ensureHistoryIndex();

        if (typeof target === 'string') {
            const targetStr = String(target);
            const normTarget = targetStr.replace(/^series_/, 'ep_');
            return (
                this._byUrl.get(targetStr) ||
                this._byId.get(targetStr) ||
                this._byId.get(normTarget) ||
                null
            );
        }

        const targetUrl = target.url || target.hlsUrl;
        if (targetUrl) {
            const byUrl = this._byUrl.get(targetUrl);
            if (byUrl) return byUrl;
        }

        const targetId = target.id ? String(target.id) : '';
        if (targetId) {
            const normTargetId = targetId.replace(/^series_/, 'ep_');
            const byId = this._byId.get(targetId) || this._byId.get(normTargetId);
            if (byId) return byId;
        }

        const targetItemId = target.itemId ? String(target.itemId) : '';
        if (targetItemId) {
            const normTargetItemId = targetItemId.replace(/^series_/, 'ep_');
            const byItemId = this._byId.get(targetItemId) || this._byId.get(normTargetItemId);
            if (byItemId) return byItemId;
        }

        const targetSeason = target.season != null ? target.season : target.seasonNum;
        const targetEpisode = target.episode != null ? target.episode : target.episodeNum;
        if (target.seriesName && targetSeason != null && targetEpisode != null) {
            const sKey = this._seriesEpKey(target.seriesName, targetSeason, targetEpisode);
            const bySeries = sKey ? this._bySeriesEp.get(sKey) : null;
            if (bySeries) return bySeries;
        }

        const targetSeriesContext = target.seriesContext;
        if (targetSeriesContext && targetSeriesContext.seriesName) {
            const sKey = this._seriesEpKey(
                targetSeriesContext.seriesName,
                targetSeriesContext.currentSeason,
                targetSeriesContext.currentEpisodeNum || (targetSeriesContext.currentEpisodeIndex + 1)
            );
            const byCtx = sKey ? this._bySeriesEp.get(sKey) : null;
            if (byCtx && byCtx.type === 'series') return byCtx;
        }

        return null;
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
        const epTitle = (window.IPTV.XtreamService && typeof window.IPTV.XtreamService.formatEpisodeTitle === 'function')
            ? window.IPTV.XtreamService.formatEpisodeTitle(ep.title, seriesInfo.name, seasonNum, epNum)
            : ((window.IPTV.SeriesDetailView && window.IPTV.SeriesDetailView._formatEpisodeTitle)
                ? window.IPTV.SeriesDetailView._formatEpisodeTitle(ep.title, seriesInfo.name, seasonNum, epNum)
                : (ep.title || `Episode ${epNum}`));
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

