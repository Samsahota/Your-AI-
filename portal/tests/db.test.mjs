// Database tests: access levels, two-factor enforcement, company separation, measures, colours,
// connections and the library. Each query runs as Supabase runs it: role "authenticated" with
// the user's token claims. Needs the local database:  npm run db:reset && npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const URL = process.env.PGURL || 'postgres://postgres@localhost:54329/portal_test?host=/tmp';
const U = {
  admin: '10000000-0000-4000-8000-000000000001', director: '10000000-0000-4000-8000-000000000002',
  consultant: '10000000-0000-4000-8000-000000000003', ops: '10000000-0000-4000-8000-000000000004',
  transport: '10000000-0000-4000-8000-000000000005', warehouse: '10000000-0000-4000-8000-000000000006',
  testTm: '10000000-0000-4000-8000-000000000007', leaver: '10000000-0000-4000-8000-000000000008',
  second: '10000000-0000-4000-8000-000000000009',
};
const A = '20000000-0000-4000-8000-00000000000a', B = '20000000-0000-4000-8000-00000000000b';
const DAY = '2026-11-17';
let db;
before(async () => { db = new pg.Client({ connectionString: URL }); await db.connect(); await db.query('begin'); });
after(async () => { await db.query('rollback'); await db.end(); });   // every change is rolled back

async function as(user, sql, params = [], aal = 'aal2') {
  await db.query('savepoint q');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated', aal })]);
    await db.query('set local role authenticated');
    const r = await db.query(sql, params);
    await db.query('reset role'); await db.query('release savepoint q');
    return r.rows;
  } catch (e) { await db.query('rollback to savepoint q'); await db.query('reset role'); throw e; }
}
const count = async (user, table, aal) => (await as(user, `select count(*)::int n from ${table}`, [], aal))[0].n;
const rejects = async (p, re) => assert.rejects(p, e => re.test(e.message), `expected error ${re}`);
const dash = async (user, day = DAY) => (await as(user, `select dashboard($1) d`, [day]))[0].d;
const measure = (d, code) => d.measures.find(m => m.code === code);

test('Two-factor: without the authenticator code nobody sees anything', async () => {
  assert.equal(await count(U.director, 'jobs', 'aal1'), 0);
  assert.equal(await count(U.director, 'incidents', 'aal1'), 0);
  assert.equal(await count(U.admin, 'jobs', 'aal1'), 0);
  await rejects(as(U.director, `select dashboard($1)`, [DAY], 'aal1'), /two-factor/);
  const [{ a }] = await as(U.director, `select my_access() a`, [], 'aal1');
  assert.equal(a.mfa, false); assert.equal(a.areas.cost, 'none');
});

test('Director: full dashboard with the expected colours', async () => {
  const d = await dash(U.director);
  assert.equal(d.company, 'Demo Haulage Ltd');
  assert.deepEqual(Object.fromEntries(Object.entries(d.quadrants).map(([k, v]) => [k, v.status])),
    { hs: 'amber', service: 'red', cost: 'red', people: 'amber', compliance: 'red' });
  assert.equal(measure(d, 'service.otif').value, 80);
  assert.equal(measure(d, 'service.on_time').value, 90);
  assert.equal(measure(d, 'cost.revenue_vs_plan').value, 88.2);
  assert.equal(measure(d, 'cost.job_cost_vs_plan').value, 108.3);
  assert.equal(measure(d, 'cost.cost_per_case').status, 'no_target');   // no target set yet: never shown as green
  assert.equal(measure(d, 'people.absence_pct').value, 5);
  assert.equal(measure(d, 'hs.days_since_accident').value, 47);
  assert.deepEqual(d.measures.filter(m => m.headline).map(m => m.code).sort(),
    ['compliance.infringements_7d', 'cost.revenue_vs_plan', 'hs.accidents_mtd', 'service.otif']);
  assert.ok(Array.isArray(d.connections));
});

