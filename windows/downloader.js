// ============================================================
// MI IPTV Player — Desktop Windows Downloader Engine
// Background HTTP/HTTPS Streaming, Queue & Concurrency Management,
// Directory Selection, History Persistence & Windows Shell Integration.
// ============================================================

const { app, dialog, shell, powerSaveBlocker } = require('electron');
const fs = require('fs');
const path = require('path');
const {
    ensureDir,
    sanitizeFileName,
    formatBytes,
    resolveDownloadTarget,
    serializeTask,
    remuxToMp4,
    matchesDownloadItem,
    removeSegmentMeta
} = require('./downloadUtils');
const { DownloadPersistence } = require('./downloadPersistence');
const { abortTaskSockets, executeHttpTransfer } = require('./httpTransfer');

class Downloader {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.settingsPath = path.join(this.userDataPath, 'download-settings.json');
        this.historyPath = path.join(this.userDataPath, 'download-history.json');

        this.defaultDownloadDir = path.join(app.getPath('downloads'), 'MI IPTV Downloads');
        this.persistence = new DownloadPersistence(this.settingsPath, this.historyPath, this.defaultDownloadDir);
        this.settings = this._loadSettings();
        this.history = this._loadHistory();

        this.activeDownloads = new Map();
        this.mainWindow = null;
        this._powerBlockerId = null;
        this._watchdogTimer = null;

