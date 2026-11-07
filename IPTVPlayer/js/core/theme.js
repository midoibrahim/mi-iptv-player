/* ============================================================
   IPTV Player — Theme Manager
   Centralized Theme Engine & Palette Swapper
   Supports: Midnight Signal (Default), Graphite Amber, OLED Mint, Daylight Slate
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.ThemeManager = {
    DEFAULT_THEME: 'midnight-signal',

    LEGACY_MAP: {
        'midnight': 'midnight-signal',
        'oled': 'oled-mint',
        'emerald': 'oled-mint',
        'crimson': 'midnight-signal'
    },

    THEMES: [
        {
            id: 'midnight-signal',
            name: 'Midnight Signal',
            subtitle: 'Default · Deep Navy & Blue',
            bg: '#0B1220',
            surface: '#131C2E',
            card: '#1C2942',
            accent: '#4F8CFF',
            focus: '#8BB4FF',
            text: '#F2F6FF'
        },
        {
            id: 'graphite-amber',
            name: 'Graphite Amber',
            subtitle: 'Cinema Charcoal & Warm Gold',
            bg: '#121214',
            surface: '#1C1C1F',
            card: '#28282D',
            accent: '#FFB020',
            focus: '#FFC85C',
            text: '#F7F4EE'
        },
        {
            id: 'oled-mint',
            name: 'OLED Mint',
            subtitle: 'True Black & Emerald Mint',
            bg: '#000000',
            surface: '#0D1512',
            card: '#152019',
            accent: '#2EE6A8',
            focus: '#63F0C4',
            text: '#EDFFF7'
        },
        {
            id: 'daylight-slate',
            name: 'Daylight Slate',
            subtitle: 'Bright Room · High-Contrast Light',
            bg: '#E9EEF5',
            surface: '#FFFFFF',
            card: '#E3E9F2',
            accent: '#3D5AFE',
            focus: '#637BFF',
            text: '#161B26'
        }
    ],

    init() {
        const savedTheme = this.getSavedTheme();
        this.applyTheme(savedTheme);
    },

    _resolveThemeId(rawId) {
        if (!rawId) return this.DEFAULT_THEME;
        const mapped = this.LEGACY_MAP[rawId] || rawId;
        const valid = this.THEMES.some(t => t.id === mapped);
        return valid ? mapped : this.DEFAULT_THEME;
    },

    getSavedTheme() {
        try {
            const key = (window.IPTV.Storage && window.IPTV.Storage.KEYS && window.IPTV.Storage.KEYS.THEME) || 'iptv_theme';
            const raw = localStorage.getItem(key);
            return this._resolveThemeId(raw);
        } catch (e) {
            return this.DEFAULT_THEME;
        }
    },

    applyTheme(themeId) {
        const activeTheme = this._resolveThemeId(themeId);

        document.documentElement.setAttribute('data-theme', activeTheme);
        if (document.body) {
            document.body.setAttribute('data-theme', activeTheme);
        }
        try {
            const key = (window.IPTV.Storage && window.IPTV.Storage.KEYS && window.IPTV.Storage.KEYS.THEME) || 'iptv_theme';
            localStorage.setItem(key, activeTheme);
        } catch (e) {}
        return activeTheme;
    },

    getThemes() {
        return this.THEMES;
    }
};
