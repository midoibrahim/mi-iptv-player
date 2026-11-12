// ============================================================
// MI IPTV Player — Desktop Windows Downloader Engine
// Background HTTP/HTTPS Streaming, Queue & Concurrency Management,
// Directory Selection, History Persistence & Windows Shell Integration.
// ============================================================

const { app, dialog, shell, powerSaveBlocker } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const {
    ensureDir,
    sanitizeFileName,
    formatBytes,
    resolveDownloadTarget,
    serializeTask,
    remuxToMp4
} = require('./downloadUtils');

class Downloader {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.settingsPath = path.join(this.userDataPath, 'download-settings.json');
        this.historyPath = path.join(this.userDataPath, 'download-history.json');

        this.defaultDownloadDir = path.join(app.getPath('downloads'), 'MI IPTV Downloads');
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
        if (task.request) {
            try { task.request.destroy(); } catch (e) {}
            task.request = null;
        }
        if (task.fileStream) {
            try { task.fileStream.close(); } catch (e) {}
            task.fileStream = null;
        }
        if (Array.isArray(task.segments)) {
            for (const seg of task.segments) {
                if (seg.request) {
                    try { seg.request.destroy(); } catch (e) {}
                    seg.request = null;
                }
                if (seg.fileStream) {
                    try { seg.fileStream.close(); } catch (e) {}
                    seg.fileStream = null;
                }
                if (seg.status === 'active') {
                    seg.status = 'pending';
                }
            }
            this._saveSegmentMeta(task);
        }
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
            const hasActiveSeg = Array.isArray(task.segments) && task.segments.some(s => s.status === 'active' && s.request);
            if (task.status === 'downloading' && !task.retryTimer && ((!task.request && !hasActiveSeg) || (now - task.lastDataTime > 8000))) {
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
    }

    setMainWindow(win) {
        this.mainWindow = win;
    }

    _ensureDir(dirPath) {
        ensureDir(dirPath);
    }

