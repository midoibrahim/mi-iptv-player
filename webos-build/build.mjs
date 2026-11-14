/**
 * MI IPTV Player - legacy webOS build
 *
 * Produces ../build/IPTVPlayer : a copy of ../IPTVPlayer that runs on
 * webOS 3.x (Chromium 38) as well as newer TVs, plus ../build/IPTVService.
 *
 * The source in ../IPTVPlayer is never modified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLegacyApp, DESKTOP_DOWNLOAD_FILES, verifyEs5Files } from '../scripts/legacyCompiler.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'IPTVPlayer');
const OUT = path.resolve(HERE, '..', 'build', 'IPTVPlayer');

// Same exclusions package-webos.bat used to pass to ares-package (top-level entries)
const EXCLUDE_TOP = new Set([
    'server.py', 'README.md', 'package.json', 'TV', 'Tools', 'Downloads',
    'Config', 'OSE', 'test_svg.png', 'setup.html', 'node_modules', 'config.xml',
]);

const log = (...a) => console.log('[legacy-build]', ...a);

await buildLegacyApp({
    srcDir: SRC,
    outDir: OUT,
    webosBuildDir: HERE,
    excludeTop: EXCLUDE_TOP,
    excludeRel: DESKTOP_DOWNLOAD_FILES,
    stripDesktopDownloads: true,
    compactJs: 'auto',
    verifyEs5: false,
    minifyCss: false,
    log,
});

// ---------------------------------------------------------------- 5. on-TV service
// ../IPTVService -> ../build/IPTVService, plus the phone setup page in www/
// (served by the service on <TV LAN IP>:8089). Service code must stay ES5
// because webOS 3.x runs Node 0.12.
{
    const SVC_SRC = path.resolve(HERE, '..', 'IPTVService');
    const SVC_OUT = path.resolve(HERE, '..', 'build', 'IPTVService');
    fs.rmSync(SVC_OUT, { recursive: true, force: true });
    fs.cpSync(SVC_SRC, SVC_OUT, { recursive: true });
    const www = path.join(SVC_OUT, 'www');
    fs.mkdirSync(www, { recursive: true });
    for (const f of ['setup.html', 'icon.png', 'largeicon.png']) {
        fs.copyFileSync(path.join(SRC, f), path.join(www, f));
    }
    await verifyEs5Files(
        [path.join(SVC_OUT, 'service.js'), path.join(SVC_OUT, 'companionCore.js')],
        HERE,
    );
    log('service ->', SVC_OUT);
}
log('done');
