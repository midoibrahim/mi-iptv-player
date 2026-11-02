const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  MI IPTV Player - Windows Packaging Utility');
console.log('========================================================\n');

console.log('[1/3] Preparing app bundle for Windows...');
const srcDir = path.join(__dirname, '../IPTVPlayer');
const appDir = path.join(__dirname, 'app');

if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
}
fs.cpSync(srcDir, appDir, { recursive: true });

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

execSync(packagerCmd, { stdio: 'inherit', cwd: __dirname });

// Clean up temporary app folder
if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
}

console.log('\n[3/3] SUCCESS! Windows app generated in dist/windows/');
const expectedExe = path.join(outDir, 'MI IPTV Player-win32-x64', 'MI IPTV Player.exe');
if (fs.existsSync(expectedExe)) {
    console.log('Executable: ' + expectedExe);
}

