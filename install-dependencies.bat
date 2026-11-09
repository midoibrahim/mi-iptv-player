@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   MI IPTV Player - Dependency Installation ^& Setup
echo   Platforms: LG webOS ^| Samsung Tizen ^| Windows Desktop
echo ========================================================
echo.

:: 1. Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js 18+ from https://nodejs.org/
    goto :fail
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js detected: %NODE_VER%

:: 2. Check npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed or not in PATH!
    goto :fail
)
for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo [OK] npm detected: v%NPM_VER%

:: 3. Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo [WARN] Python is not installed or not in PATH.
    echo        Python is optional for local server testing and graphify.
) else (
    for /f "tokens=*" %%v in ('python --version') do set PY_VER=%%v
    echo [OK] Python detected: !PY_VER!
    
    echo.
    echo Installing Python packages from requirements.txt...
    python -m pip install -r requirements.txt --quiet
    if errorlevel 1 (
        echo [WARN] Failed to install some Python packages. Continuing...
    ) else (
        echo [OK] Python dependencies installed successfully.
    )
)

echo.
echo --------------------------------------------------------
echo [1/2] Installing webOS ^& Tizen build tools: Babel, PostCSS, esbuild...
echo --------------------------------------------------------
cd /d "%~dp0webos-build"
call npm install
if errorlevel 1 goto :fail

echo.
echo --------------------------------------------------------
echo [2/2] Installing Windows Desktop Electron dependencies...
echo --------------------------------------------------------
cd /d "%~dp0windows"
call npm install
if errorlevel 1 goto :fail

cd /d "%~dp0"

echo.
echo --------------------------------------------------------
echo [Test] Running 16 Characterization Tests...
echo --------------------------------------------------------
node --test tests/characterization.test.js
if errorlevel 1 (
    echo [WARN] Some tests failed. Please review the output above.
) else (
    echo [OK] All 16 characterization tests passed!
)

echo.
echo ========================================================
echo   Setup Completed Successfully!
echo ========================================================
echo.
echo Available packaging commands:
echo   - package-webos.bat          (Build LG webOS .ipk)
echo   - package-tizen.bat          (Build Samsung Tizen .wgt for LAN ^& USB)
echo   - package-windows.bat        (Build Windows Desktop .exe)
echo.
echo Available running commands:
echo   - install-tizen-emulator.bat (Auto-sign and launch in Tizen Emulator)
echo   - python server.py           (Start local test server at localhost:8088)
echo.
exit /b 0

:fail
echo.
echo [ERROR] Installation encountered an error.
exit /b 1
