/* ============================================================
   IPTV Player — M3U / M3U8 Playlist Parser Service
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.M3UParser = {
    async load(url, onProgress) {
        if (onProgress) onProgress('Downloading M3U playlist...');
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();

        if (!text || !text.includes('#EXTM3U')) {
            throw new Error('Invalid playlist format (Missing #EXTM3U tag)');
        }

        if (onProgress) onProgress('Parsing channels and VODs...');
        const lines = text.split('\n');
        let currentMeta = null;

        const liveChannels = [];
        const movies = [];
        const series = [];

        for (let i = 0; i < lines.length; i++) {
            if (i > 0 && (i & 16383) === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
            const line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                currentMeta = this.parseExtinf(line);
            } else if (line && !line.startsWith('#') && currentMeta) {
                const streamUrl = line;
                const cat = currentMeta.groupTitle || 'Uncategorized';
                const name = currentMeta.title || 'Unknown';
                const item = {
                    id: `m3u_${i}`,
                    name: name,
                    _q: (name + ' ' + cat).toLowerCase(),
                    logo: currentMeta.tvgLogo || '',
                    category: cat,
                    url: streamUrl,
                    hd: /hd|fhd|uhd|4k/i.test(name)
                };

                // Classify stream type
                const lcUrl = streamUrl.toLowerCase();
                if (/\.(mp4|mkv|avi|mov)($|\?)/.test(lcUrl)) {
                    movies.push({ ...item, type: 'movie', poster: item.logo, plot: '', rating: '', year: '' });
                } else if (/\/series\//.test(lcUrl)) {
                    series.push({ ...item, type: 'series', poster: item.logo, plot: '', rating: '', year: '' });
                } else {
                    liveChannels.push({ ...item, type: 'live', _idx: liveChannels.length });
                }
                currentMeta = null;
            }
        }

        const categories = {
            live: [...new Set(liveChannels.map(c => c.category))].map((n, i) => ({ category_id: i, category_name: n })),
            movies: [...new Set(movies.map(c => c.category))].map((n, i) => ({ category_id: i, category_name: n })),
            series: [...new Set(series.map(c => c.category))].map((n, i) => ({ category_id: i, category_name: n }))
        };

        return {
            liveChannels,
            movies,
            series,
            categories
        };
    },

    parseExtinf(line) {
        const result = { title: '', groupTitle: '', tvgLogo: '' };
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        if (logoMatch) result.tvgLogo = logoMatch[1];

        const groupMatch = line.match(/group-title="([^"]*)"/i);
        if (groupMatch) result.groupTitle = groupMatch[1];

        const commaIdx = line.lastIndexOf(',');
        if (commaIdx !== -1) result.title = line.substring(commaIdx + 1).trim();
        return result;
    }
};
