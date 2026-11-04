/* End-to-end demo journey QA (Playwright). Run: node tools/qa_journey.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'thp-shots'); fs.mkdirSync(SHOTS, { recursive: true }); process.chdir(SHOTS); fs.mkdirSync('shots', { recursive: true });
const results = []; const ok = (name, cond, extra='') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const go = async h => { await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(150); };
  const text = () => p.evaluate(() => document.getElementById('app').innerText);
  const signIn = async id => { await go('#/signin'); await p.evaluate(() => { const b = document.querySelector('[data-act=signOut]'); }); await p.click(`button.acct[data-id="${id}"]`); await p.waitForTimeout(200); };
  const signOut = async () => { await p.click('[data-act=signOut]'); await p.waitForTimeout(150); };
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(200);
  const seed0 = await p.evaluate(() => JSON.stringify(buildSeed()));

  // ---------- Scene A: Director ----------
  await signIn('U01');
  let t = await text();
  for (const s of ['£16,490','£17,000 daily target','97.0% of target','£510 short','£10,475','£11,110','+£635','£5,380','£6,015','32.63%','36.48%','£31,225','£32,120','+£895','£98,000','£17,000','19 / 21','TODAY-01 · No driver','TODAY-02 · Vehicle VOR']) ok('A overview shows ' + s, t.includes(s));
  ok('A 18 on time 90%', /18\s*·\s*90%/.test(t));
  await p.screenshot({ path: 'shots/A-overview.png' });
  await p.click('a.chip[href="#/job/TH-001"]'); await p.waitForTimeout(200);
  t = await text();
  ok('A TH-001 opens from dashboard', t.includes('TH-001 · Leeds'));
  ok('A £270 below planned contribution', t.includes('£270 below planned contribution'));
  ok('A never says lost £270', !/lost £270/i.test(t));
  ok('A £180 recharge shown', t.includes('£180 potential waiting-time recharge'));
  ok('A variance reasons', t.includes('Waiting time at customer') && t.includes('£150') && t.includes('+£65') && t.includes('+£55'));
  await p.screenshot({ path: 'shots/A-th001.png', fullPage: true });
  await go('#/job/TH-001?tab=cost'); t = await text();
  ok('A cost build-up planned lines', ['£544.50','£171.00','£143.00','£61.50','£920.00'].every(s => t.includes(s)));
  ok('A cost build-up actual lines', ['£608.85','£0.65','£226.00','£150.00','£1,190.00'].every(s => t.includes(s)));
  ok('A no £609.50', !t.includes('609.50'));
  await go('#/job/TH-001'); t = await text();
  ok('A unit costs', ['£2.79','£3.22','£35.38','£45.77'].every(s => t.includes(s)), t.match(/£\d\.\d\d|£\d\d\.\d\d/g)?.join(' '));
  // jobs list KPI links
  await go('#/dashboard'); await p.click('a.kpi-link[data-arg=late]'); await p.waitForTimeout(200);
  let rows = await p.$$eval('#jobs-results tbody tr', r => r.map(x => x.querySelector('.id').innerText));
  ok('A late filter → TH-001, TH-003', rows.join() === 'TH-001,TH-003', rows.join());
  await go('#/dashboard'); await p.click('a.kpi-link[data-arg=flagged]'); await p.waitForTimeout(200);
  rows = await p.$$eval('#jobs-results tbody tr', r => r.map(x => x.querySelector('.id').innerText));
  ok('A flagged → 3 jobs', rows.sort().join() === 'TH-001,TH-002,TH-003', rows.join());
  await go('#/dashboard'); await p.click('a.kpi-link[data-arg=yesterday]'); await p.waitForTimeout(200);
  rows = await p.$$eval('#jobs-results tbody tr', r => r.length);
  ok('A delivered → 20 rows', rows === 20, rows);
  await p.fill('input[data-bind=q]', 'Leeds'); await p.waitForTimeout(150);
  rows = await p.$$eval('#jobs-results tbody tr', r => r.map(x => x.querySelector('.id').innerText));
  ok('A search Leeds', rows.join() === 'TH-001', rows.join());
  await p.fill('input[data-bind=q]', 'V018'); await p.waitForTimeout(150);
  rows = await p.$$eval('#jobs-results tbody tr', r => r.length); ok('A search by vehicle V018 → 2', rows === 2, rows);
  await p.fill('input[data-bind=q]', ''); await p.fill('input[data-bind=from]', '2026-12-01'); await p.fill('input[data-bind=to]', '2026-12-05'); await p.waitForTimeout(150);
  t = await text(); ok('A out-of-range date → empty state', t.includes('No jobs match these filters'));
  await p.click('[data-act=kpiJobs][data-arg=wtd]'); await p.waitForTimeout(200);
  t = await text(); ok('A WTD jobs list planned/actual', t.includes('£31,225') && t.includes('£32,120'));
  // back navigation preserves filters
  await p.click('#jobs-results tbody tr:nth-child(3)'); await p.waitForTimeout(150);
  await p.goBack(); await p.waitForTimeout(250);
  t = await text(); ok('A back preserves WTD filter', t.includes('£31,225'));
  ok('A sort header works', await (async () => { await p.click('th[data-key=price]'); await p.waitForTimeout(100); const first = await p.$eval('#jobs-results tbody tr .id', e => e.innerText); return first === 'TH-003'; })());

  // ---------- Scene B: Operations ----------
  await signOut(); await signIn('U02'); t = await text();
  ok('B ops nav has no Customers & Cash/Fleet/Admin', !/Customers & Cash|Fleet & Compliance|Administration/.test(await p.$eval('.nav', e => e.innerText)));
  ok('B ops overview hides debtors', !t.includes('£98,000') && !t.includes('Bibby'));
  await go('#/cash/debtors'); t = await text(); ok('B ops denied cash', t.includes("isn't available for your role"));
  await go('#/job/TH-001'); await p.click('button.btn-primary[data-act=draftRecharge]'); await p.waitForTimeout(100);
  await p.click('.modal button[type=submit]'); await p.waitForTimeout(200);
  await go('#/dashboard'); t = await text(); ok('B after 1 draft shows £180 not £255', t.includes('£180') && !t.includes('£255'));
  await go('#/job/TH-002'); await p.click('button.btn-primary[data-act=draftRecharge]'); await p.waitForTimeout(100);
  await p.fill('.modal textarea[name=note]', 'Waiting beyond free period, tolls at customer request, handling surcharge.');
  await p.click('.modal button[type=submit]'); await p.waitForTimeout(200);
  await go('#/ops/pods'); t = await text(); ok('B £255 possible recovery — draft only', t.includes('£255 possible recovery — draft only'));
  await p.screenshot({ path: 'shots/B-pods.png', fullPage: true });
  await go('#/job/TODAY-01'); await p.click('button[data-act=proposeCover]'); await p.waitForTimeout(150);
  t = await p.$eval('.modal', e => e.innerText); ok('B cover modal compares D12/D07', t.includes('D12') && t.includes('6h 15m') && t.includes('D07') && t.includes('2h 10m'));
  await p.screenshot({ path: 'shots/B-cover.png' });
  await p.click('.modal label[data-cand=D07]'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(100);
  t = await p.$eval('.m-err', e => e.innerText); ok('B D07 rejected', t.includes('not planning-eligible'), t);
  await p.click('.modal label[data-cand=D12]'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(200);
  t = await text(); ok('B D12 proposed awaiting Vigo', t.includes('Proposed cover, awaiting Vigo confirmation'));
  await go('#/ops/today'); t = await text(); ok('B planned cover 20 / 21', t.includes('20 / 21')); ok('B one uncovered', /Uncovered\s*1/.test(t));
  await p.screenshot({ path: 'shots/B-today.png', fullPage: true });
  // action creation
  await go('#/ops/actions'); await p.click('button[data-act=raiseAction]'); await p.waitForTimeout(100);
  await p.fill('.modal input[name=title]', 'Agree detention terms with Northfield'); await p.selectOption('.modal select[name=rec]', 'job:TH-001'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(150);
  t = await text(); ok('B action raised & listed', t.includes('Agree detention terms with Northfield'));

  // ---------- Scene C: Transport ----------
  await signOut(); await signIn('U03');
  const pagesT = ['#/overview','#/ops/today','#/ops/pods','#/ops/actions','#/job/TH-001','#/job/TH-001?tab=history','#/job/TODAY-01','#/fleet/vehicles','#/fleet/drivers','#/fleet/compliance','#/fleet/documents','#/vehicle/V014','#/driver/D22'];
  let leaks = [];
  for (const h of pagesT) { await go(h); const tt = await p.evaluate(() => document.body.innerText); if (tt.includes('£')) leaks.push(h); }
  ok('C transport sees no £ on any page', leaks.length === 0, leaks.join(' '));
  await go('#/jobs'); t = await text(); ok('C transport denied Jobs & Margins', t.includes("isn't available"));
  await go('#/dashboard'); await p.fill('#gsearch', 'TH-00'); await p.waitForTimeout(150);
  t = await p.$eval('#gsearch-res', e => e.innerText); ok('C search no £', !t.includes('£') && t.includes('TH-001'));
  await go('#/driver/D22'); await p.click('button.btn-primary[data-act=followUp]'); await p.waitForTimeout(100);
  await p.fill('.modal textarea[name=note]', 'Driver presented licence; check code obtained. DVLA check booked for Monday.'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(200);
  t = await text(); ok('C D22 follow-up recorded', t.includes('Follow-up recorded') && t.includes('not a DVLA licence check'));
  await p.screenshot({ path: 'shots/C-d22.png', fullPage: true });
  // transport CSV export
  await go('#/ops/pods');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-act=exportPods]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8'); ok('C transport CSV has no value column', !csv.includes('Value') && !csv.includes('£'), csv.split('\n')[0]);
  await go('#/dashboard'); await p.evaluate(() => { window.print = () => {}; }); await p.click('button[data-act=printReport]'); await p.waitForTimeout(150);
  t = await p.$eval('#print-root', e => e.innerText); ok('C print report has no £', !t.includes('£') && t.includes('Morning report'));

  // ---------- Scene D: Director again ----------
  await signOut(); await signIn('U01'); t = await text();
  ok('D one uncovered remaining', /Uncovered\s*1/.test(t));
  ok('D £255 draft recovery', t.includes('£255') && t.includes('draft only'));
  ok('D D22 follow-up recorded', t.includes('D22 · Licence evidence review overdue') && t.includes('Follow-up recorded by Transport Manager'));
  ok('D activity attributed', t.includes('Lisa Grant') && t.includes('Transport Manager'));
  ok('D revenue unchanged £16,490', t.includes('£16,490'));
  await p.screenshot({ path: 'shots/D-overview.png', fullPage: true });
  ok('D debtors unchanged', t.includes('£98,000'));

  // ---------- Scene E: Driver (mobile viewport) ----------
  await signOut(); await p.setViewportSize({ width: 390, height: 844 }); await signIn('U04');
  t = await text(); ok('E driver sees next job TODAY-05 with address', t.includes('TODAY-05') && t.includes('ZZ4 7KT') && t.includes('Gatehouse 2'));
  ok('E driver sees no £', !(await p.evaluate(() => document.body.innerText)).includes('£'));
  await p.screenshot({ path: 'shots/E-driver-home.png', fullPage: true });
  await p.click('button[data-arg=walkaround]'); await p.waitForTimeout(150);
  await p.screenshot({ path: 'shots/E-walkaround.png', fullPage: true });
  await p.click('button[type=submit]'); await p.waitForTimeout(150);
  for (const st of ['depart','arrive','unloading','complete']) { await p.click(`button[data-arg=${st}]`); await p.waitForTimeout(150); }
  t = await text(); ok('E after complete, next is POD', t.includes('Upload POD'));
  await p.click('button[data-arg=pod]'); await p.waitForTimeout(150);
  await p.setInputFiles('#pod-file', { name: 'pod.png', mimeType: 'image/png', buffer: fs.readFileSync('shots/E-walkaround.png') }); await p.waitForTimeout(600);
  ok('E POD preview shown', await p.$('#pod-prev img') !== null);
  await p.screenshot({ path: 'shots/E-pod.png', fullPage: true });
  await p.click('#pod-submit'); await p.waitForTimeout(200);
  t = await text(); ok('E driver home moves to TODAY-19 with Maps disabled', t.includes('TODAY-19') && t.includes('awaiting confirmation') );
  ok('E maps disabled for no-address job', await p.$('button[disabled]:has-text("Open in Maps")') !== null);
  await p.screenshot({ path: 'shots/E-driver-after.png', fullPage: true });
  await signOut(); await p.setViewportSize({ width: 1440, height: 900 }); await signIn('U02');
  await go('#/ops/today'); t = await text(); ok('E office board shows TODAY-05 completed', /Completed\s*1/.test(t) && t.includes('TODAY-05'));
  await go('#/job/TODAY-05?tab=delivery'); ok('E job shows POD image', await p.$('img.pod-thumb') !== null);

  // ---------- Scene F: Customer ----------
  await signOut(); await p.setViewportSize({ width: 390, height: 844 }); await go('#/mailbox'); t = await text();
  ok('F simulated email for TODAY-05', t.includes('Delivered: TODAY-05 to Kettering'));
  await p.screenshot({ path: 'shots/F-mailbox.png', fullPage: true });
  await p.click('button[data-act=previewEmail]'); await p.waitForTimeout(100); await p.screenshot({ path: 'shots/F-email.png' });
  ok('F email marked simulated', (await p.$eval('.modal', e => e.innerText)).includes('Simulated email — not sent'));
  await p.click('.modal button[data-act=openLink]'); await p.waitForTimeout(300);
  t = await text(); ok('F portal via one-time link', t.includes('Signed in with a one-time link') && t.includes('Kettering') && t.includes('Leicester'));
  ok('F POD visible to customer', await p.$('img.pod-thumb') !== null);
  ok('F customer sees no costs', !t.includes('Planned') && !t.includes('margin') && !t.includes('£'));
  await p.screenshot({ path: 'shots/F-portal.png', fullPage: true });
  await p.fill('#cref', 'TH-011'); await p.click('form[data-form=custFind] button'); await p.waitForTimeout(150);
  t = await text(); ok('F unshared TH-011 not available', t.includes('Delivery not available') && !t.includes('Swindon'));
  await go('#/portal/job/TH-001'); t = await text(); ok('F typed TH-001 URL blocked', t.includes('Delivery not available') && !t.includes('Leeds'));
  await go('#/portal/settings'); await p.click('label.switch'); await p.waitForTimeout(100);
  ok('F opt-out saved', await p.evaluate(() => contact('CT01').notify === false));
  await p.click('[data-act=signOut]'); await p.waitForTimeout(100);
  await go('#/link/' + await p.evaluate(() => S().links[0].token)); t = await text(); ok('F link single-use', t.includes('already been used'));
  const tok = await p.evaluate(() => S().links.find(l => l.jobId === 'TH-006').token);
  ok('F TH-006 link expired naturally by demo clock (08:20)', await p.evaluate(t => linkState(S().links.find(l => l.token === t)), tok) === 'expired');
  await go('#/link/' + tok); t = await text(); ok('F expired link refused', t.includes('expired'));
  await p.click('button[data-act=newLink]'); await p.waitForTimeout(150);
  const nt = await p.evaluate(() => S().links[0].token);
  await p.click(`button[data-act=expireLink][data-arg="${nt}"]`); await p.waitForTimeout(100);
  await go('#/link/' + nt); t = await text(); ok('F simulated 24h expiry refused', t.includes('expired'));

  // ---------- Scene G + admin ----------
  await p.setViewportSize({ width: 1440, height: 900 }); await signIn('U01');
  await go('#/admin/connections'); t = await text();
  ok('G no false integration claims', !/\bConnected\b|\bLive\b|Sync successful/i.test(t.replace(/No live systems connected|not connected|Nothing below is connected/gi, '')));
  ok('G Vigo access agreed', t.includes('Access agreed'));
  await p.screenshot({ path: 'shots/G-connections.png', fullPage: true });
  await go('#/admin/costmodel'); await p.fill('#thr', '20'); await p.click('form[data-form=threshold] button'); await p.waitForTimeout(150);
  ok('Threshold 20% flags 2', await p.evaluate(() => S().jobs.filter(isFlagged).length) === 2);
  await p.fill('#thr', '10'); await p.click('form[data-form=threshold] button'); await p.waitForTimeout(150);
  ok('Threshold 10% flags 3', await p.evaluate(() => S().jobs.filter(isFlagged).map(j => j.id).join()) === 'TH-001,TH-002,TH-003');
  await p.fill('#rate-artic', '1.70'); await p.click('form[data-form=rates] button[type=submit]'); await p.waitForTimeout(150);
  ok('Rate change keeps TH-001 snapshot', await p.evaluate(() => job('TH-001').plannedCost === 920 && costLines(job('TH-001')).planned[0].amt === 544.5) && (await text()).includes('RC-2026-11-v2'));
  await go('#/admin/team'); await p.click('button[data-act=invite]'); await p.fill('.modal input[name=name]', 'Jordan Reeves'); await p.fill('.modal input[name=email]', 'jordan@transhaul.example');
  await p.click('.modal input[value=fleet]'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(150);
  ok('Invite view-only user', (await text()).includes('Jordan Reeves'));
  await p.click('button[data-act=userStatus][data-id="U02"]'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(150);
  ok('Suspend Lisa', await p.evaluate(() => user('U02').status) === 'suspended');
  await signOut(); ok('Suspended account disabled on sign-in', await p.$('button.acct[data-id="U02"][disabled]') !== null);
  await p.click('button.acct:has-text("Jordan Reeves")'); await p.waitForTimeout(200); t = await text();
  ok('View-only: no £ by default', !(await p.evaluate(() => document.body.innerText)).includes('£'));
  ok('View-only nav limited', (await p.$eval('.nav', e => e.innerText)).replace(/\d+/g,'').replace(/\s+/g,' ').trim() === 'Dashboard Fleet & Compliance');
  await go('#/fleet/compliance'); ok('View-only has no action buttons', await p.$('button[data-act=followUp]') === null);
  await signOut(); await signIn('U01'); await go('#/admin/team'); await p.click('button[data-act=userStatus][data-id="U02"]'); await p.waitForTimeout(150);
  ok('Restore Lisa', await p.evaluate(() => user('U02').status) === 'active');
  await go('#/admin/activity'); t = await text();
  ok('Activity log has actor/role/prev/new', t.includes('Lisa Grant') && t.includes('Operations Manager') && t.includes('Proposed driver cover') && t.includes('Driver check-in: Delivery complete'));
  // revenue unchanged after everything
  ok('Revenue still £16,490 after workflow', await p.evaluate(() => yesterdayStats().revenue) === 16490);
  // persistence
  await p.reload(); await p.waitForTimeout(200); ok('State persists across reload', await p.evaluate(() => activeRecharges().length) === 2);
  // reset
  await p.click('[data-act=resetDemo]'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(200);
  const after = await p.evaluate(() => JSON.stringify(S()));
  ok('Reset restores exact initial state', after === seed0);
  ok('Reset clears PODs', await p.evaluate(() => Object.keys(Store.pods).length === 0 && !localStorage.getItem('thp.pods.v3')));
  ok('No console errors', errs.length === 0, errs.join(' | '));
  for (const r of results) console.log(r.join('  '));
  console.log(results.filter(r => r[0] === 'PASS').length + '/' + results.length + ' passed');
  await b.close();
})().catch(e => { console.error('SCRIPT ERROR', e); for (const r of results) console.log(r.join('  ')); process.exit(1); });
