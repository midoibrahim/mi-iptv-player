# HLS.js MSE Streaming Engine (Part 5)

> 51 nodes · cohesion 0.12

## Key Concepts

- **Downloader** (52 connections) — `windows/downloader.js`
- **._executeDownload()** (18 connections) — `windows/downloader.js`
- **._sendToRenderer()** (14 connections) — `windows/downloader.js`
- **._processQueue()** (13 connections) — `windows/downloader.js`
- **._serializeTask()** (12 connections) — `windows/downloader.js`
- **._completeTask()** (11 connections) — `windows/downloader.js`
- **._handleError()** (11 connections) — `windows/downloader.js`
- **.startDownload()** (11 connections) — `windows/downloader.js`
- **._attachStreamToSegment()** (9 connections) — `windows/downloader.js`
- **._abortTaskSockets()** (8 connections) — `windows/downloader.js`
- **._handleTransientOrFatalError()** (8 connections) — `windows/downloader.js`
- **._runSegment()** (8 connections) — `windows/downloader.js`
- **.recoverStalledDownloads()** (7 connections) — `windows/downloader.js`
- **._reportProgress()** (7 connections) — `windows/downloader.js`
- **._syncPowerSaveBlocker()** (7 connections) — `windows/downloader.js`
- **._formatBytes()** (6 connections) — `windows/downloader.js`
- **.resumeDownload()** (6 connections) — `windows/downloader.js`
- **.startBatchDownloads()** (6 connections) — `windows/downloader.js`
- **.updateSettings()** (6 connections) — `windows/downloader.js`
- **.cancelDownload()** (5 connections) — `windows/downloader.js`
- **.convertItemToMp4()** (5 connections) — `windows/downloader.js`
- **._ensureDir()** (5 connections) — `windows/downloader.js`
- **.pauseDownload()** (5 connections) — `windows/downloader.js`
- **._retrySegmentOrTask()** (5 connections) — `windows/downloader.js`
- **._saveHistory()** (5 connections) — `windows/downloader.js`
- *... and 26 more nodes in this community*

## Relationships

- [Community 15](Community_15.md) (7 shared connections)

## Source Files

- `windows/downloader.js`

## Audit Trail

- EXTRACTED: 165 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*