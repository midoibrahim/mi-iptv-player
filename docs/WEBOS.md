# LG webOS TV Guide — MI IPTV Player

Complete guide for building, installing, and debugging MI IPTV Player on **LG webOS Smart TVs** (`webOS 3.0` through `webOS 25+`).

---

## 1. Compatibility & Architecture

MI IPTV Player is tested and optimized across all major webOS hardware generations:

| webOS Version | TV Model Years | Chromium Engine | Architecture & Optimizations |
|---|---|---|---|
| **webOS 3.0 – 3.9** (e.g. Firmware `05.70.45`) | 2016 – 2017 | Chromium 38 | Strict Babel ES5 transpilation (`acorn` verified), `core-js` + `regenerator-runtime` polyfills, static PostCSS theme compilation (CSS custom property fallbacks), Node 0.12 compatible `IPTVService` |
| **webOS 4.0 – 4.9** | 2018 – 2019 | Chromium 53 | Native flex-wrap 10-foot layout, hardware HLS/TS + MSE streaming fallback |
| **webOS 5.0 – 5.9** | 2020 | Chromium 68 | Native CSS custom properties + fallback overrides, hardware HLS + `Hls.js` / `mpegts.js` MSE fallbacks |
| **webOS 6.0** | 2021 | Chromium 79 | Full hardware & MSE streaming pipeline, Magic Remote cursor + wheel + IR D-pad navigation |
| **webOS 22 / 23 / 24 / 25** | 2022 – 2025+ | Chromium 87 – 108+ | Native `1920x1080` canvas auto-upscaled to 4K UHD by TV compositor, 60fps progressive rendering |

---

## 2. Remote Control Key Mappings

| Remote Key / Control | Function in App |
|---|---|
| **D-Pad (Up / Down / Left / Right)** | 2D spatial traversal across navigation rail, category sidebars, and media grids |
| **OK / Enter / Wheel Click** | Open selected channel, movie, or series; toggle playback controls |
| **Back Button (`keyCode 461` / `webOSBack`)** | Hierarchical LIFO back stack: closes player, channel drawer, or search before exiting app |
| **Channel Up / Channel Down (`CH+ / CH-`)** | Dedicated next / previous channel switch during live playback |
| **Play / Pause / PlayPause** | Hardware transport control during video playback |
| **Fast Forward / Rewind (`FF / RW`)** | Jump `+10s` / `-10s` in movies and series episodes |
| **Yellow / Blue Remote Button (or `F` key)** | Instant toggle Favorite for current channel or series |
| **Guide / Channel List Button** | Toggle live channel drawer overlay during playback |
| **Magic Remote Pointer & Wheel** | Direct cursor click and smooth vertical mouse wheel scrolling |

---

## 3. Step-by-Step Installation Guide

### Prerequisites on Your PC
1. **Node.js** (v18 or newer): [https://nodejs.org](https://nodejs.org)
2. **One-Click Dependencies Setup**:
   Run the repository dependency installer to set up all build tools (Babel ES5, PostCSS, esbuild):
   ```cmd
   install-dependencies.bat
   ```
3. **Install the Official LG webOS CLI (`@webos-tools/cli`)**:
   ```bash
   npm install -g @webos-tools/cli
   ```
4. Verify the CLI tools are available:
   ```bash
   ares -V
   ```

### Step 1: Enable Developer Mode on the LG TV
1. Create a free LG Developer account at [https://webostv.developer.lge.com](https://webostv.developer.lge.com).
2. On your LG TV, open the **LG Content Store** (or **Apps** on webOS 5 / 6 / 22+), search for **Developer Mode**, and install it.
3. Launch the **Developer Mode** app on the TV and sign in with your LG Developer account.
4. Toggle **Dev Mode Status** to **ON** (the TV will reboot).
5. After the TV reboots, open the **Developer Mode** app again and toggle **Key Server** to **ON**.
6. Note the **TV IP Address** and the **6-character Passphrase** shown on the screen.

### Step 2: Pair Your PC with the TV (One-Time Setup)
1. Ensure your PC and LG TV are on the same local Wi-Fi or Ethernet network.
2. Register your TV with `ares-setup-device` (replace `<TV_IP>` with your TV's IP address, e.g., `192.168.1.107`):
   ```bash
   ares-setup-device --add lgtv --info "{'host':'<TV_IP>','port':'9922','username':'prisoner','description':'LG webOS TV'}"
   ```
3. Fetch the SSH Developer Key from the TV and enter the **6-character Passphrase** when prompted:
   ```bash
   ares-novacom --device lgtv --getkey
   ```
4. Verify connection:
   ```bash
   ares-device -i --device lgtv
   ```

### Step 3: Install & Launch the `.ipk` Package

#### Option A: One-Click Windows Script (`install-webos.bat`)
Make sure your TV is turned on, then run:
```cmd
install-webos.bat
```
*(If your device name in `ares-setup-device` is not `lgtv`, pass it as an argument: `install-webos.bat myTV`).*

#### Option B: Direct CLI Commands
1. Install package:
   ```bash
   ares-install --device lgtv dist/com.miiptv.player_1.0.0_all.ipk
   ```
2. Launch app:
   ```bash
   ares-launch --device lgtv com.miiptv.player
   ```

---

## 4. Building the `.ipk` from Source

Run the automated packaging script from the repository root:
```cmd
package-webos.bat
```

Or execute the pipeline manually:
```bash
npm --prefix webos-build install
node webos-build/build.mjs
ares-package build/IPTVPlayer build/IPTVService -o dist
```

This generates:
```text
dist/com.miiptv.player_1.0.0_all.ipk (~425 KB)
```

---

## 5. Debugging & Live Inspection

- **Launch Chrome Web Inspector for live debugging**:
  ```bash
  ares-inspect --device lgtv --app com.miiptv.player --open
  ```
- **View Live Application Logs**:
  ```bash
  ares-launch --device lgtv --log com.miiptv.player
  ```
- **Close the Running App**:
  ```bash
  ares-launch --device lgtv --close com.miiptv.player
  ```
- **Uninstall App from TV**:
  ```bash
  ares-install --device lgtv --remove com.miiptv.player
  ```

