# webOS Build & ES5 Transpilation Pipeline

> 53 nodes · cohesion 0.12

## Key Concepts

- **Downloader** (52 connections) — `windows/downloader.js`
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
- **._ensureDir()** (5 connections) — `windows/downloader.js`
- **.pauseDownload()** (5 connections) — `windows/downloader.js`
- *... and 28 more nodes in this community*

## Relationships

- [Community 14](Community_14.md) (15 shared connections)

## Source Files

- `windows/downloadUtils.js`
- `windows/downloader.js`

## Audit Trail

- EXTRACTED: 178 (99%)
- INFERRED: 2 (1%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*