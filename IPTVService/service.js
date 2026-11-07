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
var path = require('path');
var Service = require('webos-service');
var companionCore = require('./companionCore');

var SERVICE_ID = 'com.miiptv.player.service';
var PORT = 8089;
var STATIC_DIR = path.join(__dirname, 'www');
var PREFERRED_IFACES = ['wlan0', 'eth0'];

var service = new Service(SERVICE_ID);
var server = null;
var serverError = null;
var keepAliveActivity = null;
var activeSockets = [];
var lastPollTime = 0;
var pollWatchdogTimer = null;

function log(msg) {
    try { console.log('[miiptv-service] ' + msg); } catch (e) { /* ignore */ }
}

var companionHandler = companionCore.createCompanionHandler({
    port: PORT,
    host: 'tv',
    staticDir: STATIC_DIR,
    preferredIfaces: PREFERRED_IFACES,
    onPoll: function () {
        lastPollTime = Date.now();
    }
});

function ensureServer(cb) {
    if (server && server.listening !== false && !serverError) { cb(null); return; }
    serverError = null;
    activeSockets = [];
    server = http.createServer(companionHandler);
    server.on('connection', function (socket) {
        activeSockets.push(socket);
        socket.on('close', function () {
            var idx = activeSockets.indexOf(socket);
            if (idx >= 0) activeSockets.splice(idx, 1);
        });
    });
    server.on('error', function (e) {
        serverError = e;
        log('server error: ' + e.message);
        cb(e);
        cb = function () {};
    });
    server.listen(PORT, '0.0.0.0', function () {
        lastPollTime = Date.now();
        if (pollWatchdogTimer) clearInterval(pollWatchdogTimer);
        pollWatchdogTimer = setInterval(function () {
            // The QR setup screen polls /api/credentials every 1.5s.
            // If no poll arrives for 6 seconds, the user left the QR setup screen -> shut down immediately!
            if (Date.now() - lastPollTime > 6000) {
                log('No QR poll for 6s -> shutting down setup server');
                shutdownServer();
                setTimeout(function () {
                    try { process.exit(0); } catch (e) { /* ignore */ }
                }, 100);
            }
        }, 2000);
        log('listening on ' + companionHandler.getLanIp() + ':' + PORT);
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
    if (pollWatchdogTimer) {
        clearInterval(pollWatchdogTimer);
        pollWatchdogTimer = null;
    }
    if (activeSockets && activeSockets.length) {
        for (var i = 0; i < activeSockets.length; i++) {
            try { activeSockets[i].destroy(); } catch (e) { /* ignore */ }
        }
        activeSockets = [];
    }
    if (server) {
        try { server.close(); } catch (e) { /* ignore */ }
        server = null;
    }
    serverError = null;
    companionHandler.resetCredentials();
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
        var ip = companionHandler.getLanIp();
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
    setTimeout(function () {
        try { process.exit(0); } catch (e) { /* ignore */ }
    }, 120);
});
