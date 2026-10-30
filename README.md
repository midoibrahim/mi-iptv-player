# MI IPTV Player for LG webOS TV

A high-performance, 10-foot Smart TV IPTV player engineered for **LG webOS TVs** (compatible from legacy **webOS 3.x / Chromium 38** through modern **webOS 24+**). Supports **Xtream Codes API** and **M3U / M3U8 playlists**, Live TV, Movies (VOD), Series with multi-season episode browsers, phone QR code credential setup, and hardware-friendly D-pad spatial navigation.

---

## Key Features

- **Universal LG webOS Compatibility (`webOS 3.x` – `webOS 24+`)**
  - Automated ES5 transpilation (`Babel` + `core-js` + `regenerator-runtime`) and static CSS custom-property / theme compilation (`PostCSS` + `Autoprefixer`) so the app runs natively on Chromium 38 as well as modern Chromium engines.
- **10-Foot Native Full HD (`1920x1080`) TV Interface**
  - Designed specifically for TV viewing distance with zero CSS `zoom` distortion, hardware-accelerated transitions, and cross-TV `flex-wrap` grids.
  - **4 Built-in TV Themes**: *OLED Black (Default)*, *Midnight Blue*, *Emerald Teal*, and *Crimson Indigo*.
- **Fast On-TV Phone Setup via QR Code (`com.miiptv.player.service`)**
  - Bundled Node.js background service (`IPTVService`) starts an HTTP server on `<TV_LAN_IP>:8089` **only while the QR Code setup screen is open** and automatically shuts down the moment you leave the setup screen.
  - Scan the QR code with your phone to enter Xtream Codes or M3U credentials without typing on the TV remote.
- **High-FPS Large Playlist Engine**
  - `O(1)` category-to-stream lookup maps, lazy section rendering, `DocumentFragment` batching, and 36-card progressive scroll pagination handle 20,000+ channels/movies smoothly.
- **Multi-Stage Stream Playback Pipeline**
  - Prioritizes native LG webOS hardware HLS (`.m3u8`) and MPEG-TS decoding, with automatic fallbacks to `hls.js`, `mpegts.js`, and the local stream proxy (`http://127.0.0.1:8089/api/stream`).
- **Deterministic 2D & 1D Remote Navigation**
  - Full support for LG Magic Remote & standard IR D-pad (`ArrowKeys`, `Enter/OK`, `Back` button `keyCode 461`, `CH+/CH-`, and media transport keys).

---

## Prerequisites & Step-by-Step `.ipk` Installation Guide

Follow these steps to install `dist/com.miiptv.player_1.0.0_all.ipk` (or the `.ipk` downloaded from **GitHub Releases**) onto any LG webOS Smart TV.

