/**
 * Shared Legacy Smart TV Compiler (LG webOS 3.x+ & Samsung Tizen 2.4+)
 *
 * Centralizes:
 *   1. Copying IPTVPlayer -> target build folder with platform exclusions
 *   2. Generating js/core/legacy-polyfills.js (core-js + regenerator-runtime for Chrome 38)
 *   3. Transpiling JS -> ES5 via Babel (+ optional Acorn ES5 syntax verification)
 *   4. Expanding CSS custom property fallbacks (:root & [data-theme]), `inset`, & autoprefixer
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const DESKTOP_DOWNLOAD_FILES = new Set([
    'js/components/downloadManager.js',
    'js/services/downloadStore.js',
    'css/downloads.css',
]);

export const walkDir = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walkDir(p) : [p];
});

export function stripDesktopDownloadHtmlTags(html) {
    return html
        .replace(/^[ \t]*<link[^>]+href="css\/downloads\.css"[^>]*>\r?\n?/im, '')
        .replace(/^[ \t]*<script[^>]+src="js\/services\/downloadStore\.js"[^>]*><\/script>\r?\n?/im, '')
        .replace(/^[ \t]*<script[^>]+src="js\/components\/downloadManager\.js"[^>]*><\/script>\r?\n?/im, '');
}

function loadBuildTools(webosBuildDir) {
    const requireFromWebos = createRequire(path.join(webosBuildDir, 'package.json'));
    return {
        babel: requireFromWebos('@babel/core'),
        esbuild: requireFromWebos('esbuild'),
        postcss: requireFromWebos('postcss'),
        autoprefixer: requireFromWebos('autoprefixer'),
        acorn: requireFromWebos('acorn'),
    };
}

function collectThemeTokens(cssFiles, postcss) {
    const rootTokens = new Map();
    const themeTokens = new Map();

    for (const f of cssFiles) {
        postcss.parse(fs.readFileSync(f, 'utf8')).walkRules((rule) => {
            if (rule.selectors.some((s) => s.trim() === ':root')) {
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
    return { rootTokens, themeTokens };
}

function resolveVarsWithMap(value, tokenMap, rootTokens, depth = 0) {
    if (depth > 12) return null;
    let out = '';
    let i = 0;
    while (i < value.length) {
        const at = value.indexOf('var(', i);
        if (at < 0) { out += value.slice(i); break; }
        out += value.slice(i, at);
        let p = at + 4;
        let level = 1;
        while (p < value.length && level) {
            if (value[p] === '(') level++;
            else if (value[p] === ')') level--;
            p++;
        }
        const inner = value.slice(at + 4, p - 1);
        let comma = -1;
        for (let k = 0, l = 0; k < inner.length; k++) {
            const c = inner[k];
            if (c === '(') l++;
            else if (c === ')') l--;
            else if (c === ',' && !l) { comma = k; break; }
        }
        const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
        const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
        const raw = (tokenMap && tokenMap.has(name))
            ? tokenMap.get(name)
            : (rootTokens.has(name) ? rootTokens.get(name) : fallback);
        if (raw == null) return null;
        const r = resolveVarsWithMap(raw, tokenMap, rootTokens, depth + 1);
        if (r == null) return null;
        out += r;
        i = p;
    }
    return out.replace(/\s+/g, ' ').trim();
}

function prefixSelectorForTheme(sel, tid) {
    const s = sel.trim();
    if (!s || s === ':root' || s.startsWith('[data-theme')) return null;
    if (/^(html|body)\b/.test(s)) {
        return s.replace(/^(html|body)\b/, `[data-theme="${tid}"]`);
    }
    return `[data-theme="${tid}"] ${s}`;
}

function createLegacyCssPlugin(postcss, rootTokens, themeTokens) {
    const plugin = () => ({
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
                        const defVal = resolveVarsWithMap(d.value, rootTokens, rootTokens);
                        const thmVal = resolveVarsWithMap(d.value, tmap, rootTokens);
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
                const resolved = resolveVarsWithMap(value, rootTokens, rootTokens);
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
    plugin.postcss = true;
    return plugin;
}

export async function verifyEs5Files(filePaths, webosBuildDir) {
    const { acorn } = loadBuildTools(webosBuildDir);
    for (const filePath of filePaths) {
        acorn.parse(fs.readFileSync(filePath, 'utf8'), { ecmaVersion: 5 });
    }
}

export async function buildLegacyApp({
    srcDir,
    outDir,
    webosBuildDir,
    target = { chrome: '38' },
    browserslist = ['chrome >= 38'],
    excludeTop = new Set(),
    excludeRel = DESKTOP_DOWNLOAD_FILES,
    stripDesktopDownloads = true,
    compactJs = 'auto',
    verifyEs5 = false,
    minifyCss = false,
    afterCopy = null,
    transformHtml = null,
    log = console.log,
}) {
    const { babel, esbuild, postcss, autoprefixer, acorn } = loadBuildTools(webosBuildDir);

    const isExcluded = (rel) => {
        const norm = rel.split(path.sep).join('/');
        const top = norm.split('/')[0];
        if (excludeTop.has(top)) return true;
        if (excludeRel && excludeRel.has(norm)) return true;
        if (top.startsWith('.git')) return true;
        if (norm.endsWith('.py')) return true;
        return false;
    };

    // 1. Copy source
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.cpSync(srcDir, outDir, {
        recursive: true,
        filter: (src) => {
            const rel = path.relative(srcDir, src);
            return rel === '' || !isExcluded(rel);
        },
    });
    if (typeof afterCopy === 'function') {
        afterCopy(outDir);
    }
    log('copied ->', outDir);

    // 2. Polyfills & index.html adaptation
    const POLY_REL = 'js/core/legacy-polyfills.js';
    {
        const entry = babel.transformSync(
            "import 'core-js/stable';\nimport 'regenerator-runtime/runtime';\n",
            {
                cwd: webosBuildDir,
                babelrc: false, configFile: false, filename: 'polyfill-entry.js',
                presets: [['@babel/preset-env', { targets: target, useBuiltIns: 'entry', corejs: '3.39', modules: false }]],
            },
        ).code;
        const res = await esbuild.build({
            stdin: { contents: entry, resolveDir: webosBuildDir, sourcefile: 'polyfill-entry.js' },
            bundle: true, minify: true, format: 'iife', target: 'chrome38', write: false,
            legalComments: 'none',
        });
        fs.writeFileSync(path.join(outDir, POLY_REL), res.outputFiles[0].text);
        log(`polyfills: ${(res.outputFiles[0].text.length / 1024).toFixed(0)} KB`);

        const idxPath = path.join(outDir, 'index.html');
        let html = fs.readFileSync(idxPath, 'utf8');
        if (stripDesktopDownloads) {
            html = stripDesktopDownloadHtmlTags(html);
        }
        if (typeof transformHtml === 'function') {
            html = transformHtml(html);
        }
        const firstScript = html.search(/<script\b/i);
        if (firstScript < 0) throw new Error('no <script> in index.html');
        html = html.slice(0, firstScript) + `<script src="${POLY_REL}"></script>\n    ` + html.slice(firstScript);
        fs.writeFileSync(idxPath, html);
    }

    // 3. JS -> ES5
    const babelBaseOpts = {
        cwd: webosBuildDir,
        babelrc: false, configFile: false,
        sourceType: 'script',
        presets: [['@babel/preset-env', { targets: target, modules: false, bugfixes: true }]],
    };
    let jsCount = 0;
    for (const file of walkDir(outDir).filter((f) => f.endsWith('.js'))) {
        const rel = path.relative(outDir, file).split(path.sep).join('/');
        if (rel === POLY_REL) continue;
        const code = fs.readFileSync(file, 'utf8');
        const isCompact = compactJs === 'auto' ? (code.length > 150 * 1024) : Boolean(compactJs);
        const out = babel.transformSync(code, {
            ...babelBaseOpts,
            filename: rel,
            compact: isCompact,
            comments: !isCompact,
        });
        if (verifyEs5) {
            acorn.parse(out.code, { ecmaVersion: 5 });
        }
        fs.writeFileSync(file, out.code);
        jsCount++;
    }
    log(`transpiled${verifyEs5 ? ' & verified' : ''} ${jsCount} JS files to ES5`);

    // 4. CSS static fallbacks & prefixes
    const cssDir = path.join(outDir, 'css');
    const cssFiles = walkDir(cssDir).filter((f) => f.endsWith('.css'));
    const { rootTokens, themeTokens } = collectThemeTokens(cssFiles, postcss);
    log(`css tokens: ${rootTokens.size} root, ${themeTokens.size} themes (${[...themeTokens.keys()].join(', ')})`);

    const legacyCss = createLegacyCssPlugin(postcss, rootTokens, themeTokens);
    const processor = postcss([legacyCss(), autoprefixer({ overrideBrowserslist: browserslist, grid: false })]);
    for (const f of cssFiles) {
        const res = await processor.process(fs.readFileSync(f, 'utf8'), { from: f, to: f });
        if (minifyCss) {
            const minified = esbuild.transformSync(res.css, { loader: 'css', minify: true, legalComments: 'none' });
            fs.writeFileSync(f, minified.code);
        } else {
            fs.writeFileSync(f, res.css);
        }
    }
    log(`processed${minifyCss ? ' & minified' : ''} ${cssFiles.length} CSS files`);
}

