@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo   MI IPTV Player - Samsung Tizen TV Installer Utility
echo ========================================================
echo.

set "WGT_PATH=%~dp0dist\MIIPTVPlayer.wgt"
set "APP_ID=MIIPTVPlay.MIIPTVPlayer"
set "TV_IP=%~1"

if not exist "%WGT_PATH%" (
    echo [ERROR] WGT file not found at: "%WGT_PATH%"
    echo Run package-tizen.bat first to build the Tizen package.
    exit /b 1
)

set "SDB_BIN="
set "TIZEN_BIN="

if exist "C:\tizen-studio\tools\sdb.exe" set "SDB_BIN=C:\tizen-studio\tools\sdb.exe"
if exist "%USERPROFILE%\tizen-studio\tools\sdb.exe" set "SDB_BIN=%USERPROFILE%\tizen-studio\tools\sdb.exe"
if "%SDB_BIN%"=="" (
    for /f "delims=" %%i in ('where.exe sdb.exe 2^>nul') do if "!SDB_BIN!"=="" set "SDB_BIN=%%i"
)

if exist "C:\tizen-studio\tools\ide\bin\tizen.bat" set "TIZEN_BIN=C:\tizen-studio\tools\ide\bin\tizen.bat"
if exist "%USERPROFILE%\tizen-studio\tools\ide\bin\tizen.bat" set "TIZEN_BIN=%USERPROFILE%\tizen-studio\tools\ide\bin\tizen.bat"
if "%TIZEN_BIN%"=="" (
    for /f "delims=" %%i in ('where.exe tizen.bat 2^>nul') do if "!TIZEN_BIN!"=="" set "TIZEN_BIN=%%i"
)

if "%SDB_BIN%"=="" (
    echo [WARNING] Samsung SDB / Tizen Studio CLI was not found on this PC.
    echo.
    echo You can either:
    echo   1. Copy "dist\tizen-usb\userwidget" onto the root of a FAT32 USB drive and plug it into your Samsung TV.
    echo   2. Or install Tizen Studio CLI ^(C:\tizen-studio^) and run:
    echo        install-tizen.bat ^<TV_IP_ADDRESS^>
    exit /b 1
)

if not "%TV_IP%"=="" (
    echo [1/3] Connecting to Samsung TV at %TV_IP%:26101...
    "%SDB_BIN%" connect %TV_IP%:26101
)

echo.
echo [2/3] Installing %WGT_PATH% onto connected Samsung TV...
if not "%TIZEN_BIN%"=="" (
    cmd /c ""%TIZEN_BIN%" install -n "%WGT_PATH%""
) else (
    "%SDB_BIN%" install "%WGT_PATH%"
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Installation failed. Please verify:
    echo   1. On your Samsung TV, open the "Apps" screen and press 1-2-3-4-5 on the remote.
    echo   2. Turn Developer Mode ON, enter your PC's IP address, and reboot the TV.
    echo   3. Run: install-tizen.bat ^<TV_IP_ADDRESS^>
    exit /b 1
)

echo.
echo [3/3] Launching %APP_ID% on Samsung TV...
if not "%TIZEN_BIN%"=="" (
    cmd /c ""%TIZEN_BIN%" run -p %APP_ID%"
) else (
    "%SDB_BIN%" shell 0 was_execute %APP_ID%
)
echo.
echo [SUCCESS] MI IPTV Player installed on your Samsung Tizen TV!

