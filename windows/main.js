const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const urlLib = require('url');
const downloader = require('./downloader');

// Hardware video decoding & acceleration switches for 4K / 60fps IPTV playback
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const PORT = 8089;
let mainWindow = null;
let companionServer = null;
let pendingCredentials = null;

function getLanIp() {
    const ifaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(ifaces)) {
        for (const addr of (ifaces[name] || [])) {
            if (addr.family === 'IPv4' && !addr.internal) {
                candidates.push({ name, address: addr.address });
            }
        }
    }
    // Prioritize Wi-Fi and Ethernet adapters
    const preferred = ['Wi-Fi', 'Ethernet', 'wlan', 'eth', 'Local Area Connection'];
    for (const pref of preferred) {
        const found = candidates.find(c => c.name.toLowerCase().includes(pref.toLowerCase()));
        if (found) return found.address;
    }
    return candidates.length ? candidates[0].address : '127.0.0.1';
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json'
};

function sendJson(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
    });
    res.end(body);
}

function startCompanionServer() {
    const packagedStatic = path.join(__dirname, 'app');
    const devStatic = path.join(__dirname, '../IPTVPlayer');
    const staticDir = fs.existsSync(packagedStatic) ? packagedStatic : devStatic;

    companionServer = http.createServer((req, res) => {
        const parsed = urlLib.parse(req.url, true);
        const p = parsed.pathname;

        if (req.method === 'OPTIONS') {
            res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': '*'
            });
            res.end();
            return;
        }

        // GET /api/info -> { ip, port, setupUrl, host }
        if (p === '/api/info' && req.method === 'GET') {
            const ip = getLanIp();
            sendJson(res, 200, {
                ip: ip,
                port: PORT,
                setupUrl: `http://${ip}:${PORT}/setup.html`,
                host: 'windows'
            });
            return;
        }

        // GET /api/credentials -> return and consume pending credentials
        // POST /api/credentials -> save credentials from phone
        if (p === '/api/credentials') {
            if (req.method === 'GET') {
                if (pendingCredentials) {
                    const creds = pendingCredentials;
                    pendingCredentials = null; // consume once
                    sendJson(res, 200, { status: 'available', credentials: creds });
                } else {
                    sendJson(res, 200, { status: 'waiting' });
                }
                return;
            }
            if (req.method === 'POST') {
                let raw = '';
                req.setEncoding('utf8');
                req.on('data', chunk => {
                    raw += chunk;
                    if (raw.length > 64 * 1024) req.destroy();
                });
                req.on('end', () => {
                    try {
                        pendingCredentials = JSON.parse(raw);
                        console.log('[CompanionServer] Credentials received from phone:', pendingCredentials.type, pendingCredentials.name);
                        sendJson(res, 200, { status: 'ok', message: 'Credentials sent to player successfully!' });
                    } catch (e) {
                        sendJson(res, 400, { status: 'error', message: String(e.message || e) });
                    }
                });
                return;
            }
        }

        // Static files (setup.html, icon.png, largeicon.png, etc.)
        if (req.method === 'GET') {
            let targetFile = p;
            if (targetFile === '/' || targetFile === '/setup' || targetFile === '/setup/') {
                targetFile = '/setup.html';
            }
            const filePath = path.normalize(path.join(staticDir, targetFile));
            if (!filePath.startsWith(staticDir)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not found');
                } else {
                    const ext = path.extname(filePath).toLowerCase();
                    res.writeHead(200, {
                        'Content-Type': MIME[ext] || 'application/octet-stream',
                        'Content-Length': data.length,
                        'Cache-Control': 'no-cache',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(data);
                }
            });
            return;
        }

        sendJson(res, 404, { error: 'Endpoint not found' });
    });

    companionServer.on('error', (err) => {
        console.warn('[CompanionServer] Port 8089 in use or error:', err.message);
    });

    companionServer.listen(PORT, '0.0.0.0', () => {
        const ip = getLanIp();
        console.log(`[CompanionServer] Running at http://${ip}:${PORT}/setup.html`);
    });
}

