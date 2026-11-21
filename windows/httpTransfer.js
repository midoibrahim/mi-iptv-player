/* ============================================================
   MI IPTV Player — Sequential HTTP/HTTPS Media Transfer Engine
   Single-stream bit-exact download with verified Content-Range
   resume, redirect following, and clean socket teardown.
   ============================================================ */

const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { parseContentRange } = require('./downloadUtils');

function abortTaskSockets(task) {
    if (!task) return;
    if (task.retryTimer) {
        clearTimeout(task.retryTimer);
        task.retryTimer = null;
    }
    if (task.request) {
        const req = task.request;
        task.request = null;
        try { req.destroy(); } catch (e) {}
    }
    if (task.fileStream) {
        const st = task.fileStream;
        task.fileStream = null;
        try { st.end(); } catch (e) {}
        try { st.destroy(); } catch (e) {}
    }
}

function executeHttpTransfer(task, callbacks, options = {}) {
    const redirectCount = options.redirectCount || 0;
    const currentUrl = options.currentUrl || null;
    const disableRange = Boolean(options.disableRange);

    if (!task || task.status !== 'downloading') return;

    if (task.retryTimer) {
        clearTimeout(task.retryTimer);
        task.retryTimer = null;
    }

    if (redirectCount > 6) {
        callbacks.onFatalError(task, new Error('Too many HTTP redirects'));
        return;
    }

    const fetchUrl = currentUrl || task.url;
    let parsedUrl;
    try {
        parsedUrl = new URL(fetchUrl);
    } catch (e) {
        callbacks.onFatalError(task, new Error('Invalid download URL: ' + e.message));
        return;
    }

    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Connection': 'keep-alive'
    };

    let flags = 'w';
    let requestedOffset = 0;
    if (fs.existsSync(task.partPath)) {
        try {
            const stat = fs.statSync(task.partPath);
            if (stat.size > 0 && task.receivedBytes > 0) {
                requestedOffset = stat.size;
                task.receivedBytes = stat.size;
            } else {
                task.receivedBytes = 0;
            }
        } catch (e) {
            task.receivedBytes = 0;
        }
    }

    if (requestedOffset > 0 && !disableRange) {
        headers['Range'] = `bytes=${requestedOffset}-`;
        flags = 'a';
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
            return executeHttpTransfer(task, callbacks, {
                redirectCount: redirectCount + 1,
                currentUrl: nextUrl,
                disableRange
            });
        }

        if ((res.statusCode === 400 || res.statusCode === 416) && !disableRange && task.receivedBytes === 0) {
            res.resume();
            return executeHttpTransfer(task, callbacks, {
                redirectCount,
                currentUrl: fetchUrl,
                disableRange: true
            });
        }

        if (res.statusCode === 416 && task.receivedBytes > 0) {
            res.resume();
            task.receivedBytes = 0;
            task.lastReportBytes = 0;
            try { if (fs.existsSync(task.partPath)) fs.unlinkSync(task.partPath); } catch (e) {}
            return executeHttpTransfer(task, callbacks, {
                redirectCount,
                currentUrl: fetchUrl,
                disableRange: true
            });
        }

        if (res.statusCode >= 400) {
            const err = new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Download failed'}`);
            const isPermanent = [400, 410].includes(res.statusCode) && task.receivedBytes === 0 && (task.retryCount || 0) >= 2;
            res.resume();
            if (isPermanent) {
                return callbacks.onFatalError(task, err);
            }
            return callbacks.onTransientError(task, err);
        }

        task.resolvedUrl = fetchUrl;

        const contentRange = res.headers['content-range'];
        const parsedRange = parseContentRange(contentRange);
        if (parsedRange && parsedRange.total > 0) {
            task.totalBytes = parsedRange.total;
        } else {
            const contentLength = parseInt(res.headers['content-length'], 10);
            if (!isNaN(contentLength) && contentLength > 0) {
                task.totalBytes = res.statusCode === 206 ? requestedOffset + contentLength : contentLength;
            }
        }

        // Validate resume offset before appending so mismatched ranges never corrupt .part
        if (flags === 'a' && requestedOffset > 0) {
            if (res.statusCode === 206) {
                if (!parsedRange || parsedRange.start !== requestedOffset) {
                    console.warn(`[Downloader] Server returned mismatched Content-Range (${contentRange || 'missing'}) for offset ${requestedOffset}; restarting from 0`);
                    res.destroy();
                    task.receivedBytes = 0;
                    task.lastReportBytes = 0;
                    return executeHttpTransfer(task, callbacks, {
                        redirectCount,
                        currentUrl: fetchUrl,
                        disableRange: true
                    });
                }
            } else if (res.statusCode === 200) {
                flags = 'w';
                requestedOffset = 0;
                task.receivedBytes = 0;
                task.lastReportBytes = 0;
            }
        }

        let stream;
        try {
            stream = fs.createWriteStream(task.partPath, { flags, highWaterMark: 1024 * 1024 });
            task.fileStream = stream;
        } catch (err) {
            return callbacks.onFatalError(task, err);
        }

        task.lastDataTime = Date.now();
        task.lastReportTime = Date.now();
        task.lastReportBytes = task.receivedBytes;

        res.on('data', (chunk) => {
            if (task.status !== 'downloading' || task.fileStream !== stream) return;
            task.receivedBytes += chunk.length;
            task.lastDataTime = Date.now();
            task.retryCount = 0;
            callbacks.onProgress(task);
        });

        res.on('error', (err) => {
            if (task.fileStream !== stream) return;
            callbacks.onTransientError(task, err);
        });

        res.on('close', () => {
            if (task.status === 'downloading' && task.fileStream === stream && !res.complete && !stream.writableEnded) {
                stream.end();
            }
        });

        res.pipe(stream);

        stream.on('finish', () => {
            if (task.status !== 'downloading' || task.fileStream !== stream) return;
            task.fileStream = null;

            stream.close(() => {
                const diskSize = fs.existsSync(task.partPath) ? fs.statSync(task.partPath).size : 0;
                task.receivedBytes = diskSize;
                const isTruncated = !res.complete || (task.totalBytes > 0 && diskSize < task.totalBytes);
                if (isTruncated) {
                    return callbacks.onTransientError(
                        task,
                        new Error(`Connection closed early (${diskSize}/${task.totalBytes || '?'} bytes)`)
                    );
                }
                callbacks.onComplete(task);
            });
        });

        stream.on('error', (err) => {
            if (task.fileStream !== stream) return;
            callbacks.onFatalError(task, err);
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
        callbacks.onTransientError(task, err);
    });

    task.request = req;
}

module.exports = {
    abortTaskSockets,
    executeHttpTransfer
};
