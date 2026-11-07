// ============================================================
// MI IPTV Player — Desktop Downloader Utilities & FFmpeg Remuxer
// Pure path resolution, filename sanitization, byte formatting,
// task serialization, and FFmpeg MP4 remuxing (no Electron deps).
// ============================================================

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

function ensureDir(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    } catch (e) {
        console.error('[Downloader] Failed to create directory:', dirPath, e.message);
    }
}

function sanitizeFileName(name) {
    if (!name) return 'media_' + Date.now();
    let clean = String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
    if (clean.length > 160) {
        clean = clean.substring(0, 160).trim();
    }
    return clean || 'media_' + Date.now();
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + units[i];
}

function resolveDownloadTarget(baseDir, item, options = {}) {
    let targetDir = baseDir;
    if (item.seriesName) {
        const cleanSeriesName = sanitizeFileName(item.seriesName);
        const sNum = String(item.season || '1').padStart(2, '0');
        targetDir = path.join(baseDir, cleanSeriesName, `Season ${sNum}`);
        ensureDir(targetDir);
    }

    let ext = item.ext;
    if (!ext) {
        try {
            const parsedUrl = new URL(item.url);
            const match = parsedUrl.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
            if (match) ext = match[1];
        } catch (e) {}
    }
    ext = ext || 'mp4';

    let baseName = options.customFileName || item.title || item.name || 'Media';
    if (item.seriesName && (item.season != null || item.episode != null)) {
        const sNum = String(item.season || '1').padStart(2, '0');
        const eNum = String(item.episode || '1').padStart(2, '0');
        baseName = `${sanitizeFileName(item.seriesName)} - S${sNum}E${eNum} - ${sanitizeFileName(item.title || 'Episode ' + eNum)}`;
    } else {
        baseName = sanitizeFileName(baseName);
    }

    let finalFileName = `${baseName}.${ext}`;
    let targetPath = path.join(targetDir, finalFileName);
    let counter = 1;
    while (fs.existsSync(targetPath)) {
        finalFileName = `${baseName} (${counter}).${ext}`;
        targetPath = path.join(targetDir, finalFileName);
        counter++;
    }

    return {
        targetDir,
        finalFileName,
        targetPath,
        partPath: targetPath + '.part'
    };
}

function serializeTask(task) {
    return {
        id: task.id,
        itemId: task.itemId,
        title: task.title,
        seriesName: task.seriesName,
        season: task.season,
        episode: task.episode,
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
        receivedFormatted: formatBytes(task.receivedBytes),
        totalFormatted: formatBytes(task.totalBytes),
        error: task.error
    };
}

function remuxToMp4(inputPath, callback) {
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

    let called = false;
    const done = (err, finalPath) => {
        if (called) return;
        called = true;
        callback(err, finalPath);
    };

    proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
            try {
                const stat = fs.statSync(outputPath);
                if (stat.size > 1024) {
                    try { fs.unlinkSync(inputPath); } catch (e) {}
                    console.log(`[Downloader] Successfully converted to Universal MP4: ${path.basename(outputPath)}`);
                    return done(null, outputPath);
                }
            } catch (e) {}
        }
        console.warn('[Downloader] FFmpeg remux failed with code:', code, 'keeping original file');
        done(new Error('Remux failed with code ' + code), inputPath);
    });

    proc.on('error', (err) => {
        console.warn('[Downloader] FFmpeg error:', err.message, 'keeping original file');
        done(err, inputPath);
    });
}

module.exports = {
    ensureDir,
    sanitizeFileName,
    formatBytes,
    resolveDownloadTarget,
    serializeTask,
    remuxToMp4
};

