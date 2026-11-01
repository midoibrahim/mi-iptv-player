/* ============================================================
   IPTV Player — Hardware Remote Key Handler & Back Button Stack
   Adheres to TV Navigation Architecture Back Button Protocol
   Supports LG webOS, Samsung Tizen & Standard Remote Keys
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.KeyHandler = {
    init(app) {
        this.app = app;

        // Use capture phase (true) to intercept keys before browser default handling
        window.addEventListener('keydown', (e) => this.handleKeyDown(e), true);

        // Web & TV Browser popstate / navigation handling
        window.addEventListener('popstate', (e) => {
            e.preventDefault();
            this.app.goBack();
            try { history.pushState(null, '', window.location.href); } catch(err) {}
        });
        try { history.pushState(null, '', window.location.href); } catch(err) {}

        // LG webOS TV custom hardware back event
        document.addEventListener('webOSBack', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.app.goBack();
        });

        // Samsung Tizen / Cordova backbutton
        document.addEventListener('backbutton', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.app.goBack();
        });

        // Register keys for Samsung Tizen TV remote (Do NOT register Volume keys - let TV OS handle audio)
        if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
            const keys = [
                "ChannelUp", "ChannelDown", 
                "MediaPlay", "MediaPause", "MediaPlayPause",
                "MediaFastForward", "MediaRewind", "MediaStop"
            ];
            keys.forEach(k => {
                try { tizen.tvinputdevice.registerKey(k); } catch(e) {}
            });
        }
    },

    isBackKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        const eCode = e.code;
        return (
            key === 'Back' ||
            key === 'GoBack' ||
            key === 'Escape' ||
            key === 'Backspace' ||
            key === 'BrowserBack' ||
            key === 'XF86Back' ||
            key === 'U+001B' ||
            eCode === 'Escape' ||
            eCode === 'Backspace' ||
            eCode === 'BrowserBack' ||
            code === 461 ||   // LG webOS remote Back button
            code === 10009 || // Samsung Tizen remote Return
            code === 4 ||     // Android TV KEYCODE_BACK
            code === 27 ||    // Escape
            code === 8 ||     // Backspace
            code === 166      // Browser Back key
        );
    },

    isChannelUp(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        const eCode = e.code;
        return (
            key === 'ChannelUp' ||
            key === 'PageUp' ||
            key === ']' ||
            eCode === 'PageUp' ||
            eCode === 'ChannelUp' ||
            eCode === 'BracketRight' ||
            code === 427 ||  // LG webOS & Tizen ChannelUp
            code === 33 ||   // PageUp
            code === 166 ||  // Android TV KEYCODE_CHANNEL_UP
            code === 221     // BracketRight (])
        );
    },

    isChannelDown(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        const eCode = e.code;
        return (
            key === 'ChannelDown' ||
            key === 'PageDown' ||
            key === '[' ||
            eCode === 'PageDown' ||
            eCode === 'ChannelDown' ||
            eCode === 'BracketLeft' ||
            code === 428 ||  // LG webOS & Tizen ChannelDown
            code === 34 ||   // PageDown
            code === 167 ||  // Android TV KEYCODE_CHANNEL_DOWN
            code === 219     // BracketLeft ([)
        );
    },

    isVolumeUp(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'VolumeUp' ||
            key === 'AudioVolumeUp' ||
            code === 447 ||  // LG webOS & Tizen VolumeUp
            code === 175 ||  // Standard VolumeUp
            code === 24      // Android KEYCODE_VOLUME_UP
        );
    },

    isVolumeDown(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'VolumeDown' ||
            key === 'AudioVolumeDown' ||
            code === 448 ||  // LG webOS & Tizen VolumeDown
            code === 174 ||  // Standard VolumeDown
            code === 25      // Android KEYCODE_VOLUME_DOWN
        );
    },

    isVolumeMute(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'VolumeMute' ||
            key === 'AudioVolumeMute' ||
            code === 449 ||  // LG webOS & Tizen VolumeMute
            code === 173 ||  // Standard VolumeMute
            code === 164     // Android KEYCODE_VOLUME_MUTE
        );
    },

    isPlayKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'MediaPlay' ||
            key === 'Play' ||
            code === 415 // LG webOS & Tizen MediaPlay
        );
    },

    isPauseKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'MediaPause' ||
            key === 'Pause' ||
            code === 19 // LG webOS & Tizen MediaPause
        );
    },

    isPlayPauseKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'MediaPlayPause' ||
            key === 'PlayPause' ||
            key === ' ' || // Spacebar
            key === 'k' ||
            key === 'K' ||
            code === 179 || // MediaPlayPause
            code === 32     // Space
        );
    },

    isForwardKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'MediaFastForward' ||
            key === 'FastForward' ||
            key === 'Forward' ||
            key === 'l' ||
            key === 'L' ||
            code === 417 || // LG webOS & Tizen MediaFastForward
            code === 228    // Android KEYCODE_MEDIA_FAST_FORWARD
        );
    },

    isBackwardKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'MediaRewind' ||
            key === 'Rewind' ||
            key === 'Backward' ||
            key === 'j' ||
            key === 'J' ||
            code === 412 || // LG webOS & Tizen MediaRewind
            code === 227    // Android KEYCODE_MEDIA_REWIND
        );
    },


    isFavoriteKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'f' || key === 'F' ||
            key === 'Favorite' ||
            code === 405 || // Remote Yellow button
            code === 406 || // Remote Blue button
            code === 10182  // Samsung Favorite key
        );
    },

    isChannelListKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return (
            key === 'c' || key === 'C' ||
            key === 'g' || key === 'G' ||
            key === 'ChannelList' ||
            key === 'Guide' ||
            code === 458 || // webOS Guide
            code === 10140  // webOS ChannelList
        );
    },

    isPlayerActive() {
        return !!(
            (this.app && this.app.playerService && this.app.playerService.isVisible()) ||
            document.body.classList.contains('player-active') ||
            (document.getElementById('player-screen') && document.getElementById('player-screen').classList.contains('active'))
        );
    },

    getDirection(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        if (key === 'ArrowUp' || key === 'Up' || code === 38) return 'up';
        if (key === 'ArrowDown' || key === 'Down' || code === 40) return 'down';
        if (key === 'ArrowLeft' || key === 'Left' || code === 37) return 'left';
        if (key === 'ArrowRight' || key === 'Right' || code === 39) return 'right';
        return null;
    },

    isEnterKey(e) {
        const key = e.key;
        const code = e.keyCode || e.which;
        return key === 'Enter' || key === 'OK' || key === 'Select' || code === 13;
    },

    handleKeyDown(e) {
        // ---- 0. TV Hardware Volume (Strict Pass-through to TV Firmware / OS) ----
        // The IPTV app does not control volume at all. Volume is managed entirely by the TV.
        if (this.isVolumeUp(e) || this.isVolumeDown(e) || this.isVolumeMute(e)) {
            return; // Pure pass-through: do not preventDefault or stopPropagation
        }

        // ---- 1. Hardware Back Button Handling ----
        if (this.isBackKey(e)) {
            const active = document.activeElement;
            // If focused in an input field that is currently in typing mode (!readOnly)
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                // If Backspace key is pressed while actively typing, allow normal character deletion
                if ((e.key === 'Backspace' || e.keyCode === 8) && !active.readOnly) {
                    return;
                }
                // If Back button on remote or Escape is pressed while editing an input,
                // dismiss the keyboard, set readOnly back to true, and blur the input without leaving the page
                if (!active.readOnly) {
                    e.preventDefault();
                    e.stopPropagation();
                    active.readOnly = true;
                    active.blur();
                    return;
                }
            }

            e.preventDefault();
            e.stopPropagation();
            this.app.goBack();
            return;
        }

        // ---- 2. Hardware Channel +/- Buttons (Dedicated Next/Previous Channel) ----
        if (this.isChannelUp(e)) {
            if (this.isPlayerActive() && this.app.playerService && this.app.playerService.isChannelDrawerOpen) {
                // Pass to drawer navigation
            } else {
                e.preventDefault();
                e.stopPropagation();
                this.app.nextChannel();
                return;
            }
        }

        if (this.isChannelDown(e)) {
            if (this.isPlayerActive() && this.app.playerService && this.app.playerService.isChannelDrawerOpen) {
                // Pass to drawer navigation
            } else {
                e.preventDefault();
                e.stopPropagation();
                this.app.prevChannel();
                return;
            }
        }

        // ---- 3. Dedicated Favorite Shortcut (F / Yellow / Blue Key on TV Remote) ----
        if (this.isFavoriteKey(e)) {
            const active = document.activeElement;
            // Do not intercept if typing in an input
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !active.readOnly) {
                return;
            }

            // Case A: Playing video
            if (this.isPlayerActive() && this.app.playerService && this.app.playerService.currentItem) {
                e.preventDefault();
                e.stopPropagation();
                this.app.toggleFavorite(this.app.playerService.currentItem);
                if (this.app.playerService.updateFavoriteState) {
                    this.app.playerService.updateFavoriteState();
                }
                return;
            }

            // Case B: Series detail screen
            const seriesScreen = document.getElementById('series-detail-screen');
            if (seriesScreen && seriesScreen.classList.contains('active') && this.app.seriesDetailView && this.app.seriesDetailView.currentSeries) {
                e.preventDefault();
                e.stopPropagation();
                this.app.toggleFavorite(this.app.seriesDetailView.currentSeries);
                if (this.app.seriesDetailView.updateFavoriteState) {
                    this.app.seriesDetailView.updateFavoriteState();
                }
                return;
            }

            // Case C: Focused on a card
            if (active && active.classList.contains('card') && active._item) {
                e.preventDefault();
                e.stopPropagation();
                this.app.toggleFavorite(active._item);
                const nowFav = this.app.isFavorite(active._item);
                if (active._favBtn) active._favBtn.classList.toggle('active', nowFav);
                active.classList.toggle('is-favorited', nowFav);
                return;
            }
        }

        // ---- 4. Player Screen Key Trap (Total Isolation & On-Screen Button Navigation) ----
        if (this.isPlayerActive()) {
            e.preventDefault();
            e.stopPropagation();
            if (this.app.playerService) {
                this.app.playerService.handleKey(e, this);
            }
            return;
        }

        // ---- 5. Smart TV Remote Arrow Key 2D Navigation (Browse Mode) ----
        const dir = this.getDirection(e);
        if (dir) {
            const handled = window.IPTV.SpatialNav.navigate(dir);
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        // ---- 6. Enter / Remote OK Key ----
        if (this.isEnterKey(e)) {
            const active = document.activeElement;
            // If focused on a readonly search/text input, activate typing mode and open TV OSK
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                if (active.readOnly) {
                    e.preventDefault();
                    e.stopPropagation();
                    active.readOnly = false;
                    active.focus();
                    try { active.select(); } catch(err) {}
                    return;
                }
                return;
            }
            if (active && active !== document.body && active.tagName !== 'SELECT' && active.tagName !== 'BUTTON') {
                e.preventDefault();
                e.stopPropagation();
                active.click();
                return;
            }
        }
    },

    exitApp() {
        if (typeof webOS !== 'undefined') {
            try {
                webOS.platformBack();
            } catch(e) {
                try { window.close(); } catch(e2) {}
            }
        }
    }
};