    _loadSettings() {
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
            console.warn('[Downloader] Error loading settings, using defaults:', e.message);
        }
        return {
            saveDirectory: this.defaultDownloadDir,
            askEveryTime: false,
            autoConvertToMp4: true,
            maxConcurrent: 1
        };
    }

    _saveSettings() {
        try {
            fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
        } catch (e) {
            console.error('[Downloader] Failed to save settings:', e.message);
        }
    }

    _loadHistory() {
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
            console.warn('[Downloader] Error loading history:', e.message);
        }
        return [];
    }

    _saveHistory() {
        try {
            fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2), 'utf8');
        } catch (e) {
            console.error('[Downloader] Failed to save history:', e.message);
        }
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
        const target = String(urlOrId);
        const normTarget = target.replace(/^series_/, 'ep_');
        for (const task of this.activeDownloads.values()) {
            const taskItemId = task.itemId ? String(task.itemId) : '';
            const normTaskItemId = taskItemId.replace(/^series_/, 'ep_');
            if (
                task.id === target ||
                taskItemId === target ||
                (normTaskItemId && normTaskItemId === normTarget) ||
                (taskItemId && taskItemId.endsWith('_' + target)) ||
                task.url === target
            ) {
                return true;
            }
        }
        return false;
    }

    isCompleted(urlOrId) {
        if (!urlOrId) return false;
        const target = String(urlOrId);
        const normTarget = target.replace(/^series_/, 'ep_');
        return this.history.some(h => {
            if (!h.filePath || !fs.existsSync(h.filePath)) return false;
            const hItemId = h.itemId ? String(h.itemId) : '';
            const normHItemId = hItemId.replace(/^series_/, 'ep_');
            return (
                h.id === target ||
                hItemId === target ||
                (normHItemId && normHItemId === normTarget) ||
                (hItemId && hItemId.endsWith('_' + target)) ||
                h.url === target
            );
        });
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

        const normItemId = item.id ? String(item.id).replace(/^series_/, 'ep_') : '';
        const existingInHistory = this.history.find(h => {
            if (!h.filePath || !fs.existsSync(h.filePath)) return false;
            const hItemId = h.itemId ? String(h.itemId).replace(/^series_/, 'ep_') : '';
            if (h.url === item.url) return true;
            if (item.id && (h.id === item.id || h.itemId === item.id || (hItemId && hItemId === normItemId))) return true;
            if (item.seriesName && item.season != null && item.episode != null && h.seriesName) {
                const sameSeries = h.seriesName.trim().toLowerCase() === String(item.seriesName).trim().toLowerCase();
                const sameSeason = String(h.season) === String(item.season);
                const sameEp = String(h.episode) === String(item.episode);
                if (sameSeries && sameSeason && sameEp) return true;
            }
            return false;
        });
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
            maxRetries: 6,
            retryTimer: null,
            maxConnections: 8,
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

    _saveSegmentMeta(task) {
        if (!Array.isArray(task.segments) || !task.metaPath) return;
        try {
            const payload = {
                totalBytes: task.totalBytes,
                resolvedUrl: task.resolvedUrl || task.url,
                maxConnections: task.maxConnections,
                segments: task.segments.map(s => ({
                    index: s.index,
                    start: s.start,
                    end: s.end,
                    current: s.current,
                    status: s.status === 'done' ? 'done' : 'pending'
                }))
            };
            fs.writeFileSync(task.metaPath, JSON.stringify(payload), 'utf8');
        } catch (e) {}
    }

    _loadSegmentMeta(task) {
        if (!task.metaPath || !fs.existsSync(task.metaPath) || !fs.existsSync(task.partPath)) return false;
        try {
            const data = JSON.parse(fs.readFileSync(task.metaPath, 'utf8'));
            if (data && Array.isArray(data.segments) && data.segments.length > 0 && data.totalBytes > 0) {
                task.totalBytes = data.totalBytes;
                task.resolvedUrl = data.resolvedUrl || task.url;
                task.maxConnections = data.maxConnections || 8;
                task.segments = data.segments.map(s => ({
                    index: s.index,
                    start: s.start,
                    end: s.end,
                    current: s.current,
                    status: s.current > s.end ? 'done' : 'pending',
                    retryCount: 0,
                    request: null,
                    fileStream: null
                }));
                task.receivedBytes = task.segments.reduce((acc, s) => acc + Math.max(0, s.current - s.start), 0);
                task.lastReportBytes = task.receivedBytes;
                return true;
            }
        } catch (e) {}
        return false;
    }

    _removeSegmentMeta(task) {
        if (task.metaPath && fs.existsSync(task.metaPath)) {
            try { fs.unlinkSync(task.metaPath); } catch (e) {}
        }
    }

    _reportProgress(task, force = false) {
        const now = Date.now();
        const deltaMs = now - task.lastReportTime;
        if (!force && deltaMs < 350) return;

        if (Array.isArray(task.segments)) {
            task.receivedBytes = task.segments.reduce((acc, s) => acc + Math.max(0, s.current - s.start), 0);
            if (now - (task.lastMetaSave || 0) >= 2500) {
                task.lastMetaSave = now;
                this._saveSegmentMeta(task);
            }
        }

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

    _createSegments(task) {
        const total = task.totalBytes;
        const numSegs = total >= 100 * 1024 * 1024 ? 8 : (total >= 20 * 1024 * 1024 ? 6 : 4);
        task.maxConnections = numSegs;
        const chunkSize = Math.floor(total / numSegs);
        const segments = [];
        for (let i = 0; i < numSegs; i++) {
            const start = i * chunkSize;
            const end = i === numSegs - 1 ? total - 1 : (start + chunkSize - 1);
            segments.push({
                index: i,
                start,
                end,
                current: start,
                status: i === 0 ? 'active' : 'pending',
                retryCount: 0,
                request: null,
                fileStream: null
            });
        }
        task.segments = segments;
        return segments;
    }

    _attachStreamToSegment(task, seg, res, req) {
        try {
            seg.fileStream = fs.createWriteStream(task.partPath, {
                flags: 'r+',
                start: seg.current,
                highWaterMark: 1024 * 1024
            });
        } catch (err) {
            try { req.destroy(); } catch (e) {}
            return this._handleError(task, err);
        }

        let finishedWriting = false;
        const finishSegment = () => {
            if (finishedWriting) return;
            finishedWriting = true;
            seg.request = null;
            seg.fileStream = null;
            if (task.status !== 'downloading') return;

            if (seg.current > seg.end) {
                seg.status = 'done';
                if (task.segments.every(s => s.status === 'done')) {
                    this._completeTask(task);
                } else {
                    this._saveSegmentMeta(task);
                    this._startSegmentWorkers(task);
                }
            } else {
                // Segment ended early before reaching seg.end — re-queue for resume
                seg.status = 'pending';
                this._retrySegmentOrTask(task, seg, new Error(`Segment ${seg.index} closed early`));
            }
        };

        seg.fileStream.on('finish', finishSegment);
        seg.fileStream.on('error', (err) => {
            try { req.destroy(); } catch (e) {}
            this._handleError(task, err);
        });

        res.on('data', (chunk) => {
            if (task.status !== 'downloading' || seg.status !== 'active') return;
            const remaining = (seg.end - seg.current) + 1;
            if (remaining <= 0) {
                try { req.destroy(); } catch (e) {}
                return;
            }

            const toWrite = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
            seg.current += toWrite.length;
            task.lastDataTime = Date.now();
            task.retryCount = 0;
            seg.retryCount = 0;

            if (seg.fileStream) {
                const ok = seg.fileStream.write(toWrite);
                if (!ok) {
                    res.pause();
                    seg.fileStream.once('drain', () => {
                        if (task.status === 'downloading' && seg.status === 'active') {
                            res.resume();
                        }
                    });
                }
            }

            this._reportProgress(task);

            if (seg.current > seg.end) {
                // Segment reached exact end byte; close cleanly and destroy socket
                seg.status = 'done';
                try { req.destroy(); } catch (e) {}
                if (seg.fileStream) {
                    seg.fileStream.end();
                }
            }
        });

        res.on('end', () => {
            if (seg.fileStream && !seg.fileStream.writableEnded) {
                seg.fileStream.end();
            }
        });

        res.on('error', (err) => {
            if (seg.status === 'done') return;
            if (seg.fileStream) {
                try { seg.fileStream.destroy(); } catch (e) {}
                seg.fileStream = null;
            }
            seg.request = null;
            seg.status = 'pending';
            this._retrySegmentOrTask(task, seg, err);
        });
    }

    _retrySegmentOrTask(task, seg, err) {
        if (task.status !== 'downloading') return;
        seg.retryCount = (seg.retryCount || 0) + 1;
        if (seg.retryCount <= (task.maxRetries || 6)) {
            const delayMs = Math.min(8000, 1000 * seg.retryCount);
            setTimeout(() => {
                if (task.status === 'downloading' && seg.status === 'pending') {
                    this._startSegmentWorkers(task);
                }
            }, delayMs);
        } else {
            this._handleTransientOrFatalError(task, err);
        }
    }

    _startSegmentWorkers(task) {
        if (task.status !== 'downloading' || !Array.isArray(task.segments)) return;
        let activeCount = task.segments.filter(s => s.status === 'active').length;
        const limit = Math.max(1, task.maxConnections || 4);

        for (const seg of task.segments) {
            if (activeCount >= limit) break;
            if (seg.status === 'pending' && seg.current <= seg.end) {
                seg.status = 'active';
                activeCount++;
                this._runSegment(task, seg);
            }
        }
    }

    _runSegment(task, seg, redirectCount = 0, overrideUrl = null) {
        if (task.status !== 'downloading' || seg.status !== 'active') return;
        if (redirectCount > 6) {
            seg.status = 'pending';
            return this._handleTransientOrFatalError(task, new Error('Too many HTTP redirects'));
        }

        const targetUrl = overrideUrl || task.resolvedUrl || task.url;
        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
        } catch (e) {
            return this._handleError(task, e);
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Range': `bytes=${seg.current}-${seg.end}`
        };

        const req = protocol.get(targetUrl, { headers, highWaterMark: 1024 * 1024 }, (res) => {
            if (task.status !== 'downloading' || seg.status !== 'active') {
                res.destroy();
                return;
            }

            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                let nextUrl = res.headers.location;
                if (!nextUrl.startsWith('http')) {
                    nextUrl = new URL(nextUrl, targetUrl).toString();
                }
                res.resume();
                return this._runSegment(task, seg, redirectCount + 1, nextUrl);
            }

            // If IPTV server enforces a connection limit on secondary workers, step down maxConnections gracefully
            if ([401, 403, 429, 503, 509].includes(res.statusCode)) {
                res.resume();
                const otherActive = task.segments.filter(s => s !== seg && s.status === 'active').length;
                if (otherActive > 0) {
                    task.maxConnections = Math.max(1, otherActive);
                    seg.status = 'pending';
                    seg.request = null;
                    console.log(`[Downloader] Server limited concurrent connections (${res.statusCode}), stepping down to ${task.maxConnections} connection(s)`);
                    return;
                }
            }

            if (res.statusCode >= 400) {
                res.resume();
                seg.status = 'pending';
                seg.request = null;
                return this._retrySegmentOrTask(task, seg, new Error(`HTTP ${res.statusCode} on segment ${seg.index}`));
            }

            if (res.statusCode !== 206 && seg.index > 0) {
                // Server unexpectedly ignored Range on secondary connection — step down to 1 connection
                res.resume();
                task.maxConnections = 1;
                seg.status = 'pending';
                seg.request = null;
                return;
            }

            this._attachStreamToSegment(task, seg, res, req);
        });

        req.on('socket', (socket) => {
            socket.setNoDelay(true);
            socket.setKeepAlive(true, 10000);
        });

        req.setTimeout(25000, () => {
            req.destroy(new Error(`Segment ${seg.index} timeout`));
        });

        req.on('error', (err) => {
            if (seg.status === 'done' || task.status !== 'downloading') return;
            if (seg.fileStream) {
                try { seg.fileStream.destroy(); } catch (e) {}
                seg.fileStream = null;
            }
            seg.request = null;
            seg.status = 'pending';
            this._retrySegmentOrTask(task, seg, err);
        });

        seg.request = req;
    }

    _executeDownload(task, redirectCount = 0, currentUrl = null, disableRangeProbe = false) {
        if (task.status !== 'downloading') return;

        if (task.retryTimer) {
            clearTimeout(task.retryTimer);
            task.retryTimer = null;
        }

        // Resume existing segmented download if segments are in memory or saved on disk
        if (Array.isArray(task.segments) || (task.receivedBytes === 0 && this._loadSegmentMeta(task))) {
            task.lastDataTime = Date.now();
            task.lastReportTime = Date.now();
            task.lastReportBytes = task.receivedBytes;
            console.log(`[Downloader] Resuming segmented download (${task.maxConnections} connections): ${task.fileName}`);
            return this._startSegmentWorkers(task);
        }

        if (redirectCount > 6) {
            this._handleError(task, new Error('Too many HTTP redirects'));
            return;
        }

        const fetchUrl = currentUrl || task.url;
        let parsedUrl;
        try {
            parsedUrl = new URL(fetchUrl);
        } catch (e) {
            this._handleError(task, new Error('Invalid download URL: ' + e.message));
            return;
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        };

        let flags = 'w';
        if (task.receivedBytes > 0 && fs.existsSync(task.partPath)) {
            const stat = fs.statSync(task.partPath);
            task.receivedBytes = stat.size;
            if (task.receivedBytes > 0) {
                headers['Range'] = `bytes=${task.receivedBytes}-`;
                flags = 'a';
            }
        } else if (!disableRangeProbe) {
            // Probe Range support on fresh downloads in 1 round-trip
            headers['Range'] = 'bytes=0-';
        }

        task.lastDataTime = Date.now();

        const req = protocol.get(fetchUrl, { headers, highWaterMark: 1024 * 1024 }, (res) => {
            if (task.status !== 'downloading') {
                res.destroy();
                return;
            }

            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                let nextUrl = res.headers.location;
                if (!nextUrl.startsWith('http')) {
                    nextUrl = new URL(nextUrl, fetchUrl).toString();
                }
                console.log(`[Downloader] Redirecting to: ${nextUrl}`);
                res.resume();
                return this._executeDownload(task, redirectCount + 1, nextUrl, disableRangeProbe);
            }

            // If server rejected initial Range: bytes=0- probe, retry cleanly without Range
            if ((res.statusCode === 400 || res.statusCode === 416) && !disableRangeProbe && task.receivedBytes === 0) {
                res.resume();
                return this._executeDownload(task, redirectCount, fetchUrl, true);
            }

            if (res.statusCode === 416 && task.receivedBytes > 0) {
                res.resume();
                task.receivedBytes = 0;
                task.lastReportBytes = 0;
                try { if (fs.existsSync(task.partPath)) fs.unlinkSync(task.partPath); } catch (e) {}
                return this._executeDownload(task, redirectCount, fetchUrl, true);
            }

            if (res.statusCode >= 400) {
                const err = new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Download failed'}`);
                const isPermanent = [400, 401, 403, 404, 410].includes(res.statusCode);
                res.resume();
                if (isPermanent) {
                    return this._handleError(task, err);
                }
                return this._handleTransientOrFatalError(task, err);
            }

            task.resolvedUrl = fetchUrl;

            // Parse total file size from Content-Range or Content-Length
            const contentRange = res.headers['content-range'];
            if (contentRange && /\/(\d+)$/.test(contentRange)) {
                task.totalBytes = parseInt(contentRange.match(/\/(\d+)$/)[1], 10);
            } else {
                const contentLength = parseInt(res.headers['content-length'], 10);
                if (!isNaN(contentLength) && contentLength > 0) {
                    task.totalBytes = res.statusCode === 206 ? task.receivedBytes + contentLength : contentLength;
                }
            }

            // Activate IDM-style multi-connection segmented downloading if server supports Range & file >= 4MB
            const supportsRange = res.statusCode === 206 || String(res.headers['accept-ranges'] || '').toLowerCase() === 'bytes';
            if (supportsRange && task.receivedBytes === 0 && task.totalBytes >= 4 * 1024 * 1024) {
                try {
                    fs.closeSync(fs.openSync(task.partPath, 'w'));
                } catch (err) {
                    res.destroy();
                    return this._handleError(task, err);
                }

                const segments = this._createSegments(task);
                this._saveSegmentMeta(task);
                task.lastDataTime = Date.now();
                task.lastReportTime = Date.now();
                task.lastReportBytes = 0;

                console.log(`[Downloader] Segmented multi-connection mode (${segments.length} connections) for ${task.fileName} (${this._formatBytes(task.totalBytes)})`);
                segments[0].request = req;
                this._attachStreamToSegment(task, segments[0], res, req);
                this._startSegmentWorkers(task);
                return;
            }

            // Single-stream fallback (if server doesn't support Range or file < 4MB)
            if (res.statusCode === 200 && flags === 'a') {
                flags = 'w';
                task.receivedBytes = 0;
                task.lastReportBytes = 0;
            }

            try {
                task.fileStream = fs.createWriteStream(task.partPath, { flags, highWaterMark: 1024 * 1024 });
            } catch (err) {
                return this._handleError(task, err);
            }

            task.lastDataTime = Date.now();
            task.lastReportTime = Date.now();
            task.lastReportBytes = task.receivedBytes;

            res.on('data', (chunk) => {
                if (task.status !== 'downloading') return;
                task.receivedBytes += chunk.length;
                task.lastDataTime = Date.now();
                task.retryCount = 0;
                this._reportProgress(task);
            });

            res.on('error', (err) => {
                this._handleTransientOrFatalError(task, err);
            });

            res.pipe(task.fileStream);

            task.fileStream.on('finish', () => {
                if (task.status !== 'downloading') return;

                task.fileStream.close(() => {
                    const isTruncated = !res.complete || (task.totalBytes > 0 && task.receivedBytes < task.totalBytes);
                    if (isTruncated) {
                        return this._handleTransientOrFatalError(
                            task,
                            new Error(`Connection closed early (${task.receivedBytes}/${task.totalBytes || '?'} bytes)`)
                        );
                    }
                    this._completeTask(task);
                });
            });

            task.fileStream.on('error', (err) => {
                this._handleError(task, err);
            });
        });

        req.on('socket', (socket) => {
            socket.setNoDelay(true);
            socket.setKeepAlive(true, 10000);
        });

        req.setTimeout(25000, () => {
            req.destroy(new Error('Socket timeout (no response for 25s)'));
        });

        req.on('error', (err) => {
            this._handleTransientOrFatalError(task, err);
        });

        task.request = req;
    }

    _handleTransientOrFatalError(task, error) {
        if (task.status !== 'downloading') return;

        this._abortTaskSockets(task);

        if (task.retryCount < (task.maxRetries || 6)) {
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
        const maxRetries = task.maxRetries || 6;
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
        this._removeSegmentMeta(task);

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
