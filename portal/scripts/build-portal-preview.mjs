// Builds the clickable preview of the real portal screens into web/preview/dist:
// the app's own files unchanged (two import paths made relative), the recordings, and the stand-in.
//   node scripts/record-preview.mjs && node scripts/build-portal-preview.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'web/preview/dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
fs.mkdirSync(path.join(dist, 'connectors'), { recursive: true });

for (const f of fs.readdirSync(path.join(root, 'web/app/js'))) {
  let src = fs.readFileSync(path.join(root, 'web/app/js', f), 'utf8');
  src = src.replace(/from '\/connectors\//g, "from '../connectors/");
  fs.writeFileSync(path.join(dist, 'js', f), src);
}
for (const f of ['core.mjs', 'catalogue.mjs']) fs.copyFileSync(path.join(root, 'connectors', f), path.join(dist, 'connectors', f));
// The viewer can force light or dark: honour that as well as the device setting.
let css = fs.readFileSync(path.join(root, 'web/app/styles.css'), 'utf8');
const dark = css.match(/@media \(prefers-color-scheme: dark\)\{:root\{([^}]*)\}\}/);
if (!dark) throw new Error('dark theme block not found in styles.css');
css = css.replace(dark[0], `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark[1]}}}\n:root[data-theme="dark"]{${dark[1]}}`);
fs.writeFileSync(path.join(dist, 'styles.css'), css);
fs.copyFileSync(path.join(root, 'web/preview/shim.js'), path.join(dist, 'preview-shim.js'));
const rec = fs.readFileSync(path.join(root, 'web/portal-preview-recordings.json'), 'utf8');
fs.writeFileSync(path.join(dist, 'preview-data.js'), `window.__CLEARPATH_REC = ${rec.replace(/</g, '\\u003c')};\n`);

fs.writeFileSync(path.join(dist, 'index.html'), `<title>Clearpath portal preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap">
<link rel="stylesheet" href="styles.css">
<style>
.pv-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-block:8px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));background:var(--soft);border-bottom:1px solid var(--line);font-size:.85rem;color:var(--ink)}
.pv-tag{background:var(--accent);color:var(--accent-ink);font-weight:600;border-radius:999px;padding:2px 10px;font-size:.78rem}
.pv-text{color:var(--muted);flex:1 1 220px;min-width:0}
.pv-pick{display:flex;align-items:center;gap:6px}
.pv-pick select{font:inherit;padding:4px 8px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);max-width:100%}
@media (min-width:901px){.pv-bar + #app .shell .side{height:calc(100vh - 42px)}}
</style>
<script src="preview-data.js"></script>
<script src="preview-shim.js"></script>
<div id="app"><main class="auth"><p class="loading">Loading…</p></main></div>
<div id="toasts" class="toasts" aria-live="polite"></div>
<script type="module" src="js/app.js"></script>
`);
console.log('built web/preview/dist');
