// End-to-end: a real browser drives every screen against the local database, with two-factor sign-in.
// Run after a fresh database:  npm run db:reset && npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalSupabase, totp, TEST_PASSWORD } from './local-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 54411;
let server, browser; const errors = [];
const secrets = {};   // email -> authenticator key, as if saved in the person's phone

before(async () => {
  server = await startLocalSupabase({ port: PORT, rootDir: root, pgUrl: process.env.PGURL || 'postgres://postgres@localhost:54329/portal_test?host=/tmp', config: { url: `http://localhost:${PORT}`, anonKey: 'local' } });
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function signIn(email, { width = 1400 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  page.on('pageerror', e => errors.push(`${email}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${email}: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/`);
  await page.fill('#email', email); await page.fill('#password', TEST_PASSWORD); await page.click('#signin button[type=submit]');
  await page.waitForSelector('#code');
  if (await page.$('#secret')) secrets[email] = (await page.textContent('#secret')).replace(/\s/g, '');
  await page.fill('#code', totp(secrets[email]));
  await page.click('#mfa button[type=submit]');
  await page.waitForSelector('.shell');
  return page;
}
const go = async (page, hash) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForFunction(() => !document.querySelector('#main .loading')); await page.waitForTimeout(150); };
const text = page => page.textContent('#main');

test('Sign-in: wrong password and wrong code are refused with a clear message', async () => {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`);
  await page.fill('#email', 'director@demo.test'); await page.fill('#password', 'wrong'); await page.click('#signin button[type=submit]');
  await page.waitForSelector('#signin .form-error:not([hidden])');
  assert.match(await page.textContent('#signin .form-error'), /don't match/);
  await page.fill('#password', TEST_PASSWORD); await page.click('#signin button[type=submit]');
  await page.waitForSelector('#secret');
  assert.match(await page.textContent('#mfa'), /Microsoft Authenticator/);
  await page.fill('#code', '000000'); await page.click('#mfa button[type=submit]');
  await page.waitForSelector('#mfa .form-error:not([hidden])');
  assert.match(await page.textContent('#mfa .form-error'), /didn't work/);
  await page.close();
});

test('Director: every page opens, with the agreed figures', async () => {
  const page = await signIn('director@demo.test');
  assert.match(await text(page), /Demo Haulage Ltd/);
  assert.equal(await page.$$eval('svg.bull .wedge', w => w.length), 5);
  assert.match(await text(page), /On time in full\s*80\.0%/);
  for (const [hash, heading, expect] of [
    ['#/hs', 'Health and Safety', /Pallet slipped from racking/],
    ['#/service', 'Service', /Jobs on 17 Nov 2026 \(10\)/],
    ['#/cost', 'Cost', /Company profit and loss/],
    ['#/people', 'People', /Absent or on holiday/],
    ['#/compliance', 'Compliance', /AB12 CDE/],
    ['#/links', 'Links', /Logistics UK/],
    ['#/records/jobs', 'Records', /J-10/],
    ['#/records/payroll', 'Records', /£60,000/],
    ['#/settings/users', 'Users and settings', /Toni Transport/],
    ['#/settings/access', 'Users and settings', /Disciplinary detail/],
    ['#/settings/targets', 'Users and settings', /On time in full/],
    ['#/settings/connections', 'Users and settings', /Connections/],
    ['#/settings/library', 'Users and settings', /Company documents/],
    ['#/settings/activity', 'Users and settings', /Activity/],
    ['#/me', 'My account', /Two-factor sign-in/],
  ]) {
    await go(page, hash);
    assert.equal((await page.textContent('#main h1')).trim(), heading, hash);
    assert.match(await text(page), expect, hash);
    assert.doesNotMatch(await text(page), /Something went wrong/, hash);
  }
  await page.close();
});

test('Director: report an incident, comment, change a target, change access, invite a user', async () => {
  const page = await signIn('director@demo.test');
  await go(page, '#/hs');
  await page.click('#report');
  await page.selectOption('#f-kind', 'near_miss');
  await page.fill('#f-description', 'Pedestrian walked through the loading bay');
  await page.click('dialog [type=submit]');
  await page.waitForSelector('.toast >> text=Incident reported');
  assert.match(await text(page), /Pedestrian walked through the loading bay/);
  await page.fill('#c-hs', 'Banksman briefing booked for Monday');
  await page.click('.comment-form button');
  await page.waitForSelector('.comments >> text=Banksman briefing booked for Monday');

  await go(page, '#/settings/targets');
  await page.click('[data-measure="service.otif"]');
  await page.fill('#f-green', '75'); await page.fill('#f-amber', '70');
  await page.click('dialog [type=submit]');
  await page.waitForSelector('.toast >> text=Target saved');
  await go(page, '#/dashboard');
  assert.match(await text(page), /On time in full\s*80\.0%\s*On target/);

  await go(page, '#/settings/access');
  await page.selectOption('select[data-role="transport"][data-area="cost"]', 'own');
  await page.waitForSelector('.toast >> text=Transport Manager: Cost set to own area');

  await go(page, '#/settings/users');
  await page.click('#invite');
  await page.fill('#f-name', 'Monica Example'); await page.fill('#f-email', 'monica@demo.test');
  await page.selectOption('#f-role', 'transport'); await page.selectOption('#f-division', 'transport');
  await page.click('dialog [type=submit]');
  await page.waitForSelector('.toast >> text=Invitation sent');
  assert.match(await text(page), /Monica Example[\s\S]*Invited/);
  await page.close();
});

test('Invited user: the email link asks for a password, then two-factor, then activates the account', async () => {
  const db = new (require('pg').Client)({ connectionString: process.env.PGURL || 'postgres://postgres@localhost:54329/portal_test?host=/tmp' });
  await db.connect(); const { rows: [u] } = await db.query(`select id from auth.users where email = 'monica@demo.test'`); await db.end();
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok = `${b64({ alg: 'none' })}.${b64({ sub: u.id, role: 'authenticated', aal: 'aal1' })}.sig`;
  const link = await browser.newPage();
  await link.goto(`http://localhost:${PORT}/#access_token=${tok}&refresh_token=r.aal1.${u.id}&type=invite`);
  await link.waitForSelector('#pw1');
  assert.match(await link.textContent('h1'), /Welcome: choose a password/);
  await link.fill('#pw1', 'short'); await link.fill('#pw2', 'short'); await link.click('#pw button');
  assert.match(await link.textContent('#pw .form-error'), /at least 12/);
  await link.fill('#pw1', 'Monica long password 1'); await link.fill('#pw2', 'Monica long password 1'); await link.click('#pw button');
  await link.waitForSelector('#secret');
  secrets['monica@demo.test'] = (await link.textContent('#secret')).replace(/\s/g, '');
  await link.fill('#code', totp(secrets['monica@demo.test'])); await link.click('#mfa button[type=submit]');
  await link.waitForSelector('.shell');
  await link.close();
  const page = await signIn('monica@demo.test');
  assert.match(await page.textContent('.side'), /Transport Manager/);
  assert.match(await text(page), /Dashboard/);
  await page.close();
});

test('Transport Manager: no money, own area only; pages they can\'t see are blocked', async () => {
  const page = await signIn('transport@demo.test');
  assert.match(await page.textContent('.side'), /Own area/);
  await go(page, '#/people');
  assert.match(await text(page), /for transport staff/);
  assert.doesNotMatch(await text(page), /Case details/);
  await go(page, '#/records/payroll');
  assert.doesNotMatch(await text(page), /£60,000/);
  await go(page, '#/cost');                       // the director gave transport "own" cost access above
  assert.match(await text(page), /Job costs on/);
  assert.doesNotMatch(await text(page), /Company profit and loss/);
  await page.close();
  const w = await signIn('warehouse@demo.test');
  assert.match(await w.textContent('.side'), /Users and settings|My account/);
  await go(w, '#/settings/users');
  assert.doesNotMatch(await text(w), /Invite someone/);
  await w.close();
});

test('Demo view: staff names are hidden on screen', async () => {
  const page = await signIn('consultant@demo.test');
  await go(page, '#/me');
  await page.check('#demo');
  await page.waitForSelector('.toast >> text=Demo view on');
  await go(page, '#/records/staff');
  assert.match(await text(page), /Driver 1/);
  assert.doesNotMatch(await text(page), /Driver 10\b.*T10/);
  await go(page, '#/people');
  assert.doesNotMatch(await text(page), /Confidential case detail.*Driver 3/);
  await page.close();
});

test('Platform admin: open a company, add a connection, import a file, see the figures update', async () => {
  const page = await signIn('admin@example.test');
  assert.match(await text(page), /Admin console/);
  await page.click('button[data-open="20000000-0000-4000-8000-00000000000a"]');
  await page.waitForSelector('svg.bull');
  await go(page, '#/admin/connections');
  await page.click('#add');
  await page.selectOption('#f-system', 'sharepoint'); await page.fill('#f-label', 'Accident log');
  await page.selectOption('#f-method', 'file'); await page.selectOption('#f-status', 'configured');
  await page.click('dialog [type=submit]');
  await page.waitForSelector('.toast >> text=Connection saved');

  await go(page, '#/admin/import');
  await page.selectOption('#iconn', { label: 'Accident log' });
  await page.selectOption('#itarget', 'incidents');
  const csv = 'Reference,Type,Date,Time,Area,What happened,Status,Open actions\nSP-1,Accident,16/11/2026,14:20,Transport,Mirror clipped gatepost,Open,1\nSP-2,Near miss,15/11/2026,07:05,Warehouse,Unsecured load on racking,Closed,0\n';
  await page.setInputFiles('#ifile', { name: 'accidents.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.click('#imp [type=submit]');
  await page.waitForSelector('#write');
  assert.match(await page.textContent('#result'), /Passed rows readable/);
  await page.click('#write');
  await page.waitForSelector('.toast >> text=2 records written');
  await go(page, '#/dashboard');
  assert.match(await text(page), /Accidents this month\s*1/);

  // A file with a renamed column writes nothing and says why.
  await go(page, '#/admin/import');
  await page.selectOption('#iconn', { label: 'Accident log' });
  await page.selectOption('#itarget', 'incidents');
  await page.setInputFiles('#ifile', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(csv.replace('What happened', 'Description')) });
  await page.click('#imp [type=submit]');
  await page.waitForSelector('#write');
  assert.match(await page.textContent('#result'), /Column missing: What happened\. Has the report layout changed\?/);

  for (const t of ['companies', 'library', 'health']) { await go(page, `#/admin/${t}`); assert.doesNotMatch(await text(page), /Something went wrong/, t); }
  await page.close();
});

test('New company with no figures yet: every page opens and says it is waiting for data', async () => {
  // The platform admin adds a brand-new company (as on day one for a new haulier) and opens it.
  const page = await signIn('admin@example.test');
  const id = await page.evaluate(async () => {
    const s = JSON.parse(sessionStorage.getItem('portal.session'));
    const r = await fetch('/rest/v1/rpc/create_company', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local', Authorization: `Bearer ${s.access_token}` },
      body: JSON.stringify({ p_name: 'Empty Haulier Ltd', p_slug: 'empty-haulier', p_deal: 'standard', p_setup_fee: 5000, p_monthly_fee: 500 }) });
    return r.json();
  });
  await page.evaluate(x => { sessionStorage.setItem('portal.company', x); location.hash = '#/dashboard'; }, id);
  await page.reload(); await page.waitForSelector('#main h1');
  assert.match(await page.locator('#main').innerText(), /Empty Haulier Ltd · no figures yet/);
  for (const h of ['#/hs', '#/service', '#/cost', '#/people', '#/compliance', '#/records/jobs', '#/links', '#/admin/connections', '#/admin/import']) {
    await page.evaluate(x => { location.hash = x; }, h);
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(150);
    const text = await page.locator('#main').innerText();
    assert.doesNotMatch(text, /Something went wrong|Invalid (Date|time)/, `${h} broke`);
  }
  await page.close();
});

test('Sign out: the sign-in screen stays, and nothing from the last person is redrawn', async () => {
  const page = await signIn('director@demo.test');
  await page.click('#signout');
  await page.waitForSelector('#signin');
  await page.waitForTimeout(500);                                  // give any late redraw time to happen
  assert.equal(await page.locator('#signin').count(), 1);
  assert.equal(await page.locator('.side').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /Demo Haulage|Dashboard/);
  await page.evaluate(() => { location.hash = '#/cost'; });        // typing an address doesn't bring it back
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.side').count(), 0);
  await page.close();
});

test('Phone width: no sideways scrolling on the dashboard and pages', async () => {
  const page = await signIn('director@demo.test', { width: 390 });
  for (const h of ['#/dashboard', '#/hs', '#/compliance', '#/settings/access']) {
    await go(page, h);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), h);
  }
  await page.close();
});

test('Security headers are sent, and source files are not served', async () => {
  const r = await fetch(`http://localhost:${PORT}/`);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/tests/e2e.test.mjs', '/supabase/config.toml', '/scripts/serve-local.mjs']) assert.equal((await fetch(`http://localhost:${PORT}${p}`)).status, 404, p);
});

test('No script errors or blocked content on any screen', () => { assert.deepEqual(errors, []); });
