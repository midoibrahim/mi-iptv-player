/* ============================================================
   IPTV Player — Media Player On-Screen Display (OSD) Component
   Handles OSD rendering, playbar scrubbing, 3-tier D-pad focus
   navigation, seek HUD, channel banner, and time formatting.
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.PlayerOsd = {
    osdEls(player) {
        if (!player._cachedOsdEls) {
            player._cachedOsdEls = {
                bar: document.getElementById('osd-progress-bar'),
                fill: document.getElementById('osd-progress-fill'),
                thumb: document.getElementById('osd-progress-thumb'),
                cur: document.getElementById('osd-time-current'),
                dur: document.getElementById('osd-time-duration')
            };
        }
        return player._cachedOsdEls;
    },

    fmtTime(sec, totalDuration = 0) {
        if (isNaN(sec) || sec < 0) return '00:00';
        const totalSec = Math.floor(sec);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0 || totalDuration >= 3600) {
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    updatePlayPauseIcon(isPlaying) {
        const pp = document.getElementById('osd-playpause');
        if (!pp) return;
        if (window.IPTV && window.IPTV.Icons) {
            pp.innerHTML = window.IPTV.Icons.get(isPlaying ? 'pause' : 'play', 'osd-svg-icon');
        } else {
            pp.textContent = isPlaying ? '⏸' : '▶';
        }
    },

    updateProgressUI(player, currentTime, duration) {
        if (!duration || isNaN(duration) || !isFinite(duration) || duration <= 0) return;
        const pct = Math.max(0, Math.min(100, (currentTime / duration) * 100));
        const els = this.osdEls(player);
        if (els.fill) els.fill.style.width = `${pct}%`;
        if (els.thumb) els.thumb.style.left = `${pct}%`;
        if (els.cur) els.cur.textContent = this.fmtTime(currentTime, duration);
        if (els.dur) els.dur.textContent = this.fmtTime(duration, duration);
        if (els.bar) els.bar.setAttribute('aria-valuenow', Math.round(pct).toString());
    },

    updateProgress(player) {
        if (!player.video || !player.isOSDVisible()) return;

        const els = this.osdEls(player);
        const bar = els.bar;
        const fill = els.fill;
        const thumb = els.thumb;
        const cur = els.cur;
        const dur = els.dur;

        if (player.isLiveStream()) {
            if (fill) fill.style.width = '100%';
            if (thumb) thumb.style.left = '100%';
            if (cur) cur.textContent = 'LIVE';
            if (dur) {
                dur.innerHTML = (window.IPTV && window.IPTV.Icons)
                    ? window.IPTV.Icons.get('liveDot', 'osd-live-svg') + '<span>LIVE</span>'
                    : 'LIVE';
            }
            if (bar) {
                bar.setAttribute('aria-valuenow', '100');
                bar.removeAttribute('tabindex');
            }
            return;
        }

        // Movie or Series (VOD)
        if (bar && !bar.hasAttribute('tabindex')) {
            bar.setAttribute('tabindex', '0');
        }

        // Do not overwrite user preview if dragging/scrubbing
        if (bar && bar.classList.contains('scrubbing')) {
            return;
        }

        if (!player.canSeek()) {
            if (fill) fill.style.width = '0%';
            if (thumb) thumb.style.left = '0%';
            if (cur) cur.textContent = '00:00';
            if (dur) dur.textContent = '--:--';
            return;
        }

        this.updateProgressUI(player, player.video.currentTime || 0, player.video.duration);
    },

    showSeekHUD(player, icon, text, time) {
        const hud = document.getElementById('seek-hud');
        if (!hud) return;
        const iconEl = document.getElementById('seek-hud-icon');
        const textEl = document.getElementById('seek-hud-text');
        const timeEl = document.getElementById('seek-hud-time');

        if (iconEl) {
            if (window.IPTV && window.IPTV.Icons) {
                const mapped = icon === '⏩' ? 'ff' : (icon === '⏪' ? 'rw' : (icon === '▶' ? 'play' : (icon === '⏸' ? 'pause' : icon)));
                iconEl.innerHTML = window.IPTV.Icons.get(mapped, 'hud-svg-icon');
            } else {
                iconEl.textContent = icon || '⏩';
            }
        }
        if (textEl) textEl.textContent = text || '';
        if (timeEl) timeEl.textContent = time || '';

        hud.classList.remove('hidden');
        clearTimeout(player.seekHudTimeout);
        player.seekHudTimeout = setTimeout(() => {
            hud.classList.add('hidden');
        }, 1600);
    },

    isVisible(player) {
        return !!(player.osd && !player.osd.classList.contains('hidden'));
    },

    show(player) {
        if (!player.osd) return;
        player.osd.classList.remove('hidden');

        // Update title and clock
        const titleEl = document.getElementById('osd-channel-name');
        if (titleEl && player.currentItem) titleEl.textContent = player.currentItem.name || '';

        const clockEl = document.getElementById('osd-clock');
        if (clockEl) {
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // Toggle buttons: Prev/Next for Live TV or Series, Rewind/Forward for Movies & Series
        const isLive = player.isLiveStream();
        const prevBtn = document.getElementById('osd-prev');
        const nextBtn = document.getElementById('osd-next');
        const rwBtn = document.getElementById('osd-rw');
        const ffBtn = document.getElementById('osd-ff');
        const channelsBtn = document.getElementById('osd-channels-btn');

        if (isLive) {
            if (channelsBtn) channelsBtn.style.display = '';
            if (prevBtn) {
                prevBtn.style.display = '';
                prevBtn.title = 'Previous Channel';
            }
            if (nextBtn) {
                nextBtn.style.display = '';
                nextBtn.title = 'Next Channel';
            }
            if (rwBtn) rwBtn.style.display = 'none';
            if (ffBtn) ffBtn.style.display = 'none';
        } else if (player.currentItem && player.currentItem.type === 'series') {
            if (channelsBtn) channelsBtn.style.display = 'none';
            if (rwBtn) rwBtn.style.display = '';
            if (ffBtn) ffBtn.style.display = '';

            const { hasPrev, hasNext } = player._getSeriesAdjacentEpisodes();
            if (prevBtn) {
                prevBtn.style.display = hasPrev ? '' : 'none';
                prevBtn.title = 'Previous Episode';
            }
            if (nextBtn) {
                nextBtn.style.display = hasNext ? '' : 'none';
                nextBtn.title = 'Next Episode';
            }
        } else {
            // Movie
            if (channelsBtn) channelsBtn.style.display = 'none';
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (rwBtn) rwBtn.style.display = '';
            if (ffBtn) ffBtn.style.display = '';
        }

        player.updateFavoriteState();
        player._updateProgress();
        player.autoHideOSD();
    },

    updateFavoriteState(player) {
        const favBtn = document.getElementById('osd-fav');
        if (!favBtn || !player.currentItem) return;
        const isFav = window.IPTV.CatalogStore.isFavorite(player.currentItem);
        favBtn.classList.toggle('active', isFav);
        favBtn.title = isFav ? 'Remove from Favorites (Press F on remote)' : 'Add to Favorites (Press F on remote)';
    },

    hide(player) {
        if (player.osd) player.osd.classList.add('hidden');
        clearTimeout(player.osdTimeout);
    },

    toggle(player) {
        if (player.isOSDVisible()) {
            player.hideOSD();
        } else {
            player.showOSD();
        }
    },

    autoHide(player) {
        clearTimeout(player.osdTimeout);
        if (player.isChannelDrawerOpen) return;
        player.osdTimeout = setTimeout(() => player.hideOSD(), 4000);
    },

    showBanner(player, item) {
        if (!player.banner) return;
        const logo = document.getElementById('banner-logo');
        if (logo) {
            logo.src = item.logo || item.poster || '';
            logo.style.display = (item.logo || item.poster) ? 'block' : 'none';
        }

        const nameEl = document.getElementById('banner-name');
        if (nameEl) nameEl.textContent = item.name || '';

        const progEl = document.getElementById('banner-program');
        if (progEl) progEl.textContent = item.category || '';

        player.banner.classList.remove('hidden');
        clearTimeout(player.bannerTimeout);
        player.bannerTimeout = setTimeout(() => player.banner.classList.add('hidden'), 3500);
    },

    navigate(player, dir) {
        // If OSD is currently hidden:
        if (!player.isOSDVisible()) {
            if (dir === 'left') {
                player.seekRelative(-10);
                player.showOSD();
                return;
            }
            if (dir === 'right') {
                player.seekRelative(10);
                player.showOSD();
                return;
            }
            player.showOSD();
            const playPause = document.getElementById('osd-playpause');
            if (playPause) playPause.focus();
            return;
        }

        // OSD is visible: reset auto-hide timer
        player.autoHideOSD();

        const topBtns = [
            document.getElementById('player-back'),
            document.getElementById('osd-channels-btn'),
            document.getElementById('osd-fav')
        ].filter(b => b && b.style.display !== 'none');

        const progressBar = document.getElementById('osd-progress-bar') || document.querySelector('.progress-bar');
        const bottomBtns = [
            document.getElementById('osd-prev'),
            document.getElementById('osd-rw'),
            document.getElementById('osd-playpause'),
            document.getElementById('osd-ff'),
            document.getElementById('osd-next')
        ].filter(b => b && b.style.display !== 'none');

        const active = document.activeElement;

        // If focus is not currently inside OSD controls, focus default (Play/Pause)
        if (!active || !player.osd || !player.osd.contains(active)) {
            const defaultTarget = document.getElementById('osd-playpause') || bottomBtns[0];
            if (defaultTarget) defaultTarget.focus();
            return;
        }

        // Tier 1: Active is in Top Bar Buttons
        const topIdx = topBtns.indexOf(active);
        if (topIdx >= 0) {
            if (dir === 'left' && topIdx > 0) {
                topBtns[topIdx - 1].focus();
                return;
            }
            if (dir === 'right' && topIdx < topBtns.length - 1) {
                topBtns[topIdx + 1].focus();
                return;
            }
            if (dir === 'down') {
                if (progressBar && !player.isLiveStream()) {
                    progressBar.focus();
                } else {
                    const pp = document.getElementById('osd-playpause') || bottomBtns[0];
                    if (pp) pp.focus();
                }
                return;
            }
            return;
        }

        // Tier 2: Active is Middle Progress Bar
        if (active === progressBar || (progressBar && progressBar.contains(active))) {
            if (dir === 'up') {
                if (topBtns.length > 0) topBtns[0].focus();
                return;
            }
            if (dir === 'down') {
                const pp = document.getElementById('osd-playpause') || bottomBtns[0];
                if (pp) pp.focus();
                return;
            }
            if (dir === 'left') {
                player.seekRelative(-10);
                return;
            }
            if (dir === 'right') {
                player.seekRelative(10);
                return;
            }
            return;
        }

        // Tier 3: Active is one of the Bottom Transport Buttons
        const idx = bottomBtns.indexOf(active);
        if (idx >= 0) {
            if (dir === 'up') {
                if (progressBar && !player.isLiveStream()) {
                    progressBar.focus();
                } else if (topBtns.length > 0) {
                    topBtns[0].focus();
                }
                return;
            }
            if (dir === 'left') {
                if (idx > 0) {
                    bottomBtns[idx - 1].focus();
                }
                return;
            }
            if (dir === 'right') {
                if (idx < bottomBtns.length - 1) {
                    bottomBtns[idx + 1].focus();
                }
                return;
            }
        }
    },

    bindScrubbing(player) {
        const progressBar = document.getElementById('osd-progress-bar');
        if (!progressBar) return;

        let isDragging = false;
        let pendingRatio = null;

        const getRatioFromEvent = (e) => {
            const rect = progressBar.getBoundingClientRect();
            const clientX = (e.clientX !== undefined)
                ? e.clientX
                : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            return Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
        };

        const updateScrubPreview = (ratio) => {
            if (!player.canSeek()) return;
            const targetTime = ratio * player.video.duration;
            player._updateProgressUI(targetTime, player.video.duration);
            const bubble = document.getElementById('osd-scrub-bubble');
            if (bubble) {
                bubble.textContent = player._fmtTime(targetTime);
                bubble.style.opacity = '1';
            }
            player.showSeekHUD(
                'seekPin',
                player._fmtTime(targetTime),
                `${player._fmtTime(targetTime)} / ${player._fmtTime(player.video.duration)}`
            );
        };

        const onStart = (e) => {
            if (!player.canSeek()) return;
            if (e.button !== undefined && e.button !== 0) return;
            isDragging = true;
            player._isProgressBarDragging = true;
            clearTimeout(player.osdTimeout);
            progressBar.classList.add('scrubbing');
            pendingRatio = getRatioFromEvent(e);
            updateScrubPreview(pendingRatio);

            const onMove = (ev) => {
                if (!isDragging) return;
                clearTimeout(player.osdTimeout);
                pendingRatio = getRatioFromEvent(ev);
                updateScrubPreview(pendingRatio);
            };

            const onEnd = () => {
                window.removeEventListener('mousemove', onMove, true);
                window.removeEventListener('mouseup', onEnd, true);
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onEnd);

                if (!isDragging) return;
                isDragging = false;
                player._isProgressBarDragging = false;
                progressBar.classList.remove('scrubbing');

                const bubble = document.getElementById('osd-scrub-bubble');
                if (bubble) bubble.style.opacity = '';

                if (pendingRatio !== null && player.canSeek()) {
                    const targetTime = pendingRatio * player.video.duration;
                    pendingRatio = null;
                    player.seekTo(targetTime, true);
                }
                player.autoHideOSD();
            };

            window.addEventListener('mousemove', onMove, true);
            window.addEventListener('mouseup', onEnd, true);
            window.addEventListener('touchmove', onMove, { passive: true });
            window.addEventListener('touchend', onEnd);
        };

        progressBar.addEventListener('mousedown', onStart);
        progressBar.addEventListener('touchstart', onStart, { passive: true });

        progressBar.addEventListener('click', (e) => {
            if (!player.canSeek()) return;
            const ratio = getRatioFromEvent(e);
            const targetTime = ratio * player.video.duration;
            player.seekTo(targetTime, true);
            player.autoHideOSD();
        });

        progressBar.addEventListener('mousemove', (e) => {
            if (!isDragging && player.canSeek()) {
                player.autoHideOSD();
                const ratio = getRatioFromEvent(e);
                const targetTime = ratio * player.video.duration;
                const bubble = document.getElementById('osd-scrub-bubble');
                if (bubble) {
                    bubble.textContent = player._fmtTime(targetTime);
                    bubble.style.opacity = '1';
                }
            }
        });

        progressBar.addEventListener('mouseleave', () => {
            if (!isDragging) {
                const bubble = document.getElementById('osd-scrub-bubble');
                if (bubble) bubble.style.opacity = '';
            }
        });
    }
};

