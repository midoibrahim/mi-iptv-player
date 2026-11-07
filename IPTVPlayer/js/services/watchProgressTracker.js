/* ============================================================
   IPTV Player — Watch Progress & Episode Adjacency Tracker
   Calculates adjacent episodes across seasons and persists
   playback progress for Movies & Series. Zero DOM dependencies.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.WatchProgressTracker = {
    getAdjacentEpisodes(seriesContext) {
        if (!seriesContext || !seriesContext.seasonsData) {
            return { hasPrev: false, hasNext: false };
        }
        const sc = seriesContext;
        const seasons = sc.seasonsData;
        const seasonKeys = Object.keys(seasons).sort((a, b) => Number(a) - Number(b));
        if (seasonKeys.length === 0) {
            return { hasPrev: false, hasNext: false };
        }

        const totalEpisodes = seasonKeys.reduce((acc, k) => acc + (seasons[k] ? seasons[k].length : 0), 0);
        if (totalEpisodes <= 1) {
            return { hasPrev: false, hasNext: false };
        }

        const curSeasonStr = String(sc.currentSeason || seasonKeys[0]);
        const curSeasonIdx = seasonKeys.indexOf(curSeasonStr);
        const curEpisodes = seasons[curSeasonStr] || [];
        const curEpIdx = typeof sc.currentEpisodeIndex === 'number'
            ? sc.currentEpisodeIndex
            : curEpisodes.findIndex(e => String(e.id) === String(sc.currentEpisodeId));

        let hasPrev = false;
        let prevSeason = null;
        let prevIndex = -1;
        let prevEpisode = null;

        if (curEpIdx > 0) {
            hasPrev = true;
            prevSeason = curSeasonStr;
            prevIndex = curEpIdx - 1;
            prevEpisode = curEpisodes[prevIndex] || null;
        } else if (curSeasonIdx > 0) {
            const prevSeasonKey = seasonKeys[curSeasonIdx - 1];
            const prevEpisodes = seasons[prevSeasonKey] || [];
            if (prevEpisodes.length > 0) {
                hasPrev = true;
                prevSeason = prevSeasonKey;
                prevIndex = prevEpisodes.length - 1;
                prevEpisode = prevEpisodes[prevIndex] || null;
            }
        }

        let hasNext = false;
        let nextSeason = null;
        let nextIndex = -1;
        let nextEpisode = null;

        if (curEpIdx < curEpisodes.length - 1) {
            hasNext = true;
            nextSeason = curSeasonStr;
            nextIndex = curEpIdx + 1;
            nextEpisode = curEpisodes[nextIndex] || null;
        } else if (curSeasonIdx >= 0 && curSeasonIdx < seasonKeys.length - 1) {
            const nextSeasonKey = seasonKeys[curSeasonIdx + 1];
            const nextEpisodes = seasons[nextSeasonKey] || [];
            if (nextEpisodes.length > 0) {
                hasNext = true;
                nextSeason = nextSeasonKey;
                nextIndex = 0;
                nextEpisode = nextEpisodes[0] || null;
            }
        }

        return {
            hasPrev,
            hasNext,
            prevSeason,
            prevIndex,
            prevEpisode,
            nextSeason,
            nextIndex,
            nextEpisode
        };
    },

    recordProgress(item, currentTime, duration, isCompleted = false) {
        if (!item || item.type === 'live') return;
        if (!duration || isNaN(duration) || duration <= 0 || !isFinite(duration)) return;

        const pct = (currentTime || 0) / duration;
        const conn = window.IPTV.CatalogStore ? window.IPTV.CatalogStore.getConnection() : null;
        if (!conn || !window.IPTV.Storage) return;

        const isSeries = item.type === 'series';
        const sc = isSeries ? item.seriesContext : null;
        const seriesId = sc ? sc.seriesId : (isSeries ? (item.seriesId || item.id) : null);
        const recordId = seriesId ? `series_${seriesId}` : String(item.id);

        // Auto-cleanup / advance to next episode when >= 95% or completed
        if (pct >= 0.95 || isCompleted) {
            if (isSeries && sc) {
                const adjacent = this.getAdjacentEpisodes(sc);
                if (adjacent && adjacent.hasNext && adjacent.nextEpisode) {
                    const nextEp = adjacent.nextEpisode;
                    const nextRecord = {
                        id: recordId,
                        type: 'series',
                        name: (sc && sc.seriesName) || item.name,
                        poster: (sc && sc.poster) || item.logo || item.poster || '',
                        position: 0,
                        duration: 0,
                        updatedAt: Date.now(),
                        seriesId: seriesId,
                        seriesName: (sc && sc.seriesName) || item.name,
                        seasonNum: adjacent.nextSeason,
                        episodeNum: adjacent.nextIndex + 1,
                        episodeId: nextEp.id || nextEp.episode_num || null,
                        episodeTitle: nextEp.title || nextEp.name || `Episode ${adjacent.nextIndex + 1}`
                    };
                    window.IPTV.Storage.saveWatchProgressItem(conn, nextRecord);
                    return;
                }
            }
            window.IPTV.Storage.removeWatchProgress(conn, recordId);
            return;
        }

        // Do not record trivial scrubbing at start (< 5s)
        if ((currentTime || 0) < 5) return;

        const record = {
            id: recordId,
            type: item.type || 'movie',
            name: (sc && sc.seriesName) || item.name,
            poster: (sc && sc.poster) || item.logo || item.poster || '',
            position: Math.floor(currentTime),
            duration: Math.floor(duration),
            updatedAt: Date.now()
        };

        if (isSeries) {
            record.seriesId = seriesId;
            record.seriesName = (sc && sc.seriesName) || item.name;
            record.seasonNum = sc ? sc.currentSeason : (item.seasonNum || 1);
            record.episodeNum = sc ? sc.currentEpisodeNum : (item.episodeNum || 1);
            record.episodeId = sc ? sc.currentEpisodeId : (item.episodeId || item.id);
            record.episodeTitle = sc ? sc.currentEpisodeTitle : (item.episodeTitle || item.name);
        }

        try {
            window.IPTV.Storage.saveWatchProgressItem(conn, record);
        } catch (err) {
            // Ignore storage quota errors so playback is never interrupted
        }
    }
};

