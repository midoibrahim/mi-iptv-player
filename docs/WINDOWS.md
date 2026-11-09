# Windows Desktop Guide — MI IPTV Player

Complete guide for building, running, and using MI IPTV Player as a native **Windows Desktop application** (Windows 10 & Windows 11 x64).

---

## 1. Overview & Architecture

The Windows desktop edition packages the 10-foot Smart TV interface inside a lightweight, hardware-accelerated **Electron** shell with dedicated desktop capabilities:

- **Universal GPU Acceleration**: Configured with `--enable-gpu-rasterization`, `--enable-zero-copy`, and `--ignore-gpu-blocklist` for silky-smooth 4K 60fps IPTV streams.
- **Offline Download Manager**: Background streaming engine that saves Movies and Series episodes directly to your PC for offline viewing.
- **Universal TV Remuxing (MP4 + AAC 48kHz)**: Automatic background remuxer that repackages `.ts`/`.mkv` streams into standard H.264 MP4 with AAC 48kHz audio for maximum compatibility with older TVs and home-theater receivers.
- **Zero-Pillarbox Responsive Scaling**: Dynamically adapts the native 1080p canvas to any monitor resolution or aspect ratio without letterbox black bars.
- **Built-in Phone Setup Companion Server**: Automatically runs the local setup service on port 8089 so you can scan the QR code with your smartphone to enter Xtream Codes or M3U credentials.

---

## 2. Desktop Controls & Keyboard Shortcuts

| Input / Shortcut | Action |
|---|---|
| **F11 / Double-Click / `F` Key** | Toggle Fullscreen mode |
| **Esc** | Exit Fullscreen mode |
| **F12 / Ctrl+Shift+I** | Toggle Chrome Developer Tools |
| **Arrow Keys (Up, Down, Left, Right)** | Navigate grid cards, side rail, and player controls |
| **Enter / Space** | Select item / Toggle Play and Pause |
| **Backspace / Escape** | Go Back / Exit screen |
| **`[` and `]` (or PageUp / PageDown)** | Previous / Next Channel |
| **`J` / `L` (or Left / Right in Player)** | Rewind `-10s` / Fast-Forward `+10s` |
| **Mouse Wheel** | Smooth vertical scrolling through long playlist channels and grids |

---

## 3. Background Downloader & Offline Playback

The Windows version includes a dedicated **Downloads** section in the navigation side rail:

### Key Features
1. **Single & Batch Downloads**:
   - Download individual movies from their detail cards or the player OSD.
   - Download individual series episodes or queue an **entire season** / **entire series** with one click.
2. **Pause & Resume**:
   - Pause active downloads anytime and resume without losing partial progress (uses HTTP Range `bytes=X-` requests).
3. **Queue & Concurrency Management**:
   - Configure simultaneous downloads (1 sequential, 2, or 3 parallel downloads) to match your internet bandwidth.
4. **Universal TV Remuxing**:
   - Check **Universal TV Compatibility (MP4 + AAC 48kHz)** in the Downloads settings. Completed downloads will automatically be converted to MP4 format for compatibility with external USB drives on older Smart TVs.
5. **Local-First Offline Resolution**:
   - When playing a movie or episode you have already downloaded, the app automatically plays from the local hard drive file (`file:///...`) instead of streaming from the provider server.

---

## 4. Building the Windows Executable

### Prerequisites
- **Node.js** (v18 or newer recommended): [https://nodejs.org](https://nodejs.org)
- **One-Click Setup Script**:
  Run the automated installer at the repository root to install all Electron dependencies:
  ```cmd
  install-dependencies.bat
  ```

### Build Command
Run the one-click Windows packaging script from the repository root:
```cmd
package-windows.bat
```

Or run the build manually:
```cmd
cd windows
npm install
npm run build
```

This compiles and packages the portable Windows executable at:
```text
dist\windows\MI IPTV Player-win32-x64\MI IPTV Player.exe
```

---

## 5. Running the Application

Launch the portable executable directly:
```cmd
start "" "dist\windows\MI IPTV Player-win32-x64\MI IPTV Player.exe"
```

No external installation or administrator privileges are required.

---

## 6. Phone QR Setup on Desktop

1. Launch **MI IPTV Player.exe**.
2. On the **Add New Playlist** screen, a QR code is displayed pointing to `http://<YOUR_PC_IP>:8089/setup.html`.
3. Open your mobile phone camera or QR scanner and scan the code (ensure phone and PC are on the same Wi-Fi network).
4. Enter your Xtream Codes API server/username/password or M3U playlist URL on your phone and tap **Connect**.
5. The desktop app instantly receives the credentials and loads your playlist without requiring keyboard input.

