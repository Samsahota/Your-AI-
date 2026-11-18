// The hosted build: builds dist/, serves it with its own security headers, and opens it in a browser.
// Checks the sign-in page loads with no blocked scripts or styles, points at the live project only,
// and that no secret or server-only code is published.   npm run test:site
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);
let server, base, headers;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

before(async () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { cwd: root });
  headers = Object.fromEntries(fs.readFileSync(path.join(dist, '_headers'), 'utf8').split('\n').slice(1).filter(Boolean)
    .map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  server = http.createServer((req, res) => {
    const p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = p.endsWith('/') ? path.join(p, 'index.html') : p;
    if (!file.startsWith(dist) || !fs.existsSync(file) || path.basename(file).startsWith('_') || file.endsWith('vercel.json')) { res.writeHead(404); return res.end(); }
    // Served over plain http locally, so the "upgrade to https" rule is left out here only.
    const h = { ...headers, 'Content-Security-Policy': headers['Content-Security-Policy'].replace('; upgrade-insecure-requests', '') };
    delete h['Strict-Transport-Security'];
    res.writeHead(200, { ...h, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('Only the live project and Google Fonts are allowed; framing is refused', () => {
  const csp = headers['Content-Security-Policy'];
  assert.match(csp, /connect-src 'self' https:\/\/vpsqrwjqrunpxcoxsixl\.supabase\.co;/);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  const v = JSON.parse(fs.readFileSync(path.join(dist, 'vercel.json'), 'utf8'));
  assert.equal(v.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value, csp, 'Vercel and Cloudflare get the same rules');
});

test('No secret keys or server-only code are published', () => {
  const all = [];
  const walk = d => fs.readdirSync(d).forEach(f => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : all.push(p); });
  walk(dist);
  assert.ok(!all.some(f => /sharepoint-folder|reports|supabase|tests/.test(path.relative(dist, f))));
  for (const f of all) assert.ok(!/service_role|sb_secret_|SERVICE_ROLE_KEY/.test(fs.readFileSync(f, 'utf8')), `${f} holds no secret`);
  assert.match(fs.readFileSync(path.join(dist, 'web/app/config.js'), 'utf8'), /sb_publishable_/);
});

test('The sign-in page loads with nothing blocked', async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const problems = [];
    page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
    page.on('pageerror', e => problems.push(e.message));
    page.on('requestfailed', r => { if (!/fonts\.g/.test(r.url())) problems.push('failed: ' + r.url()); });
    page.on('request', r => { const u = new URL(r.url()); if (!['127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) problems.push('unexpected request: ' + r.url()); });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type=email]', { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.PORTAL_CONFIG.url), 'https://vpsqrwjqrunpxcoxsixl.supabase.co');
    assert.deepEqual(problems.filter(p => !/fonts\.g/.test(p)), []);
  } finally { await browser.close(); }
});