### Step 1: Prerequisites on Your PC
1. **Install Node.js** (v16 or newer): [https://nodejs.org](https://nodejs.org)
2. **Install the Official LG webOS CLI (`@webos-tools/cli`)**:
   ```bash
   npm install -g @webos-tools/cli
   ```
3. Verify the CLI tools are available:
   ```bash
   ares -V
   ```

### Step 2: Prepare Your LG Smart TV (Developer Mode)
1. Create a free LG Developer account at [https://webostv.developer.lge.com](https://webostv.developer.lge.com).
2. On your LG TV, open the **LG Content Store** (or Apps), search for **Developer Mode**, and install it.
3. Launch the **Developer Mode** app on the TV and sign in with your LG Developer account.
4. Toggle **Dev Mode Status** to **ON** (the TV will reboot).
5. After the TV reboots, open the **Developer Mode** app again and toggle **Key Server** to **ON**.
6. Note the **TV IP Address** and the **6-character Passphrase** shown on the Developer Mode screen.

### Step 3: Connect Your PC to the LG TV (One-Time Setup)
1. Ensure your PC and LG TV are on the same local network (Wi-Fi or Ethernet).
2. Register your TV with `ares-setup-device` (replace `<TV_IP>` with your TV's IP address, e.g., `192.168.1.107`):
   ```bash
   ares-setup-device --add lgtv --info "{'host':'<TV_IP>','port':'9922','username':'prisoner','description':'LG webOS TV'}"
   ```
   *(Or run `ares-setup-device` interactively and follow the prompts: Device Name `lgtv`, IP `<TV_IP>`, Port `9922`, User `prisoner`).*
3. Fetch the SSH Developer Key from the TV and enter the **6-character Passphrase** displayed on the TV screen when prompted:
   ```bash
   ares-novacom --device lgtv --getkey
   ```
4. Verify connectivity to your TV:
   ```bash
   ares-device -i --device lgtv
   ```

### Step 4: Install & Launch the `.ipk` Package

#### Option A: One-Click Windows Script (`install-webos.bat`)
Make sure your TV is turned on, then run:
```cmd
install-webos.bat
```
*(If your device name is not `lgtv`, pass it as an argument: `install-webos.bat myTV`).*

#### Option B: Direct CLI Commands
1. **Install the `.ipk` onto the TV**:
   ```bash
   ares-install --device lgtv dist/com.miiptv.player_1.0.0_all.ipk
   ```
2. **Launch MI IPTV Player on the TV**:
   ```bash
   ares-launch --device lgtv com.miiptv.player
   ```

#### Useful Management Commands
- **List installed apps on TV**:
  ```bash
  ares-install --device lgtv --list
  ```
- **Close the running app**:
  ```bash
  ares-launch --device lgtv --close com.miiptv.player
  ```
- **Open Chrome Web Inspector for live debugging**:
  ```bash
  ares-inspect --device lgtv --app com.miiptv.player --open
  ```

---

## Building the `.ipk` from Source

Run the packaging script from the repository root:
```cmd
package-webos.bat
```
Or run the steps manually:
```bash
npm --prefix webos-build install
npm --prefix webos-build run build
ares-package build/IPTVPlayer build/IPTVService -o dist
```
This outputs the ready-to-install package at:
```text
dist/com.miiptv.player_1.0.0_all.ipk
```

---

## Repository Structure

```text
├── IPTVPlayer/                  # Main LG webOS Web Application (com.miiptv.player)
│   ├── appinfo.json             # webOS application manifest (1920x1080)
│   ├── index.html               # App shell & screens (Login, Home, Browse, Series, Player)
│   ├── setup.html               # Companion phone web UI served on port 8089 during QR setup
│   ├── server.py                # Optional local Python dev server for PC browser testing
│   ├── icon.png / largeicon.png # webOS launcher icons
│   ├── css/                     # Modular 10-foot UI stylesheets
│   │   ├── theme.css            # Design tokens & 4 color themes
│   │   ├── base.css             # 1920x1080 viewport, focus rings, screen layout
│   │   ├── navigation.css       # Collapsible side navigation rail (104px -> 360px)
│   │   ├── components.css       # Buttons, login cards, QR card, media cards, hero banner
│   │   ├── browse.css           # Category sidebar + progressive grid/row layouts
│   │   ├── series.css           # Series detail view, season tabs & episode cards
│   │   └── player.css           # Fullscreen video player OSD, progress bar & channel banner
│   ├── js/
│   │   ├── app.js               # Main application coordinator
│   │   ├── hls.min.js           # HLS MSE fallback engine
│   │   ├── mpegts.js            # MPEG-TS MSE fallback engine
│   │   ├── core/                # Polyfills, 2D spatial navigation, key handler, storage, themes, icons
│   │   ├── services/            # Xtream API client, M3U parser, player service, on-TV server bridge
│   │   ├── components/          # Reusable media card & lazy-rendered browse view
│   │   └── views/               # Login, Home, Series Detail, Search & Settings views
│   ├── fonts/lineicons/         # Icon font & CSS assets
│   └── webOSTVjs-1.2.13/        # Official LG webOSTV.js SDK library
│
├── IPTVService/                 # Bundled webOS JS Service (com.miiptv.player.service)
│   ├── services.json            # Luna bus service definition
│   ├── package.json             # Service package manifest
│   └── service.js               # Node 0.12 ES5 HTTP setup server, LAN IP detector & CORS proxy
│
├── webos-build/                 # Build & Transpilation Pipeline for webOS 3.x+
│   ├── package.json             # Babel, esbuild, PostCSS, Autoprefixer, core-js dependencies
│   └── build.mjs                # Produces ES5 + static-theme CSS build in build/
│
├── dist/                        # Packaged LG webOS Installers (.ipk)
│   └── com.miiptv.player_1.0.0_all.ipk
│
├── package-webos.bat            # One-click Windows build & ares-package script
└── install-webos.bat            # One-click Windows TV installer & launcher script
```

---

## Local PC Browser Development

To test in a desktop browser with the phone QR setup endpoint (`http://localhost:8089`):
```bash
python IPTVPlayer/server.py
```
Then open `http://localhost:8089` in Chrome or Edge.
