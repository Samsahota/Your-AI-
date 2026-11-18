// Report emails and the nightly recalculation: who is due an email, that each email only holds
// what that person can see, that nothing is sent twice, and the email layout itself.
// Needs the local database:  npm run db:reset && npm run test:reports
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { renderDaily, renderWeekly, runReports, esc } from '../reports/email.mjs';

const URL = process.env.PGURL || 'postgres://postgres@localhost:54329/portal_test?host=/tmp';
const U = {
  admin: '10000000-0000-4000-8000-000000000001', director: '10000000-0000-4000-8000-000000000002',
  consultant: '10000000-0000-4000-8000-000000000003', ops: '10000000-0000-4000-8000-000000000004',
  transport: '10000000-0000-4000-8000-000000000005', warehouse: '10000000-0000-4000-8000-000000000006',
  testTm: '10000000-0000-4000-8000-000000000007', leaver: '10000000-0000-4000-8000-000000000008',
  second: '10000000-0000-4000-8000-000000000009',
};
const A = '20000000-0000-4000-8000-00000000000a';
const MONDAY_8AM = '2026-11-23 08:00:00 Europe/London', MONDAY_6AM = '2026-11-23 06:00:00 Europe/London';
const TUESDAY_8AM = '2026-11-24 08:00:00 Europe/London';
const APP = 'https://portal.example.test';
let db;
before(async () => { db = new pg.Client({ connectionString: URL }); await db.connect(); await db.query('begin'); });
after(async () => { await db.query('rollback'); await db.end(); });

async function run(claims, role, sql, params = []) {
  await db.query('savepoint q');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.query(`set local role ${role}`);
    const r = await db.query(sql, params);
    await db.query('reset role'); await db.query('release savepoint q');
    return r.rows;
  } catch (e) { await db.query('rollback to savepoint q'); await db.query('reset role'); throw e; }
}
const as = (user, sql, params) => run({ sub: user, role: 'authenticated', aal: 'aal2' }, 'authenticated', sql, params);
const asService = (sql, params) => run({ role: 'service_role' }, 'service_role', sql, params);
const rejects = async (p, re) => assert.rejects(p, e => re.test(e.message), `expected error ${re}`);
const digest = async (user, kind = 'daily') => (await asService(`select report_digest($1, $2) d`, [user, kind]))[0].d;
const due = async (at) => asService(`select * from report_due($1::timestamptz)`, [at]);

