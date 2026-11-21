# Graph Report - IPTV  (2026-11-21)

## Corpus Check
- 74 files · ~83,601 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 18 file(s) not represented in the graph (top: .css 8, .bat 7, (none) 1)

## Summary
- 1077 nodes · 2090 edges · 66 communities (52 shown, 14 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 201 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 65

## God Nodes (most connected - your core abstractions)
1. `Downloader` - 52 edges
2. `T()` - 27 edges
3. `IPTVApp` - 24 edges
4. `e()` - 24 edges
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
- `dt()` --indirect_call--> `w()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/js/mpegts.js
- `dt()` --indirect_call--> `M()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/webOSTVjs-1.2.13/webOSTV.js
- `dt()` --indirect_call--> `z()`  [INFERRED]
  IPTVPlayer/js/hls.min.js → IPTVPlayer/webOSTVjs-1.2.13/webOSTV.js

## Import Cycles
- None detected.

## Communities (66 total, 14 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (29): Ai(), Ar(), cn(), dr(), Eo(), Fl(), gn(), ht() (+21 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (4): Downloader, DownloadPersistence, matchesDownloadItem(), parseContentRange()

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (46): autoHideOSD(), _bindEvents(), _buildCandidateUrls(), canSeek(), _checkPendingInitialSeek(), _clearCandidateWatchdog(), close(), closeChannelDrawer() (+38 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (6): assert, fs, path, ROOT, test, vm

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (28): buildLegacyApp(), collectThemeTokens(), createLegacyCssPlugin(), DESKTOP_DOWNLOAD_FILES, loadBuildTools(), resolveVarsWithMap(), stripDesktopDownloadHtmlTags(), verifyEs5Files() (+20 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (30): ku(), m(), a(), v(), a(), f(), u(), wu() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (36): a(), ae(), assetPlayers(), bufferedEnd(), currentTime(), duration(), E(), r() (+28 more)

### Community 7 - "Community 7"
Cohesion: 0.19
Nodes (28): _addCandidateListener(), canSeek(), _clearVideoListeners(), clearWatchdog(), _createSession(), destroy(), destroyTizenAvPlay(), getCurrentTime() (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (21): _bindEvents(), _bindUIControls(), _createActiveCard(), _createCompletedCard(), downloadEpisode(), downloadMovie(), getDownloadedItem(), init() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (21): clearConnection(), createProfile(), _deduplicateWatchProgress(), deleteProfile(), get(), getConnection(), getConnectionKey(), getProfiles() (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (24): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (23): acorn, autoprefixer, @babel/core, @babel/preset-env, core-js, esbuild, postcss, regenerator-runtime (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (20): { app, dialog, shell, powerSaveBlocker }, fs, http, https, path, { URL }, createSegments(), ensureDir() (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (18): _appendNextGridBatch(), _bindControls(), _createCategoryLi(), _createGridCard(), ensureRendered(), _flushRemainingCategories(), _getGridMetrics(), hydrateContentDom() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (13): getDirection(), handleKeyDown(), init(), isBackKey(), isChannelDown(), isChannelUp(), isDesktopSearchShortcut(), isEnterKey() (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (20): b(), c(), ct(), Dd(), dt(), ee(), f(), ie() (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (17): author, description, keywords, license, name, private, scripts, build:all (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (16): electron, @electron/packager, author, description, devDependencies, electron@^33.2.1, @electron/packager@^18.3.6, keywords (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (17): Ba(), fa(), ga(), hu(), ju(), Ll(), ma(), Oa() (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.31
Nodes (16): _bindUI(), clearFormError(), closeDeleteModal(), _getApiBase(), handleRemoteCredentials(), init(), initRemoteSetup(), isQrScreenActive() (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (14): 10-Foot TV User Interface Architecture, Universal Cross-Platform Architecture (webOS + Electron), QR Code Phone Setup & Background Server, Multi-Stage Playback & Stream Pipeline, 10-Foot TV Application Shell & Screens, ensureStarted(), getSetupInfo(), isWebOS() (+6 more)

### Community 22 - "Community 22"
Cohesion: 0.16
Nodes (4): fmtTime(), osdEls(), updateProgress(), updateProgressUI()

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (15): an(), be(), ce(), Ci(), De(), In(), ke(), Le() (+7 more)

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (8): Windows Desktop Offline Download System, fs, path, { app, BrowserWindow, Menu, ipcMain, powerMonitor }, companionCore, fs, http, path

### Community 25 - "Community 25"
Cohesion: 0.32
Nodes (14): 2D Cartesian Spatial Navigation & Focus Memory, _ensureSideNavBinding(), ensureVisible(), _findFirstFocusable(), focusElement(), getActiveRoot(), isFocusable(), _navCartesian2D() (+6 more)

### Community 26 - "Community 26"
Cohesion: 0.23
Nodes (13): Xtream Codes & M3U Playlist Protocol Engine, load(), parseExtinf(), buildCatMap(), buildEpisodePlayItem(), fetchJson(), formatEpisodeTitle(), getSeriesInfo() (+5 more)

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (4): favKey(), getFavoriteItems(), isFavorite(), toggleFavorite()

### Community 28 - "Community 28"
Cohesion: 0.20
Nodes (6): init(), _initDesktopViewportAndFullscreen(), isDesktop(), isFullScreen(), setFullScreen(), toggleFullScreen()

### Community 29 - "Community 29"
Cohesion: 0.26
Nodes (13): a(), B(), c(), d(), f(), I(), l(), M() (+5 more)

### Community 30 - "Community 30"
Cohesion: 0.24
Nodes (13): b(), C(), h(), i(), m(), n(), o(), p() (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (12): appDir, { execSync }, expectedExe, fs, iconFile, IGNORED_NAMES, outDir, packagedDir (+4 more)

### Community 32 - "Community 32"
Cohesion: 0.15
Nodes (13): dn(), en(), fn(), ln(), mn(), nn(), pn(), sn() (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.19
Nodes (5): destroy(), isAvailable(), load(), play(), restore()

### Community 34 - "Community 34"
Cohesion: 0.27
Nodes (12): Bs(), Fs(), Gs(), Hs(), js(), Ks(), ls(), Ns() (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.18
Nodes (12): d(), et(), g(), gl(), gt(), He(), je(), p() (+4 more)

### Community 36 - "Community 36"
Cohesion: 0.29
Nodes (6): createCompanionHandler(), handle(), getLanIp(), proxyStream(), sendJson(), serveStatic()

### Community 38 - "Community 38"
Cohesion: 0.42
Nodes (8): appendChunk(), close(), focusItem(), handleKey(), open(), renderCategories(), renderChannels(), toggle()

### Community 39 - "Community 39"
Cohesion: 0.24
Nodes (10): at(), Gi(), Ii(), it(), Ni(), nt(), rt(), st() (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.22
Nodes (10): bt(), ft(), jl(), jt(), Kt(), lt(), ot(), pe() (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (9): applySnapshot(), buildEpisodePayload(), collectPendingEpisodes(), _ensureHistoryIndex(), getDownloadedItem(), isCompleted(), isDesktop(), isDownloading() (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.42
Nodes (9): _addContinueWatchingRow(), _addRow(), closeResumeModal(), _fmtRemaining(), _fmtTime(), init(), render(), resumeItem() (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.38
Nodes (9): buildEpisodePlayItem(), close(), focusEpisodeCard(), _formatEpisodeTitle(), init(), open(), renderEpisodesList(), renderScreen() (+1 more)

### Community 44 - "Community 44"
Cohesion: 0.36
Nodes (6): High-FPS Large Playlist Virtualization Engine, _appendIcon(), create(), _getIcon(), _isTv(), _scheduleLazyImg()

### Community 45 - "Community 45"
Cohesion: 0.25
Nodes (8): Co(), jo(), Lo(), Mo(), wo(), Ws(), xo(), Yo()

### Community 46 - "Community 46"
Cohesion: 0.43
Nodes (6): createSession(), decrypt(), deleteSession(), _generateKey(), pollSession(), stop()

### Community 47 - "Community 47"
Cohesion: 0.50
Nodes (6): _collectPoolMatches(), _collectPoolMatchesAsync(), init(), _isTv(), _matchesItem(), search()

### Community 48 - "Community 48"
Cohesion: 0.46
Nodes (6): _bindUI(), init(), _loadSettings(), _saveSettings(), _setupDownloadSettings(), _setupThemeSelector()

### Community 49 - "Community 49"
Cohesion: 0.25
Nodes (6): abortTaskSockets(), executeHttpTransfer(), fs, http, https, { URL }

### Community 50 - "Community 50"
Cohesion: 0.48
Nodes (4): ensureServer(), keepAlive(), log(), shutdownServer()

### Community 53 - "Community 53"
Cohesion: 0.60
Nodes (4): applyTheme(), getSavedTheme(), init(), _resolveThemeId()

### Community 54 - "Community 54"
Cohesion: 0.60
Nodes (4): emit(), off(), on(), toast()

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (4): description, main, name, version

## Knowledge Gaps
- **5 isolated node(s):** `LG webOS Compatibility Matrix (webOS 3.x - 25+)`, `LG webOS CLI Installation Guide`, `10-Foot TV Application Shell & Screens`, `Companion Phone Web Setup Interface`, `High-FPS Large Playlist Virtualization Engine`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 336 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Multi-Stage Playback & Stream Pipeline` connect `Community 21` to `Community 2`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `T()` (e.g. with `a()` and `l()`) actually correct?**
  _`T()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LG webOS Compatibility Matrix (webOS 3.x - 25+)`, `LG webOS CLI Installation Guide`, `10-Foot TV Application Shell & Screens` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02612942612942613 - nodes in this community are weakly interconnected._
- **Why does `Universal Cross-Platform Architecture (webOS + Electron)` connect `Community 21` to `Community 4`, `Community 31`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `e()` (e.g. with `hls.min.js` and `a()`) actually correct?**
  _`e()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10112994350282486 - nodes in this community are weakly interconnected._