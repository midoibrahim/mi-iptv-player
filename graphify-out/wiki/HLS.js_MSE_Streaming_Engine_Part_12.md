# HLS.js MSE Streaming Engine (Part 12)

> 23 nodes · cohesion 0.17

## Key Concepts

- **IPTVApp** (23 connections) — `IPTVPlayer/js/app.js`
- **.connect()** (8 connections) — `IPTVPlayer/js/app.js`
- **._init()** (8 connections) — `IPTVPlayer/js/app.js`
- **._applyCatalogData()** (4 connections) — `IPTVPlayer/js/app.js`
- **.navigateTo()** (4 connections) — `IPTVPlayer/js/app.js`
- **.toast()** (4 connections) — `IPTVPlayer/js/app.js`
- **._bindNavigation()** (3 connections) — `IPTVPlayer/js/app.js`
- **.disconnect()** (3 connections) — `IPTVPlayer/js/app.js`
- **._refreshBrowseViews()** (3 connections) — `IPTVPlayer/js/app.js`
- **._registerBackGuards()** (3 connections) — `IPTVPlayer/js/app.js`
- **.renderFavorites()** (3 connections) — `IPTVPlayer/js/app.js`
- **._stepChannel()** (3 connections) — `IPTVPlayer/js/app.js`
- **.constructor()** (2 connections) — `IPTVPlayer/js/app.js`
- **._fetchCatalogFromNetwork()** (2 connections) — `IPTVPlayer/js/app.js`
- **.hideLoading()** (2 connections) — `IPTVPlayer/js/app.js`
- **.nextChannel()** (2 connections) — `IPTVPlayer/js/app.js`
- **.onItemClick()** (2 connections) — `IPTVPlayer/js/app.js`
- **.prevChannel()** (2 connections) — `IPTVPlayer/js/app.js`
- **.registerSectionHook()** (2 connections) — `IPTVPlayer/js/app.js`
- **.setLoadingText()** (2 connections) — `IPTVPlayer/js/app.js`
- **.showLoading()** (2 connections) — `IPTVPlayer/js/app.js`
- **app.js** (1 connections) — `IPTVPlayer/js/app.js`
- **.goBack()** (1 connections) — `IPTVPlayer/js/app.js`

## Relationships

- [build.js & appDir](build.js_&_appDir.md) (1 shared connections)

## Source Files

- `IPTVPlayer/js/app.js`

## Audit Trail

- EXTRACTED: 44 (98%)
- INFERRED: 1 (2%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*