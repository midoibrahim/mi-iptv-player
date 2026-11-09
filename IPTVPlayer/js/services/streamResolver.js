/* ============================================================
   IPTV Player — Stream Candidate Resolver (Pure Domain Service)
   Builds prioritized playback candidate URLs for Live TV & VOD
   Zero DOM dependencies; deterministic and unit-testable
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.StreamResolver = {
    getStrategy(rawUrl) {
        if (!rawUrl) return '';
        if (rawUrl.indexOf('mse-hls:') === 0) return 'mse-hls';
        if (rawUrl.indexOf('mse-ts:') === 0) return 'mse-ts';
        const isProxy = rawUrl.indexOf('/api/proxy') !== -1;
        const decoded = decodeURIComponent(rawUrl);
        if (/\.m3u8($|\?)/i.test(decoded)) return isProxy ? 'proxy-hls' : 'native-hls';
        if (/\.(ts|mpegts)($|\?)/i.test(decoded)) return isProxy ? 'proxy-ts' : 'native-ts';
        return isProxy ? 'proxy-raw' : 'native-raw';
    },

    buildCandidates(item, env = {}) {
        const list = [];
        if (!item) return list;

        const add = (u) => {
            if (u && typeof u === 'string' && !list.includes(u)) {
                list.push(u);
            }
        };

        const canUseLocalProxy = env.canUseLocalProxy !== undefined
            ? !!env.canUseLocalProxy
            : Boolean(
                (window.IPTV.Platform && typeof window.IPTV.Platform.isDesktop === 'function' && window.IPTV.Platform.isDesktop()) ||
                (window.location && window.location.protocol && window.location.protocol.startsWith('http') && window.location.host) ||
                (window.IPTV.TvServer && typeof window.IPTV.TvServer.isRunning === 'function' && window.IPTV.TvServer.isRunning())
            );

        const proxyBase = env.proxyBase || (
            (window.location && window.location.protocol && window.location.protocol.startsWith('http') && window.location.host)
                ? `${window.location.origin}/api/proxy?url=`
                : 'http://127.0.0.1:8089/api/proxy?url='
        );

        const toProxy = (u) => (canUseLocalProxy && u && u.startsWith('http') && !u.includes('/api/proxy'))
            ? `${proxyBase}${encodeURIComponent(u)}`
            : null;

        const canUseMse = env.canUseMse !== undefined
            ? !!env.canUseMse
            : (typeof window.MediaSource !== 'undefined');

        if (item.type === 'live') {
            let hlsCandidate = null;
            let tsCandidate = null;

            if (item.hlsUrl) {
                hlsCandidate = item.hlsUrl;
            } else if (item.url && item.url.includes('.m3u8')) {
                hlsCandidate = item.url;
            } else if (item.url && item.url.includes('.ts')) {
                hlsCandidate = item.url.replace(/\.ts($|\?)/i, '.m3u8$1');
            }

            if (item.url && item.url.includes('.ts')) {
                tsCandidate = item.url;
            } else if (item.url && item.url.includes('.m3u8')) {
                tsCandidate = item.url.replace(/\.m3u8($|\?)/i, '.ts$1');
            } else if (item.hlsUrl && item.hlsUrl.includes('.m3u8')) {
                tsCandidate = item.hlsUrl.replace(/\.m3u8($|\?)/i, '.ts$1');
            } else if (item.url) {
                tsCandidate = item.url;
            }

            const rawCandidate = item.fallbackUrl || (item.url ? item.url.replace(/\.(ts|m3u8)($|\?)/i, '$2') : null);

            if (hlsCandidate) {
                if (canUseMse) add(`mse-hls:${hlsCandidate}`);
                add(hlsCandidate);
                add(toProxy(hlsCandidate));
            }
            if (tsCandidate) {
                if (canUseMse) add(`mse-ts:${tsCandidate}`);
                add(tsCandidate);
                add(toProxy(tsCandidate));
            }
            if (rawCandidate) {
                add(rawCandidate);
                add(toProxy(rawCandidate));
            }

            const preferredStrategy = env.preferredStrategy || null;
            if (preferredStrategy && list.length > 1) {
                const prefIdx = list.findIndex(u => this.getStrategy(u) === preferredStrategy);
                if (prefIdx > 0) {
                    const [winner] = list.splice(prefIdx, 1);
                    list.unshift(winner);
                }
            }
            return list;
        }

        // Movies & Series (VOD)
        const localFilePath = env.localFilePath !== undefined
            ? env.localFilePath
            : (() => {
                if (window.IPTV.DownloadManager && window.IPTV.DownloadManager.isDesktop) {
                    const downloaded = window.IPTV.DownloadManager.getDownloadedItem(item);
                    return (downloaded && downloaded.filePath) ? downloaded.filePath : null;
                }
                return null;
            })();

        if (localFilePath) {
            const localUrl = `file:///${localFilePath.replace(/\\/g, '/')}`;
            add(localUrl);
            item._isLocalPlayback = true;
            item._localFilePath = localFilePath;
        }

        const vodUrl = item.url || item.hlsUrl || item.fallbackUrl;
        if (vodUrl) {
            const isM3u8Vod = /\.m3u8($|\?)/i.test(vodUrl);
            const isTsVod = /\.(ts|mpegts)($|\?)/i.test(vodUrl);

            if (isM3u8Vod && canUseMse) {
                add(`mse-hls:${vodUrl}`);
            } else if (isTsVod && canUseMse) {
                add(`mse-ts:${vodUrl}`);
            }
            add(vodUrl);
            if (item.url && item.url !== vodUrl) add(item.url);
            if (item.hlsUrl && item.hlsUrl !== vodUrl) add(item.hlsUrl);
            if (item.fallbackUrl && item.fallbackUrl !== vodUrl) add(item.fallbackUrl);
            add(toProxy(vodUrl));
        }

        return list;
    }
};

