@echo off
echo ========================================================
echo   MI IPTV Player - Windows Application Packaging Utility
echo ========================================================
echo.

cd /d "%~dp0windows"

if not exist "node_modules" (
    echo [1/2] Installing Windows packaging dependencies...
    cmd /c npm install --no-fund --no-audit
    if errorlevel 1 (
        echo [ERROR] npm install failed in windows directory
        exit /b 1
    )
)

echo.
echo [2/2] Building and packaging MI IPTV Player for Windows x64...
cmd /c npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] Packaging failed. Please check error messages above.
    cd /d "%~dp0"
    exit /b 1
)

echo.
echo ========================================================
echo   SUCCESS! Windows app ready in dist\
echo ========================================================
echo.
echo Output artifacts:
echo   1. Unpacked Folder : dist\windows\MI IPTV Player-win32-x64\
echo   2. Portable ZIP    : dist\MI-IPTV-Player-v1.0.0-windows-x64.zip
echo.
echo To run the player locally:
echo   start "" "dist\windows\MI IPTV Player-win32-x64\MI IPTV Player.exe"
echo.
cd /d "%~dp0"
