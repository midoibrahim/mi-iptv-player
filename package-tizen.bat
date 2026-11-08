@echo off
echo ========================================================
echo   MI IPTV Player - Samsung Tizen TV Packaging Utility
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Building Samsung Tizen TV app (v1510 / Tizen 2.4+ ES5 + minified)...
if not exist "webos-build\node_modules" (
    cmd /c npm --prefix webos-build install --no-fund --no-audit
)
node tizen-build/build.mjs
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Tizen build failed. Please check error messages above.
    exit /b 1
)

echo.
echo [2/2] SUCCESS! Both LAN and USB Tizen packages created:
echo   1. LAN / SDB Package : dist\MIIPTVPlayer.wgt
echo   2. USB Flash Package : dist\tizen-usb\userwidget\MIIPTVPlayer.wgt
echo.
echo Deployment Option A - Install over LAN (Developer Mode):
echo   install-tizen.bat ^<TV_IP_ADDRESS^>
echo.
echo Deployment Option B - Install via USB Flash Drive:
echo   Copy the folder "dist\tizen-usb\userwidget" to the root of a FAT32 USB drive
echo   and plug it into your Samsung Smart TV.
echo.

