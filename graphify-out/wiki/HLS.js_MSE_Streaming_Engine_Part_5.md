# HLS.js MSE Streaming Engine (Part 5)

> 88 nodes · cohesion 0.06

## Key Concepts

- **Downloader** (52 connections) — `windows/downloader.js`
- **downloader.js** (27 connections) — `windows/downloader.js`
- **downloadUtils.js** (21 connections) — `windows/downloadUtils.js`
- **._executeDownload()** (18 connections) — `windows/downloader.js`
- **._sendToRenderer()** (14 connections) — `windows/downloader.js`
- **main.js** (14 connections) — `windows/main.js`
- **._processQueue()** (13 connections) — `windows/downloader.js`
- **._serializeTask()** (12 connections) — `windows/downloader.js`
- **.startDownload()** (12 connections) — `windows/downloader.js`
- **._completeTask()** (11 connections) — `windows/downloader.js`
- **._handleError()** (11 connections) — `windows/downloader.js`
- **._attachStreamToSegment()** (9 connections) — `windows/downloader.js`
- **._abortTaskSockets()** (8 connections) — `windows/downloader.js`
- **._handleTransientOrFatalError()** (8 connections) — `windows/downloader.js`
- **._runSegment()** (8 connections) — `windows/downloader.js`
- **.recoverStalledDownloads()** (7 connections) — `windows/downloader.js`
- **._reportProgress()** (7 connections) — `windows/downloader.js`
- **._syncPowerSaveBlocker()** (7 connections) — `windows/downloader.js`
- **._formatBytes()** (6 connections) — `windows/downloader.js`
- **.resumeDownload()** (6 connections) — `windows/downloader.js`
- **._saveSegmentMeta()** (6 connections) — `windows/downloader.js`
- **.startBatchDownloads()** (6 connections) — `windows/downloader.js`
- **.updateSettings()** (6 connections) — `windows/downloader.js`
- **ref_path** (6 connections)
- **.cancelDownload()** (5 connections) — `windows/downloader.js`
- *... and 63 more nodes in this community*

## Relationships

- [main.js & { app, BrowserWindow, ...](main.js_&_{_app,_BrowserWindow,_.md) (7 shared connections)
- [Community 32](Community_32.md) (3 shared connections)
- [Package Configuration & Dependencies (17)](Package_Configuration_&_Dependencies_17.md) (2 shared connections)
- [Browse View & Playlist Virtualization](Browse_View_&_Playlist_Virtualization.md) (1 shared connections)
- [Download UI & Task Management](Download_UI_&_Task_Management.md) (1 shared connections)

## Source Files

- `windows/downloadUtils.js`
- `windows/downloader.js`
- `windows/main.js`

## Audit Trail

- EXTRACTED: 228 (94%)
- INFERRED: 14 (6%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*