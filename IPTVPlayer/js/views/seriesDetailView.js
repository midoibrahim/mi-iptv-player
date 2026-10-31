/* ============================================================
   IPTV Player — Series Detail View Component
   Shows poster, metadata, season selector tabs & episodes
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.SeriesDetailView = {
    init(app) {
        this.app = app;
        this.screen = document.getElementById('series-detail-screen');
        const backBtn = document.getElementById('series-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.close());
        }
        const favBtn = document.getElementById('series-fav-btn');
        if (favBtn) {
            favBtn.addEventListener('click', () => {
                if (this.currentSeries) {
                    this.app.toggleFavorite(this.currentSeries);
                    this.updateFavoriteState();
                }
            });
        }
    },

    updateFavoriteState() {
        const favBtn = document.getElementById('series-fav-btn');
        const favText = document.getElementById('series-fav-text');
        if (!favBtn || !this.currentSeries) return;
        const isFav = this.app.isFavorite(this.currentSeries);
        favBtn.classList.toggle('active', isFav);
        if (favText) {
            favText.textContent = isFav ? 'Remove from Favorites' : 'Add to Favorites';
        }
    },

    async open(item) {
        this.lastFocusedElement = document.activeElement;
        this.app.showLoading('Loading series details...');
        try {
            let seasonsData = {};
            let seriesInfo = { ...item };

            if (this.app.connection && this.app.connection.type === 'xtream') {
                const resp = await window.IPTV.XtreamService.getSeriesInfo(this.app.connection, item.id);
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
            const seasonKeys = Object.keys(seasonsData);
            if (seasonKeys.length === 0 && item.url) {
                seasonsData['1'] = [{
                    id: item.id,
                    episode_num: 1,
                    title: item.name,
                    url: item.url,
                    info: { movie_image: item.poster, plot: item.plot }
                }];
            }

            this.currentSeries = seriesInfo;
            this.app.hideLoading();
            this.renderScreen(seriesInfo, seasonsData);
        } catch(err) {
            this.app.hideLoading();
            this.app.toast('Failed to load series details');
            console.error('Series detail error:', err);
        }
    },

    renderScreen(seriesInfo, seasonsData) {
        this.currentSeries = seriesInfo;
        document.getElementById('series-title').textContent = seriesInfo.name;
        this.updateFavoriteState();
        
        const posterEl = document.getElementById('series-poster');
        posterEl.src = seriesInfo.poster || '';
        posterEl.onerror = function() { this.style.display = 'none'; };
        posterEl.style.display = seriesInfo.poster ? 'block' : 'none';

        const yearEl = document.getElementById('series-year');
        yearEl.textContent = seriesInfo.year ? `Year: ${seriesInfo.year}` : '';
        yearEl.style.display = seriesInfo.year ? 'inline-flex' : 'none';

        const ratingEl = document.getElementById('series-rating');
        if (seriesInfo.rating) {
            const starIcon = window.IPTV.Icons ? window.IPTV.Icons.get('star', 'badge-star-svg') : '';
            ratingEl.innerHTML = starIcon + '<span>' + String(seriesInfo.rating) + '</span>';
            ratingEl.style.display = 'inline-flex';
        } else {
            ratingEl.innerHTML = '';
            ratingEl.style.display = 'none';
        }

        const catEl = document.getElementById('series-category');
        catEl.textContent = seriesInfo.category || '';
        catEl.style.display = seriesInfo.category ? 'inline-flex' : 'none';

        document.getElementById('series-plot').textContent = seriesInfo.plot || 'No description available.';

        // Seasons tabs
        const tabsContainer = document.getElementById('series-seasons-tabs');
        const episodesGrid = document.getElementById('series-episodes-list');
        tabsContainer.innerHTML = '';
        episodesGrid.innerHTML = '';

        const seasonKeys = Object.keys(seasonsData).sort((a, b) => Number(a) - Number(b));

        if (seasonKeys.length === 0) {
            episodesGrid.innerHTML = '<p class="empty-state">No episodes available for this series.</p>';
        } else {
            seasonKeys.forEach((seasonNum, index) => {
                const btn = document.createElement('button');
                btn.className = `season-tab-btn ${index === 0 ? 'active' : ''}`;
                btn.textContent = `Season ${seasonNum}`;
                btn.tabIndex = 0;
                btn.addEventListener('click', () => {
                    tabsContainer.querySelectorAll('.season-tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.renderEpisodesList(seriesInfo, seasonsData[seasonNum], seasonNum);
                });
                tabsContainer.appendChild(btn);
            });

            // Render first season by default
            this.renderEpisodesList(seriesInfo, seasonsData[seasonKeys[0]], seasonKeys[0]);
        }

        // Show series detail screen
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        this.screen.classList.add('active');
        this.screen.scrollTop = 0;

        setTimeout(() => {
            const firstTarget = this.screen.querySelector('.episode-card, .season-tab-btn.active, #series-fav-btn, #series-back-btn');
            if (firstTarget && window.IPTV.SpatialNav) {
                window.IPTV.SpatialNav.focusElement(firstTarget);
            } else if (firstTarget) {
                firstTarget.focus();
            }
        }, 60);
    },

    _formatEpisodeTitle(rawTitle, seriesName, seasonNum, epNum) {
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

    renderEpisodesList(seriesInfo, episodes, seasonNum) {
        const grid = document.getElementById('series-episodes-list');
        grid.innerHTML = '';

        if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
            grid.innerHTML = '<p class="empty-state">No episodes in this season.</p>';
            return;
        }

        const base = (this.app.connection && this.app.connection.type === 'xtream')
            ? this.app.connection.server.replace(/\/+$/, '')
            : '';

        const frag = document.createDocumentFragment();
        const playIconHtml = window.IPTV.Icons ? window.IPTV.Icons.get('play', 'ep-play-svg') : '▶';

        episodes.forEach(ep => {
            const card = document.createElement('div');
            card.className = 'episode-card';
            card.tabIndex = 0;

            let streamUrl = ep.url;
            if (!streamUrl && this.app.connection && this.app.connection.type === 'xtream') {
                const ext = ep.container_extension || 'mp4';
                streamUrl = `${base}/series/${this.app.connection.user}/${this.app.connection.pass}/${ep.id}.${ext}`;
            }

            const epNum = ep.episode_num || ep.episode || '';
            const thumb = (ep.info && ep.info.movie_image) || (ep.info && ep.info.cover) || seriesInfo.poster || '';
            const epTitle = this._formatEpisodeTitle(ep.title, seriesInfo.name, seasonNum, epNum);
            const epNumStr = `S${seasonNum} E${epNum}`;

            const thumbContainer = document.createElement('div');
            thumbContainer.className = 'episode-thumb-container';
            if (thumb) {
                const img = document.createElement('img');
                img.className = 'episode-thumb';
                img.src = thumb;
                img.alt = '';
                img.loading = 'lazy';
                img.onerror = function() { this.style.display = 'none'; };
                thumbContainer.appendChild(img);
            }
            const playIcon = document.createElement('div');
            playIcon.className = 'episode-play-icon';
            playIcon.innerHTML = playIconHtml;
            thumbContainer.appendChild(playIcon);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'episode-info';
            const numSpan = document.createElement('span');
            numSpan.className = 'episode-number';
            numSpan.textContent = epNumStr;
            const titleH4 = document.createElement('h4');
            titleH4.className = 'episode-title';
            titleH4.textContent = epTitle;
            infoDiv.appendChild(numSpan);
            infoDiv.appendChild(titleH4);

            if (ep.info && ep.info.plot) {
                const plotP = document.createElement('p');
                plotP.className = 'episode-plot';
                plotP.textContent = ep.info.plot;
                infoDiv.appendChild(plotP);
            }

            card.appendChild(thumbContainer);
            card.appendChild(infoDiv);

            card.addEventListener('click', () => {
                if (!streamUrl) {
                    this.app.toast('No episode stream URL available');
                    return;
                }
                this.app.playerService.play({
                    id: `series_${seriesInfo.id || ''}_${ep.id || ''}`,
                    name: `${seriesInfo.name} - ${epNumStr}: ${epTitle}`,
                    type: 'series',
                    url: streamUrl,
                    logo: thumb || seriesInfo.poster,
                    category: seriesInfo.name
                });
            });

            frag.appendChild(card);
        });
        grid.appendChild(frag);
    },

    close() {
        if (this.screen) this.screen.classList.remove('active');
        const mainShell = document.getElementById('main-shell');
        if (mainShell) mainShell.classList.add('active');

        if (this.lastFocusedElement && document.contains(this.lastFocusedElement)) {
            setTimeout(() => {
                try { this.lastFocusedElement.focus(); } catch(e) {}
            }, 60);
        }
    }
};
