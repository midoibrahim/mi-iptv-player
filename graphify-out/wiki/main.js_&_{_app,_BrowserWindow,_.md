# main.js & { app, BrowserWindow, ...

> 13 nodes · cohesion 0.18

## Key Concepts

- **main.js** (20 connections) — `windows/main.js`
- **startCompanionServer()** (3 connections) — `windows/main.js`
- **getLanIp()** (2 connections) — `windows/main.js`
- **sendJson()** (2 connections) — `windows/main.js`
- **{ app, BrowserWindow, Menu, ipcMain }** (1 connections) — `windows/main.js`
- **createWindow()** (1 connections) — `windows/main.js`
- **fs** (1 connections) — `windows/main.js`
- **http** (1 connections) — `windows/main.js`
- **MIME** (1 connections) — `windows/main.js`
- **os** (1 connections) — `windows/main.js`
- **path** (1 connections) — `windows/main.js`
- **setupIpcHandlers()** (1 connections) — `windows/main.js`
- **urlLib** (1 connections) — `windows/main.js`

## Relationships

- [Electron Background Downloader](Electron_Background_Downloader.md) (3 shared connections)
- [test_diag.js & { app, BrowserWin...](test_diag.js_&_{_app,_BrowserWin.md) (2 shared connections)
- [webOS Background Luna Service](webOS_Background_Luna_Service.md) (2 shared connections)
- [Package Configuration & Dependencies (30)](Package_Configuration_&_Dependencies_30.md) (1 shared connections)

## Source Files

- `windows/main.js`

## Audit Trail

- EXTRACTED: 21 (95%)
- INFERRED: 1 (5%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*