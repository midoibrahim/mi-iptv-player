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
        let currentMeta = null;

        const liveChannels = [];
        const movies = [];
        const series = [];
        const liveCatSet = new Set();
        const movieCatSet = new Set();
        const seriesCatSet = new Set();

        let pos = 0;
        let lineNum = 0;
        const len = text.length;

        while (pos < len) {
            if (lineNum > 0 && (lineNum & 16383) === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
            const nextNl = text.indexOf('\n', pos);
            const rawLine = nextNl === -1 ? text.slice(pos) : text.slice(pos, nextNl);
            pos = nextNl === -1 ? len : nextNl + 1;

            const line = rawLine.trim();
            if (!line) {
                lineNum++;
                continue;
            }
            if (line.startsWith('#EXTINF:')) {
                currentMeta = this.parseExtinf(line);
            } else if (!line.startsWith('#') && currentMeta) {
                const streamUrl = line;
                const cat = currentMeta.groupTitle || 'Uncategorized';
                const name = currentMeta.title || 'Unknown';
                const logo = currentMeta.tvgLogo || '';
                const qText = (name + ' ' + cat).toLowerCase();
                const isHd = /hd|fhd|uhd|4k/i.test(name);
                const lcUrl = streamUrl.toLowerCase();

                if (/\.(mp4|mkv|avi|mov)($|\?)/.test(lcUrl)) {
                    movieCatSet.add(cat);
                    movies.push({
                        id: `m3u_${lineNum}`,
                        name: name,
                        _q: qText,
                        logo: logo,
                        category: cat,
                        url: streamUrl,
                        hd: isHd,
                        type: 'movie',
                        poster: logo,
                        plot: '',
                        rating: '',
                        year: ''
                    });
                } else if (/\/series\//.test(lcUrl)) {
                    seriesCatSet.add(cat);
                    series.push({
                        id: `m3u_${lineNum}`,
                        name: name,
                        _q: qText,
                        logo: logo,
                        category: cat,
                        url: streamUrl,
                        hd: isHd,
                        type: 'series',
                        poster: logo,
                        plot: '',
                        rating: '',
                        year: ''
                    });
                } else {
                    liveCatSet.add(cat);
                    liveChannels.push({
                        id: `m3u_${lineNum}`,
                        name: name,
                        _q: qText,
                        logo: logo,
                        category: cat,
                        url: streamUrl,
                        hd: isHd,
                        type: 'live',
                        _idx: liveChannels.length
                    });
                }
                currentMeta = null;
            }
            lineNum++;
        }

        const toCats = (set) => Array.from(set).map((n, idx) => ({ category_id: idx, category_name: n }));
        const categories = {
            live: toCats(liveCatSet),
            movies: toCats(movieCatSet),
            series: toCats(seriesCatSet)
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
