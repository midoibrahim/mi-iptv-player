# MI IPTV Player — Agent & Graphify Architecture Rules

All AI coding agents (Antigravity, Claude Code, Cursor, Windsurf, or MCP-enabled agents) working on this repository MUST follow this workflow before searching the codebase and after making any code or documentation changes.

---

## 1. Search the Knowledge Graph FIRST (Before Broad File Grepping)

This repository maintains a live **Graphify** knowledge graph and agent-crawlable wiki in `graphify-out/` (~30.7x token reduction compared to reading raw files).

Before performing broad text searches or reading unfamiliar modules:
1. **Check the Wiki Entry Point**: Read [`graphify-out/wiki/index.md`](./graphify-out/wiki/index.md) and [`graphify-out/GRAPH_REPORT.md`](./graphify-out/GRAPH_REPORT.md) to identify the exact community, module, and god nodes.
2. **Use Graphify MCP Tools (if available)**:
   - Call `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, or `shortest_path` from the `graphify` MCP server.
3. **Or Use Graphify CLI Queries**:
   ```powershell
   $py = Get-Content graphify-out\.graphify_python
   $graphify = Join-Path (Split-Path $py) "graphify.exe"
   & $graphify query "<your question>"
   & $graphify path "<SourceNode>" "<TargetNode>"
   & $graphify explain "<NodeOrSymbol>"
   ```
4. Once you locate the target community article in `graphify-out/wiki/` or the target file/symbol from the graph, read only the specific source file lines needed.

---

## 2. Architecture & Platform Constraints

- **Clean Code & SOLID Module Boundaries**:
  - **Core (`IPTVPlayer/js/core/`)**: `eventBus.js`, `catalogStore.js`, `backStack.js`, `platform.js`, `spatialNav.js`, `keyHandler.js`, `storage.js`, `theme.js`, `icons.js`.
  - **Services (`IPTVPlayer/js/services/`)**: `playerService.js` (facade), `playbackEngine.js` (Hls.js / mpegts.js / native `<video>` lifecycle & watchdogs), `streamResolver.js` (candidate URL priority & local-first offline resolution), `watchProgressTracker.js`, `downloadStore.js`, `xtreamService.js`, `m3uParser.js`, `tvServer.js`.
  - **Components (`IPTVPlayer/js/components/`)**: `playerOsd.js`, `channelDrawer.js`, `downloadManager.js`, `card.js`.
  - **Views (`IPTVPlayer/js/views/`)**: `homeView.js`, `browseView.js`, `seriesDetailView.js`, `searchView.js`, `loginView.js`, `settingsView.js`.
  - **Companion Server & Offline Engine**: `IPTVService/companionCore.js` (strict ES5 for LG webOS 3.x Node 0.12 compatibility, mirrored to `windows/companionCore.js`), `windows/downloader.js`, and `windows/downloadUtils.js`.
- **Verification Suite**:
  - Run `node --test tests/characterization.test.js` after any code change to ensure all 16 characterization tests pass.
  - If modifying `IPTVPlayer/` or `IPTVService/`, verify legacy ES5 transpilation (`cd webos-build && node build.mjs`) and/or Windows packaging (`node windows/build.js`).

---

## 3. Update the Knowledge Graph AFTER Every Code/Doc Change

Whenever you add, modify, rename, or delete any source file or documentation in this repository, you **MUST** update `graphify-out/` before finishing your task:

1. **For Code-Only Changes (Fast AST Update — 0 LLM Tokens, ~3 seconds)**:
   Run `/graphify . --update` (or execute the incremental AST merge + `graphify export html` and `graphify export wiki`) so `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html`, and `graphify-out/wiki/` stay 100% synchronized with the codebase.
2. **For Documentation / Architecture / Screenshot Changes**:
   Run `/graphify . --update` to re-extract changed docs/images and refresh the community wiki and report.

