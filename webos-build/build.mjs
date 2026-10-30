/**
 * MI IPTV Player - legacy webOS build
 *
 * Produces ../build/IPTVPlayer : a copy of ../IPTVPlayer that runs on
 * webOS 3.x (Chromium 38) as well as newer TVs.
 *
 *   1. Copies the app (minus dev-only files that were excluded from the IPK before).
 *   2. Generates js/core/legacy-polyfills.js (core-js + regenerator, only what Chrome 38 lacks)
 *      and injects it as the very first <script> in index.html.
 *   3. Transpiles every .js file to ES5 with Babel (arrow functions, classes,
 *      template literals, let/const, async/await, spread, ...).
 *   4. CSS: adds static fallbacks for CSS custom properties (Chrome 49+), expands
 *      `inset`, and adds -webkit- prefixes (keyframes/animation/filter) via autoprefixer.
 *
 * The source in ../IPTVPlayer is never modified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import babel from '@babel/core';
import esbuild from 'esbuild';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'IPTVPlayer');
const OUT = path.resolve(HERE, '..', 'build', 'IPTVPlayer');
const TARGET = { chrome: '38' };
const BROWSERSLIST = ['chrome >= 38'];

// Same exclusions package-webos.bat used to pass to ares-package (top-level entries)
const EXCLUDE_TOP = new Set(['server.py', 'README.md', 'package.json', 'TV', 'Tools', 'Downloads',
    'Config', 'OSE', 'test_svg.png', 'setup.html', 'node_modules']);
const isExcluded = (rel) => {
    const top = rel.split(path.sep)[0];
    if (EXCLUDE_TOP.has(top)) return true;
    if (top.startsWith('.git')) return true;
    if (rel.endsWith('.py')) return true;
    return false;
};

const log = (...a) => console.log('[legacy-build]', ...a);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
});

// ---------------------------------------------------------------- 1. copy
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, {
    recursive: true,
    filter: (src) => {
        const rel = path.relative(SRC, src);
        return rel === '' || !isExcluded(rel);
    },
});
log('copied ->', OUT);

// ---------------------------------------------------------------- 2. polyfills
const POLY_REL = 'js/core/legacy-polyfills.js';
{
    const entry = babel.transformSync(
        "import 'core-js/stable';\nimport 'regenerator-runtime/runtime';\n",
        {
            babelrc: false, configFile: false, filename: 'polyfill-entry.js',
            presets: [['@babel/preset-env', { targets: TARGET, useBuiltIns: 'entry', corejs: '3.39', modules: false }]],
        },
    ).code;
    const res = await esbuild.build({
        stdin: { contents: entry, resolveDir: HERE, sourcefile: 'polyfill-entry.js' },
        bundle: true, minify: true, format: 'iife', target: 'chrome38', write: false,
        legalComments: 'none',
    });
    fs.writeFileSync(path.join(OUT, POLY_REL), res.outputFiles[0].text);
    log(`polyfills: ${(res.outputFiles[0].text.length / 1024).toFixed(0)} KB`);

    const idxPath = path.join(OUT, 'index.html');
    let html = fs.readFileSync(idxPath, 'utf8');
    const firstScript = html.search(/<script\b/i);
    if (firstScript < 0) throw new Error('no <script> in index.html');
    html = html.slice(0, firstScript) + `<script src="${POLY_REL}"></script>\n    ` + html.slice(firstScript);
    fs.writeFileSync(idxPath, html);
}

// ---------------------------------------------------------------- 3. JS -> ES5
const babelOpts = {
    babelrc: false, configFile: false,
    sourceType: 'script',           // plain <script> files sharing globals
    compact: false, comments: true,
    presets: [['@babel/preset-env', { targets: TARGET, modules: false, bugfixes: true }]],
};
let jsCount = 0;
for (const file of walk(OUT).filter((f) => f.endsWith('.js'))) {
    const rel = path.relative(OUT, file).split(path.sep).join('/');
    if (rel === POLY_REL) continue;
    const code = fs.readFileSync(file, 'utf8');
    const big = code.length > 150 * 1024;
    const out = babel.transformSync(code, { ...babelOpts, filename: rel, compact: big, comments: !big });
    fs.writeFileSync(file, out.code);
    jsCount++;
}
log(`transpiled ${jsCount} JS files to ES5`);

// ---------------------------------------------------------------- 4. CSS
const cssDir = path.join(OUT, 'css');
const cssFiles = walk(cssDir).filter((f) => f.endsWith('.css'));

// Collect design tokens for :root (default/oled) AND each [data-theme="<id>"]
// so that theme switching works on Chromium 38 (which does not support CSS var(--*)).
const rootTokens = new Map();
const themeTokens = new Map(); // themeId -> Map(prop -> val)

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
log(`css tokens: ${rootTokens.size} root, ${themeTokens.size} themes (${[...themeTokens.keys()].join(', ')})`);

// Resolve var(--x[, fallback]) recursively against a token map (falling back to rootTokens).
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
            // Skip :root / [data-theme] token definition blocks
            if (rule.selectors.every((s) => s.trim() === ':root' || s.trim().startsWith('[data-theme'))) return;

            const varDecls = [];
            rule.walkDecls((decl) => {
                if (!decl.prop.startsWith('--') && decl.value.includes('var(')) {
                    varDecls.push(decl);
                }
            });
            if (varDecls.length === 0) return;

            // For each theme, emit a static override rule if any resolved value differs from default
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
    fs.writeFileSync(f, res.css);
}
log(`processed ${cssFiles.length} CSS files`);

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
    const acorn = await import('acorn');
    acorn.parse(fs.readFileSync(path.join(SVC_OUT, 'service.js'), 'utf8'), { ecmaVersion: 5 });
    log('service ->', SVC_OUT);
}
log('done');