function createWindow() {
    const packagedIcon = path.join(__dirname, 'app/icon.png');
    const devIcon = path.join(__dirname, '../IPTVPlayer/icon.png');
    const iconPath = fs.existsSync(packagedIcon) ? packagedIcon : devIcon;

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 640,
        minHeight: 360,
        title: 'MI IPTV Player',
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        icon: iconPath,
        webPreferences: {
            webSecurity: false,          // Disables CORS & mixed-content blocks for external IPTV streams
            nodeIntegration: false,
            contextIsolation: true,
            allowRunningInsecureContent: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    Menu.setApplicationMenu(null);

    // Maximize window on launch so it fills the user's desktop immediately
    mainWindow.maximize();

    // Set standard browser User-Agent so IPTV providers do not block API calls
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    mainWindow.webContents.setUserAgent(userAgent);

    const packagedHtml = path.join(__dirname, 'app/index.html');
    const devHtml = path.join(__dirname, '../IPTVPlayer/index.html');
    const indexPath = fs.existsSync(packagedHtml) ? packagedHtml : devHtml;

    mainWindow.loadFile(indexPath);
    downloader.setMainWindow(mainWindow);

    // Notify renderer when fullscreen state changes
    mainWindow.on('enter-full-screen', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('desktop-fullscreen-changed', true);
        }
    });

    mainWindow.on('leave-full-screen', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('desktop-fullscreen-changed', false);
        }
    });

    mainWindow.webContents.on('enter-html-full-screen', () => {
        if (mainWindow) mainWindow.setFullScreen(true);
    });

    mainWindow.webContents.on('leave-html-full-screen', () => {
        if (mainWindow) mainWindow.setFullScreen(false);
    });

    // Zero-pillarbox responsive scaling and dedicated Full Screen controls
    mainWindow.webContents.on('dom-ready', () => {
        // 1. Desktop CSS: Fullscreen & Edge-to-Edge Responsive Fitting
        mainWindow.webContents.insertCSS(`
            /* Complete edge-to-edge window fill with zero black pillarbox/letterbox gaps */
            html, body {
                width: 100vw !important;
                height: 100vh !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                background: #000000 !important;
                position: relative !important;
            }

            #app {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 1920px !important;
                height: 1080px !important;
                transform-origin: 0 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
            }

            /* Hide browse screens when video player is active so background never bleeds through */
            body.player-active #main-shell,
            body.player-active #series-detail-screen,
            body.player-active #login-screen {
                display: none !important;
            }

            /* Ensure player-screen fills 100% of #app with solid black background */
            #player-screen {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: #000000 !important;
                z-index: 500 !important;
            }

            #video-player {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
                background: #000000 !important;
            }

            #player-osd {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100% !important;
                height: 100% !important;
                z-index: 10 !important;
            }

            body.player-active #player-channel-drawer {
                z-index: 100005 !important;
            }

            body.player-active #player-drawer-backdrop {
                z-index: 100004 !important;
            }

            /* Dedicated Desktop Fullscreen Toggle Button in Main UI (Browse screens) */
            .desktop-fs-btn {
                position: fixed !important;
                top: 24px !important;
                right: 28px !important;
                z-index: 9999 !important;
                width: 50px !important;
                height: 50px !important;
                border-radius: 50% !important;
                background: rgba(15, 23, 42, 0.88) !important;
                backdrop-filter: blur(10px) !important;
                border: 2px solid rgba(255, 255, 255, 0.3) !important;
                color: #FFFFFF !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6) !important;
                transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease !important;
            }
            .desktop-fs-btn:hover,
            .desktop-fs-btn:focus {
                background: var(--accent, #00a8ff) !important;
                border-color: #FFFFFF !important;
                transform: scale(1.10) !important;
                outline: none !important;
            }
            .desktop-fs-btn svg {
                width: 24px !important;
                height: 24px !important;
                pointer-events: none !important;
            }
            body.player-active .desktop-fs-btn {
                display: none !important;
            }

            /* Player OSD Download Button Styling */
            #osd-download-btn {
                cursor: pointer !important;
            }
            #osd-download-btn svg {
                width: 28px !important;
                height: 28px !important;
                pointer-events: none !important;
            }

            /* Player OSD Fullscreen Button Styling */
            #osd-fullscreen-btn {
                cursor: pointer !important;
            }
            #osd-fullscreen-btn svg {
                width: 32px !important;
                height: 32px !important;
                pointer-events: none !important;
            }
        `);

        // 2. Desktop JavaScript: Adaptive Fitting, Full Screen Button Injection & Shortcuts
        mainWindow.webContents.executeJavaScript(`
            (function() {
                // SVG Icons for Fullscreen Expand / Compress
                var SVG_EXPAND = '<svg class="osd-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
                var SVG_COMPRESS = '<svg class="osd-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6 7 7M10 10V4m0 6H4m6 0L3 3m10 7h6m-6 0V4m0 6 7-7"></path></svg>';

                // Edge-to-edge window fitting (eliminates all letterbox and pillarbox bars)
                function fitWindow() {
                    var app = document.getElementById('app');
                    if (!app) return;
                    var w = window.innerWidth;
                    var h = window.innerHeight;
                    var scaleX = w / 1920;
                    var scaleY = h / 1080;
                    app.style.transform = 'scale(' + scaleX + ', ' + scaleY + ')';
                }
                window.addEventListener('resize', fitWindow);
                fitWindow();
                setTimeout(fitWindow, 50);
                setTimeout(fitWindow, 250);

                // Inject Full Screen button into Player OSD top bar
                function injectPlayerFullscreenBtn() {
                    var osdTop = document.querySelector('.osd-top');
                    var osdClock = document.getElementById('osd-clock');
                    if (!osdTop || document.getElementById('osd-fullscreen-btn')) return;

                    var btn = document.createElement('button');
                    btn.id = 'osd-fullscreen-btn';
                    btn.className = 'osd-btn';
                    btn.tabIndex = 0;
                    btn.title = 'Full Screen (F11 / Double-Click / F)';
                    btn.innerHTML = SVG_EXPAND;

                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (window.electronDesktop) {
                            window.electronDesktop.toggleFullScreen();
                        }
                    });

                    if (osdClock) {
                        osdTop.insertBefore(btn, osdClock);
                    } else {
                        osdTop.appendChild(btn);
                    }
                }

                // Inject Download button into Player OSD top bar for movies & episodes
                function injectPlayerDownloadBtn() {
                    var osdTop = document.querySelector('.osd-top');
                    var osdClock = document.getElementById('osd-clock');
                    if (!osdTop) return;

                    var btn = document.getElementById('osd-download-btn');
                    if (!btn) {
                        btn = document.createElement('button');
                        btn.id = 'osd-download-btn';
                        btn.className = 'osd-btn';
                        btn.tabIndex = 0;
                        btn.title = 'Download Video to PC';
                        btn.innerHTML = '<svg class="osd-svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25C12.4142 2.25 12.75 2.58579 12.75 3V13.6893L15.9697 10.4697C16.2626 10.1768 16.7374 10.1768 17.0303 10.4697C17.3232 10.7626 17.3232 11.2374 17.0303 11.5303L12.5303 16.0303C12.2374 16.3232 11.7626 16.3232 11.4697 16.0303L6.96967 11.5303C6.67678 11.2374 6.67678 10.7626 6.96967 10.4697C7.26256 10.1768 7.73744 10.1768 8.03033 10.4697L11.25 13.6893V3C11.25 2.58579 11.5858 2.25 12 2.25Z"/><path d="M3.75 16.5C4.16421 16.5 4.5 16.8358 4.5 17.25V18.75C4.5 19.1642 4.83579 19.5 5.25 19.5H18.75C19.1642 19.5 19.5 19.1642 19.5 18.75V17.25C19.5 16.8358 19.8358 16.5 20.25 16.5C20.6642 16.5 21 16.8358 21 17.25V18.75C21 19.9926 19.9926 21 18.75 21H5.25C4.00736 21 3 19.9926 3 18.75V17.25C3 16.8358 3.33579 16.5 3.75 16.5Z"/></svg>';

                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            if (window.IPTV && window.IPTV.DownloadManager && window.app && window.app.playerService) {
                                var item = window.app.playerService.currentItem;
                                if (item) {
                                    if (item.type === 'series' && item.seriesContext) {
                                        var sc = item.seriesContext;
                                        window.IPTV.DownloadManager.downloadEpisode(
                                            { id: sc.seriesId, name: sc.seriesName, poster: sc.poster },
                                            { id: sc.currentEpisodeId, title: sc.currentEpisodeTitle, episode_num: sc.currentEpisodeNum, url: item.url },
                                            sc.currentSeason,
                                            sc.currentEpisodeIndex
                                        );
                                    } else if (item.type !== 'live') {
                                        window.IPTV.DownloadManager.downloadMovie(item);
                                    }
                                }
                            }
                        });

                        var fsBtn = document.getElementById('osd-fullscreen-btn');
                        if (fsBtn) {
                            osdTop.insertBefore(btn, fsBtn);
                        } else if (osdClock) {
                            osdTop.insertBefore(btn, osdClock);
                        } else {
                            osdTop.appendChild(btn);
                        }
                    }

                    if (window.app && window.app.playerService) {
                        var cur = window.app.playerService.currentItem;
                        btn.style.display = (cur && cur.type !== 'live') ? 'inline-flex' : 'none';
                    }
                }

                // Inject Floating Full Screen button for Browse / Main screens
                function injectDesktopFullscreenBtn() {
                    if (document.getElementById('desktop-fullscreen-btn')) return;
                    var btn = document.createElement('button');
                    btn.id = 'desktop-fullscreen-btn';
                    btn.className = 'desktop-fs-btn';
                    btn.tabIndex = 0;
                    btn.title = 'Toggle Full Screen (F11 / F)';
                    btn.innerHTML = SVG_EXPAND;

                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (window.electronDesktop) {
                            window.electronDesktop.toggleFullScreen();
                        }
                    });

                    document.body.appendChild(btn);
                }

                // Double-click on player to toggle full screen (like YouTube / VLC)
                function setupDoubleClickHandler() {
                    var playerScreen = document.getElementById('player-screen');
                    if (!playerScreen) return;

                    playerScreen.addEventListener('dblclick', function(e) {
                        if (e.target.closest('button, input, .progress-bar, #player-channel-drawer, .drawer-header, .drawer-channel-list')) {
                            return; // Do not toggle when interacting with buttons or channel list
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        if (window.electronDesktop) {
                            window.electronDesktop.toggleFullScreen();
                        }
                    });
                }

                // Keyboard shortcuts: F / f to toggle full screen, Esc to exit full screen
                window.addEventListener('keydown', function(e) {
                    var tag = (document.activeElement && document.activeElement.tagName) || '';
                    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

                    if (e.key === 'f' || e.key === 'F') {
                        e.preventDefault();
                        if (window.electronDesktop) {
                            window.electronDesktop.toggleFullScreen();
                        }
                    } else if (e.key === 'Escape') {
                        if (window.electronDesktop) {
                            window.electronDesktop.isFullScreen().then(function(isFs) {
                                if (isFs) window.electronDesktop.setFullScreen(false);
                            });
                        }
                    } else if (e.key === 'ArrowRight' && document.activeElement && document.activeElement.id === 'osd-fav') {
                        var fsBtn = document.getElementById('osd-fullscreen-btn');
                        if (fsBtn) {
                            e.stopPropagation();
                            fsBtn.focus();
                        }
                    } else if (e.key === 'ArrowLeft' && document.activeElement && document.activeElement.id === 'osd-fullscreen-btn') {
                        var favBtn = document.getElementById('osd-fav');
                        if (favBtn) {
                            e.stopPropagation();
                            favBtn.focus();
                        }
                    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement && document.activeElement.id === 'osd-fullscreen-btn') {
                        var pp = document.getElementById('osd-playpause');
                        if (pp) {
                            e.stopPropagation();
                            pp.focus();
                        }
                    }
                }, true);

                // Update icons when fullscreen state changes
                if (window.electronDesktop) {
                    window.electronDesktop.onFullScreenChange(function(isFs) {
                        var osdBtn = document.getElementById('osd-fullscreen-btn');
                        var deskBtn = document.getElementById('desktop-fullscreen-btn');
                        var icon = isFs ? SVG_COMPRESS : SVG_EXPAND;
                        var title = isFs ? 'Exit Full Screen (F11 / Esc / F)' : 'Full Screen (F11 / Double-Click / F)';
                        if (osdBtn) {
                            osdBtn.innerHTML = icon;
                            osdBtn.title = title;
                        }
                        if (deskBtn) {
                            deskBtn.innerHTML = icon;
                            deskBtn.title = title;
                        }
                        fitWindow();
                    });
                }

                // Initial setup
                injectPlayerFullscreenBtn();
                injectDesktopFullscreenBtn();
                setupDoubleClickHandler();

                // Re-check periodically in case DOM re-rendered
                setInterval(function() {
                    injectPlayerFullscreenBtn();
                    injectDesktopFullscreenBtn();
                }, 1000);
            })();
        `);
    });

    // Handle Fullscreen toggle with F11 & Alt+Enter
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown') {
            if (input.key === 'F11' || (input.alt && input.key === 'Return')) {
                mainWindow.setFullScreen(!mainWindow.isFullScreen());
                event.preventDefault();
            }
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        downloader.setMainWindow(null);
    });
}

