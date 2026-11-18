// Records what the real local database returns to each role while a browser visits every page and
// tab that role can reach, tries the drop-downs and opens each action. The recordings feed the
// clickable preview (build-portal-preview.mjs). Two datasets:
//   transhaul  local database portal_preview: Trans Haul as it stands today (supabase/preview/transhaul_today.sql)
//   sample     local database portal_sample: made-up figures to show the design (supabase/preview/sample_trends.sql)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { startLocalSupabase } from '../tests/local-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATASETS = { transhaul: 'portal_preview', sample: 'portal_sample' };
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
let port = 54420;
for (const [dataset, db] of Object.entries(DATASETS)) {
  const s = await startLocalSupabase({ port, rootDir: root, pgUrl: `postgres://postgres@localhost:54329/${db}?host=/tmp`, config: { url: `http://localhost:${port}`, anonKey: 'local' } });
  out[dataset] = {};
  for (const [role, sub] of Object.entries(ROLES)) {
    const rec = {};
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(([sess, company]) => {
      sessionStorage.setItem('portal.session', JSON.stringify(sess));
      if (company) sessionStorage.setItem('portal.company', company);
    }, [sessionFor(sub), role === 'admin' ? COMPANY_A : null]);
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(`${dataset} ${role}: script error: ${e.message}`));
    page.on('response', async r => {
      const u = new URL(r.url());
      if (!/^\/(rest|functions)\//.test(u.pathname)) return;
      const req = r.request(); if (req.method() === 'OPTIONS') return;
      const key = `${req.method()} ${u.pathname}${u.search} ${req.postData() || ''}`;
      try { rec[key] = { status: r.status(), body: await r.text() }; } catch { /* page moved on */ }
    });
    const settle = async () => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(200); };
    const seen = new Set(); const queue = ['#/dashboard', '#/actions'];
    if (role === 'admin') queue.push('#/admin/companies');
    await page.goto(`http://localhost:${port}/`); await settle();
    while (queue.length) {
      const h = queue.shift(); if (seen.has(h)) continue; seen.add(h);
      await page.evaluate(x => { location.hash = x; }, h); await settle();
      const txt = (await page.locator('#main').innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (/\b(Invalid Date|NaN|undefined|null)\b|Request failed|Something went wrong/.test(txt)) problems.push(`${dataset} ${role} ${h}: ${txt.slice(0, 220)}`);
      if (h === '#/actions') {                       // open each action so its timeline is recorded
        for (const id of await page.$$eval('[data-open-action]', els => [...new Set(els.map(e => e.dataset.openAction))])) {
          await page.click(`[data-open-action="${id}"]`); await settle(); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
        }
      }
      const links = await page.$$eval('a[href^="#/"]', as => as.map(a => a.getAttribute('href')));
      for (const l of links) if (!seen.has(l) && !queue.includes(l) && seen.size + queue.length < 80) queue.push(l);
    }
    // The dashboard drop-downs: every view, then every day.
    await page.evaluate(() => { location.hash = '#/dashboard'; }); await settle();
    for (const v of await page.$$eval('#scope option', os => os.map(o => o.value))) { await page.selectOption('#scope', v); await settle(); }
    if (await page.$('#scope')) { await page.selectOption('#scope', 'all'); await settle(); }
    for (const v of await page.$$eval('#day:not([disabled]) option', os => os.map(o => o.value))) { await page.selectOption('#day', v); await settle(); }
    out[dataset][role] = rec;
    console.log(`${dataset} ${role}: ${seen.size} pages, ${Object.keys(rec).length} responses`);
    await ctx.close();
  }
  s.close(); port++;
}
await browser.close();
fs.writeFileSync(path.join(root, 'web/portal-preview-recordings.json'), JSON.stringify(out));
console.log(`saved web/portal-preview-recordings.json (${Math.round(fs.statSync(path.join(root, 'web/portal-preview-recordings.json')).size / 1024)} KB)`);
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no problems found');
