# webOS Background Luna Service

> 15 nodes · cohesion 0.24

## Key Concepts

- **service.js** (18 connections) — `IPTVService/service.js`
- **handle()** (6 connections) — `IPTVService/service.js`
- **ensureServer()** (5 connections) — `IPTVService/service.js`
- **proxy()** (5 connections) — `IPTVService/service.js`
- **log()** (4 connections) — `IPTVService/service.js`
- **getLanIp()** (3 connections) — `IPTVService/service.js`
- **sendJson()** (3 connections) — `IPTVService/service.js`
- **shutdownServer()** (3 connections) — `IPTVService/service.js`
- **ref_http** (3 connections)
- **keepAlive()** (2 connections) — `IPTVService/service.js`
- **serveStatic()** (2 connections) — `IPTVService/service.js`
- **ref_https** (2 connections)
- **ref_os** (2 connections)
- **IMPORTANT: webOS 3.x ships Node 0.12 -> this file must stay plain ES5** (1 connections) — `IPTVService/service.js`
- **ref_webos_service** (1 connections)

## Relationships

- [Electron Background Downloader](Electron_Background_Downloader.md) (3 shared connections)
- [test_diag.js & { app, BrowserWin...](test_diag.js_&_{_app,_BrowserWin.md) (2 shared connections)
- [main.js & { app, BrowserWindow, ...](main.js_&_{_app,_BrowserWindow,_.md) (2 shared connections)
- [Core Application Shell & Coordinator](Core_Application_Shell_&_Coordinator.md) (1 shared connections)

## Source Files

- `IPTVService/service.js`

## Audit Trail

- EXTRACTED: 32 (94%)
- INFERRED: 2 (6%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*