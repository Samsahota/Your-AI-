// Production web build: the approved interface (shared with the offline demo) + Supabase live layer.
// Output: platform/web/dist/{index.html, app.js, vendor.js}. Static files — host on Vercel (or any static host).
// Env: SUPABASE_URL, SUPABASE_ANON_KEY (public, safe to ship), optional HISTORY_DAYS, COMPANY_FOOTER.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { buildSync } from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '../..');
const dist = path.join(root, 'platform/web/dist'); fs.mkdirSync(dist, { recursive: true });
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (Supabase → Project Settings → API).'); process.exit(1); }
if (/service_role/.test(Buffer.from((key.split('.')[1] || ''), 'base64').toString())) { console.error('Refusing to build: that is the service_role key. Use the anon/publishable key.'); process.exit(1); }
buildSync({ stdin: { contents: "import { createClient } from '@supabase/supabase-js'; window.supabase = { createClient };", resolveDir: path.join(root, 'platform'), loader: 'js' },
  bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: path.join(dist, 'vendor.js'), logLevel: 'error' });
const prelude = `'use strict';\nlet TODAY = '', YESTERDAY = '', WEEK_START = '';\nconst DEMO_START = '';\n`;
const files = ['core.js', 'office1.js', 'office2.js', 'mobile.js', 'main.js', 'live.js'].map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8').replace(/^'use strict';\n/, ''));
const app = prelude + files.join('\n');
const out = buildSync({ stdin: { contents: app, loader: 'js' }, minify: true, target: 'es2020', write: false, logLevel: 'error' });
fs.writeFileSync(path.join(dist, 'app.js'), out.outputFiles[0].text);
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const config = { mode: 'live', supabaseUrl: url, supabaseAnonKey: key, historyDays: Number(process.env.HISTORY_DAYS || 60), companyFooter: process.env.COMPANY_FOOTER || 'Haulage Portal' };
const v = Date.now().toString(36);
fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#25282D"><title>Haulage Portal</title><meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2325282D'/%3E%3Crect x='12' y='6' width='8' height='14' fill='%23ED1C24'/%3E%3Crect x='12' y='20' width='8' height='6' fill='%23F6EC3D'/%3E%3C/svg%3E">
<style>${css}</style></head><body>
<div id="app" aria-live="polite"><div style="padding:40px;font-family:sans-serif;color:#6E6D68">Loading…</div></div><div id="print-root"></div>
<noscript>This portal needs JavaScript enabled.</noscript>
<script>window.THP_CONFIG = ${JSON.stringify(config)};</script>
<script src="vendor.js?v=${v}"></script><script src="app.js?v=${v}"></script></body></html>
`);
fs.writeFileSync(path.join(dist, 'vercel.json'), JSON.stringify({ headers: [{ source: '/(.*)', headers: [
  { key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=()' },
  { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${url}; connect-src 'self' ${url} ${url.replace('https', 'wss')}; frame-ancestors 'none'` },
] }] }, null, 2));
console.log('built', dist, Math.round(fs.statSync(path.join(dist, 'app.js')).size / 1024) + 'KB app,', Math.round(fs.statSync(path.join(dist, 'vendor.js')).size / 1024) + 'KB vendor');
