// End-to-end test of the LIVE build: real browser → live app → test double API → real Postgres (RLS + workflows).
// Prereqs: local DB reset (scripts/reset-local-db.sh) and web build (npm run build:web with any URL/key; config is injected).
// Run: node tests/e2e-live.mjs
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { execSync } from 'node:child_process';
import { startFakeSupabase } from './fake-supabase.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 54400, BASE = `http://localhost:${PORT}`;
const results = []; const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : x]);

execSync(path.join(here, '../scripts/reset-local-db.sh'), { stdio: 'ignore' });
const srv = await startFakeSupabase({ port: PORT, pgUrl: process.env.PGURL || 'postgres://postgres@localhost:54329/thp?host=/tmp', staticDir: path.join(here, '../web/dist'),
  config: { mode: 'live', supabaseUrl: BASE, supabaseAnonKey: 'test-anon', historyDays: 60, companyFooter: 'Test' } });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/WebSocket|realtime|501|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
const wait = (ms = 250) => p.waitForTimeout(ms);
const text = () => p.evaluate(() => document.getElementById('app').innerText);
const go = async h => { await p.evaluate(h => location.hash = h, h); await wait(400); };
async function signIn(email) {
  await p.goto(BASE + '/#/signin'); await wait(500);
  if (!(await p.$('#se'))) { await p.evaluate(() => signOut()); await wait(500); }
  await p.fill('#se', email); await p.fill('#sp', 'test-password'); await p.click('form[data-form=liveSignin] button[type=submit]'); await wait(1200);
}
async function submitModal() { await p.click('.modal button[type=submit]'); try { await p.waitForSelector('.modal-back', { state: 'detached', timeout: 8000 }); } catch (e) { throw new Error('Dialog stayed open: ' + await p.$eval('.modal', m => m.innerText.slice(0, 400)).catch(() => '?')); } await wait(300); }
async function signOutUI() { await p.evaluate(() => signOut()); await wait(400); }

