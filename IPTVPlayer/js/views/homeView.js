/* ============================================================
   IPTV Player — Home View Component
   Hero Banner & Curated Horizontal Rows
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.HomeView = {
    init(app) {
        this.app = app;
        this.rowsContainer = document.getElementById('home-rows');
        this.modal = document.getElementById('continue-watching-modal');
        this.selectedRecord = null;
        this.lastFocusedCard = null;

        const btnResume = document.getElementById('btn-cw-resume');
        if (btnResume) {
            btnResume.addEventListener('click', () => {
                if (this.selectedRecord) this.resumeItem(this.selectedRecord, true);
            });
        }

        const btnRestart = document.getElementById('btn-cw-restart');
        if (btnRestart) {
            btnRestart.addEventListener('click', () => {
                if (this.selectedRecord) this.resumeItem(this.selectedRecord, false);
            });
        }

        const btnCancel = document.getElementById('btn-cw-cancel');
        if (btnCancel) {
            btnCancel.addEventListener('click', () => this.closeResumeModal());
        }
    },

    showResumeModal(record, cardElement) {
        this.selectedRecord = record;
        this.lastFocusedCard = cardElement || document.activeElement;
        if (!this.modal) return;

        const titleEl = document.getElementById('cw-modal-title');
        const descEl = document.getElementById('cw-modal-desc');

        if (titleEl) {
            titleEl.textContent = record.name || 'Resume Playback';
        }

        if (descEl) {
            const posStr = this._fmtTime(record.position);
            const durStr = this._fmtTime(record.duration);
            const remaining = Math.max(0, (record.duration || 0) - (record.position || 0));
            const remStr = this._fmtRemaining(remaining);

            if (record.type === 'series' && record.seasonNum && record.episodeNum) {
                const epInfo = `Season ${record.seasonNum}, Episode ${record.episodeNum}`;
                descEl.textContent = `${epInfo} — Resume at ${posStr} of ${durStr} (${remStr})`;
            } else {
                descEl.textContent = `Resume at ${posStr} of ${durStr} (${remStr})`;
            }
        }

        this.modal.classList.remove('hidden');

        setTimeout(() => {
            const btnResume = document.getElementById('btn-cw-resume');
            if (btnResume) {
                if (window.IPTV.SpatialNav) {
                    window.IPTV.SpatialNav.focusElement(btnResume);
                } else {
                    btnResume.focus();
                }
            }
        }, 50);
    },

    closeResumeModal() {
        if (this.modal) this.modal.classList.add('hidden');
        this.selectedRecord = null;
        if (this.lastFocusedCard && document.contains(this.lastFocusedCard)) {
            setTimeout(() => {
                try {
                    if (window.IPTV.SpatialNav) {
                        window.IPTV.SpatialNav.focusElement(this.lastFocusedCard);
                    } else {
                        this.lastFocusedCard.focus();
                    }
                } catch(e) {}
            }, 60);
        }
    },

    async resumeItem(record, isResume) {
        this.closeResumeModal();
        if (!record) return;

        const startPosition = isResume ? (record.position || 0) : 0;

        if (record.type === 'movie') {
            const movie = (this.app.movies || []).find(m => String(m.id) === String(record.id));
            if (!movie) {
                if (window.IPTV.Storage && this.app.connection) {
                    window.IPTV.Storage.removeWatchProgress(this.app.connection, record.id);
                }
                this.render(this.app.liveChannels, this.app.movies, this.app.series);
                this.app.toast('Movie is no longer available in the catalog');
                return;
            }
            this.app.playerService.play({
                ...movie,
                type: 'movie'
            }, { initialSeekTime: startPosition });
            return;
        }

        if (record.type === 'series') {
            const seriesId = record.seriesId || String(record.id).replace(/^series_/, '');
            const series = (this.app.series || []).find(s => String(s.id) === String(seriesId));
            if (!series) {
                if (window.IPTV.Storage && this.app.connection) {
                    window.IPTV.Storage.removeWatchProgress(this.app.connection, seriesId);
                }
                this.render(this.app.liveChannels, this.app.movies, this.app.series);
                this.app.toast('Series is no longer available in the catalog');
                return;
            }

            this.app.showLoading('Resuming series episode...');
            try {
                let seasonsData = {};
                let seriesInfo = { ...series };

                if (this.app.connection && this.app.connection.type === 'xtream') {
                    const resp = await window.IPTV.XtreamService.getSeriesInfo(this.app.connection, series.id);
                    if (resp) {
                        if (resp.info) {
                            seriesInfo.name = resp.info.name || series.name;
                            seriesInfo.poster = resp.info.cover || resp.info.movie_image || series.poster;
                            seriesInfo.plot = resp.info.plot || series.plot;
                        }
                        if (resp.episodes && typeof resp.episodes === 'object') {
                            seasonsData = resp.episodes;
                        }
                    }
                }

                const seasonKeys = Object.keys(seasonsData);
                if (seasonKeys.length === 0 && series.url) {
                    seasonsData['1'] = [{
                        id: series.id,
                        episode_num: 1,
                        title: series.name,
                        url: series.url,
                        info: { movie_image: series.poster, plot: series.plot }
                    }];
                }

                const seasonNum = String(record.seasonNum || Object.keys(seasonsData)[0] || '1');
                const episodes = seasonsData[seasonNum] || [];
                let epIndex = -1;
                if (record.episodeId) {
                    epIndex = episodes.findIndex(e => String(e.id) === String(record.episodeId));
                }
                if (epIndex === -1 && record.episodeNum) {
                    epIndex = episodes.findIndex(e => String(e.episode_num || e.episode) === String(record.episodeNum));
                }
                if (epIndex === -1 && episodes.length > 0) {
                    epIndex = 0;
                }

                if (epIndex === -1) {
                    this.app.hideLoading();
                    if (window.IPTV.Storage && this.app.connection) {
                        window.IPTV.Storage.removeWatchProgress(this.app.connection, record.id);
                    }
                    this.render(this.app.liveChannels, this.app.movies, this.app.series);
                    this.app.toast('Episode is no longer available in the catalog');
                    return;
                }

                const playItem = this.app.seriesDetailView.buildEpisodePlayItem(
                    this.app.connection,
                    seriesInfo,
                    seasonsData,
                    seasonNum,
                    epIndex
                );
                this.app.hideLoading();

                if (!playItem) {
                    this.app.toast('No episode stream URL available');
                    return;
                }

                this.app.playerService.play(playItem, { initialSeekTime: startPosition });
            } catch(err) {
                this.app.hideLoading();
                this.app.toast('Failed to load series details');
                console.error('[HomeView] Resume series error:', err);
            }
        }
    },

    render(liveChannels, movies, series) {
        if (!this.rowsContainer) return;
        this.rowsContainer.innerHTML = '';

        // Hero Item
        const heroItem = movies[0] || liveChannels[0] || series[0];
        if (heroItem) {
            const banner = document.getElementById('hero-banner');
            const poster = heroItem.poster || heroItem.logo;
            if (banner && poster) {
                banner.style.backgroundImage = `url(${poster})`;
                banner.style.backgroundSize = 'cover';
                banner.style.backgroundPosition = 'center';
            }
            const titleEl = document.getElementById('hero-title');
            if (titleEl) titleEl.textContent = heroItem.name || '';

            const descEl = document.getElementById('hero-desc');
            if (descEl) descEl.textContent = heroItem.plot || heroItem.category || '';

            const playBtn = document.getElementById('hero-play');
            if (playBtn) playBtn.onclick = () => this.app.onItemClick(heroItem, heroItem.type || 'movie');

            const favBtn = document.getElementById('hero-fav');
            if (favBtn) {
                const updateHeroFav = () => {
                    const isFav = this.app.isFavorite(heroItem);
                    favBtn.classList.toggle('active', isFav);
                    const iconSpan = favBtn.querySelector('.btn-icon');
                    const label = isFav ? ' Favorited' : ' Add to Favorites';
                    if (iconSpan) {
                        while (iconSpan.nextSibling) {
                            favBtn.removeChild(iconSpan.nextSibling);
                        }
                        favBtn.appendChild(document.createTextNode(label));
                    } else {
                        favBtn.textContent = isFav ? '★ Favorited' : '☆ Add to Favorites';
                    }
                };
                updateHeroFav();
                favBtn.onclick = () => {
                    this.app.toggleFavorite(heroItem);
                    updateHeroFav();
                };
            }
        }

        // Continue Watching Row (Owner decision: top of Home, max 10 items, scoped per connection)
        const cwItems = (window.IPTV.Storage && this.app.connection)
            ? window.IPTV.Storage.getWatchProgress(this.app.connection)
            : [];
        if (cwItems && cwItems.length > 0) {
            this._addContinueWatchingRow(cwItems);
        }

        // Live TV Row (first 25 channels)
        if (liveChannels && liveChannels.length > 0) {
            this._addRow('Live Channels', liveChannels.slice(0, 25), 'live');
        }

        // Popular Movies Row (first 25 movies)
        if (movies && movies.length > 0) {
            this._addRow('Popular Movies', movies.slice(0, 25), 'movie');
        }

        // Trending Series Row (first 25 series)
        if (series && series.length > 0) {
            this._addRow('Trending Series', series.slice(0, 25), 'series');
        }
    },

    _fmtRemaining(sec) {
        if (!sec || sec <= 0 || isNaN(sec)) return '';
        const m = Math.round(sec / 60);
        if (m < 60) return `${m}m left`;
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return remM > 0 ? `${h}h ${remM}m left` : `${h}h left`;
    },

    _fmtTime(sec) {
        if (isNaN(sec) || sec < 0) return '00:00';
        const total = Math.floor(sec);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) {
            return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
        return `${m}:${String(s).padStart(2,'0')}`;
    },

    _addContinueWatchingRow(items) {
        const row = document.createElement('div');
        row.className = 'content-row continue-watching-row';

        const h = document.createElement('h3');
        h.textContent = 'Continue Watching';
        row.appendChild(h);

        const scroll = document.createElement('div');
        scroll.className = 'row-scroll';

        const frag = document.createDocumentFragment();
        items.forEach(record => {
            const remaining = Math.max(0, (record.duration || 0) - (record.position || 0));
            const remStr = this._fmtRemaining(remaining);
            let subText = remStr;
            if (record.type === 'series' && record.seasonNum && record.episodeNum) {
                if (record.position === 0) {
                    subText = `Next: S${record.seasonNum} E${record.episodeNum}`;
                } else {
                    subText = remStr ? `S${record.seasonNum} E${record.episodeNum} · ${remStr}` : `S${record.seasonNum} E${record.episodeNum}`;
                }
            }

            const card = window.IPTV.Card.create(record, record.type, {
                isFavorite: this.app.isFavorite(record),
                progress: { position: record.position, duration: record.duration },
                subtitle: subText,
                onClick: (item, type) => this.showResumeModal(record, card)
            });
            frag.appendChild(card);
        });
        scroll.appendChild(frag);

        row.appendChild(scroll);
        this.rowsContainer.appendChild(row);
    },

    _addRow(title, items, type) {
        const row = document.createElement('div');
        row.className = 'content-row';

        const h = document.createElement('h3');
        h.textContent = title;
        row.appendChild(h);

        const scroll = document.createElement('div');
        scroll.className = 'row-scroll';

        const frag = document.createDocumentFragment();
        items.forEach(item => {
            const card = window.IPTV.Card.create(item, type, {
                isFavorite: this.app.isFavorite(item),
                onClick: (selectedItem, itemType) => this.app.onItemClick(selectedItem, itemType)
            });
            frag.appendChild(card);
        });
        scroll.appendChild(frag);

        row.appendChild(scroll);
        this.rowsContainer.appendChild(row);
    }
};
