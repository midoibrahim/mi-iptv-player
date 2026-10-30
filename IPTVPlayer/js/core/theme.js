/* ============================================================
   IPTV Player — Theme Manager
   Centralized Theme Engine & Palette Swapper
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.ThemeManager = {
    THEMES: [
        { id: 'oled',     name: 'OLED Pure Black (Default)' },
        { id: 'midnight', name: 'Midnight Blue' },
        { id: 'emerald',  name: 'Emerald Cinema' },
        { id: 'crimson',  name: 'Crimson Pulse' }
    ],

    init() {
        const savedTheme = this.getSavedTheme();
        this.applyTheme(savedTheme);
    },

    getSavedTheme() {
        try {
            return localStorage.getItem('iptv_theme') || 'oled';
        } catch(e) {
            return 'oled';
        }
    },

    applyTheme(themeId) {
        const valid = this.THEMES.some(t => t.id === themeId);
        const activeTheme = valid ? themeId : 'oled';
        
        document.documentElement.setAttribute('data-theme', activeTheme);
        if (document.body) {
            document.body.setAttribute('data-theme', activeTheme);
        }
        try {
            localStorage.setItem('iptv_theme', activeTheme);
        } catch(e) {}
    },

    getThemes() {
        return this.THEMES;
    }
};
