# Video Player & OSD Pipeline

> 57 nodes · cohesion 0.06

## Key Concepts

- **downloader.js** (22 connections) — `windows/downloader.js`
- **downloadUtils.js** (16 connections) — `windows/downloadUtils.js`
- **IPTVService/companionCore.js** (14 connections) — `IPTVService/companionCore.js`
- **main.js** (14 connections) — `windows/main.js`
- **windows/companionCore.js** (13 connections) — `windows/companionCore.js`
- **service.js** (10 connections) — `IPTVService/service.js`
- **ref_path** (7 connections)
- **ref_fs** (6 connections)
- **handle()** (5 connections) — `IPTVService/companionCore.js`
- **proxyStream()** (5 connections) — `IPTVService/companionCore.js`
- **ref_http** (5 connections)
- **handle()** (5 connections) — `windows/companionCore.js`
- **proxyStream()** (5 connections) — `windows/companionCore.js`
- **resolveDownloadTarget()** (5 connections) — `windows/downloadUtils.js`
- **log()** (4 connections) — `IPTVService/service.js`
- **ref_url** (4 connections)
- **ensureDir()** (4 connections) — `windows/downloadUtils.js`
- **formatBytes()** (4 connections) — `windows/downloadUtils.js`
- **sanitizeFileName()** (4 connections) — `windows/downloadUtils.js`
- **serializeTask()** (4 connections) — `windows/downloadUtils.js`
- **Windows Desktop Offline Download System** (3 connections) — `windows/main.js`
- **createCompanionHandler()** (3 connections) — `IPTVService/companionCore.js`
- **getLanIp()** (3 connections) — `IPTVService/companionCore.js`
- **sendJson()** (3 connections) — `IPTVService/companionCore.js`
- **ensureServer()** (3 connections) — `IPTVService/service.js`
- *... and 32 more nodes in this community*

## Relationships

- [Electron Background Downloader](Electron_Background_Downloader.md) (7 shared connections)
- [Storage & Profile Persistence](Storage_&_Profile_Persistence.md) (4 shared connections)
- [HLS.js MSE Streaming Engine (Part 12)](HLS.js_MSE_Streaming_Engine_Part_12.md) (2 shared connections)
- [Package Configuration & Dependencies (17)](Package_Configuration_&_Dependencies_17.md) (2 shared connections)
- [Browse View & Playlist Virtualization](Browse_View_&_Playlist_Virtualization.md) (1 shared connections)

## Source Files

- `IPTVService/companionCore.js`
- `IPTVService/service.js`
- `windows/companionCore.js`
- `windows/downloadUtils.js`
- `windows/downloader.js`
- `windows/main.js`

## Audit Trail

- EXTRACTED: 98 (83%)
- INFERRED: 20 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*