try {
  // Scene A
  await signIn('paul.dyer@transhaul.example');
  let t = await text();
  for (const s of ['£16,490', '£98,000', '£17,000', '19 / 21', '£11,110', '+£635', '£32,120', 'Good morning, Paul']) ok('A dashboard shows ' + s, t.includes(s));
  ok('A shows demo-company label, not "illustrative"', t.includes('Demo company') && !t.includes('Illustrative demo data'));
  await go('#/job/TH-001'); t = await text();
  ok('A TH-001 £270 below planned contribution', t.includes('£270 below planned contribution') && t.includes('£180 potential waiting-time recharge'));
  await go('#/job/TH-001?tab=cost'); t = await text(); ok('A cost build-up reconciles', t.includes('£608.85') && t.includes('£1,190.00'));
  await go('#/cash/debtors'); t = await text(); ok('A cash page from DB', t.includes('£98,000') && t.includes('£80,000') && t.includes('£51,000'));
  // Scene B
  await signOutUI(); await signIn('lisa.grant@transhaul.example');
  ok('B ops has no cash nav', !(await p.$eval('.nav', e => e.innerText)).includes('Customers'));
  await go('#/job/TH-001'); await p.click('button.btn-primary[data-act=draftRecharge]'); await wait(200); await submitModal();
  await go('#/job/TH-002'); await p.click('button.btn-primary[data-act=draftRecharge]'); await wait(200);
  await p.fill('.modal input[name=amount]', '90'); await p.click('.modal button[type=submit]'); await wait(700);
  ok('B over-limit recharge rejected by server', (await p.$eval('.m-err', e => e.innerText)).includes('cannot exceed'));
  await p.fill('.modal input[name=amount]', '75'); await submitModal();
  await go('#/ops/pods'); t = await text(); ok('B £255 possible recovery — draft only', t.includes('£255 possible recovery — draft only'));
  await go('#/job/TODAY-01'); await p.click('button[data-act=proposeCover]'); await wait(200);
  await p.click('.modal label[data-cand=D07]'); await p.click('.modal button[type=submit]'); await wait(700);
  ok('B D07 rejected', (await p.$eval('.m-err', e => e.innerText)).includes('not planning-eligible'));
  await p.click('.modal label[data-cand=D12]'); await submitModal();
  await go('#/ops/today'); t = await text(); ok('B planned cover 20 / 21', t.includes('20 / 21'));
  // Scene C
  await signOutUI(); await signIn('transport@transhaul.example');
  const leaks = [];
  for (const h of ['#/dashboard', '#/ops/today', '#/ops/pods', '#/job/TH-001', '#/job/TH-001?tab=history', '#/fleet/compliance', '#/driver/D22']) { await go(h); if ((await p.evaluate(() => document.body.innerText)).includes('£')) leaks.push(h); }
  ok('C transport sees no £ (data withheld by database)', leaks.length === 0, leaks.join(' '));
  await go('#/driver/D22'); await p.click('button.btn-primary[data-act=followUp]'); await wait(200);
  await p.fill('.modal textarea[name=note]', 'Licence seen. DVLA check booked.'); await submitModal();
  t = await text(); ok('C D22 follow-up recorded', t.includes('Follow-up recorded') && t.includes('not a DVLA licence check'));
  // Scene D
  await signOutUI(); await signIn('paul.dyer@transhaul.example'); t = await text();
  ok('D dashboard: £255 drafts, 1 uncovered, D22 actioned', t.includes('£255') && /Uncovered\s*1/.test(t) && t.includes('D22 · Licence evidence review overdue'));
  ok('D activity attributed to Lisa and Transport Manager', t.includes('Lisa Grant') && t.includes('Transport Manager'));
  ok('D revenue unchanged', t.includes('£16,490'));
  // Scene E — driver on a phone
  await signOutUI(); await p.setViewportSize({ width: 390, height: 844 }); await signIn('d04@transhaul.example'); t = await text();
  ok('E driver app opens on TODAY-05', t.includes('TODAY-05') && t.includes('ZZ4 7KT') && !t.includes('£'));
  await p.click('button[data-arg=walkaround]'); await wait(300);
  for (const btn of await p.$$('button[data-act=walkSet][data-v=pass]')) await btn.click();
  await p.click('form[data-form=walkaround] button[type=submit]'); await wait(1000);
  for (const s of ['depart', 'arrive', 'unloading']) { await p.click(`button[data-arg=${s}]`); await wait(900); }
  await p.click('button[data-arg=complete]'); await wait(300); await submitModal(); await wait(600);
  ok('E undo of accidental completion works against the database', (await text()).includes('Undo “Delivery complete”'));
  await p.click('button[data-act=undoCheckin]'); await wait(1000);
  ok('E job back on site after undo', !(await text()).includes('Upload POD'));
  await p.click('button[data-arg=complete]'); await wait(300); await submitModal(); await wait(900);
  t = await text(); ok('E next task is POD', t.includes('Upload POD'));
  await p.click('button[data-arg=pod]'); await wait(300); await p.click('button[data-act=podSample]'); await wait(300); await p.click('#pod-submit'); await wait(1500);
  t = await text(); ok('E driver moves on to TODAY-19', t.includes('TODAY-19'));
  // office sees it
  await signOutUI(); await p.setViewportSize({ width: 1440, height: 900 }); await signIn('lisa.grant@transhaul.example');
  await go('#/ops/today'); t = await text(); ok('E Today Board shows TODAY-05 completed', /Completed\s*1/.test(t));
  await go('#/job/TODAY-05?tab=delivery'); await wait(500);
  ok('E POD image served from storage', await p.$eval('img.pod-thumb', i => i.naturalWidth > 0).catch(() => false));
  await go('#/job/TODAY-05?tab=sharing'); t = await text(); ok('E delivery email queued for Customer Contact', t.includes('Delivered: TODAY-05 to Kettering') && t.includes('Pending'));
  // Scene F — customer
  await signOutUI(); await p.setViewportSize({ width: 390, height: 844 }); await signIn('deliveries@northfield-fresh.example'); t = await text();
  ok('F portal shows only shared deliveries', t.includes('Kettering') && t.includes('Leicester') && !t.includes('Swindon') && !t.includes('£'));
  ok('F customer sees POD image', await p.$eval('img.pod-thumb', i => i.naturalWidth > 0).catch(() => false));
  await p.fill('#cref', 'TH-011'); await p.click('form[data-form=custFind] button'); await wait(500);
  t = await text(); ok('F unshared job not available', t.includes('Delivery not available'));
  await go('#/portal/job/TH-001'); t = await text(); ok('F typed URL for unshared job blocked', t.includes('Delivery not available') && !t.includes('Leeds'));
  // Administration
  await signOutUI(); await p.setViewportSize({ width: 1440, height: 900 }); await signIn('paul.dyer@transhaul.example');
  await go('#/admin/team'); await p.click('button[data-act=userStatus][data-id="00000000-0000-4000-8000-000000000002"]'); await wait(200); await submitModal();
  await signOutUI(); await signIn('lisa.grant@transhaul.example'); t = await text(); ok('Suspended user cannot use the portal', t.includes('Account suspended'));
  await signOutUI(); await signIn('paul.dyer@transhaul.example'); await go('#/admin/team'); await p.click('button[data-act=userStatus][data-id="00000000-0000-4000-8000-000000000002"]'); await wait(900);
  await go('#/admin/costmodel'); await p.fill('#thr', '20'); await p.click('form[data-form=threshold] button'); await wait(900);
  await go('#/jobs'); await p.click('[data-act=kpiJobs][data-arg=yesterday]'); await wait(400); await p.selectOption('select[data-bind=exc]', 'flagged'); await wait(300);
  ok('Threshold change re-flags from server settings (2 jobs at 20%)', (await p.$$('#jobs-results tbody tr')).length === 2);
  await go('#/admin/activity'); t = await text(); ok('Activity log from database', t.includes('Proposed driver cover') && t.includes('Driver check-in: Delivery complete') && t.includes('Suspended user'));
} catch (e) { ok('script error', false, e.stack); }
ok('No browser errors', errs.length === 0, errs.slice(0, 5).join(' | '));
for (const r of results) console.log(r.filter(Boolean).join('  '));
console.log(`${results.filter(r => r[0] === 'PASS').length}/${results.length} passed`);
await b.close(); srv.close();