        this._ensureDir(this.settings.saveDirectory);
    }

    _hasActiveWork() {
        for (const task of this.activeDownloads.values()) {
            if (task.status === 'downloading' || task.status === 'queued' || task.status === 'converting') {
                return true;
            }
        }
        return false;
    }

    _syncPowerSaveBlocker() {
        if (this._hasActiveWork()) {
            if (this._powerBlockerId === null || !powerSaveBlocker.isStarted(this._powerBlockerId)) {
                try {
                    this._powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
                    console.log('[Downloader] PowerSaveBlocker started (prevent-app-suspension), id:', this._powerBlockerId);
                } catch (e) {
                    console.warn('[Downloader] Failed to start PowerSaveBlocker:', e.message);
                }
            }
            if (!this._watchdogTimer) {
                this._watchdogTimer = setInterval(() => this._checkStalledDownloads(), 5000);
            }
        } else {
            if (this._powerBlockerId !== null) {
                try {
                    if (powerSaveBlocker.isStarted(this._powerBlockerId)) {
                        powerSaveBlocker.stop(this._powerBlockerId);
                        console.log('[Downloader] PowerSaveBlocker stopped');
                    }
                } catch (e) {}
                this._powerBlockerId = null;
            }
            if (this._watchdogTimer) {
                clearInterval(this._watchdogTimer);
                this._watchdogTimer = null;
            }
        }
    }

    _abortTaskSockets(task) {
        abortTaskSockets(task);
    }

    _checkStalledDownloads() {
        const now = Date.now();
        for (const task of this.activeDownloads.values()) {
            if (task.status === 'downloading' && !task.retryTimer && (now - task.lastDataTime > 25000)) {
                console.warn(`[Downloader] Watchdog detected stalled download (${task.fileName}), reconnecting...`);
                this._abortTaskSockets(task);
                this._handleTransientOrFatalError(task, new Error('Download stalled (no data for 25s)'));
            }
        }
    }

    recoverStalledDownloads() {
        const now = Date.now();
        for (const task of this.activeDownloads.values()) {
            if (task.status === 'downloading' && !task.retryTimer && (!task.request || (now - task.lastDataTime > 8000))) {
                console.log(`[Downloader] Recovering download after wake/unlock: ${task.fileName}`);
                this._abortTaskSockets(task);
                task.lastDataTime = now;
                task.speedFormatted = 'Resuming...';
                this._sendToRenderer('download-progress', this._serializeTask(task));
                this._executeDownload(task);
            }
        }
        this._processQueue();
        this._syncPowerSaveBlocker();
    }

    shutdown() {
        if (this._watchdogTimer) {
            clearInterval(this._watchdogTimer);
            this._watchdogTimer = null;
        }
        for (const task of this.activeDownloads.values()) {
            if (task.retryTimer) {
                clearTimeout(task.retryTimer);
                task.retryTimer = null;
            }
        }
        if (this._powerBlockerId !== null) {
            try {
                if (powerSaveBlocker.isStarted(this._powerBlockerId)) {
                    powerSaveBlocker.stop(this._powerBlockerId);
                }
            } catch (e) {}
            this._powerBlockerId = null;
        }
        this.persistence.flushIfDirty(this.settings, this.history);
    }

    setMainWindow(win) {
        this.mainWindow = win;
    }

    _ensureDir(dirPath) {
        ensureDir(dirPath);
    }

    _loadSettings() {
        return this.persistence.loadSettings();
    }

    _saveSettings(sync = false) {
        this.persistence.saveSettings(this.settings, sync);
    }

    _loadHistory() {
        return this.persistence.loadHistory();
    }

    _saveHistory(sync = false) {
        this.persistence.saveHistory(this.history, sync);
    }

    _sanitizeFileName(name) {
        return sanitizeFileName(name);
    }

    _formatBytes(bytes) {
        return formatBytes(bytes);
    }

    _sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    getSettings() {
        return {
            saveDirectory: this.settings.saveDirectory,
            askEveryTime: Boolean(this.settings.askEveryTime),
            autoConvertToMp4: this.settings.autoConvertToMp4 !== false,
            maxConcurrent: Math.max(1, parseInt(this.settings.maxConcurrent, 10) || 1)
        };
    }

    updateSettings(newSettings) {
        if (newSettings.saveDirectory && typeof newSettings.saveDirectory === 'string') {
            this._ensureDir(newSettings.saveDirectory);
            this.settings.saveDirectory = newSettings.saveDirectory;
        }
        if (typeof newSettings.askEveryTime === 'boolean') {
            this.settings.askEveryTime = newSettings.askEveryTime;
        }
        if (typeof newSettings.autoConvertToMp4 === 'boolean') {
            this.settings.autoConvertToMp4 = newSettings.autoConvertToMp4;
        }
        if (typeof newSettings.maxConcurrent === 'number') {
            this.settings.maxConcurrent = Math.max(1, Math.min(10, newSettings.maxConcurrent));
            this._processQueue();
        }
        this._saveSettings();
        return this.getSettings();
    }

    async selectDirectory() {
        const win = this.mainWindow || null;
        const res = await dialog.showOpenDialog(win, {
            title: 'Select Destination Folder for Downloads',
            defaultPath: this.settings.saveDirectory || this.defaultDownloadDir,
            properties: ['openDirectory', 'createDirectory']
        });

        if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
            const chosenDir = res.filePaths[0];
            this.updateSettings({ saveDirectory: chosenDir });
            return { canceled: false, path: chosenDir };
        }
        return { canceled: true, path: this.settings.saveDirectory };
    }

    openFolder(dirPath) {
        const target = dirPath || this.settings.saveDirectory;
        if (fs.existsSync(target)) {
            shell.openPath(target);
            return true;
        }
        return false;
    }

    showInFolder(filePath) {
        if (filePath && fs.existsSync(filePath)) {
            shell.showItemInFolder(filePath);
            return true;
        }
        return false;
    }

    openFile(filePath) {
        if (filePath && fs.existsSync(filePath)) {
            shell.openPath(filePath);
            return true;
        }
        return false;
    }

    getAll() {
        const activeList = Array.from(this.activeDownloads.values()).map(t => this._serializeTask(t));

        this.history.forEach(item => {
            item.status = 'completed';
            item.percent = 100;
            item.existsOnDisk = Boolean(item.filePath && fs.existsSync(item.filePath));
            item.isUniversalMp4 = Boolean(item.filePath && path.extname(item.filePath).toLowerCase() === '.mp4');
        });

        return {
            settings: this.getSettings(),
            active: activeList,
            history: this.history
        };
    }

    isDownloading(urlOrId) {
        if (!urlOrId) return false;
        for (const task of this.activeDownloads.values()) {
            if (matchesDownloadItem(task, urlOrId)) {
                return true;
            }
        }
        return false;
    }

    isCompleted(urlOrId) {
        if (!urlOrId) return false;
        return this.history.some(h => Boolean(h.filePath && fs.existsSync(h.filePath) && matchesDownloadItem(h, urlOrId)));
    }

    _runningCount() {
        let count = 0;
        for (const task of this.activeDownloads.values()) {
            if (task.status === 'downloading' || task.status === 'converting') {
                count++;
            }
        }
        return count;
    }

    _processQueue() {
        let runningCount = this._runningCount();
        const maxParallel = Math.max(1, parseInt(this.settings.maxConcurrent, 10) || 1);

        if (runningCount < maxParallel) {
            for (const task of this.activeDownloads.values()) {
                if (task.status === 'queued') {
                    task.status = 'downloading';
                    task.lastDataTime = Date.now();
                    task.speedFormatted = 'Connecting...';
                    this._sendToRenderer('download-progress', this._serializeTask(task));
                    this._executeDownload(task);
                    runningCount++;
                    if (runningCount >= maxParallel) break;
                }
            }
        }
        this._syncPowerSaveBlocker();
    }

    _remuxToMp4(inputPath, callback) {
        return remuxToMp4(inputPath, callback);
    }

    async convertItemToMp4(id) {
        const item = this.history.find(h => h.id === id);
        if (!item || !item.filePath || !fs.existsSync(item.filePath)) {
            return { success: false, error: 'File not found on disk' };
        }
        if (path.extname(item.filePath).toLowerCase() === '.mp4') {
            return { success: true, message: 'Already MP4', filePath: item.filePath };
        }

        return new Promise((resolve) => {
            this._sendToRenderer('download-converting', { id, status: 'converting' });
            this._remuxToMp4(item.filePath, (err, newPath) => {
                if (err || !fs.existsSync(newPath) || path.extname(newPath).toLowerCase() !== '.mp4') {
                    this._sendToRenderer('download-history-updated', this.history);
                    return resolve({ success: false, error: 'Remux failed. Verify ffmpeg is installed.' });
                }

                try {
                    const stat = fs.statSync(newPath);
                    item.filePath = newPath;
                    item.fileName = path.basename(newPath);
                    item.fileSize = stat.size;
                    item.fileSizeFormatted = this._formatBytes(stat.size);
                    item.isUniversalMp4 = true;
                    this._saveHistory();
                    this._sendToRenderer('download-history-updated', this.history);
                    resolve({ success: true, filePath: newPath });
                } catch (statErr) {
                    resolve({ success: false, error: statErr.message });
                }
            });
        });
    }

    async startDownload(item, options = {}) {
        if (!item || !item.url) {
            throw new Error('Invalid download item: URL is required');
        }

        if (this.isDownloading(item.url) || (item.id && this.isDownloading(item.id))) {
            console.log('[Downloader] Download already active for: ' + (item.url || item.id));
            return { alreadyActive: true };
        }

        const existingInHistory = this.history.find(h => Boolean(
            h.filePath && fs.existsSync(h.filePath) && matchesDownloadItem(h, item)
        ));
        if (existingInHistory && !options.forceRedownload) {
            console.log('[Downloader] File already downloaded on disk: ' + existingInHistory.filePath);
            return { alreadyDownloaded: true, filePath: existingInHistory.filePath, id: existingInHistory.id };
        }

        let baseDir = options.targetDir;
        if (!baseDir && this.settings.askEveryTime && !options.skipPrompt) {
            const sel = await this.selectDirectory();
            if (sel.canceled) {
                return { canceled: true };
            }
            baseDir = sel.path;
        }
        baseDir = baseDir || this.settings.saveDirectory;
        this._ensureDir(baseDir);

        const { targetDir, finalFileName, targetPath, partPath } = resolveDownloadTarget(baseDir, item, options);
        const downloadId = 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

        const maxParallel = Math.max(1, parseInt(this.settings.maxConcurrent, 10) || 1);
        const shouldQueue = this._runningCount() >= maxParallel;

        const task = {
            id: downloadId,
            itemId: item.id,
            title: item.title || item.name || finalFileName,
            seriesName: item.seriesName || null,
            season: item.season || null,
            episode: item.episode || null,
            fileName: finalFileName,
            filePath: targetPath,
            partPath: partPath,
            metaPath: partPath + '.meta.json',
            url: item.url,
            resolvedUrl: null,
            poster: item.poster || item.logo || '',
            type: item.type || 'movie',
            targetDir: targetDir,
            totalBytes: 0,
            receivedBytes: 0,
            percent: 0,
            speedBps: 0,
            speedFormatted: shouldQueue ? 'In Queue' : '0 B/s',
            status: shouldQueue ? 'queued' : 'downloading',
            error: null,
            startTime: Date.now(),
            lastDataTime: Date.now(),
            lastReportTime: Date.now(),
            lastReportBytes: 0,
            lastMetaSave: 0,
            retryCount: 0,
            maxRetries: 10,
            retryTimer: null,
            maxConnections: 1,
            segments: null,
            request: null,
            fileStream: null
        };

        this.activeDownloads.set(downloadId, task);
        this._sendToRenderer('download-started', this._serializeTask(task));
        this._syncPowerSaveBlocker();

        if (!shouldQueue) {
            this._executeDownload(task);
        }

        return { canceled: false, task: this._serializeTask(task) };
    }

    async startBatchDownloads(items, options = {}) {
        if (!Array.isArray(items) || items.length === 0) {
            return { canceled: false, count: 0 };
        }

        let baseDir = options.targetDir;
        if (!baseDir && this.settings.askEveryTime) {
            const sel = await this.selectDirectory();
            if (sel.canceled) return { canceled: true, count: 0 };
            baseDir = sel.path;
        }
        baseDir = baseDir || this.settings.saveDirectory;

        const added = [];
        for (const item of items) {
            if (
                this.isDownloading(item.url) ||
                (item.id && this.isDownloading(item.id)) ||
                this.isCompleted(item.url) ||
                (item.id && this.isCompleted(item.id))
            ) {
                continue;
            }
            const res = await this.startDownload(item, { ...options, targetDir: baseDir, skipPrompt: true });
            if (res && res.task) {
                added.push(res.task);
            }
        }

        this._processQueue();
        return { canceled: false, count: added.length, tasks: added };
    }

    _serializeTask(task) {
        return serializeTask(task);
    }

    _removeSegmentMeta(task) {
        return removeSegmentMeta(task);
    }

    _reportProgress(task, force = false) {
        const now = Date.now();
        const deltaMs = now - task.lastReportTime;
        if (!force && deltaMs < 350) return;

        if (deltaMs > 0) {
            const deltaBytes = Math.max(0, task.receivedBytes - task.lastReportBytes);
            task.speedBps = Math.round((deltaBytes / deltaMs) * 1000);
            task.speedFormatted = this._formatBytes(task.speedBps) + '/s';
        }

        if (task.totalBytes > 0) {
            task.percent = Math.min(100, Math.round((task.receivedBytes / task.totalBytes) * 100));
        }

        task.lastReportTime = now;
        task.lastReportBytes = task.receivedBytes;
        this._sendToRenderer('download-progress', this._serializeTask(task));
    }

    _completeTask(task) {
        if (task.status !== 'downloading') return;
        this._removeSegmentMeta(task);

        try {
            if (fs.existsSync(task.partPath)) {
                fs.renameSync(task.partPath, task.filePath);
            }
        } catch (renErr) {
            return this._handleError(task, new Error('Failed to finalize file: ' + renErr.message));
        }

        const finalizeHistory = (finalPath) => {
            const stat = fs.existsSync(finalPath) ? fs.statSync(finalPath) : null;
            const finalSize = stat ? stat.size : (task.receivedBytes || task.totalBytes);

            task.status = 'completed';
            task.percent = 100;
            task.speedBps = 0;
            task.speedFormatted = 'Completed';
            task.filePath = finalPath;
            task.fileName = path.basename(finalPath);

            const historyItem = {
                id: task.id,
                itemId: task.itemId,
                title: task.title,
                seriesName: task.seriesName,
                season: task.season,
                episode: task.episode,
                fileName: path.basename(finalPath),
                filePath: finalPath,
                fileSize: finalSize,
                fileSizeFormatted: this._formatBytes(finalSize),
                poster: task.poster,
                type: task.type,
                url: task.url,
                status: 'completed',
                percent: 100,
                completedAt: Date.now(),
                existsOnDisk: true,
                isUniversalMp4: path.extname(finalPath).toLowerCase() === '.mp4'
            };

            this.history.unshift(historyItem);
            if (this.history.length > 150) this.history.pop();
            this._saveHistory();

            this.activeDownloads.delete(task.id);
            this._sendToRenderer('download-completed', historyItem);
            console.log(`[Downloader] Download completed & ready: ${historyItem.fileName}`);

            this._processQueue();
        };

        if (this.settings.autoConvertToMp4 !== false && path.extname(task.filePath).toLowerCase() !== '.mp4') {
            task.status = 'converting';
            task.speedFormatted = 'Optimizing for TV/Receiver (MP4)...';
            this._sendToRenderer('download-progress', this._serializeTask(task));

            this._remuxToMp4(task.filePath, (_err, convertedPath) => {
                finalizeHistory(convertedPath);
            });
        } else {
            finalizeHistory(task.filePath);
        }
    }

    _executeDownload(task, redirectCount = 0, currentUrl = null, disableRange = false) {
        executeHttpTransfer(task, {
            onProgress: (t) => this._reportProgress(t),
            onComplete: (t) => this._completeTask(t),
            onTransientError: (t, err) => this._handleTransientOrFatalError(t, err),
            onFatalError: (t, err) => this._handleError(t, err)
        }, { redirectCount, currentUrl, disableRange });
    }

    _handleTransientOrFatalError(task, error) {
        if (task.status !== 'downloading') return;

        this._abortTaskSockets(task);

        if (task.retryCount < (task.maxRetries || 10)) {
            this._scheduleRetry(task, error);
        } else {
            this._handleError(task, error);
        }
    }

    _scheduleRetry(task, error) {
        if (task.status !== 'downloading') return;
        if (task.retryTimer) {
            clearTimeout(task.retryTimer);
            task.retryTimer = null;
        }

        task.retryCount = (task.retryCount || 0) + 1;
        const maxRetries = task.maxRetries || 10;
        const delayMs = Math.min(10000, 2000 * task.retryCount);

        console.warn(`[Downloader] Transient error on ${task.fileName} (${error.message}). Retrying ${task.retryCount}/${maxRetries} in ${delayMs}ms...`);
        task.speedBps = 0;
        task.speedFormatted = `Reconnecting (${task.retryCount}/${maxRetries})...`;
        this._sendToRenderer('download-progress', this._serializeTask(task));

        task.retryTimer = setTimeout(() => {
            task.retryTimer = null;
            if (task.status === 'downloading') {
                this._executeDownload(task);
            }
        }, delayMs);
    }

    _handleError(task, error) {
        if (task.status === 'cancelled' || task.status === 'paused') return;

        if (task.retryTimer) {
            clearTimeout(task.retryTimer);
            task.retryTimer = null;
        }

        console.error(`[Downloader] Error in task ${task.id} (${task.fileName}):`, error.message);
        task.status = 'failed';
        task.error = error.message;

        this._abortTaskSockets(task);

        const serialized = this._serializeTask(task);
        this.activeDownloads.delete(task.id);
        this._sendToRenderer('download-failed', serialized);

        this._processQueue();
    }

    pauseDownload(id) {
        const task = this.activeDownloads.get(id);
        if (!task || task.status !== 'downloading') return false;

        task.status = 'paused';
        task.speedBps = 0;
        task.speedFormatted = 'Paused';

        if (task.retryTimer) {
            clearTimeout(task.retryTimer);
            task.retryTimer = null;
        }
        this._abortTaskSockets(task);

        this._sendToRenderer('download-paused', this._serializeTask(task));
        this._processQueue();
        return true;
    }

    resumeDownload(id) {
        const task = this.activeDownloads.get(id);
        if (!task || (task.status !== 'paused' && task.status !== 'queued')) return false;

        task.retryCount = 0;
        task.lastDataTime = Date.now();

        const maxParallel = Math.max(1, parseInt(this.settings.maxConcurrent, 10) || 1);
        if (this._runningCount() < maxParallel) {
            task.status = 'downloading';
            task.speedFormatted = 'Resuming...';
            this._sendToRenderer('download-resumed', this._serializeTask(task));
            this._executeDownload(task);
        } else {
            task.status = 'queued';
            task.speedFormatted = 'In Queue';
            this._sendToRenderer('download-progress', this._serializeTask(task));
        }
        this._syncPowerSaveBlocker();
        return true;
    }

    cancelDownload(id) {
        const task = this.activeDownloads.get(id);
        if (!task) return false;

        task.status = 'cancelled';

        if (task.retryTimer) {
            clearTimeout(task.retryTimer);
            task.retryTimer = null;
        }
        this._abortTaskSockets(task);
        this._removeSegmentMeta(task);

        try {
            if (fs.existsSync(task.partPath)) {
                fs.unlinkSync(task.partPath);
            }
        } catch (e) {}

        this.activeDownloads.delete(id);
        this._sendToRenderer('download-cancelled', { id });

        this._processQueue();
        return true;
    }

    deleteDownloadedFile(id) {
        const index = this.history.findIndex(h => h.id === id);
        if (index === -1) return false;

        const item = this.history[index];
        if (item.filePath && fs.existsSync(item.filePath)) {
            try {
                fs.unlinkSync(item.filePath);
            } catch (e) {
                console.error('[Downloader] Failed to delete file:', item.filePath, e.message);
            }
        }

        this.history.splice(index, 1);
        this._saveHistory();
        this._sendToRenderer('download-history-updated', this.history);
        return true;
    }

    clearHistory() {
        this.history = [];
        this._saveHistory();
        this._sendToRenderer('download-history-updated', this.history);
        return true;
    }
}

module.exports = new Downloader();