test('Transport Manager: transport figures only, no money, no personal detail', async () => {
  const d = await dash(U.transport);
  assert.equal(d.quadrants.cost.status, 'no_access');
  assert.equal(d.measures.filter(m => m.quadrant === 'cost').length, 0);
  assert.equal(measure(d, 'people.absence_pct').value, 10);             // transport staff only
  assert.equal(measure(d, 'people.absence_pct').scope, 'transport');
  assert.equal(measure(d, 'service.picks_per_hour'), undefined);       // warehouse measure hidden
  assert.equal(d.connections, null);
  for (const t of ['job_costs', 'cost_daily', 'revenue_plan', 'pnl_lines', 'payroll_periods', 'hr_cases', 'warehouse_daily']) {
    assert.equal(await count(U.transport, t), 0, t);
  }
  assert.equal(await count(U.transport, 'jobs'), 10);
  assert.equal(await count(U.transport, 'staff'), 10);                 // transport staff only
  assert.equal(await count(U.transport, 'compliance_items'), 1);       // the MOT, not the BRC action
  const counts = await as(U.transport, `select * from hr_case_counts()`);
  assert.deepEqual(counts.map(c => [c.division, c.kind, Number(c.open_cases)]), [['transport', 'disciplinary', 1]]);
  assert.equal(await count(U.transport, 'profiles'), 1);              // only their own profile
  assert.equal(await count(U.testTm, 'jobs'), 10);                     // Clearpath test login behaves the same
});

test('Warehouse Manager: warehouse cost per case yes, transport jobs and company revenue no', async () => {
  const d = await dash(U.warehouse);
  assert.equal(measure(d, 'cost.cost_per_case').value, 1.5);
  assert.equal(measure(d, 'cost.revenue_vs_plan'), undefined);
  assert.equal(measure(d, 'cost.job_cost_vs_plan'), undefined);
  assert.equal(measure(d, 'people.holiday_pct').value, 20);
  assert.equal(await count(U.warehouse, 'jobs'), 0);
  assert.equal(await count(U.warehouse, 'job_costs'), 0);
  assert.equal(await count(U.warehouse, 'warehouse_daily'), 1);
  assert.equal(await count(U.warehouse, 'cost_daily'), 1);
});

test('Operations: costs yes, company P&L, payroll and case detail no', async () => {
  assert.equal(await count(U.ops, 'job_costs'), 10);
  for (const t of ['pnl_lines', 'payroll_periods', 'hr_cases']) assert.equal(await count(U.ops, t), 0, t);
  assert.equal(await count(U.ops, 'staff'), 20);
});

test('Consultant: sees everything, but cannot manage users or access', async () => {
  for (const t of ['pnl_lines', 'payroll_periods', 'hr_cases', 'job_costs']) assert.ok(await count(U.consultant, t) > 0, t);
  assert.equal(await count(U.consultant, 'profiles'), 1);
  await rejects(as(U.consultant, `select set_access_override('transport', 'cost', 'own')`), /Only a director/);
  await rejects(as(U.consultant, `select set_user_status($1, 'suspended')`, [U.ops]), /permission/);
});

test('Companies are separated', async () => {
  assert.equal(await count(U.second, 'jobs'), 1);
  assert.equal(await count(U.second, 'incidents'), 1);
  assert.equal(await count(U.second, 'staff'), 0);
  assert.equal(await count(U.director, 'jobs'), 10);
  assert.equal((await as(U.director, `select count(*)::int n from incidents where company_id = $1`, [B]))[0].n, 0);
  assert.equal((await as(U.second, `select count(*)::int n from measure_values where company_id = $1`, [A]))[0].n, 0);
  assert.equal(await count(U.second, 'library_documents'), 0);   // not subscribed to the master policy
});

test('Platform admin: every company, and can recompute; a suspended user sees nothing', async () => {
  assert.equal(await count(U.admin, 'companies'), 2);
  assert.equal(await count(U.admin, 'jobs'), 11);
  const [{ n }] = await as(U.admin, `select compute_measures($1, $2) n`, [A, DAY]);
  assert.equal(n, 46);
  await rejects(as(U.director, `select compute_measures($1, $2)`, [A, DAY]), /Only the platform/);
  assert.equal(await count(U.leaver, 'jobs'), 0);
  assert.equal(await count(U.leaver, 'companies'), 0);
});

test('Targets: only the director changes them, and the colours follow', async () => {
  await rejects(as(U.transport, `select set_threshold('service.otif', 75, 70)`), /Only a director/);
  await rejects(as(U.director, `select set_threshold('service.otif', 70, 75)`), /amber level must be at or below/);
  await as(U.director, `select set_threshold('service.otif', 75, 70)`);
  await as(U.director, `select set_threshold('service.on_time', 85, 80)`);
  const d = await dash(U.director);
  assert.equal(measure(d, 'service.otif').status, 'green');
  assert.equal(d.quadrants.service.status, 'green');
  assert.equal(d.quadrants.service.incomplete, true);                  // picks per hour has no target yet
  const [log] = await as(U.director, `select action, target from audit_log where action = 'threshold_changed' order by id limit 1`);
  assert.deepEqual([log.action, log.target], ['threshold_changed', 'service.otif']);
});

