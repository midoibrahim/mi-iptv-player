/**
 * MI IPTV Player - Samsung Tizen TV Build & WGT Packager
 *
 * Targets Samsung Tizen TVs (including firmware v1510 / Tizen 2.4 / 3.0 / 4.0 / 5.0+):
 *   1. Uses ../scripts/legacyCompiler.mjs for ES5 Babel + Acorn + CSS fallbacks/minification.
 *   2. Injects config.xml and $WEBAPIS/webapis/webapis.js.
 *   3. Packages:
 *      - ../dist/MIIPTVPlayer.wgt (for LAN Developer Mode install via sdb / tizen CLI)
 *      - ../dist/tizen-usb/userwidget/MIIPTVPlayer.wgt (ready to copy onto a FAT32 USB drive)
 *
 * Zero changes to ../IPTVPlayer, ../webos-build, ../IPTVService, or ../windows.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildLegacyApp, DESKTOP_DOWNLOAD_FILES, walkDir } from '../scripts/legacyCompiler.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WEBOS_BUILD_DIR = path.resolve(ROOT, 'webos-build');

const SRC = path.resolve(ROOT, 'IPTVPlayer');
const OUT = path.resolve(ROOT, 'build', 'TizenPlayer');
const DIST = path.resolve(ROOT, 'dist');

const EXCLUDE_TOP = new Set([
    'server.py', 'README.md', 'package.json', 'TV', 'Tools', 'Downloads',
    'Config', 'OSE', 'test_svg.png', 'setup.html', 'node_modules',
    'webOSTVjs-1.2.13', 'appinfo.json',
]);

const log = (...a) => console.log('[tizen-build]', ...a);

await buildLegacyApp({
    srcDir: SRC,
    outDir: OUT,
    webosBuildDir: WEBOS_BUILD_DIR,
    excludeTop: EXCLUDE_TOP,
    excludeRel: DESKTOP_DOWNLOAD_FILES,
    stripDesktopDownloads: true,
    compactJs: true,
    verifyEs5: true,
    minifyCss: true,
    afterCopy: (outDir) => {
        fs.copyFileSync(path.join(HERE, 'config.xml'), path.join(outDir, 'config.xml'));
    },
    transformHtml: (html) => html.replace(
        /<script[^>]+src="webOSTVjs-1\.2\.13\/webOSTV\.js"[^>]*><\/script>/i,
        '<script src="$WEBAPIS/webapis/webapis.js"></script>'
    ),
    log,
});

// ---------------------------------------------------------------- 5. Package .wgt (Pure Node ZIP/WGT writer + Tizen CLI if available)
const CRC_TABLE = (() => {
    const tbl = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        tbl[n] = c >>> 0;
    }
    return tbl;
})();

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildWgtArchive(sourceDir, outFile) {
    const files = walkDir(sourceDir);
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const absPath of files) {
        const relPath = path.relative(sourceDir, absPath).split(path.sep).join('/');
        const nameBuf = Buffer.from(relPath, 'utf8');
        const rawData = fs.readFileSync(absPath);
        const crc = crc32(rawData);
        const compressed = zlib.deflateRawSync(rawData, { level: 9 });
        const useDeflate = compressed.length < rawData.length;
        const body = useDeflate ? compressed : rawData;
        const method = useDeflate ? 8 : 0;

        const lfh = Buffer.alloc(30);
        lfh.writeUInt32LE(0x04034b50, 0);
        lfh.writeUInt16LE(20, 4);
        lfh.writeUInt16LE(0x0800, 6);
        lfh.writeUInt16LE(method, 8);
        lfh.writeUInt16LE(0, 10);
        lfh.writeUInt16LE(0x5421, 12);
        lfh.writeUInt32LE(crc, 14);
        lfh.writeUInt32LE(body.length, 18);
        lfh.writeUInt32LE(rawData.length, 22);
        lfh.writeUInt16LE(nameBuf.length, 26);
        lfh.writeUInt16LE(0, 28);

        localParts.push(lfh, nameBuf, body);

        const cdh = Buffer.alloc(46);
        cdh.writeUInt32LE(0x02014b50, 0);
        cdh.writeUInt16LE(20, 4);
        cdh.writeUInt16LE(20, 6);
        cdh.writeUInt16LE(0x0800, 8);
        cdh.writeUInt16LE(method, 10);
        cdh.writeUInt16LE(0, 12);
        cdh.writeUInt16LE(0x5421, 14);
        cdh.writeUInt32LE(crc, 16);
        cdh.writeUInt32LE(body.length, 20);
        cdh.writeUInt32LE(rawData.length, 24);
        cdh.writeUInt16LE(nameBuf.length, 28);
        cdh.writeUInt16LE(0, 30);
        cdh.writeUInt16LE(0, 32);
        cdh.writeUInt16LE(0, 34);
        cdh.writeUInt16LE(0, 36);
        cdh.writeUInt32LE(0, 38);
        cdh.writeUInt32LE(offset, 42);

        centralParts.push(cdh, nameBuf);
        offset += lfh.length + nameBuf.length + body.length;
    }

    const centralBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, Buffer.concat([...localParts, centralBuf, eocd]));
}

function findTizenCli() {
    const candidates = [
        'C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat',
        path.join(process.env.USERPROFILE || '', 'tizen-studio\\tools\\ide\\bin\\tizen.bat'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    try {
        const out = execSync('where.exe tizen.bat 2>nul', { encoding: 'utf8' }).trim();
        if (out) return out.split(/\r?\n/)[0].trim();
    } catch (e) {}
    return null;
}

fs.mkdirSync(DIST, { recursive: true });
const wgtPath = path.join(DIST, 'MIIPTVPlayer.wgt');
const usbUserwidgetDir = path.join(DIST, 'tizen-usb', 'userwidget');
fs.mkdirSync(usbUserwidgetDir, { recursive: true });
const usbWgtPath = path.join(usbUserwidgetDir, 'MIIPTVPlayer.wgt');

const tizenCli = findTizenCli();
let packagedWithTizenCli = false;
if (tizenCli) {
    try {
        log('packaging with Tizen Studio CLI:', tizenCli);
        execSync(`"${tizenCli}" package -t wgt -o "${DIST}" -- "${OUT}"`, { stdio: 'inherit' });
        const generated = fs.readdirSync(DIST).find((f) => f.toLowerCase().endsWith('.wgt'));
        if (generated && path.join(DIST, generated) !== wgtPath) {
            fs.renameSync(path.join(DIST, generated), wgtPath);
        }
        if (fs.existsSync(wgtPath)) {
            packagedWithTizenCli = true;
        }
    } catch (err) {
        log('Tizen CLI packaging fallback to built-in WGT archive builder:', err.message);
    }
}

if (!packagedWithTizenCli) {
    buildWgtArchive(OUT, wgtPath);
}

fs.copyFileSync(wgtPath, usbWgtPath);
fs.rmSync(OUT, { recursive: true, force: true });

const sizeKb = (fs.statSync(wgtPath).size / 1024).toFixed(1);
log(`created LAN package: ${wgtPath} (${sizeKb} KB)`);
log(`created USB package: ${usbWgtPath} (${sizeKb} KB)`);
log('done');
