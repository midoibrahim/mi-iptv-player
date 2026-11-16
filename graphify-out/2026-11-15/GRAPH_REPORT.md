# Graph Report - IPTV  (2026-11-15)

## Corpus Check
- 54 files · ~75,823 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 18 file(s) not represented in the graph (top: .css 8, .bat 7, (none) 1)

## Summary
- 1012 nodes · 1925 edges · 62 communities (47 shown, 15 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 193 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bcec2997`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- HLS.js MSE Streaming Engine (Part 0)
- Video Player & OSD Pipeline
- webOS Build & ES5 Transpilation Pipeline
- HLS.js MSE Streaming Engine (Part 3)
- tizen-build/build.mjs
- HLS.js MSE Streaming Engine (Part 5)
- Electron Background Downloader
- Spatial Navigation & Key Handling
- HLS.js MSE Streaming Engine (Part 8)
- Storage & Profile Persistence
- Download UI & Task Management
- Browse View & Playlist Virtualization
- HLS.js MSE Streaming Engine (Part 12)
- downloader.js
- card.js
- browseView.js
- webOS Background Luna Service
- Package Configuration & Dependencies (17)
- webOS Platform SDK Bridge
- webOS Platform SDK Bridge
- HLS.js MSE Streaming Engine (Part 20)
- main.js & { app, BrowserWindow, ...
- gt
- Electron Background Downloader
- webOS Background Luna Service
- build.js
- Home View & Content Rows
- Series Detail & Episode Browser
- Settings & Preferences View
- test_diag.js & { app, BrowserWin...
- Package Configuration & Dependencies (30)
- QR Code Generation Library
- build.js
- legacyCompiler.mjs
- HLS.js MSE Streaming Engine (Part 34)
- Package Configuration & Dependencies (35)
- main.js
- HLS.js MSE Streaming Engine (Part 37)
- Search Engine & Filter View
- HLS.js MSE Streaming Engine (Part 39)
- Vector Icon System
- service.js
- HLS.js MSE Streaming Engine (Part 42)
- HLS.js MSE Streaming Engine (Part 43)
- HLS.js MSE Streaming Engine (Part 44)
- HLS.js MSE Streaming Engine (Part 45)
- HLS.js MSE Streaming Engine (Part 46)
- HLS.js MSE Streaming Engine (Part 48)
- HLS.js MSE Streaming Engine (Part 49)
- HLS.js MSE Streaming Engine (Part 50)
- Legacy JavaScript Polyfills
- Legacy JavaScript Polyfills
- Legacy JavaScript Polyfills
- .addEventListener

## God Nodes (most connected - your core abstractions)
1. `Downloader` - 52 edges
2. `T()` - 27 edges
3. `e()` - 24 edges
4. `IPTVApp` - 23 edges
5. `E()` - 23 edges
6. `i()` - 23 edges
7. `dt()` - 22 edges
8. `r()` - 22 edges
9. `n()` - 21 edges
10. `a()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `10-Foot TV User Interface Architecture` --implements--> `IPTVApp`  [INFERRED]
  README.md → IPTVPlayer/js/app.js
- `rt()` --indirect_call--> `C()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/webOSTVjs-1.2.13/webOSTV-dev.js
- `T()` --indirect_call--> `e()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/js/mpegts.js
- `dt()` --indirect_call--> `w()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/js/mpegts.js
- `dt()` --indirect_call--> `M()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/webOSTVjs-1.2.13/webOSTV.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Mobile Phone QR Setup & Luna Bus Lifecycle** — concept_qr_companion_setup, iptvplayer_js_services_tvserver, iptvservice_service, iptvplayer_setup_html_page [INFERRED 0.95]
- **Hardware & MSE Video Playback Pipeline** — concept_streaming_pipeline, iptvplayer_js_services_playerservice, iptvservice_service [INFERRED 0.95]
- **10-Foot Spatial Focus & Remote Control System** — concept_spatial_navigation_engine, iptvplayer_js_core_spatialnav, iptvplayer_js_core_keyhandler [INFERRED 0.95]

## Communities (62 total, 15 thin omitted)

### Community 0 - "HLS.js MSE Streaming Engine (Part 0)"
Cohesion: 0.03
Nodes (29): Ai(), Ar(), cn(), dr(), Eo(), Fl(), gn(), ht() (+21 more)

### Community 1 - "Video Player & OSD Pipeline"
Cohesion: 0.08
Nodes (46): autoHideOSD(), _bindEvents(), _buildCandidateUrls(), canSeek(), _checkPendingInitialSeek(), _clearCandidateWatchdog(), close(), closeChannelDrawer() (+38 more)

### Community 2 - "webOS Build & ES5 Transpilation Pipeline"
Cohesion: 0.11
Nodes (23): acorn, autoprefixer, @babel/core, @babel/preset-env, core-js, esbuild, postcss, regenerator-runtime (+15 more)

### Community 3 - "HLS.js MSE Streaming Engine (Part 3)"
Cohesion: 0.10
Nodes (39): ku(), a(), a(), wu(), n(), zu(), a(), b() (+31 more)

### Community 4 - "tizen-build/build.mjs"
Cohesion: 0.10
Nodes (16): walkDir(), buildWgtArchive(), crc32(), CRC_TABLE, DIST, EXCLUDE_TOP, HERE, OUT (+8 more)

### Community 6 - "Electron Background Downloader"
Cohesion: 0.11
Nodes (21): 2D Cartesian Spatial Navigation & Focus Memory, getDirection(), handleKeyDown(), init(), isBackKey(), isChannelDown(), isChannelUp(), isDesktopSearchShortcut() (+13 more)

### Community 7 - "Spatial Navigation & Key Handling"
Cohesion: 0.12
Nodes (42): a(), ae(), assetPlayers(), at(), bufferedEnd(), currentTime(), duration(), E() (+34 more)

### Community 8 - "HLS.js MSE Streaming Engine (Part 8)"
Cohesion: 0.14
Nodes (21): clearConnection(), createProfile(), _deduplicateWatchProgress(), deleteProfile(), get(), getConnection(), getConnectionKey(), getProfiles() (+13 more)

### Community 9 - "Storage & Profile Persistence"
Cohesion: 0.08
Nodes (24): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+16 more)