test('Access override: the director lets the Transport Manager see transport costs', async () => {
  await as(U.director, `select set_access_override('transport', 'cost', 'own')`);
  assert.equal(await count(U.transport, 'job_costs'), 10);
  assert.equal(await count(U.transport, 'cost_daily'), 0);             // warehouse costs still hidden
  const d = await dash(U.transport);
  assert.equal(measure(d, 'cost.job_cost_vs_plan').value, 108.3);
  assert.equal(measure(d, 'cost.revenue_vs_plan'), undefined);          // company-wide figure stays hidden
  await rejects(as(U.director, `select set_access_override('director', 'cost', 'none')`), /cannot be changed/);
});

test('Connections: a failing feed marks its figures as not updated; secrets are refused', async () => {
  await rejects(as(U.director, `select save_connection($1, 'vigo', 'Jobs', 'api', '{jobs}')`, [A]), /Only the platform admin/);
  await rejects(as(U.admin, `select save_connection($1, 'vigo', 'Jobs', 'api', '{jobs}', 'nightly', '{"api_key": "abc"}')`, [A]), /vault/);
  const [{ id }] = await as(U.admin, `select save_connection($1, 'vigo', 'Jobs', 'api', '{jobs,job_costs}', 'nightly', '{"mapping": {}}', 'VIGO_KEY_DEMO') id`, [A]);
  await as(U.admin, `select record_run($1, 'ok', 10, 10, '[{"name": "job count", "expected": 10, "actual": 9, "passed": false}]')`, [id]);
  const [c] = await as(U.admin, `select status, last_error from connections where id = $1`, [id]);
  assert.equal(c.status, 'failing');
  const d = await dash(U.director);
  assert.equal(measure(d, 'service.otif').status, 'stale');
  assert.equal(measure(d, 'cost.job_cost_vs_plan').status, 'stale');
  assert.equal(d.quadrants.service.incomplete, true);
  assert.deepEqual(d.stale_sources.sort(), ['job_costs', 'jobs']);
  await as(U.admin, `select record_run($1, 'ok', 10, 10, '[{"name": "job count", "expected": 10, "actual": 10, "passed": true}]')`, [id]);
  // Back to trusted figures. (Green, because the earlier test lowered the OTIF target to 75%.)
  assert.equal(measure(await dash(U.director), 'service.otif').status, 'green');
  assert.equal(await count(U.transport, 'connections'), 0);
  assert.equal(await count(U.director, 'connections'), 1);
});

test('Comments follow access to the area', async () => {
  await as(U.transport, `select add_comment('hs', 'hs.near_misses_open', 'Racking inspected, closing today')`);
  await rejects(as(U.transport, `select add_comment('pnl', null, 'test')`), /do not have access/);
  assert.equal(await count(U.director, 'comments'), 1);
  assert.equal(await count(U.second, 'comments'), 0);
});

test('Policy library: master documents reach subscribed companies; staff sign the current version', async () => {
  const doc = '60000000-0000-4000-8000-000000000001';
  await rejects(as(U.director, `select publish_document_version($1, 'library/manual-handling-v1.pdf', 'First issue')`, [doc]), /cannot publish/);
  await rejects(as(U.transport, `select acknowledge_document($1)`, [doc]), /not been published/);
  const [{ v }] = await as(U.admin, `select publish_document_version($1, 'library/manual-handling-v1.pdf', 'First issue') v`, [doc]);
  assert.equal(v, 1);
  await as(U.transport, `select acknowledge_document($1)`, [doc]);
  assert.equal(await count(U.transport, 'acknowledgements'), 1);
  assert.equal(await count(U.director, 'acknowledgements'), 1);
  await rejects(as(U.second, `select acknowledge_document($1)`, [doc]), /not available/);
});

test('Users: directors suspend leavers in their own company only', async () => {
  await as(U.director, `select set_user_status($1, 'suspended')`, [U.ops]);
  assert.equal(await count(U.ops, 'jobs'), 0);
  await rejects(as(U.second, `select set_user_status($1, 'active')`, [U.ops]), /permission/);
  await rejects(as(U.director, `select set_user_status($1, 'suspended')`, [U.director]), /own status/);
});
