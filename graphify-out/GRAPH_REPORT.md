# Graph Report - IPTV  (2026-11-07)

## Corpus Check
- 48 files · ~60,942 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: .css 8, .bat 3, (none) 1)

## Summary
- 740 nodes · 1536 edges · 57 communities (37 shown, 20 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 177 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Video Player & OSD Pipeline
- webOS Build & ES5 Transpilation Pipeline
- HLS.js MSE Streaming Engine (Part 3)
- Core Application Shell & Coordinator
- HLS.js MSE Streaming Engine (Part 5)
- Electron Background Downloader
- Spatial Navigation & Key Handling
- HLS.js MSE Streaming Engine (Part 8)
- Storage & Profile Persistence
- Download UI & Task Management
- Browse View & Playlist Virtualization
- HLS.js MSE Streaming Engine (Part 12)
- HLS.js MSE Streaming Engine (Part 13)
- HLS.js MSE Streaming Engine (Part 14)
- Login View & Profile Selector
- webOS Background Luna Service
- Package Configuration & Dependencies (17)
- webOS Platform SDK Bridge
- webOS Platform SDK Bridge
- HLS.js MSE Streaming Engine (Part 20)
- main.js & { app, BrowserWindow, ...
- build.js & appDir
- Electron Background Downloader
- webOS Background Luna Service
- HLS.js MSE Streaming Engine (Part 25)
- Home View & Content Rows
- Series Detail & Episode Browser
- Settings & Preferences View
- test_diag.js & { app, BrowserWin...
- Package Configuration & Dependencies (30)
- Theme Engine & Design Tokens
- HLS.js MSE Streaming Engine (Part 33)
- HLS.js MSE Streaming Engine (Part 34)
- Package Configuration & Dependencies (35)
- HLS.js MSE Streaming Engine (Part 36)
- HLS.js MSE Streaming Engine (Part 37)
- Search Engine & Filter View
- HLS.js MSE Streaming Engine (Part 39)
- HLS.js MSE Streaming Engine (Part 42)
- HLS.js MSE Streaming Engine (Part 43)
- HLS.js MSE Streaming Engine (Part 44)
- HLS.js MSE Streaming Engine (Part 45)
- HLS.js MSE Streaming Engine (Part 46)
- HLS.js MSE Streaming Engine (Part 47)
- HLS.js MSE Streaming Engine (Part 48)
- HLS.js MSE Streaming Engine (Part 49)
- HLS.js MSE Streaming Engine (Part 50)
- LG webOS CLI Installation Guide

## God Nodes (most connected - your core abstractions)
1. `Downloader` - 33 edges
2. `T()` - 27 edges
3. `e()` - 24 edges
4. `i()` - 23 edges
5. `E()` - 23 edges
6. `_bindEvents()` - 23 edges
7. `r()` - 22 edges
8. `dt()` - 22 edges
9. `IPTVApp` - 21 edges
10. `n()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `10-Foot TV User Interface Architecture` --implements--> `IPTVApp`  [INFERRED]
  README.md → IPTVPlayer/js/app.js
- `rt()` --indirect_call--> `C()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/webOSTVjs-1.2.13/webOSTV-dev.js
- `a()` --indirect_call--> `e()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/js/mpegts.js
- `a()` --indirect_call--> `e()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/js/mpegts.js
- `E()` --indirect_call--> `e()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/js/mpegts.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Hardware & MSE Video Playback Pipeline** — concept_streaming_pipeline, iptvplayer_js_services_playerservice, iptvservice_service [INFERRED 0.95]
- **10-Foot Spatial Focus & Remote Control System** — concept_spatial_navigation_engine, iptvplayer_js_core_spatialnav, iptvplayer_js_core_keyhandler [INFERRED 0.95]
- **Mobile Phone QR Setup & Luna Bus Lifecycle** — concept_qr_companion_setup, iptvplayer_js_services_tvserver, iptvservice_service, iptvplayer_setup_html_page [INFERRED 0.95]

## Communities (57 total, 20 thin omitted)

### Community 1 - "Video Player & OSD Pipeline"
Cohesion: 0.13
Nodes (53): _appendDrawerChannelChunk(), autoHideOSD(), _bindEvents(), _buildCandidateUrls(), canSeek(), _checkPendingInitialSeek(), _clearCandidateWatchdog(), close() (+45 more)

### Community 2 - "webOS Build & ES5 Transpilation Pipeline"
Cohesion: 0.05
Nodes (37): acorn, autoprefixer, @babel/core, @babel/preset-env, core-js, esbuild, postcss, regenerator-runtime (+29 more)

### Community 3 - "HLS.js MSE Streaming Engine (Part 3)"
Cohesion: 0.12
Nodes (30): ku(), m(), a(), v(), a(), f(), u(), wu() (+22 more)

### Community 4 - "Core Application Shell & Coordinator"
Cohesion: 0.09
Nodes (12): 10-Foot TV User Interface Architecture, Universal Cross-Platform Architecture (webOS + Electron), QR Code Phone Setup & Background Server, Multi-Stage Playback & Stream Pipeline, 10-Foot TV Application Shell & Screens, IPTVApp, ensureStarted(), isWebOS() (+4 more)

### Community 5 - "HLS.js MSE Streaming Engine (Part 5)"
Cohesion: 0.15
Nodes (33): a(), ae(), assetPlayers(), at(), bufferedEnd(), currentTime(), duration(), es() (+25 more)

### Community 7 - "Spatial Navigation & Key Handling"
Cohesion: 0.12
Nodes (20): 2D Cartesian Spatial Navigation & Focus Memory, getDirection(), handleKeyDown(), init(), isBackKey(), isChannelDown(), isChannelUp(), isEnterKey() (+12 more)

### Community 8 - "HLS.js MSE Streaming Engine (Part 8)"
Cohesion: 0.09
Nodes (26): an(), be(), bt(), Ci(), ft(), Gi(), Ii(), In() (+18 more)

### Community 9 - "Storage & Profile Persistence"
Cohesion: 0.16
Nodes (19): clearConnection(), deleteProfile(), get(), getConnection(), getConnectionKey(), getProfiles(), getStreamStrategy(), getWatchProgress() (+11 more)

### Community 10 - "Download UI & Task Management"
Cohesion: 0.24
Nodes (20): _bindEvents(), _bindUIControls(), _createActiveCard(), _createCompletedCard(), downloadEntireSeries(), downloadEpisode(), downloadMovie(), downloadSeason() (+12 more)

### Community 11 - "Browse View & Playlist Virtualization"
Cohesion: 0.18
Nodes (15): High-FPS Large Playlist Virtualization Engine, _appendNextGridBatch(), _bindControls(), _createCategoryLi(), ensureRendered(), _flushRemainingCategories(), _refreshContent(), render() (+7 more)

### Community 12 - "HLS.js MSE Streaming Engine (Part 12)"
Cohesion: 0.11
Nodes (20): b(), ct(), dt(), ee(), et(), gt(), He(), J() (+12 more)

### Community 13 - "HLS.js MSE Streaming Engine (Part 13)"
Cohesion: 0.14
Nodes (20): Bs(), Co(), Fs(), Gs(), Hs(), jo(), js(), Ks() (+12 more)

### Community 14 - "HLS.js MSE Streaming Engine (Part 14)"
Cohesion: 0.17
Nodes (20): c(), d(), Dd(), E(), r(), ei(), f(), g() (+12 more)

### Community 15 - "Login View & Profile Selector"
Cohesion: 0.34
Nodes (15): _bindUI(), clearFormError(), closeDeleteModal(), _getApiBase(), handleRemoteCredentials(), init(), initRemoteSetup(), isQrScreenActive() (+7 more)

### Community 16 - "webOS Background Luna Service"
Cohesion: 0.24
Nodes (9): ensureServer(), getLanIp(), handle(), keepAlive(), log(), proxy(), sendJson(), serveStatic() (+1 more)

### Community 17 - "Package Configuration & Dependencies (17)"
Cohesion: 0.14
Nodes (14): @electron/packager, author, description, devDependencies, electron@^33.2.1, @electron/packager@^18.3.6, keywords, license (+6 more)

### Community 18 - "webOS Platform SDK Bridge"
Cohesion: 0.26
Nodes (13): a(), B(), c(), d(), f(), I(), l(), M() (+5 more)

### Community 19 - "webOS Platform SDK Bridge"
Cohesion: 0.24
Nodes (13): b(), C(), h(), i(), m(), n(), o(), p() (+5 more)

### Community 20 - "HLS.js MSE Streaming Engine (Part 20)"
Cohesion: 0.15
Nodes (13): dn(), en(), fn(), ln(), mn(), nn(), pn(), sn() (+5 more)

### Community 21 - "main.js & { app, BrowserWindow, ..."
Cohesion: 0.18
Nodes (10): { app, BrowserWindow, Menu, ipcMain }, fs, getLanIp(), http, MIME, os, path, sendJson() (+2 more)

### Community 22 - "build.js & appDir"
Cohesion: 0.18
Nodes (9): appDir, { execSync }, expectedExe, fs, iconFile, IGNORED_NAMES, outDir, path (+1 more)

### Community 23 - "Electron Background Downloader"
Cohesion: 0.20
Nodes (8): Windows Desktop Offline Download System, { app, dialog, shell }, fs, http, https, path, { spawn }, { URL }

### Community 24 - "webOS Background Luna Service"
Cohesion: 0.31
Nodes (8): Xtream Codes & M3U Playlist Protocol Engine, load(), parseExtinf(), buildCatMap(), fetchJson(), getSeriesInfo(), loadAll(), _yieldToMain()

### Community 25 - "HLS.js MSE Streaming Engine (Part 25)"
Cohesion: 0.20
Nodes (10): hu(), ju(), Ll(), Oa(), qu(), Rl(), wa(), Xt() (+2 more)

### Community 26 - "Home View & Content Rows"
Cohesion: 0.42
Nodes (9): _addContinueWatchingRow(), _addRow(), closeResumeModal(), _fmtRemaining(), _fmtTime(), init(), render(), resumeItem() (+1 more)

### Community 27 - "Series Detail & Episode Browser"
Cohesion: 0.40
Nodes (9): buildEpisodePlayItem(), close(), focusEpisodeCard(), _formatEpisodeTitle(), init(), open(), renderEpisodesList(), renderScreen() (+1 more)

### Community 28 - "Settings & Preferences View"
Cohesion: 0.43
Nodes (6): _bindUI(), init(), _loadSettings(), _saveSettings(), _setupDownloadSettings(), _setupThemeSelector()

### Community 29 - "test_diag.js & { app, BrowserWin..."
Cohesion: 0.25
Nodes (4): { app, BrowserWindow }, fs, logFile, path

### Community 30 - "Package Configuration & Dependencies (30)"
Cohesion: 0.29
Nodes (4): electron, { contextBridge, ipcRenderer }, electron, el

### Community 32 - "Theme Engine & Design Tokens"
Cohesion: 0.60
Nodes (4): applyTheme(), getSavedTheme(), init(), _resolveThemeId()

### Community 33 - "HLS.js MSE Streaming Engine (Part 33)"
Cohesion: 0.33
Nodes (6): Ba(), fa(), ga(), ma(), Ua(), va()

### Community 34 - "HLS.js MSE Streaming Engine (Part 34)"
Cohesion: 0.40
Nodes (5): ce(), De(), fe(), ke(), ve()

### Community 35 - "Package Configuration & Dependencies (35)"
Cohesion: 0.40
Nodes (4): description, main, name, version

### Community 36 - "HLS.js MSE Streaming Engine (Part 36)"
Cohesion: 0.50
Nodes (4): Ar(), Fl(), kn(), xl()

### Community 37 - "HLS.js MSE Streaming Engine (Part 37)"
Cohesion: 0.50
Nodes (4): Eo(), Po(), Sl(), So()

### Community 38 - "Search Engine & Filter View"
Cohesion: 0.83
Nodes (3): _collectPoolMatches(), init(), search()

### Community 39 - "HLS.js MSE Streaming Engine (Part 39)"
Cohesion: 0.67
Nodes (3): Md(), Od(), wd()

## Knowledge Gaps
- **4 isolated node(s):** `LG webOS Compatibility Matrix (webOS 3.x - 25+)`, `LG webOS CLI Installation Guide`, `10-Foot TV Application Shell & Screens`, `Companion Phone Web Setup Interface`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 187 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Universal Cross-Platform Architecture (webOS + Electron)` connect `Core Application Shell & Coordinator` to `webOS Build & ES5 Transpilation Pipeline`, `build.js & appDir`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `T()` (e.g. with `a()` and `l()`) actually correct?**
  _`T()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LG webOS Compatibility Matrix (webOS 3.x - 25+)`, `LG webOS CLI Installation Guide`, `10-Foot TV Application Shell & Screens` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `HLS.js MSE Streaming Engine (Part 0)` be split into smaller, more focused modules?**
  _Cohesion score 0.03225806451612903 - nodes in this community are weakly interconnected._
- **Why does `Multi-Stage Playback & Stream Pipeline` connect `Core Application Shell & Coordinator` to `Video Player & OSD Pipeline`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `e()` (e.g. with `hls.min.js` and `a()`) actually correct?**
  _`e()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Should `Video Player & OSD Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.12525252525252525 - nodes in this community are weakly interconnected._