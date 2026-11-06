// ============================================================
// MI IPTV Player — Desktop Windows Downloader Engine
// Background HTTP/HTTPS Streaming, Pause/Resume, Chunked Downloads,
// Directory Selection, History Persistence, Windows Shell Integration
// & Universal TV/Receiver Remuxing (H.264 + AAC 48kHz MP4)
// ============================================================

const { app, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

class Downloader {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.settingsPath = path.join(this.userDataPath, 'download-settings.json');
        this.historyPath = path.join(this.userDataPath, 'download-history.json');

        this.defaultDownloadDir = path.join(app.getPath('downloads'), 'MI IPTV Downloads');
        this.settings = this._loadSettings();
        this.history = this._loadHistory();

        this.activeDownloads = new Map(); // id -> downloadTask
        this.mainWindow = null;

        // Ensure current download directory exists
        this._ensureDir(this.settings.saveDirectory);
    }

    setMainWindow(win) {
        this.mainWindow = win;
    }

    _ensureDir(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        } catch (e) {
            console.error('[Downloader] Failed to create directory:', dirPath, e.message);
        }
    }

    _loadSettings() {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const data = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
                if (data && data.saveDirectory) {
                    return {
                        saveDirectory: data.saveDirectory,
                        askEveryTime: Boolean(data.askEveryTime),
                        autoConvertToMp4: data.autoConvertToMp4 !== false
                    };
                }
            }
        } catch (e) {
            console.warn('[Downloader] Error loading settings, using defaults:', e.message);
        }
        return {
            saveDirectory: this.defaultDownloadDir,
            askEveryTime: false,
            autoConvertToMp4: true // Enabled by default for universal TV & receiver compatibility
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
                    // Check if files still exist on disk
                    return list.map(item => ({
                        ...item,
                        existsOnDisk: fs.existsSync(item.filePath)
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
        if (!name) return 'download_' + Date.now();
        // Remove characters forbidden in Windows file names: < > : " / \ | ? * and control chars
        let clean = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
        if (clean.length > 180) {
            clean = clean.substring(0, 180).trim();
        }
        return clean || 'media_' + Date.now();
    }

    _formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + units[i];
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
            autoConvertToMp4: this.settings.autoConvertToMp4 !== false
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
        const activeList = Array.from(this.activeDownloads.values()).map(t => ({
            id: t.id,
            title: t.title,
            fileName: t.fileName,
            filePath: t.filePath,
            url: t.url,
            poster: t.poster,
            type: t.type,
            status: t.status,
            totalBytes: t.totalBytes,
            receivedBytes: t.receivedBytes,
            percent: t.percent,
            speedBps: t.speedBps,
            speedFormatted: t.speedFormatted,
            receivedFormatted: this._formatBytes(t.receivedBytes),
            totalFormatted: this._formatBytes(t.totalBytes),
            error: t.error
        }));

        // Re-check disk presence for history items
        this.history.forEach(item => {
            item.existsOnDisk = Boolean(item.filePath && fs.existsSync(item.filePath));
            item.isUniversalMp4 = Boolean(item.filePath && path.extname(item.filePath).toLowerCase() === '.mp4');
        });

        return {
            settings: this.getSettings(),
            active: activeList,
            history: this.history
        };
    }

    /**
     * Remux any video file to universal MP4 with AAC 48kHz audio.
     * Copies video stream directly without quality loss (-c:v copy).
     * Converts audio to standard AAC-LC 48,000 Hz.
     */
    _remuxToMp4(inputPath, callback) {
        const ext = path.extname(inputPath).toLowerCase();
        if (ext === '.mp4') {
            return callback(null, inputPath);
        }

        const outputPath = inputPath.replace(/\.[a-zA-Z0-9]+$/, '.mp4');
        const args = [
            '-y',
            '-i', inputPath,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-ar', '48000',
            '-b:a', '128k',
            outputPath
        ];

        console.log(`[Downloader] Remuxing to Universal MP4 (AAC 48kHz): ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
        
        let proc;
        try {
            proc = spawn('ffmpeg', args, { windowsHide: true });
        } catch (e) {
            console.warn('[Downloader] FFmpeg spawn error:', e.message);
            return callback(e, inputPath);
        }

        proc.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
                try {
                    const stat = fs.statSync(outputPath);
                    if (stat.size > 1024) {
                        // Safely remove original MKV
                        try { fs.unlinkSync(inputPath); } catch (e) {}
                        console.log(`[Downloader] Successfully converted to Universal MP4: ${path.basename(outputPath)}`);
                        return callback(null, outputPath);
                    }
                } catch (e) {}
            }
            console.warn('[Downloader] FFmpeg remux failed with code:', code, 'keeping original file');
            callback(new Error('Remux failed with code ' + code), inputPath);
        });

        proc.on('error', (err) => {
            console.warn('[Downloader] FFmpeg error:', err.message, 'keeping original file');
            callback(err, inputPath);
        });
    }

    /**
     * Convert an already downloaded file from history to Universal MP4 on demand
     */
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

    /**
     * Start a new download
     * @param {Object} item { id, title, url, poster, type, seriesName, season, episode, ext }
     * @param {Object} options { targetDir, customFileName }
     */
    async startDownload(item, options = {}) {
        if (!item || !item.url) {
            throw new Error('Invalid download item: URL is required');
        }

        // Check if user has "Ask Every Time" enabled and no explicit directory passed
        let targetDir = options.targetDir;
        if (!targetDir && this.settings.askEveryTime) {
            const sel = await this.selectDirectory();
            if (sel.canceled) {
                return { canceled: true };
            }
            targetDir = sel.path;
        }
        targetDir = targetDir || this.settings.saveDirectory;
        this._ensureDir(targetDir);

        // Derive extension from URL or item
        let ext = item.ext;
        if (!ext) {
            try {
                const parsedUrl = new URL(item.url);
                const match = parsedUrl.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
                if (match) ext = match[1];
            } catch (e) {}
        }
        ext = ext || 'mp4';

        // Clean & construct base file name
        let baseName = options.customFileName || item.title || item.name || 'Media';
        if (item.seriesName && (item.season != null || item.episode != null)) {
            const sNum = String(item.season || '1').padStart(2, '0');
            const eNum = String(item.episode || '1').padStart(2, '0');
            baseName = `${item.seriesName} - S${sNum}E${eNum} - ${item.title || 'Episode ' + eNum}`;
        }
        baseName = this._sanitizeFileName(baseName);

        // Deduplicate file name if file already exists
        let finalFileName = `${baseName}.${ext}`;
        let targetPath = path.join(targetDir, finalFileName);
        let counter = 1;
        while (fs.existsSync(targetPath)) {
            finalFileName = `${baseName} (${counter}).${ext}`;
            targetPath = path.join(targetDir, finalFileName);
            counter++;
        }

        const partPath = targetPath + '.part';
        const downloadId = 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

        const task = {
            id: downloadId,
            itemId: item.id,
            title: item.title || item.name || finalFileName,
            fileName: finalFileName,
            filePath: targetPath,
            partPath: partPath,
            url: item.url,
            poster: item.poster || item.logo || '',
            type: item.type || 'movie',
            targetDir: targetDir,
            totalBytes: 0,
            receivedBytes: 0,
            percent: 0,
            speedBps: 0,
            speedFormatted: '0 B/s',
            status: 'downloading',
            error: null,
            startTime: Date.now(),
            lastReportTime: Date.now(),
            lastReportBytes: 0,
            request: null,
            fileStream: null
        };

        this.activeDownloads.set(downloadId, task);
        this._sendToRenderer('download-started', this._serializeTask(task));

        this._executeDownload(task);
        return { canceled: false, task: this._serializeTask(task) };
    }

    _serializeTask(task) {
        return {
            id: task.id,
            itemId: task.itemId,
            title: task.title,
            fileName: task.fileName,
            filePath: task.filePath,
            url: task.url,
            poster: task.poster,
            type: task.type,
            status: task.status,
            totalBytes: task.totalBytes,
            receivedBytes: task.receivedBytes,
            percent: task.percent,
            speedBps: task.speedBps,
            speedFormatted: task.speedFormatted,
            receivedFormatted: this._formatBytes(task.receivedBytes),
            totalFormatted: this._formatBytes(task.totalBytes),
            error: task.error
        };
    }

    _executeDownload(task, redirectCount = 0) {
        if (redirectCount > 6) {
            this._handleError(task, new Error('Too many HTTP redirects'));
            return;
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(task.url);
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
        // Support Resume if .part already exists
        if (task.receivedBytes > 0 && fs.existsSync(task.partPath)) {
            const stat = fs.statSync(task.partPath);
            if (stat.size === task.receivedBytes) {
                headers['Range'] = `bytes=${task.receivedBytes}-`;
                flags = 'a';
            } else {
                task.receivedBytes = stat.size;
                headers['Range'] = `bytes=${stat.size}-`;
                flags = 'a';
            }
        }

        const req = protocol.get(task.url, { headers }, (res) => {
            // Handle redirects (301, 302, 303, 307, 308)
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                let nextUrl = res.headers.location;
                if (!nextUrl.startsWith('http')) {
                    nextUrl = new URL(nextUrl, task.url).toString();
                }
                console.log(`[Downloader] Redirecting to: ${nextUrl}`);
                task.url = nextUrl;
                return this._executeDownload(task, redirectCount + 1);
            }

            if (res.statusCode >= 400) {
                return this._handleError(task, new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Download failed'}`));
            }

            // Total bytes determination
            const contentLength = parseInt(res.headers['content-length'], 10);
            if (!isNaN(contentLength) && contentLength > 0) {
                if (res.statusCode === 206) {
                    // Partial content: add existing received bytes
                    task.totalBytes = task.receivedBytes + contentLength;
                } else {
                    task.totalBytes = contentLength;
                }
            }

            try {
                task.fileStream = fs.createWriteStream(task.partPath, { flags });
            } catch (err) {
                return this._handleError(task, err);
            }

            task.lastReportTime = Date.now();
            task.lastReportBytes = task.receivedBytes;

            res.on('data', (chunk) => {
                if (task.status !== 'downloading') return;
                task.receivedBytes += chunk.length;

                // Throttled UI progress report (every 350ms)
                const now = Date.now();
                const deltaMs = now - task.lastReportTime;
                if (deltaMs >= 350) {
                    const deltaBytes = task.receivedBytes - task.lastReportBytes;
                    task.speedBps = Math.round((deltaBytes / deltaMs) * 1000);
                    task.speedFormatted = this._formatBytes(task.speedBps) + '/s';

                    if (task.totalBytes > 0) {
                        task.percent = Math.min(100, Math.round((task.receivedBytes / task.totalBytes) * 100));
                    }

                    task.lastReportTime = now;
                    task.lastReportBytes = task.receivedBytes;

                    this._sendToRenderer('download-progress', this._serializeTask(task));
                }
            });

            res.pipe(task.fileStream);

            task.fileStream.on('finish', () => {
                if (task.status !== 'downloading') return;

                task.fileStream.close(() => {
                    // Rename .part to target path
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
                            fileName: path.basename(finalPath),
                            filePath: finalPath,
                            fileSize: finalSize,
                            fileSizeFormatted: this._formatBytes(finalSize),
                            poster: task.poster,
                            type: task.type,
                            url: task.url,
                            completedAt: Date.now(),
                            existsOnDisk: true,
                            isUniversalMp4: path.extname(finalPath).toLowerCase() === '.mp4'
                        };

                        this.history.unshift(historyItem);
                        if (this.history.length > 100) this.history.pop();
                        this._saveHistory();

                        this.activeDownloads.delete(task.id);
                        this._sendToRenderer('download-completed', historyItem);
                        console.log(`[Downloader] Download completed & ready: ${historyItem.fileName}`);
                    };

                    // Auto-convert to Universal MP4 (H.264 + AAC 48kHz) if enabled and source is not already MP4
                    if (this.settings.autoConvertToMp4 !== false && path.extname(task.filePath).toLowerCase() !== '.mp4') {
                        task.status = 'converting';
                        task.speedFormatted = 'Optimizing for TV/Receiver (MP4)...';
                        this._sendToRenderer('download-progress', this._serializeTask(task));

                        this._remuxToMp4(task.filePath, (err, convertedPath) => {
                            finalizeHistory(convertedPath);
                        });
                    } else {
                        finalizeHistory(task.filePath);
                    }
                });
            });

            task.fileStream.on('error', (err) => {
                this._handleError(task, err);
            });
        });

        req.on('error', (err) => {
            this._handleError(task, err);
        });

        task.request = req;
    }

    _handleError(task, error) {
        if (task.status === 'cancelled') return;

        console.error(`[Downloader] Error in task ${task.id} (${task.fileName}):`, error.message);
        task.status = 'failed';
        task.error = error.message;

        if (task.fileStream) {
            try { task.fileStream.close(); } catch (e) {}
        }
        if (task.request) {
            try { task.request.destroy(); } catch (e) {}
        }

        const serialized = this._serializeTask(task);
        this.activeDownloads.delete(task.id);
        this._sendToRenderer('download-failed', serialized);
    }

    pauseDownload(id) {
        const task = this.activeDownloads.get(id);
        if (!task || task.status !== 'downloading') return false;

        task.status = 'paused';
        task.speedBps = 0;
        task.speedFormatted = 'Paused';

        if (task.request) {
            try { task.request.destroy(); } catch (e) {}
            task.request = null;
        }
        if (task.fileStream) {
            try { task.fileStream.close(); } catch (e) {}
            task.fileStream = null;
        }

        this._sendToRenderer('download-paused', this._serializeTask(task));
        return true;
    }

    resumeDownload(id) {
        const task = this.activeDownloads.get(id);
        if (!task || task.status !== 'paused') return false;

        task.status = 'downloading';
        task.speedFormatted = 'Resuming...';
        this._sendToRenderer('download-resumed', this._serializeTask(task));

        this._executeDownload(task);
        return true;
    }

    cancelDownload(id) {
        const task = this.activeDownloads.get(id);
        if (!task) return false;

        task.status = 'cancelled';

        if (task.request) {
            try { task.request.destroy(); } catch (e) {}
        }
        if (task.fileStream) {
            try { task.fileStream.close(); } catch (e) {}
        }

        // Clean up partial file
        try {
            if (fs.existsSync(task.partPath)) {
                fs.unlinkSync(task.partPath);
            }
        } catch (e) {
            console.warn('[Downloader] Could not remove partial file:', e.message);
        }

        this.activeDownloads.delete(id);
        this._sendToRenderer('download-cancelled', { id });
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
