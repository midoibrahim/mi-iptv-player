@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Building Tizen ES5 package...
node tizen-build/build.mjs
if errorlevel 1 goto :fail

set "TZ_PATH=%USERPROFILE%\.tizen-extension-platform\server\sdktools\data\tools\tizen-core\tz.exe"
set "SDB_PATH=%USERPROFILE%\.tizen-extension-platform\server\sdktools\data\tools\sdb.exe"

if not exist "%TZ_PATH%" (
    echo Error: tz.exe not found at %TZ_PATH%
    goto :fail
)

echo [2/3] Signing WGT package for emulator...
"%TZ_PATH%" pack -t wgt -b "dist\MIIPTVPlayer.wgt" -o "dist\MIIPTVPlayer.signed.wgt"
if errorlevel 1 goto :fail

echo [3/3] Installing and launching on emulator...
"%SDB_PATH%" install "dist\MIIPTVPlayer.signed.wgt"
if errorlevel 1 goto :fail

"%SDB_PATH%" shell "app_launcher -s MIIPTVPlay.MIIPTVPlayer"
echo.
echo ========================================================
echo   MI IPTV Player successfully launched on Emulator!
echo ========================================================
exit /b 0

:fail
echo [ERROR] Emulator deployment failed.
exit /b 1

