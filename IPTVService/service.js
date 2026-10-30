/*
 * MI IPTV Player - on-TV companion service (webOS JS service)
 *
 * Runs on the TV itself and replaces the PC-only server.py:
 *   GET  /setup.html        -> phone setup page (QR code target)
 *   GET  /api/info          -> { ip, port, setupUrl }  (TV's real LAN IP)
 *   GET  /api/credentials   -> TV app polls for credentials sent by the phone
 *   POST /api/credentials   -> phone submits credentials
 *   GET  /api/proxy?url=... -> stream proxy (bypasses CORS / User-Agent blocks)
 *
 * IMPORTANT: webOS 3.x ships Node 0.12 -> this file must stay plain ES5
 * (no let/const, arrow functions, template literals, classes, etc.).
 */
'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var os = require('os');
var path = require('path');
var urlLib = require('url');
var Service = require('webos-service');

var SERVICE_ID = 'com.miiptv.player.service';
var PORT = 8089;
var STATIC_DIR = path.join(__dirname, 'www');

var service = new Service(SERVICE_ID);
var server = null;
var serverError = null;
var pendingCredentials = null;
var keepAliveActivity = null;

function log(msg) {
    try { console.log('[miiptv-service] ' + msg); } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ LAN IP */
function getLanIp() {
    var ifaces = os.networkInterfaces();
    var preferred = ['wlan0', 'eth0'];
    var candidates = [];
    Object.keys(ifaces).forEach(function (name) {
        (ifaces[name] || []).forEach(function (addr) {
            if (addr.family === 'IPv4' && !addr.internal) {
                candidates.push({ name: name, address: addr.address });
            }
        });
    });
    for (var i = 0; i < preferred.length; i++) {
        for (var j = 0; j < candidates.length; j++) {
            if (candidates[j].name === preferred[i]) return candidates[j].address;
        }
    }
    return candidates.length ? candidates[0].address : '127.0.0.1';
}

/* ------------------------------------------------------------------ helpers */
function sendJson(res, code, obj) {
    var body = JSON.stringify(obj);
    res.writeHead(code, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(body);
}

var MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json'
};

function serveStatic(res, pathname) {
    if (pathname === '/' || pathname === '/setup' || pathname === '/setup/') pathname = '/setup.html';
    var file = path.normalize(path.join(STATIC_DIR, pathname));
    if (file.indexOf(STATIC_DIR) !== 0) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, function (err, data) {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Content-Length': data.length,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
}

function proxy(req, res, target, redirects) {
    var parsed;
    try { parsed = urlLib.parse(target); } catch (e) { parsed = null; }
    if (!parsed || !/^https?:$/.test(parsed.protocol || '')) {
        sendJson(res, 400, { error: 'Invalid url parameter' });
        return;
    }
    var headers = { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18', 'Accept': '*/*' };
    if (req.headers.range) headers.Range = req.headers.range;

    var lib = parsed.protocol === 'https:' ? https : http;
    var upstream = lib.request({
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        headers: headers,
        rejectUnauthorized: false
    }, function (up) {
        if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location && redirects < 5) {
            up.resume();
            proxy(req, res, urlLib.resolve(target, up.headers.location), redirects + 1);
            return;
        }
        var ctype = (up.headers['content-type'] || '').toLowerCase();
        var isM3u8 = target.toLowerCase().indexOf('.m3u8') >= 0 ||
            ctype.indexOf('mpegurl') >= 0 ||
            ctype.indexOf('x-mpegurl') >= 0;

        var out = {
            'Content-Type': up.headers['content-type'] ||
                (isM3u8 ? 'application/vnd.apple.mpegurl' : 'video/mp2t'),
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        };

        // If this is an HLS playlist (.m3u8), buffer & rewrite relative segment/variant URLs
        // so that all child requests also route through /api/proxy with the final redirected base URL.
        if (isM3u8 && up.statusCode >= 200 && up.statusCode < 300) {
            var chunks = [];
            up.on('data', function (chunk) { chunks.push(chunk); });
            up.on('end', function () {
                try {
                    var text = Buffer.concat(chunks).toString('utf8');
                    var proxyOrigin = 'http://' + (req.headers.host || '127.0.0.1:' + PORT);
                    var rewritten = text.split(/\r?\n/).map(function (line) {
                        var trimmed = line.trim();
                        if (!trimmed) return line;
                        if (trimmed.charAt(0) === '#') {
                            // Rewrite URI="..." attributes inside #EXT-X-KEY / #EXT-X-MAP / #EXT-X-MEDIA
                            return line.replace(/URI="([^"]+)"/g, function (m, uriVal) {
                                var absUri = urlLib.resolve(target, uriVal);
                                return 'URI="' + proxyOrigin + '/api/proxy?url=' + encodeURIComponent(absUri) + '"';
                            });
                        }
                        var absUrl = urlLib.resolve(target, trimmed);
                        return proxyOrigin + '/api/proxy?url=' + encodeURIComponent(absUrl);
                    }).join('\n');
                    var buf = typeof Buffer.from === 'function' ? Buffer.from(rewritten, 'utf8') : new Buffer(rewritten, 'utf8');
                    out['Content-Type'] = 'application/vnd.apple.mpegurl';
                    out['Content-Length'] = buf.length;
                    res.writeHead(up.statusCode, out);
                    res.end(buf);
                } catch (e) {
                    res.writeHead(500);
                    res.end();
                }
            });
            return;
        }

        ['content-length', 'content-range', 'accept-ranges'].forEach(function (h) {
            if (up.headers[h]) out[h] = up.headers[h];
        });
        res.writeHead(up.statusCode, out);
        up.pipe(res);
    });
    // Only set a connect/response-header timeout, NOT an idle stream timeout on live video!
    upstream.on('socket', function (socket) {
        socket.setTimeout(15000);
        socket.once('timeout', function () { upstream.abort(); });
    });
    upstream.on('response', function () {
        if (upstream.socket) upstream.socket.setTimeout(0);
    });
    upstream.on('error', function (e) {
        if (!res.headersSent) sendJson(res, 502, { error: 'Streaming proxy error: ' + e.message });
        else res.end();
    });
    req.on('close', function () { upstream.abort(); });
    upstream.end();
}

/* ------------------------------------------------------------------ HTTP server */
function handle(req, res) {
    var parsed = urlLib.parse(req.url, true);
    var p = parsed.pathname;

    if (req.method === 'OPTIONS') { sendJson(res, 200, {}); return; }

    if (p === '/api/info' && req.method === 'GET') {
        var ip = getLanIp();
        sendJson(res, 200, { ip: ip, port: PORT, setupUrl: 'http://' + ip + ':' + PORT + '/setup.html', host: 'tv' });
        return;
    }

    if (p === '/api/credentials') {
        if (req.method === 'GET') {
            if (pendingCredentials) {
                var creds = pendingCredentials;
                pendingCredentials = null; // consume once
                sendJson(res, 200, { status: 'available', credentials: creds });
            } else {
                sendJson(res, 200, { status: 'waiting' });
            }
            return;
        }
        if (req.method === 'POST') {
            var raw = '';
            req.setEncoding('utf8');
            req.on('data', function (c) { raw += c; if (raw.length > 64 * 1024) req.destroy(); });
            req.on('end', function () {
                try {
                    pendingCredentials = JSON.parse(raw);
                    sendJson(res, 200, { status: 'ok', message: 'Credentials sent to TV successfully!' });
                } catch (e) {
                    sendJson(res, 400, { status: 'error', message: String(e.message || e) });
                }
            });
            return;
        }
    }

    if (p === '/api/proxy' && req.method === 'GET') {
        if (!parsed.query.url) { sendJson(res, 400, { error: 'Missing url parameter' }); return; }
        proxy(req, res, String(parsed.query.url), 0);
        return;
    }

    if (req.method === 'GET') { serveStatic(res, p); return; }
    sendJson(res, 404, { error: 'Endpoint not found' });
}

function ensureServer(cb) {
    if (server && server.listening !== false && !serverError) { cb(null); return; }
    serverError = null;
    server = http.createServer(handle);
    server.on('error', function (e) {
        serverError = e;
        log('server error: ' + e.message);
        cb(e);
        cb = function () {};
    });
    server.listen(PORT, '0.0.0.0', function () {
        log('listening on ' + getLanIp() + ':' + PORT);
        cb(null);
        cb = function () {};
    });
}

function keepAlive() {
    if (keepAliveActivity) return;
    try {
        service.activityManager.create('miiptvKeepAlive', function (activity) {
            keepAliveActivity = activity;
        });
    } catch (e) {
        log('keepAlive failed: ' + e.message);
    }
}

function shutdownServer() {
    if (server) {
        try { server.close(); } catch (e) { /* ignore */ }
        server = null;
    }
    serverError = null;
    pendingCredentials = null;
    if (keepAliveActivity) {
        try { keepAliveActivity.complete(); } catch (e) { /* ignore */ }
        keepAliveActivity = null;
    }
    log('HTTP server on port ' + PORT + ' terminated');
}

/* ------------------------------------------------------------------ luna API */
// luna://com.miiptv.player.service/start  { subscribe: true }
// Active only while the QR setup screen is shown; closes immediately when
// the subscription is cancelled or `stop` is called.
service.register('start', function (message) {
    keepAlive();
    ensureServer(function (err) {
        var ip = getLanIp();
        if (err && err.code !== 'EADDRINUSE') {
            message.respond({ returnValue: false, errorText: String(err.message || err) });
            return;
        }
        message.respond({
            returnValue: true,
            subscribed: !!message.isSubscription,
            ip: ip,
            port: PORT,
            setupUrl: 'http://' + ip + ':' + PORT + '/setup.html'
        });
    });
}, function () {
    // Subscription cancelled (QR screen exited or app closed) -> terminate HTTP server immediately
    log('start subscription cancelled -> shutting down server');
    shutdownServer();
});

service.register('stop', function (message) {
    shutdownServer();
    message.respond({ returnValue: true });
});

