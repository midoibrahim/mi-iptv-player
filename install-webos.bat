@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo   MI IPTV Player - LG webOS TV Installer Utility
echo ========================================================
echo.

set "IPK_PATH=%~dp0dist\com.miiptv.player_1.0.0_all.ipk"
set "APP_ID=com.miiptv.player"
set "DEVICE=%~1"
if "%DEVICE%"=="" set "DEVICE=lgtv"

if not exist "%IPK_PATH%" (
    echo [ERROR] IPK file not found at: "%IPK_PATH%"
    echo Run package-webos.bat first to build the IPK.
    exit /b 1
)

where ares-install >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] LG webOS CLI ^(ares-install^) is not installed or not in PATH.
    echo Install it globally with:
    echo   npm install -g @webos-tools/cli
    exit /b 1
)

echo Target Device : %DEVICE%
echo Package       : %IPK_PATH%
echo.

echo [1/2] Installing %APP_ID% onto TV ^(%DEVICE%^)...
cmd /c ares-install --device "%DEVICE%" "%IPK_PATH%"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Installation failed. Please verify:
    echo   1. Your LG TV is turned ON and connected to the same Wi-Fi/LAN.
    echo   2. Developer Mode app on the TV has "Dev Mode Status" and "Key Server" ON.
    echo   3. Your device is configured via: ares-setup-device
    echo   4. Your SSH key is fetched via: ares-novacom --device %DEVICE% --getkey
    exit /b 1
)

echo.
echo [2/2] Launching %APP_ID% on TV ^(%DEVICE%^)...
cmd /c ares-launch --device "%DEVICE%" %APP_ID%
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] MI IPTV Player is installed and running on your LG TV!
) else (
    echo.
    echo [WARNING] Package installed, but auto-launch failed. You can open MI IPTV Player from the TV Home Bar.
)
