# Electron Background Downloader

> 10 nodes · cohesion 0.20

## Key Concepts

- **downloader.js** (17 connections) — `windows/downloader.js`
- **Windows Desktop Offline Download System** (3 connections) — `windows/main.js`
- **ref_url** (3 connections)
- **{ app, dialog, shell }** (1 connections) — `windows/downloader.js`
- **fs** (1 connections) — `windows/downloader.js`
- **http** (1 connections) — `windows/downloader.js`
- **https** (1 connections) — `windows/downloader.js`
- **path** (1 connections) — `windows/downloader.js`
- **{ spawn }** (1 connections) — `windows/downloader.js`
- **{ URL }** (1 connections) — `windows/downloader.js`

## Relationships

- [main.js & { app, BrowserWindow, ...](main.js_&_{_app,_BrowserWindow,_.md) (3 shared connections)
- [webOS Background Luna Service](webOS_Background_Luna_Service.md) (3 shared connections)
- [test_diag.js & { app, BrowserWin...](test_diag.js_&_{_app,_BrowserWin.md) (2 shared connections)
- [Download UI & Task Management](Download_UI_&_Task_Management.md) (1 shared connections)
- [Package Configuration & Dependencies (30)](Package_Configuration_&_Dependencies_30.md) (1 shared connections)
- [build.js & appDir](build.js_&_appDir.md) (1 shared connections)
- [Electron Background Downloader](Electron_Background_Downloader.md) (1 shared connections)

## Source Files

- `windows/downloader.js`
- `windows/main.js`

## Audit Trail

- EXTRACTED: 18 (86%)
- INFERRED: 3 (14%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*