# Electron Background Downloader

> 33 nodes · cohesion 0.16

## Key Concepts

- **Downloader** (33 connections) — `windows/downloader.js`
- **._executeDownload()** (12 connections) — `windows/downloader.js`
- **._sendToRenderer()** (11 connections) — `windows/downloader.js`
- **._processQueue()** (9 connections) — `windows/downloader.js`
- **._serializeTask()** (9 connections) — `windows/downloader.js`
- **.startDownload()** (9 connections) — `windows/downloader.js`
- **.startBatchDownloads()** (6 connections) — `windows/downloader.js`
- **.updateSettings()** (6 connections) — `windows/downloader.js`
- **.convertItemToMp4()** (5 connections) — `windows/downloader.js`
- **._handleError()** (5 connections) — `windows/downloader.js`
- **._saveHistory()** (5 connections) — `windows/downloader.js`
- **.constructor()** (4 connections) — `windows/downloader.js`
- **._ensureDir()** (4 connections) — `windows/downloader.js`
- **._formatBytes()** (4 connections) — `windows/downloader.js`
- **.pauseDownload()** (4 connections) — `windows/downloader.js`
- **.resumeDownload()** (4 connections) — `windows/downloader.js`
- **.selectDirectory()** (4 connections) — `windows/downloader.js`
- **.cancelDownload()** (3 connections) — `windows/downloader.js`
- **.clearHistory()** (3 connections) — `windows/downloader.js`
- **.deleteDownloadedFile()** (3 connections) — `windows/downloader.js`
- **.getAll()** (3 connections) — `windows/downloader.js`
- **.getSettings()** (3 connections) — `windows/downloader.js`
- **.isDownloading()** (3 connections) — `windows/downloader.js`
- **._remuxToMp4()** (3 connections) — `windows/downloader.js`
- **.isCompleted()** (2 connections) — `windows/downloader.js`
- *... and 8 more nodes in this community*

## Relationships

- [Electron Background Downloader](Electron_Background_Downloader.md) (1 shared connections)

## Source Files

- `windows/downloader.js`

## Audit Trail

- EXTRACTED: 85 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*