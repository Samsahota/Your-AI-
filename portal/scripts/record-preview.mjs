// Records what the real local database returns to each role while a browser visits every page
// and tab that role can reach. The recordings feed the clickable preview (build-portal-preview.mjs).
// Needs the local database:  npm run db:reset && node scripts/record-preview.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { startLocalSupabase } from '../tests/local-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 54420;
const s = await startLocalSupabase({ port, rootDir: root, pgUrl: process.env.PGURL || 'postgres://postgres@localhost:54329/portal_preview?host=/tmp', config: { url: `http://localhost:${port}`, anonKey: 'local' } });

const COMPANY_A = '20000000-0000-4000-8000-00000000000a';
const ROLES = {
  director: '10000000-0000-4000-8000-000000000002', consultant: '10000000-0000-4000-8000-000000000003',
  operations: '10000000-0000-4000-8000-000000000004', transport: '10000000-0000-4000-8000-000000000005',
  warehouse: '10000000-0000-4000-8000-000000000006', admin: '10000000-0000-4000-8000-000000000001',
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sessionFor = sub => ({ access_token: `${b64({ alg: 'none' })}.${b64({ sub, role: 'authenticated', aal: 'aal2', exp: 4102444800 })}.sig`, refresh_token: `r.aal2.${sub}`, user: { id: sub } });

const browser = await chromium.launch();
const out = {}; const problems = [];
for (const [role, sub] of Object.entries(ROLES)) {
  const rec = {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([sess, company]) => {
    sessionStorage.setItem('portal.session', JSON.stringify(sess));
    if (company) sessionStorage.setItem('portal.company', company);
  }, [sessionFor(sub), role === 'admin' ? COMPANY_A : null]);
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(`${role}: script error: ${e.message}`));
  page.on('response', async r => {
    const u = new URL(r.url());
    if (!/^\/(rest|functions)\//.test(u.pathname)) return;
    const req = r.request(); if (req.method() === 'OPTIONS') return;
    const key = `${req.method()} ${u.pathname}${u.search} ${req.postData() || ''}`;
    try { rec[key] = { status: r.status(), body: await r.text() }; } catch { /* page moved on */ }
  });
  const seen = new Set(); const queue = ['#/dashboard'];
  if (role === 'admin') queue.push('#/admin/companies');
  await page.goto(`${s.url}/`); await page.waitForLoadState('networkidle');
  while (queue.length) {
    const h = queue.shift(); if (seen.has(h)) continue; seen.add(h);
    await page.evaluate(x => { location.hash = x; }, h);
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(250);
    const txt = (await page.locator('#main').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/Invalid Date|NaN|undefined|null|Request failed|Something went wrong|error/i.test(txt)) problems.push(`${role} ${h}: ${txt.slice(0, 220)}`);
    const links = await page.$$eval('a[href^="#/"]', as => as.map(a => a.getAttribute('href')));
    for (const l of links) if (!seen.has(l) && seen.size + queue.length < 80) queue.push(l);
  }
  out[role] = rec;
  console.log(`${role}: ${seen.size} pages, ${Object.keys(rec).length} responses`);
  await ctx.close();
}
await browser.close(); s.close();
fs.writeFileSync(path.join(root, 'web/portal-preview-recordings.json'), JSON.stringify(out));
console.log('saved web/portal-preview-recordings.json');
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no problems found');
