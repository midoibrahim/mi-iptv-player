# HLS.js MSE Streaming Engine (Part 43)

> 7 nodes · cohesion 0.48

## Key Concepts

- **service.js** (10 connections) — `IPTVService/service.js`
- **log()** (4 connections) — `IPTVService/service.js`
- **ensureServer()** (3 connections) — `IPTVService/service.js`
- **shutdownServer()** (3 connections) — `IPTVService/service.js`
- **keepAlive()** (2 connections) — `IPTVService/service.js`
- **IMPORTANT: webOS 3.x ships Node 0.12 -> this file must stay plain ES5** (1 connections) — `IPTVService/service.js`
- **ref_webos_service** (1 connections)

## Relationships

- [test_diag.js & { app, BrowserWin...](test_diag.js_&_{_app,_BrowserWin.md) (2 shared connections)
- [Spatial Navigation & Key Handling](Spatial_Navigation_&_Key_Handling.md) (1 shared connections)
- [Community 32](Community_32.md) (1 shared connections)

## Source Files

- `IPTVService/service.js`

## Audit Trail

- EXTRACTED: 13 (93%)
- INFERRED: 1 (7%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*