# Login View & Profile Selector

> 20 nodes · cohesion 0.15

## Key Concepts

- **downloader.js** (22 connections) — `windows/downloader.js`
- **downloadUtils.js** (16 connections) — `windows/downloadUtils.js`
- **resolveDownloadTarget()** (5 connections) — `windows/downloadUtils.js`
- **ref_url** (4 connections)
- **ensureDir()** (4 connections) — `windows/downloadUtils.js`
- **formatBytes()** (4 connections) — `windows/downloadUtils.js`
- **sanitizeFileName()** (4 connections) — `windows/downloadUtils.js`
- **serializeTask()** (4 connections) — `windows/downloadUtils.js`
- **remuxToMp4()** (3 connections) — `windows/downloadUtils.js`
- **._sanitizeFileName()** (2 connections) — `windows/downloader.js`
- **{ app, dialog, shell }** (1 connections) — `windows/downloader.js`
- **fs** (1 connections) — `windows/downloader.js`
- **http** (1 connections) — `windows/downloader.js`
- **https** (1 connections) — `windows/downloader.js`
- **path** (1 connections) — `windows/downloader.js`
- **{ URL }** (1 connections) — `windows/downloader.js`
- **fs** (1 connections) — `windows/downloadUtils.js`
- **path** (1 connections) — `windows/downloadUtils.js`
- **{ spawn }** (1 connections) — `windows/downloadUtils.js`
- **{ URL }** (1 connections) — `windows/downloadUtils.js`

## Relationships

- [HLS.js MSE Streaming Engine (Part 5)](HLS.js_MSE_Streaming_Engine_Part_5.md) (7 shared connections)
- [main.js & { app, BrowserWindow, ...](main.js_&_{_app,_BrowserWindow,_.md) (4 shared connections)
- [HLS.js MSE Streaming Engine (Part 33)](HLS.js_MSE_Streaming_Engine_Part_33.md) (4 shared connections)
- [Community 41](Community_41.md) (2 shared connections)
- [Package Configuration & Dependencies (17)](Package_Configuration_&_Dependencies_17.md) (1 shared connections)
- [Browse View & Playlist Virtualization](Browse_View_&_Playlist_Virtualization.md) (1 shared connections)
- [Theme Engine & Design Tokens](Theme_Engine_&_Design_Tokens.md) (1 shared connections)

## Source Files

- `windows/downloadUtils.js`
- `windows/downloader.js`

## Audit Trail

- EXTRACTED: 42 (86%)
- INFERRED: 7 (14%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*