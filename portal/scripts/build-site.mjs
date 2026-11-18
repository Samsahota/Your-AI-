// Builds the portal for web hosting into dist/: the app, the two browser-side connector modules,
// the live settings (config.js) and the security headers for Cloudflare Pages (_headers) and Vercel (vercel.json).
//   node scripts/build-site.mjs                      uses hosting/clearpath.json
//   node scripts/build-site.mjs hosting/other.json   for another deployment
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgFile = path.resolve(root, process.argv[2] || 'hosting/clearpath.json');
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
for (const k of ['appUrl', 'supabaseUrl', 'publishableKey']) if (!cfg[k]) throw new Error(`${path.basename(cfgFile)} is missing ${k}`);
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(cfg.supabaseUrl)) throw new Error('supabaseUrl must be https://<project>.supabase.co');
if (/service_role|sb_secret_/.test(JSON.stringify(cfg))) throw new Error('That looks like a secret key. Only the publishable key belongs in the browser.');

const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
const copy = (from, to) => { fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true }); fs.copyFileSync(path.join(root, from), path.join(out, to)); };

copy('web/app/index.html', 'index.html');
copy('web/app/styles.css', 'web/app/styles.css');
for (const f of fs.readdirSync(path.join(root, 'web/app/js'))) copy(`web/app/js/${f}`, `web/app/js/${f}`);
// Only the modules the browser imports; the SharePoint connector runs on the server and is not published.
copy('connectors/core.mjs', 'connectors/core.mjs');
copy('connectors/catalogue.mjs', 'connectors/catalogue.mjs');

fs.writeFileSync(path.join(out, 'web/app/config.js'),
  `// Written by scripts/build-site.mjs. Public values only: row-level security in the database protects the data.\n`
  + `window.PORTAL_CONFIG = ${JSON.stringify({ url: cfg.supabaseUrl, anonKey: cfg.publishableKey, appUrl: cfg.appUrl }, null, 2)};\n`);

// The same headers as web/app/_headers, with data allowed to go to this one Supabase project only.
const csp = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com',
  "img-src 'self' data:", `connect-src 'self' ${cfg.supabaseUrl}`, "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'",
  "object-src 'none'", 'upgrade-insecure-requests',
].join('; ');
const headers = {
  'Content-Security-Policy': csp,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};
fs.writeFileSync(path.join(out, '_headers'), '/*\n' + Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n');
fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
  cleanUrls: false, trailingSlash: false,
  headers: [{ source: '/(.*)', headers: Object.entries(headers).map(([key, value]) => ({ key, value })) }],
}, null, 2) + '\n');

const files = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(path.relative(out, p)); } };
walk(out);
console.log(`Built ${files.length} files into dist/ for ${cfg.appUrl}`);
export { headers };