### Community 10 - "Download UI & Task Management"
Cohesion: 0.15
Nodes (21): _bindEvents(), _bindUIControls(), _createActiveCard(), _createCompletedCard(), downloadEpisode(), downloadMovie(), getDownloadedItem(), init() (+13 more)

### Community 11 - "Browse View & Playlist Virtualization"
Cohesion: 0.05
Nodes (6): assert, fs, path, ROOT, test, vm

### Community 13 - "downloader.js"
Cohesion: 0.14
Nodes (20): { app, dialog, shell, powerSaveBlocker }, fs, http, https, path, { URL }, createSegments(), ensureDir() (+12 more)

### Community 14 - "card.js"
Cohesion: 0.38
Nodes (4): High-FPS Large Playlist Virtualization Engine, create(), _getIcon(), _scheduleLazyImg()

### Community 15 - "browseView.js"
Cohesion: 0.29
Nodes (12): _appendNextGridBatch(), _bindControls(), _createCategoryLi(), ensureRendered(), _flushRemainingCategories(), _rebuildCategoryBuckets(), _refreshContent(), render() (+4 more)

### Community 16 - "webOS Background Luna Service"
Cohesion: 0.11
Nodes (17): author, description, keywords, license, name, private, scripts, build:all (+9 more)

### Community 17 - "Package Configuration & Dependencies (17)"
Cohesion: 0.12
Nodes (16): electron, @electron/packager, author, description, devDependencies, electron@^33.2.1, @electron/packager@^18.3.6, keywords (+8 more)

### Community 18 - "webOS Platform SDK Bridge"
Cohesion: 0.09
Nodes (24): an(), be(), c(), ce(), Ci(), Dd(), De(), Gi() (+16 more)

