@echo off
echo ========================================================
echo   MI IPTV Player - LG webOS TV Packaging Utility
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Building legacy-compatible app (ES5 + CSS fallbacks for webOS 3.x / Chromium 38)...
if not exist "webos-build\node_modules" (
    cmd /c npm --prefix webos-build install --no-fund --no-audit
)
cmd /c npm --prefix webos-build run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Legacy build failed. Please check error messages above.
    exit /b 1
)

cd /d "%~dp0\build"

echo [2/3] Packaging MI IPTV Player (app + on-TV service) into webOS .ipk...
rem Dev-only files are already excluded by webos-build\build.mjs
cmd /c ares-package IPTVPlayer IPTVService -o ../dist

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [3/3] SUCCESS! Package created in dist\
    dir "..\dist\*.ipk"
    echo.
    echo Next steps:
    echo 1. Connect to TV:
    echo    ares-setup-device
    echo 2. Install on TV:
    echo    ares-install -d myTV "..\dist\com.miiptv.player_1.0.0_all.ipk"
    echo 3. Launch on TV:
    echo    ares-launch -d myTV com.miiptv.player
    echo 4. Debug / Live Inspect:
    echo    ares-inspect -d myTV -a com.miiptv.player --open
) else (
    echo.
    echo [ERROR] Packaging failed. Please check error messages above.
)
