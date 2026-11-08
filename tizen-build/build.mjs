/**
 * MI IPTV Player - Samsung Tizen TV Build & WGT Packager
 *
 * Targets Samsung Tizen TVs (including firmware v1510 / Tizen 2.4 / 3.0 / 4.0 / 5.0+):
 *   1. Copies ../IPTVPlayer -> ../build/TizenPlayer (excluding webOS/Windows/dev files).
 *   2. Injects config.xml, $WEBAPIS/webapis/webapis.js, and legacy-polyfills.js.
 *   3. Transpiles all JS to strict ES5 via Babel + verifies with Acorn (ecmaVersion: 5).
 *   4. Expands CSS var(--*) static fallbacks and minifies CSS via PostCSS + esbuild.
 *   5. Packages:
 *      - ../dist/MIIPTVPlayer.wgt (for LAN Developer Mode install via sdb / tizen CLI)
 *      - ../dist/tizen-usb/userwidget/MIIPTVPlayer.wgt (ready to copy onto a FAT32 USB drive)
 *
 * Zero changes to ../IPTVPlayer, ../webos-build, ../IPTVService, or ../windows.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WEBOS_BUILD_DIR = path.resolve(ROOT, 'webos-build');

// Reuse Babel, PostCSS, esbuild, and Acorn from webos-build/node_modules
const requireFromWebos = createRequire(path.join(WEBOS_BUILD_DIR, 'package.json'));
const babel = requireFromWebos('@babel/core');
const esbuild = requireFromWebos('esbuild');
const postcss = requireFromWebos('postcss');
const autoprefixer = requireFromWebos('autoprefixer');
const acorn = requireFromWebos('acorn');

const SRC = path.resolve(ROOT, 'IPTVPlayer');
const OUT = path.resolve(ROOT, 'build', 'TizenPlayer');
const DIST = path.resolve(ROOT, 'dist');
const TARGET = { chrome: '38' };
const BROWSERSLIST = ['chrome >= 38'];

const EXCLUDE_TOP = new Set([
    'server.py', 'README.md', 'package.json', 'TV', 'Tools', 'Downloads',
    'Config', 'OSE', 'test_svg.png', 'setup.html', 'node_modules',
    'webOSTVjs-1.2.13', 'appinfo.json',
]);
const EXCLUDE_REL = new Set([
    'js/components/downloadManager.js',
    'js/services/downloadStore.js',
    'css/downloads.css',
]);

const isExcluded = (rel) => {
    const norm = rel.split(path.sep).join('/');
    const top = norm.split('/')[0];
    if (EXCLUDE_TOP.has(top)) return true;
    if (EXCLUDE_REL.has(norm)) return true;
    if (top.startsWith('.git')) return true;
    if (norm.endsWith('.py')) return true;
    return false;
};

const log = (...a) => console.log('[tizen-build]', ...a);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
});

// ---------------------------------------------------------------- 1. Copy source & Tizen config.xml
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, {
    recursive: true,
    filter: (src) => {
        const rel = path.relative(SRC, src);
        return rel === '' || !isExcluded(rel);
    },
});
fs.copyFileSync(path.join(HERE, 'config.xml'), path.join(OUT, 'config.xml'));
log('copied ->', OUT);

// ---------------------------------------------------------------- 2. Polyfills & index.html adaptation
const POLY_REL = 'js/core/legacy-polyfills.js';
{
    const entry = babel.transformSync(
        "import 'core-js/stable';\nimport 'regenerator-runtime/runtime';\n",
        {
            cwd: WEBOS_BUILD_DIR,
            babelrc: false, configFile: false, filename: 'polyfill-entry.js',
            presets: [['@babel/preset-env', { targets: TARGET, useBuiltIns: 'entry', corejs: '3.39', modules: false }]],
        },
    ).code;
    const res = await esbuild.build({
        stdin: { contents: entry, resolveDir: WEBOS_BUILD_DIR, sourcefile: 'polyfill-entry.js' },
        bundle: true, minify: true, format: 'iife', target: 'chrome38', write: false,
        legalComments: 'none',
    });
    fs.writeFileSync(path.join(OUT, POLY_REL), res.outputFiles[0].text);
    log(`polyfills: ${(res.outputFiles[0].text.length / 1024).toFixed(0)} KB`);

    const idxPath = path.join(OUT, 'index.html');
    let html = fs.readFileSync(idxPath, 'utf8');
    // Strip desktop-only download tags and swap webOSTV.js for Samsung Tizen $WEBAPIS/webapis/webapis.js
    html = html
        .replace(/^[ \t]*<link[^>]+href="css\/downloads\.css"[^>]*>\r?\n?/im, '')
        .replace(/^[ \t]*<script[^>]+src="js\/services\/downloadStore\.js"[^>]*><\/script>\r?\n?/im, '')
        .replace(/^[ \t]*<script[^>]+src="js\/components\/downloadManager\.js"[^>]*><\/script>\r?\n?/im, '')
        .replace(
            /<script[^>]+src="webOSTVjs-1\.2\.13\/webOSTV\.js"[^>]*><\/script>/i,
            '<script src="$WEBAPIS/webapis/webapis.js"></script>'
        );

    const firstScript = html.search(/<script\b/i);
    if (firstScript < 0) throw new Error('no <script> in index.html');
    html = html.slice(0, firstScript) + `<script src="${POLY_REL}"></script>\n    ` + html.slice(firstScript);
    fs.writeFileSync(idxPath, html);
}

// ---------------------------------------------------------------- 3. JS -> ES5 (compact + Acorn ES5 check)
const babelOpts = {
    cwd: WEBOS_BUILD_DIR,
    babelrc: false, configFile: false,
    sourceType: 'script',
    compact: true, comments: false,
    presets: [['@babel/preset-env', { targets: TARGET, modules: false, bugfixes: true }]],
};
let jsCount = 0;
for (const file of walk(OUT).filter((f) => f.endsWith('.js'))) {
    const rel = path.relative(OUT, file).split(path.sep).join('/');
    if (rel === POLY_REL) continue;
    const code = fs.readFileSync(file, 'utf8');
    const out = babel.transformSync(code, { ...babelOpts, filename: rel });
    acorn.parse(out.code, { ecmaVersion: 5 });
    fs.writeFileSync(file, out.code);
    jsCount++;
}
log(`transpiled & verified ${jsCount} JS files to strict ES5`);

// ---------------------------------------------------------------- 4. CSS (static var(--*) fallbacks + minification)
const cssDir = path.join(OUT, 'css');
const cssFiles = walk(cssDir).filter((f) => f.endsWith('.css'));

const rootTokens = new Map();
const themeTokens = new Map();

for (const f of cssFiles) {
    postcss.parse(fs.readFileSync(f, 'utf8')).walkRules((rule) => {
        const isRoot = rule.selectors.some((s) => s.trim() === ':root');
        if (isRoot) {
            rule.walkDecls((d) => { if (d.prop.startsWith('--')) rootTokens.set(d.prop, d.value.trim()); });
        }
        for (const sel of rule.selectors) {
            const m = sel.trim().match(/^\[data-theme=["']?([\w-]+)["']?\]$/);
            if (m) {
                const tid = m[1];
                if (!themeTokens.has(tid)) themeTokens.set(tid, new Map());
                const tmap = themeTokens.get(tid);
                rule.walkDecls((d) => { if (d.prop.startsWith('--')) tmap.set(d.prop, d.value.trim()); });
            }
        }
    });
}

function resolveVarsWithMap(value, tokenMap, depth = 0) {
    if (depth > 12) return null;
    let out = '';
    let i = 0;
    while (i < value.length) {
        const at = value.indexOf('var(', i);
        if (at < 0) { out += value.slice(i); break; }
        out += value.slice(i, at);
        let p = at + 4, level = 1;
        while (p < value.length && level) { if (value[p] === '(') level++; else if (value[p] === ')') level--; p++; }
        const inner = value.slice(at + 4, p - 1);
        const comma = (() => { let l = 0; for (let k = 0; k < inner.length; k++) { const c = inner[k]; if (c === '(') l++; else if (c === ')') l--; else if (c === ',' && !l) return k; } return -1; })();
        const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
        const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
        const raw = (tokenMap && tokenMap.has(name))
            ? tokenMap.get(name)
            : (rootTokens.has(name) ? rootTokens.get(name) : fallback);
        if (raw == null) return null;
        const r = resolveVarsWithMap(raw, tokenMap, depth + 1);
        if (r == null) return null;
        out += r;
        i = p;
    }
    return out.replace(/\s+/g, ' ').trim();
}

const prefixSelectorForTheme = (sel, tid) => {
    const s = sel.trim();
    if (!s || s === ':root' || s.startsWith('[data-theme')) return null;
    if (/^(html|body)\b/.test(s)) {
        return s.replace(/^(html|body)\b/, `[data-theme="${tid}"]`);
    }
    return `[data-theme="${tid}"] ${s}`;
};

const legacyCss = () => ({
    postcssPlugin: 'legacy-css-fallbacks',
    Once(root) {
        const themeRulesToAppend = [];
        root.walkRules((rule) => {
            if (rule.__legacyThemeGenerated) return;
            if (rule.selectors.every((s) => s.trim() === ':root' || s.trim().startsWith('[data-theme'))) return;

            const varDecls = [];
            rule.walkDecls((decl) => {
                if (!decl.prop.startsWith('--') && decl.value.includes('var(')) {
                    varDecls.push(decl);
                }
            });
            if (varDecls.length === 0) return;

            for (const [tid, tmap] of themeTokens.entries()) {
                const themedSelectors = rule.selectors
                    .map((s) => prefixSelectorForTheme(s, tid))
                    .filter(Boolean);
                if (themedSelectors.length === 0) continue;

                const declsForTheme = [];
                for (const d of varDecls) {
                    const defVal = resolveVarsWithMap(d.value, rootTokens);
                    const thmVal = resolveVarsWithMap(d.value, tmap);
                    if (thmVal != null && thmVal !== defVal) {
                        declsForTheme.push({ prop: d.prop, value: thmVal, important: d.important });
                    }
                }
                if (declsForTheme.length > 0) {
                    const newRule = postcss.rule({ selector: themedSelectors.join(',\n') });
                    newRule.__legacyThemeGenerated = true;
                    for (const td of declsForTheme) {
                        const nd = postcss.decl({ prop: td.prop, value: td.value, important: td.important });
                        nd.__legacyDone = true;
                        newRule.append(nd);
                    }
                    themeRulesToAppend.push(newRule);
                }
            }
        });
        for (const r of themeRulesToAppend) {
            root.append(r);
        }
    },
    Declaration(decl) {
        if (decl.prop.startsWith('--') || decl.__legacyDone) return;
        decl.__legacyDone = true;
        let value = decl.value;
        if (value.includes('var(')) {
            const resolved = resolveVarsWithMap(value, rootTokens);
            if (resolved == null) return;
            value = resolved;
            decl.cloneBefore({ value, __legacyDone: true });
        }
        if (decl.prop === 'inset') {
            const parts = postcss.list.space(value);
            const [t, r = t, b = t, l = r] = parts;
            for (const [prop, v] of [['top', t], ['right', r], ['bottom', b], ['left', l]]) {
                decl.cloneBefore({ prop, value: v, __legacyDone: true });
            }
        }
    },
});
legacyCss.postcss = true;

const processor = postcss([legacyCss(), autoprefixer({ overrideBrowserslist: BROWSERSLIST, grid: false })]);
for (const f of cssFiles) {
    const res = await processor.process(fs.readFileSync(f, 'utf8'), { from: f, to: f });
    const minified = esbuild.transformSync(res.css, { loader: 'css', minify: true, legalComments: 'none' });
    fs.writeFileSync(f, minified.code);
}
log(`processed & minified ${cssFiles.length} CSS files`);

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
    const files = walk(sourceDir);
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

        // Local file header (30 bytes + filename)
        const lfh = Buffer.alloc(30);
        lfh.writeUInt32LE(0x04034b50, 0);
        lfh.writeUInt16LE(20, 4);
        lfh.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
        lfh.writeUInt16LE(method, 8);
        lfh.writeUInt16LE(0, 10);
        lfh.writeUInt16LE(0x5421, 12);
        lfh.writeUInt32LE(crc, 14);
        lfh.writeUInt32LE(body.length, 18);
        lfh.writeUInt32LE(rawData.length, 22);
        lfh.writeUInt16LE(nameBuf.length, 26);
        lfh.writeUInt16LE(0, 28);

        localParts.push(lfh, nameBuf, body);

        // Central directory header (46 bytes + filename)
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

// Copy to USB deployment folder (userwidget/MIIPTVPlayer.wgt)
fs.copyFileSync(wgtPath, usbWgtPath);

// Clean up intermediate build/TizenPlayer directory
fs.rmSync(OUT, { recursive: true, force: true });

const sizeKb = (fs.statSync(wgtPath).size / 1024).toFixed(1);
log(`created LAN package: ${wgtPath} (${sizeKb} KB)`);
log(`created USB package: ${usbWgtPath} (${sizeKb} KB)`);
log('done');

