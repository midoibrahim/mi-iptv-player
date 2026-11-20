# Video Player & OSD Pipeline

> 76 nodes · cohesion 0.07

## Key Concepts

- **Downloader** (52 connections) — `windows/downloader.js`
- **downloader.js** (28 connections) — `windows/downloader.js`
- **downloadUtils.js** (22 connections) — `windows/downloadUtils.js`
- **._executeDownload()** (19 connections) — `windows/downloader.js`
- **._sendToRenderer()** (14 connections) — `windows/downloader.js`
- **._processQueue()** (13 connections) — `windows/downloader.js`
- **._serializeTask()** (12 connections) — `windows/downloader.js`
- **.startDownload()** (12 connections) — `windows/downloader.js`
- **._completeTask()** (11 connections) — `windows/downloader.js`
- **._handleError()** (11 connections) — `windows/downloader.js`
- **._runSegment()** (10 connections) — `windows/downloader.js`
- **._attachStreamToSegment()** (9 connections) — `windows/downloader.js`
- **._saveSegmentMeta()** (9 connections) — `windows/downloader.js`
- **._abortTaskSockets()** (8 connections) — `windows/downloader.js`
- **._handleTransientOrFatalError()** (8 connections) — `windows/downloader.js`
- **.recoverStalledDownloads()** (7 connections) — `windows/downloader.js`
- **._reportProgress()** (7 connections) — `windows/downloader.js`
- **._syncPowerSaveBlocker()** (7 connections) — `windows/downloader.js`
- **._formatBytes()** (6 connections) — `windows/downloader.js`
- **.resumeDownload()** (6 connections) — `windows/downloader.js`
- **._retrySegmentOrTask()** (6 connections) — `windows/downloader.js`
- **.startBatchDownloads()** (6 connections) — `windows/downloader.js`
- **.updateSettings()** (6 connections) — `windows/downloader.js`
- **.cancelDownload()** (5 connections) — `windows/downloader.js`
- **.convertItemToMp4()** (5 connections) — `windows/downloader.js`
- *... and 51 more nodes in this community*

## Relationships

- [test_diag.js & { app, BrowserWin...](test_diag.js_&_{_app,_BrowserWin.md) (6 shared connections)
- [Community 32](Community_32.md) (4 shared connections)
- [Package Configuration & Dependencies (17)](Package_Configuration_&_Dependencies_17.md) (1 shared connections)
- [HLS.js MSE Streaming Engine (Part 5)](HLS.js_MSE_Streaming_Engine_Part_5.md) (1 shared connections)
- [Spatial Navigation & Key Handling](Spatial_Navigation_&_Key_Handling.md) (1 shared connections)

## Source Files

- `windows/downloadUtils.js`
- `windows/downloader.js`

## Audit Trail

- EXTRACTED: 215 (94%)
- INFERRED: 13 (6%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*