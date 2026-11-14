const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  MI IPTV Player - Windows Packaging Utility');
console.log('========================================================\n');

// Ensure any running instances of the app are closed so the executable is not locked
try {
    execSync('taskkill /F /IM "MI IPTV Player.exe" /T', { stdio: 'ignore' });
} catch (e) {}

console.log('[1/3] Preparing app bundle for Windows...');
const srcDir = path.join(__dirname, '../IPTVPlayer');
const appDir = path.join(__dirname, 'app');

// Keep shared companion server core in sync with IPTVService/companionCore.js
fs.copyFileSync(
    path.join(__dirname, '../IPTVService/companionCore.js'),
    path.join(__dirname, 'companionCore.js')
);

if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
}
const IGNORED_NAMES = new Set(['Tools', 'Downloads', 'Config', 'OSE', 'TV', 'store_icons', 'node_modules', '.git']);
fs.cpSync(srcDir, appDir, {
    recursive: true,
    filter: (src) => {
        const base = path.basename(src);
        if (IGNORED_NAMES.has(base)) return false;
        if (base.endsWith('.py') || base.endsWith('.iso') || base.endsWith('.dll') || base.endsWith('.exe')) {
            // Keep only web assets, exclude any loose executables/DLLs in source tree
            return false;
        }
        return true;
    }
});

console.log('[2/3] Packaging Windows executable with @electron/packager...');
const outDir = path.join(__dirname, '../dist/windows');
const iconFile = path.join(__dirname, 'icon.ico');

let packagerCmd = `npx @electron/packager . "MI IPTV Player" ` +
    `--platform=win32 --arch=x64 --out="${outDir}" ` +
    `--overwrite --asar --prune=true ` +
    `--app-version="1.0.0"`;

if (fs.existsSync(iconFile)) {
    packagerCmd += ` --icon="${iconFile}"`;
}

// Retry loop for Windows Defender momentary lock
let packaged = false;
for (let attempt = 1; attempt <= 3; attempt++) {
    try {
        console.log(`Packaging attempt ${attempt}/3...`);
        execSync(packagerCmd, { stdio: 'inherit', cwd: __dirname });
        packaged = true;
        break;
    } catch (err) {
        console.warn(`Attempt ${attempt} encountered lock, waiting 3s before retry...`);
        try { execSync('taskkill /F /IM "MI IPTV Player.exe" /T', { stdio: 'ignore' }); } catch (k) {}
        execSync('node -e "setTimeout(() => {}, 3000)"');
    }
}

if (!packaged) {
    throw new Error('Packaging failed after 3 attempts');
}

// Clean up temporary app folder and staged companionCore copy
const stagedCompanion = path.join(__dirname, 'companionCore.js');
if (fs.existsSync(stagedCompanion)) {
    fs.unlinkSync(stagedCompanion);
}
if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
}

console.log('\n[3/4] Creating portable distribution ZIP archive...');
const zipOutput = path.join(__dirname, '../dist/MI-IPTV-Player-v1.0.0-windows-x64.zip');
const packagedDir = path.join(outDir, 'MI IPTV Player-win32-x64');
if (fs.existsSync(zipOutput)) {
    try { fs.unlinkSync(zipOutput); } catch (e) {}
}
try {
    execSync(`tar -a -cf "${zipOutput}" -C "${packagedDir}" .`, { stdio: 'inherit' });
    console.log('Portable ZIP created: ' + zipOutput);
} catch (e) {
    try {
        execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${packagedDir}\\*' -DestinationPath '${zipOutput}' -Force"`, { stdio: 'inherit' });
        console.log('Portable ZIP created (PowerShell fallback): ' + zipOutput);
    } catch (zipErr) {
        console.warn('Could not create portable zip archive automatically:', zipErr.message);
    }
}

console.log('\n[4/4] SUCCESS! Windows app generated in dist/');
const expectedExe = path.join(outDir, 'MI IPTV Player-win32-x64', 'MI IPTV Player.exe');
if (fs.existsSync(expectedExe)) {
    console.log('  Executable: ' + expectedExe);
}
if (fs.existsSync(zipOutput)) {
    console.log('  Portable ZIP: ' + zipOutput);
}
