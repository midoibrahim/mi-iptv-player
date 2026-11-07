/*
 * MI IPTV Player - Shared Companion HTTP Server Core
 *
 * Shared between:
 *   - IPTVService/service.js (webOS background JS service, Node 0.12+)
 *   - windows/main.js        (Windows Electron main process)
 *
 * Endpoints handled:
 *   GET  /setup.html        -> phone setup page (QR code target)
 *   GET  /api/info          -> { ip, port, setupUrl, host }
 *   GET  /api/credentials   -> poll & consume-once credentials submitted by phone
 *   POST /api/credentials   -> receive credentials JSON from phone
 *   GET  /api/proxy?url=... -> stream & HLS (.m3u8) manifest proxy
 *
 * IMPORTANT: webOS 3.x ships Node 0.12 -> this file must remain strict ES5
 * (no let/const, arrow functions, template literals, classes, destructuring).
 */
'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var os = require('os');
var path = require('path');
var urlLib = require('url');

var MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json'
};

var DEFAULT_PREFERRED_IFACES = [
    'wlan0',
    'eth0',
    'Wi-Fi',
    'Ethernet',
    'wlan',
    'eth',
    'Local Area Connection'
];

function getLanIp(preferred) {
    var ifaces = os.networkInterfaces();
    var prefs = preferred || DEFAULT_PREFERRED_IFACES;
    var candidates = [];

    Object.keys(ifaces).forEach(function (name) {
        (ifaces[name] || []).forEach(function (addr) {
            if (addr.family === 'IPv4' && !addr.internal) {
                candidates.push({ name: name, address: addr.address });
            }
        });
    });

    var i, j, prefLower;
    // 1. Exact interface name match first (e.g. wlan0, eth0 on webOS)
    for (i = 0; i < prefs.length; i++) {
        for (j = 0; j < candidates.length; j++) {
            if (candidates[j].name === prefs[i]) {
                return candidates[j].address;
            }
        }
    }
    // 2. Case-insensitive substring match (e.g. "Wi-Fi", "Ethernet 2" on Windows)
    for (i = 0; i < prefs.length; i++) {
        prefLower = String(prefs[i]).toLowerCase();
        for (j = 0; j < candidates.length; j++) {
            if (candidates[j].name.toLowerCase().indexOf(prefLower) >= 0) {
                return candidates[j].address;
            }
        }
    }

    return candidates.length ? candidates[0].address : '127.0.0.1';
}

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

function serveStatic(res, staticDir, pathname) {
    var target = pathname;
    if (target === '/' || target === '/setup' || target === '/setup/') {
        target = '/setup.html';
    }
    var resolvedRoot = path.normalize(staticDir);
    var file = path.normalize(path.join(resolvedRoot, target));
    if (file.indexOf(resolvedRoot) !== 0) {
        res.writeHead(403);
        res.end();
        return;
    }
    fs.readFile(file, function (err, data) {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Content-Length': data.length,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
}

function proxyStream(req, res, target, port, agents, redirects) {
    var hopCount = redirects || 0;
    var parsed;
    try { parsed = urlLib.parse(target); } catch (e) { parsed = null; }
    if (!parsed || !/^https?:$/.test(parsed.protocol || '')) {
        sendJson(res, 400, { error: 'Invalid url parameter' });
        return;
    }
    var headers = { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18', 'Accept': '*/*' };
    if (req.headers && req.headers.range) headers.Range = req.headers.range;

    var isHttps = parsed.protocol === 'https:';
    var lib = isHttps ? https : http;
    var agent = agents ? (isHttps ? agents.httpsAgent : agents.httpAgent) : undefined;

    var upstream = lib.request({
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        headers: headers,
        agent: agent,
        rejectUnauthorized: false
    }, function (up) {
        if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location && hopCount < 5) {
            up.resume();
            proxyStream(req, res, urlLib.resolve(target, up.headers.location), port, agents, hopCount + 1);
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
                    var hostHeader = (req.headers && req.headers.host) ? req.headers.host : ('127.0.0.1:' + port);
                    var proxyOrigin = 'http://' + hostHeader;
                    var rewritten = text.split(/\r?\n/).map(function (line) {
                        var trimmed = line.trim();
                        if (!trimmed) return line;
                        if (trimmed.charAt(0) === '#') {
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

    // Set connect/response-header timeout only, NOT an idle stream timeout on live video
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

function createCompanionHandler(options) {
    var opts = options || {};
    var port = opts.port || 8089;
    var hostLabel = opts.host || 'tv';
    var staticDir = opts.staticDir || path.join(__dirname, 'www');
    var preferredIfaces = opts.preferredIfaces || DEFAULT_PREFERRED_IFACES;
    var onPoll = typeof opts.onPoll === 'function' ? opts.onPoll : null;
    var onCredentialsReceived = typeof opts.onCredentialsReceived === 'function' ? opts.onCredentialsReceived : null;

    var pendingCredentials = null;
    var agents = {
        httpAgent: new http.Agent({ keepAlive: true, maxSockets: 16 }),
        httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 16, rejectUnauthorized: false })
    };

    function handle(req, res) {
        var parsed = urlLib.parse(req.url || '/', true);
        var p = parsed.pathname;

        if (req.method === 'OPTIONS') {
            sendJson(res, 200, {});
            return;
        }

        if (p === '/api/info' && req.method === 'GET') {
            if (onPoll) onPoll();
            var ip = getLanIp(preferredIfaces);
            sendJson(res, 200, {
                ip: ip,
                port: port,
                setupUrl: 'http://' + ip + ':' + port + '/setup.html',
                host: hostLabel
            });
            return;
        }

        if (p === '/api/credentials') {
            if (req.method === 'GET') {
                if (onPoll) onPoll();
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
                if (typeof req.setEncoding === 'function') req.setEncoding('utf8');
                req.on('data', function (c) {
                    raw += c;
                    if (raw.length > 64 * 1024 && typeof req.destroy === 'function') req.destroy();
                });
                req.on('end', function () {
                    try {
                        pendingCredentials = JSON.parse(raw);
                        if (onCredentialsReceived) onCredentialsReceived(pendingCredentials);
                        sendJson(res, 200, { status: 'ok', message: 'Credentials sent to TV successfully!' });
                    } catch (e) {
                        sendJson(res, 400, { status: 'error', message: String(e.message || e) });
                    }
                });
                return;
            }
        }

        if (p === '/api/proxy' && req.method === 'GET') {
            if (!parsed.query || !parsed.query.url) {
                sendJson(res, 400, { error: 'Missing url parameter' });
                return;
            }
            proxyStream(req, res, String(parsed.query.url), port, agents, 0);
            return;
        }

        if (req.method === 'GET') {
            serveStatic(res, staticDir, p);
            return;
        }

        sendJson(res, 404, { error: 'Endpoint not found' });
    }

    handle.resetCredentials = function () {
        pendingCredentials = null;
    };

    handle.getLanIp = function () {
        return getLanIp(preferredIfaces);
    };

    return handle;
}

module.exports = {
    getLanIp: getLanIp,
    sendJson: sendJson,
    serveStatic: serveStatic,
    proxyStream: proxyStream,
    createCompanionHandler: createCompanionHandler
};