### Community 19 - "webOS Platform SDK Bridge"
Cohesion: 0.15
Nodes (14): b(), ct(), dt(), ee(), J(), Me(), Oe(), q() (+6 more)

### Community 20 - "HLS.js MSE Streaming Engine (Part 20)"
Cohesion: 0.31
Nodes (16): _bindUI(), clearFormError(), closeDeleteModal(), _getApiBase(), handleRemoteCredentials(), init(), initRemoteSetup(), isQrScreenActive() (+8 more)

### Community 21 - "main.js & { app, BrowserWindow, ..."
Cohesion: 0.26
Nodes (6): createCompanionHandler(), handle(), getLanIp(), proxyStream(), sendJson(), serveStatic()

### Community 22 - "gt"
Cohesion: 0.20
Nodes (11): d(), ei(), et(), gt(), He(), je(), Jr(), p() (+3 more)

### Community 23 - "Electron Background Downloader"
Cohesion: 0.16
Nodes (4): fmtTime(), osdEls(), updateProgress(), updateProgressUI()

### Community 24 - "webOS Background Luna Service"
Cohesion: 0.18
Nodes (4): favKey(), getFavoriteItems(), isFavorite(), toggleFavorite()

### Community 25 - "build.js"
Cohesion: 0.14
Nodes (12): appDir, { execSync }, expectedExe, fs, iconFile, IGNORED_NAMES, outDir, packagedDir (+4 more)

### Community 26 - "Home View & Content Rows"
Cohesion: 0.24
Nodes (13): b(), C(), h(), i(), m(), n(), o(), p() (+5 more)

### Community 27 - "Series Detail & Episode Browser"
Cohesion: 0.20
Nodes (6): init(), _initDesktopViewportAndFullscreen(), isDesktop(), isFullScreen(), setFullScreen(), toggleFullScreen()

### Community 28 - "Settings & Preferences View"
Cohesion: 0.13
Nodes (15): dn(), en(), fn(), ln(), mn(), nn(), pn(), qn() (+7 more)

### Community 29 - "test_diag.js & { app, BrowserWin..."
Cohesion: 0.23
Nodes (13): Xtream Codes & M3U Playlist Protocol Engine, load(), parseExtinf(), buildCatMap(), buildEpisodePlayItem(), fetchJson(), formatEpisodeTitle(), getSeriesInfo() (+5 more)

### Community 30 - "Package Configuration & Dependencies (30)"
Cohesion: 0.27
Nodes (12): Bs(), Fs(), Gs(), Hs(), js(), Ks(), ls(), Ns() (+4 more)

### Community 31 - "QR Code Generation Library"
Cohesion: 0.18
Nodes (17): _addCandidateListener(), _clearVideoListeners(), clearWatchdog(), destroy(), destroyTizenAvPlay(), getEngineProfile(), isPaused(), isTizenAvPlayAvailable() (+9 more)

### Community 32 - "build.js"
Cohesion: 0.17
Nodes (14): 10-Foot TV User Interface Architecture, Universal Cross-Platform Architecture (webOS + Electron), QR Code Phone Setup & Background Server, Multi-Stage Playback & Stream Pipeline, 10-Foot TV Application Shell & Screens, ensureStarted(), getSetupInfo(), isWebOS() (+6 more)

### Community 33 - "legacyCompiler.mjs"
Cohesion: 0.15
Nodes (12): buildLegacyApp(), collectThemeTokens(), createLegacyCssPlugin(), DESKTOP_DOWNLOAD_FILES, loadBuildTools(), resolveVarsWithMap(), stripDesktopDownloadHtmlTags(), verifyEs5Files() (+4 more)

### Community 35 - "Package Configuration & Dependencies (35)"
Cohesion: 0.42
Nodes (8): appendChunk(), close(), focusItem(), handleKey(), open(), renderCategories(), renderChannels(), toggle()

### Community 36 - "main.js"
Cohesion: 0.20
Nodes (6): Windows Desktop Offline Download System, { app, BrowserWindow, Menu, ipcMain, powerMonitor }, companionCore, fs, http, path