let ipcRegistered = false;
function setupIpcHandlers() {
    if (ipcRegistered) return;
    ipcRegistered = true;

    // Fullscreen IPC Handlers
    ipcMain.on('desktop-toggle-fullscreen', () => {
        if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
    });
    ipcMain.on('desktop-set-fullscreen', (_e, flag) => {
        if (mainWindow) mainWindow.setFullScreen(Boolean(flag));
    });
    ipcMain.handle('desktop-is-fullscreen', () => {
        return mainWindow ? mainWindow.isFullScreen() : false;
    });

    // Downloads IPC Handlers
    ipcMain.handle('downloads-get-all', () => downloader.getAll());
    ipcMain.handle('downloads-get-settings', () => downloader.getSettings());
    ipcMain.handle('downloads-update-settings', (_e, s) => downloader.updateSettings(s));
    ipcMain.handle('downloads-select-directory', () => downloader.selectDirectory());
    ipcMain.handle('downloads-open-folder', (_e, dir) => downloader.openFolder(dir));
    ipcMain.handle('downloads-show-in-folder', (_e, file) => downloader.showInFolder(file));
    ipcMain.handle('downloads-open-file', (_e, file) => downloader.openFile(file));
    ipcMain.handle('downloads-start', (_e, item, opts) => downloader.startDownload(item, opts));
    ipcMain.handle('downloads-start-batch', (_e, items, opts) => downloader.startBatchDownloads(items, opts));
    ipcMain.handle('downloads-pause', (_e, id) => downloader.pauseDownload(id));
    ipcMain.handle('downloads-resume', (_e, id) => downloader.resumeDownload(id));
    ipcMain.handle('downloads-cancel', (_e, id) => downloader.cancelDownload(id));
    ipcMain.handle('downloads-delete', (_e, id) => downloader.deleteDownloadedFile(id));
    ipcMain.handle('downloads-clear-history', () => downloader.clearHistory());
    ipcMain.handle('downloads-convert-to-mp4', (_e, id) => downloader.convertItemToMp4(id));
}

app.whenReady().then(() => {
    setupIpcHandlers();
    startCompanionServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => {
    if (companionServer) {
        try { companionServer.close(); } catch(e) {}
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
