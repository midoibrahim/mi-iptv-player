const { app, BrowserWindow, Menu, ipcMain, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const downloader = require('./downloader');
const companionCorePath = fs.existsSync(path.join(__dirname, 'companionCore.js'))
    ? './companionCore'
    : '../IPTVService/companionCore';
const companionCore = require(companionCorePath);

// Hardware video decoding & acceleration switches for 4K / 60fps IPTV playback
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Prevent Chromium from throttling or suspending background downloads when minimized, occluded, or screen-locked
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const PORT = 8089;
let mainWindow = null;
let companionServer = null;

function startCompanionServer() {
    const packagedStatic = path.join(__dirname, 'app');
    const devStatic = path.join(__dirname, '../IPTVPlayer');
    const staticDir = fs.existsSync(packagedStatic) ? packagedStatic : devStatic;

    const handler = companionCore.createCompanionHandler({
        port: PORT,
        host: 'windows',
        staticDir,
        preferredIfaces: ['Wi-Fi', 'Ethernet', 'wlan', 'eth', 'Local Area Connection'],
        onCredentialsReceived: (creds) => {
            console.log('[CompanionServer] Credentials received from phone:', creds && creds.type, creds && creds.name);
        }
    });

    companionServer = http.createServer(handler);

    companionServer.on('error', (err) => {
        console.warn('[CompanionServer] Port 8089 in use or error:', err.message);
    });

    companionServer.listen(PORT, '0.0.0.0', () => {
        const ip = handler.getLanIp();
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
            backgroundThrottling: false, // Keep timers and download IPC active when screen is locked or window is hidden
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

    mainWindow.webContents.on('console-message', (_event, _level, message) => {
        console.log(`[Renderer] ${message}`);
    });

    // F12 / Ctrl+Shift+I toggle DevTools shortcut
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

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

    // Recover any stalled network sockets if OS forced sleep/lock suspension
    powerMonitor.on('resume', () => {
        console.log('[Main] System resumed from sleep, checking active downloads...');
        downloader.recoverStalledDownloads();
    });
    powerMonitor.on('unlock-screen', () => {
        console.log('[Main] Screen unlocked, checking active downloads...');
        downloader.recoverStalledDownloads();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => {
    downloader.shutdown();
    if (companionServer) {
        try { companionServer.close(); } catch(e) {}
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