### Community 37 - "HLS.js MSE Streaming Engine (Part 37)"
Cohesion: 0.22
Nodes (10): bt(), ft(), jl(), jt(), Kt(), lt(), ot(), pe() (+2 more)

### Community 38 - "Search Engine & Filter View"
Cohesion: 0.12
Nodes (17): Ba(), fa(), ga(), hu(), ju(), Ll(), ma(), Oa() (+9 more)

### Community 39 - "HLS.js MSE Streaming Engine (Part 39)"
Cohesion: 0.42
Nodes (9): _addContinueWatchingRow(), _addRow(), closeResumeModal(), _fmtRemaining(), _fmtTime(), init(), render(), resumeItem() (+1 more)

### Community 40 - "Vector Icon System"
Cohesion: 0.38
Nodes (9): buildEpisodePlayItem(), close(), focusEpisodeCard(), _formatEpisodeTitle(), init(), open(), renderEpisodesList(), renderScreen() (+1 more)

### Community 41 - "service.js"
Cohesion: 0.33
Nodes (4): ensureServer(), keepAlive(), log(), shutdownServer()

### Community 42 - "HLS.js MSE Streaming Engine (Part 42)"
Cohesion: 0.16
Nodes (12): Co(), jo(), Lo(), m(), Mo(), v(), f(), u() (+4 more)

### Community 43 - "HLS.js MSE Streaming Engine (Part 43)"
Cohesion: 0.43
Nodes (6): buildEpisodePayload(), collectPendingEpisodes(), getDownloadedItem(), isCompleted(), isDesktop(), isDownloading()

### Community 44 - "HLS.js MSE Streaming Engine (Part 44)"
Cohesion: 0.43
Nodes (6): createSession(), decrypt(), deleteSession(), _generateKey(), pollSession(), stop()

### Community 45 - "HLS.js MSE Streaming Engine (Part 45)"
Cohesion: 0.46
Nodes (6): _bindUI(), init(), _loadSettings(), _saveSettings(), _setupDownloadSettings(), _setupThemeSelector()

### Community 48 - "HLS.js MSE Streaming Engine (Part 48)"
Cohesion: 0.60
Nodes (4): applyTheme(), getSavedTheme(), init(), _resolveThemeId()

### Community 49 - "HLS.js MSE Streaming Engine (Part 49)"
Cohesion: 0.60
Nodes (4): emit(), off(), on(), toast()

### Community 50 - "HLS.js MSE Streaming Engine (Part 50)"
Cohesion: 0.40
Nodes (4): description, main, name, version

### Community 51 - "Legacy JavaScript Polyfills"
Cohesion: 0.60
Nodes (3): _collectPoolMatches(), init(), search()

## Knowledge Gaps
- **5 isolated node(s):** `LG webOS Compatibility Matrix (webOS 3.x - 25+)`, `LG webOS CLI Installation Guide`, `High-FPS Large Playlist Virtualization Engine`, `10-Foot TV Application Shell & Screens`, `Companion Phone Web Setup Interface`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 322 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Multi-Stage Playback & Stream Pipeline` connect `build.js` to `Video Player & OSD Pipeline`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `T()` (e.g. with `a()` and `l()`) actually correct?**
  _`T()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LG webOS Compatibility Matrix (webOS 3.x - 25+)`, `LG webOS CLI Installation Guide`, `High-FPS Large Playlist Virtualization Engine` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `HLS.js MSE Streaming Engine (Part 0)` be split into smaller, more focused modules?**
  _Cohesion score 0.02612942612942613 - nodes in this community are weakly interconnected._
- **Why does `Universal Cross-Platform Architecture (webOS + Electron)` connect `build.js` to `legacyCompiler.mjs`, `build.js`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `e()` (e.g. with `hls.min.js` and `a()`) actually correct?**
  _`e()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Should `Video Player & OSD Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.08469449485783424 - nodes in this community are weakly interconnected._