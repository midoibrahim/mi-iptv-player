/* ============================================================
   MI IPTV Player — Download Settings & History Persistence
   Coalesced async JSON writes with synchronous shutdown flush.
   ============================================================ */

const fs = require('fs');
const path = require('path');

class DownloadPersistence {
    constructor(settingsPath, historyPath, defaultDownloadDir) {
        this.settingsPath = settingsPath;
        this.historyPath = historyPath;
        this.defaultDownloadDir = defaultDownloadDir;
        this._settingsDirty = false;
        this._settingsWriting = false;
        this._historyDirty = false;
        this._historyWriting = false;
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const data = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
                if (data && data.saveDirectory) {
                    return {
                        saveDirectory: data.saveDirectory,
                        askEveryTime: Boolean(data.askEveryTime),
                        autoConvertToMp4: data.autoConvertToMp4 !== false,
                        maxConcurrent: Math.max(1, parseInt(data.maxConcurrent, 10) || 1)
                    };
                }
            }
        } catch (e) {
            console.warn('[DownloadPersistence] Error loading settings, using defaults:', e.message);
        }
        return {
            saveDirectory: this.defaultDownloadDir,
            askEveryTime: false,
            autoConvertToMp4: true,
            maxConcurrent: 1
        };
    }

    saveSettings(settings, sync = false) {
        if (sync || !fs.promises) {
            this._settingsDirty = false;
            try {
                fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            } catch (e) {
                console.error('[DownloadPersistence] Failed to save settings:', e.message);
            }
            return;
        }
        this._latestSettings = settings;
        this._settingsDirty = true;
        if (this._settingsWriting) return;
        this._settingsWriting = true;

        const flush = () => {
            this._settingsDirty = false;
            const payload = JSON.stringify(this._latestSettings, null, 2);
            fs.promises.writeFile(this.settingsPath, payload, 'utf8')
                .catch(e => console.error('[DownloadPersistence] Failed to save settings:', e.message))
                .finally(() => {
                    if (this._settingsDirty) {
                        flush();
                    } else {
                        this._settingsWriting = false;
                    }
                });
        };
        flush();
    }

    loadHistory() {
        try {
            if (fs.existsSync(this.historyPath)) {
                const list = JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
                if (Array.isArray(list)) {
                    return list.map(item => ({
                        ...item,
                        existsOnDisk: fs.existsSync(item.filePath),
                        isUniversalMp4: Boolean(item.filePath && path.extname(item.filePath).toLowerCase() === '.mp4')
                    }));
                }
            }
        } catch (e) {
            console.warn('[DownloadPersistence] Error loading history:', e.message);
        }
        return [];
    }

    saveHistory(history, sync = false) {
        if (sync || !fs.promises) {
            this._historyDirty = false;
            try {
                fs.writeFileSync(this.historyPath, JSON.stringify(history, null, 2), 'utf8');
            } catch (e) {
                console.error('[DownloadPersistence] Failed to save history:', e.message);
            }
            return;
        }
        this._latestHistory = history;
        this._historyDirty = true;
        if (this._historyWriting) return;
        this._historyWriting = true;

        const flush = () => {
            this._historyDirty = false;
            const payload = JSON.stringify(this._latestHistory, null, 2);
            fs.promises.writeFile(this.historyPath, payload, 'utf8')
                .catch(e => console.error('[DownloadPersistence] Failed to save history:', e.message))
                .finally(() => {
                    if (this._historyDirty) {
                        flush();
                    } else {
                        this._historyWriting = false;
                    }
                });
        };
        flush();
    }

    flushIfDirty(settings, history) {
        if (this._settingsDirty) this.saveSettings(settings, true);
        if (this._historyDirty) this.saveHistory(history, true);
    }
}

module.exports = { DownloadPersistence };