// The server function's view of the database, through the service key.
const serviceDb = at => ({
  async rpc(fn, args) {
    if (fn === 'report_due') return due(at);
    const names = Object.keys(args), vals = Object.values(args);
    const call = `${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
    return (await asService(`select ${call} as r`, vals))[0].r;
  },
});

test('Who is due: active people at active companies with figures, after the send time; Monday adds the weekly', async () => {
  assert.equal((await due(MONDAY_6AM)).length, 0, 'nothing before 07:00');
  const rows = await due(MONDAY_8AM);
  const demo = rows.filter(r => r.company_id === A);
  assert.deepEqual([...new Set(demo.map(r => r.kind))].sort(), ['daily', 'weekly']);
  const people = new Set(demo.map(r => r.user_id));
  assert.equal(people.size, 5, 'director, consultant, operations, transport, warehouse');
  assert.ok(!people.has(U.testTm), 'test logins get no email');
  assert.ok(!people.has(U.leaver), 'suspended people get no email');
  assert.ok(!rows.some(r => r.user_id === U.admin), 'platform admin is not on a company list');
  const tue = await due(TUESDAY_8AM);
  assert.ok(tue.every(r => r.kind === 'daily'), 'weekly only on Mondays');
});

test('Companies still being set up, or with no figures, get nothing', async () => {
  await db.query(`update companies set status = 'setup' where id = $1`, [A]);
  assert.ok(!(await due(MONDAY_8AM)).some(r => r.company_id === A));
  await db.query(`update companies set status = 'active' where id = $1`, [A]);
});

test('Send time follows the company setting; directors set it, others cannot', async () => {
  await as(U.director, `select set_report_time('09:00')`);
  assert.ok(!(await due(MONDAY_8AM)).some(r => r.company_id === A), 'not before 09:00');
  await rejects(as(U.transport, `select set_report_time('06:00')`), /Only a director/);
  await rejects(as(U.director, `select set_report_time('22:00')`), /between 05:00 and 10:00/);
  await as(U.director, `select set_report_time('07:00')`);
});

test('People can turn their own emails off; directors can for their own people only', async () => {
  await as(U.transport, `select set_report_emails(false, null)`);
  let rows = await due(TUESDAY_8AM);
  assert.ok(!rows.some(r => r.user_id === U.transport));
  await rejects(as(U.ops, `select set_report_emails(true, true, $1)`, [U.transport]), /Only a director/);
  await rejects(as(U.second, `select set_report_emails(true, true, $1)`, [U.transport]), /Only a director/);
  await as(U.director, `select set_report_emails(true, true, $1)`, [U.transport]);
  rows = await due(TUESDAY_8AM);
  assert.ok(rows.some(r => r.user_id === U.transport));
});

test('Each email holds only what that person can see on screen', async () => {
  const dir = await digest(U.director);
  const tm = await digest(U.transport);
  assert.equal(dir.company, 'Demo Haulage Ltd');
  assert.ok(dir.measures.some(m => m.code === 'cost.revenue_vs_plan'), 'director sees revenue');
  assert.ok(!tm.measures.some(m => m.code.startsWith('cost.')), 'Transport Manager sees no money');
  const [{ d: screen }] = await as(U.transport, `select dashboard() d`);
  assert.deepEqual(tm.measures.map(m => [m.code, m.scope, m.value]), screen.measures.map(m => [m.code, m.scope, m.value]), 'same figures as on screen');
  assert.ok(tm.measures.filter(m => m.code.startsWith('service.')).every(m => m.scope === 'transport'), 'service figures are transport only');
  assert.equal(tm.quadrants.cost.status, 'no_access');
  const ware = await digest(U.warehouse);
  assert.ok(!ware.measures.some(m => m.code === 'service.otif'), 'warehouse does not see transport on-time');
});

test('Building an email leaves no trace of the person it was built for', async () => {
  const [{ c }] = await asService(`select report_digest($1, 'daily') is not null as ok, current_setting('request.jwt.claims', true) c`, [U.director]);
  assert.equal(JSON.parse(c).role, 'service_role');
  assert.equal(JSON.parse(c).sub, undefined);
});

test('Only the platform can list, build or record report emails, or run the nightly recalculation', async () => {
  await rejects(as(U.director, `select * from report_due()`), /permission denied|Only the platform/);
  await rejects(as(U.director, `select report_digest($1, 'daily')`, [U.director]), /permission denied|Only the platform/);
  await rejects(as(U.admin, `select run_nightly()`), /permission denied|Only the platform/);
  await rejects(as(U.director, `select record_report_send($1, $2, 'daily', '2026-11-24', 'sent')`, [A, U.director]), /permission denied|Only the platform/);
});

test('Your actions: overdue and upcoming actions appear in your own email', async () => {
  // Inserted directly so the due date can be in the past (the screens only allow future dates).
  await db.query(`insert into actions (company_id, ref, area, title, owner, owner_name, due_date, created_by_name)
    values ($1, 'A-9001', 'service', 'Chase late delivery with Example Foods', $2, 'Olive Operations', '2026-11-10', 'Dana Director')`, [A, U.ops]);
  const d = await digest(U.ops);
  const a = d.my_actions.find(x => /Chase late delivery/.test(x.title));
  assert.ok(a, 'action is listed');
  assert.equal(a.overdue, true);
  assert.equal((await digest(U.director)).my_actions.filter(x => /Chase late delivery/.test(x.title)).length, 0, 'only the owner’s email lists it');
});

test('Comments explaining a red figure appear in the email; others do not', async () => {
  await as(U.director, `select add_comment('service', 'service.otif', 'Two late jobs were the M1 closure.')`);
  await as(U.director, `select add_comment('service', 'service.picks_per_hour', 'Not a red figure.')`);
  const d = await digest(U.director);
  assert.ok(d.comments.some(c => /M1 closure/.test(c.body)));
  assert.ok(!d.comments.some(c => /Not a red figure/.test(c.body)));
});

test('Sending: one email per person per day, failures retried at most three times', async () => {
  const sent = [];
  const ok = async m => { sent.push(m); return 'msg_' + sent.length; };
  const first = await runReports({ db: serviceDb(TUESDAY_8AM), send: ok, appUrl: APP });
  assert.ok(first.results.length >= 6);
  assert.ok(first.results.every(r => r.status === 'sent'));
  assert.ok(sent.every(m => m.html.includes('Open Clearpath') && m.idempotencyKey));
  const again = await runReports({ db: serviceDb(TUESDAY_8AM), send: ok, appUrl: APP });
  assert.equal(again.due, 0, 'nobody is emailed twice');

  const fail = async () => { throw new Error('provider down'); };
  for (let i = 0; i < 3; i++) await runReports({ db: serviceDb(MONDAY_8AM), send: fail, appUrl: APP });
  const left = await runReports({ db: serviceDb(MONDAY_8AM), send: ok, appUrl: APP });
  assert.equal(left.due, 0, 'given up after three failures');
  const [{ n }] = await db.query(`select count(*)::int n from report_sends where status = 'failed' and attempts = 3`).then(r => r.rows);
  assert.ok(n > 0);
  const dirSends = await as(U.director, `select count(*)::int n from report_sends`);
  assert.ok(dirSends[0].n > 0, 'a director can see the send log for their company');
  assert.equal((await as(U.transport, `select count(*)::int n from report_sends`))[0].n, 0, 'others cannot');
});

test('Nightly recalculation covers companies with a working connection only', async () => {
  await db.query(`update connections set last_success_at = null`);
  assert.equal((await asService(`select run_nightly(2) r`))[0].r.values, 0);
  await db.query(`insert into connections (company_id, system, label, method, status, feeds, last_success_at)
    values ($1, 'vigo', 'Nightly test feed', 'api', 'connected', '{jobs}', now())`, [A]);
  const r = (await asService(`select run_nightly(2) r`))[0].r;
  assert.deepEqual(r.companies.map(c => c.company), ['Demo Haulage Ltd']);
  assert.ok(r.values > 0);
});

// ---------------------------------------------------------------- the email layout
test('Daily email: subject, red and amber first, stale feeds named, everything escaped', async () => {
  const d = await digest(U.director);
  d.today = d.day;
  d.stale_sources = ['jobs'];
  d.name = 'Dana <b>Director</b>';
  const m = renderDaily(d, { appUrl: APP });
  assert.match(m.subject, /^Demo Haulage Ltd daily: \d+ red/);
  assert.ok(m.html.indexOf('Needs attention') < m.html.indexOf('Open Clearpath'));
  assert.match(m.html, /Not updated:<\/strong> jobs/);
  assert.ok(!m.html.includes('<b>Director</b>'), 'names are escaped');
  assert.ok(m.html.includes(`href="${APP}/"`));
  assert.match(m.text, /Needs attention:\n- /);
  assert.ok(!/<script/i.test(m.html));
});

test('Weekly email: a row per figure with seven day squares, and the week’s actions', async () => {
  const d = await digest(U.director, 'weekly');
  d.trend = { 'service.otif': ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']
    .map((day, i) => ({ day, value: 90 + i, status: i < 2 ? 'red' : 'amber' })) };
  const m = renderWeekly(d, { appUrl: APP });
  assert.match(m.subject, /^Demo Haulage Ltd week 11 Nov to 17 Nov/);
  assert.match(m.html, /2 red days/);
  assert.match(m.html, /Actions this week/);
  assert.equal(esc(`<a href="x">`), '&lt;a href=&quot;x&quot;&gt;');
});
