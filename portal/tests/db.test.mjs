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
// As the platform's own server functions run (the service key).
async function asService(sql, params = []) {
  await db.query('savepoint s');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'service_role' })]);
    await db.query('set local role service_role');
    const r = await db.query(sql, params);
    await db.query('reset role'); await db.query('release savepoint s');
    return r.rows;
  } catch (e) { await db.query('rollback to savepoint s'); await db.query('reset role'); throw e; }
}
const count = async (user, table, aal) => (await as(user, `select count(*)::int n from ${table}`, [], aal))[0].n;
// A direct (superuser) query inside its own savepoint, so an expected error doesn't abort the test run.
async function raw(sql, params = []) {
  await db.query('savepoint r');
  try { const r = await db.query(sql, params); await db.query('release savepoint r'); return r.rows; }
  catch (e) { await db.query('rollback to savepoint r'); throw e; }
}
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
  assert.equal(await count(U.transport, 'people_events'), 2);          // transport absences and overtime only
  assert.equal(await count(U.warehouse, 'people_events'), 2);          // warehouse holidays only
  assert.equal(await count(U.ops, 'people_events'), 4);
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
  assert.equal(d.quadrants.service.status, 'no_target');                // figures exist, targets not set yet
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
  await rejects(as(U.admin, `select record_run($1, 'ok', 1, 1)`, [id]), /permission denied/);   // server only
  await asService(`select record_run($1, 'ok', 10, 10, '[{"name": "job count", "expected": 10, "actual": 9, "passed": false}]')`, [id]);
  const [c] = await as(U.admin, `select status, last_error from connections where id = $1`, [id]);
  assert.equal(c.status, 'failing');
  const d = await dash(U.director);
  assert.equal(measure(d, 'service.otif').status, 'stale');
  assert.equal(measure(d, 'cost.job_cost_vs_plan').status, 'stale');
  assert.equal(d.quadrants.service.incomplete, true);
  assert.deepEqual(d.stale_sources.sort(), ['job_costs', 'jobs']);
  await asService(`select record_run($1, 'ok', 10, 10, '[{"name": "job count", "expected": 10, "actual": 10, "passed": true}]')`, [id]);
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

// ---------------------------------------------------------------- screen functions
test('Incidents: anyone with H&S access reports; only managers close, and only with no open actions', async () => {
  await rejects(as(U.transport, `select log_incident('near_miss', now() + interval '1 day', 'x')`), /future/);
  await rejects(as(U.transport, `select log_incident('near_miss', now(), '  ')`), /Describe/);
  const [{ id }] = await as(U.transport, `select log_incident('near_miss', '2026-11-17 08:00+00', 'Forklift reversed without banksman', 'warehouse') id`);
  await as(U.warehouse, `select log_incident('personal_accident', '2026-11-17 09:00+00', 'Cut hand on stretch-wrap cutter', 'warehouse', 'minor')`);
  assert.equal((await as(U.second, `select count(*)::int n from incidents where id = $1`, [id]))[0].n, 0);
  await rejects(as(U.transport, `select update_incident($1, 'closed', 0)`, [id]), /Only a director/);
  await rejects(as(U.consultant, `select update_incident($1, 'closed', 2)`, [id]), /Close the open actions/);
  await as(U.consultant, `select update_incident($1, 'closed', 0)`, [id]);
  assert.equal((await as(U.director, `select status from incidents where id = $1`, [id]))[0].status, 'closed');
});

test('Library status: everyone sees their own signature; only full Compliance access sees the counts', async () => {
  const doc = '60000000-0000-4000-8000-000000000001';
  await as(U.admin, `select publish_document_version($1, 'library/mh-v2.pdf', 'Second issue')`, [doc]);
  await as(U.transport, `select acknowledge_document($1)`, [doc]);
  const [t] = await as(U.transport, `select * from library_status()`);
  assert.deepEqual([t.title, t.i_signed, t.signed_count, t.user_count], ['Manual handling policy', true, null, null]);
  const [d] = await as(U.director, `select * from library_status()`);
  assert.equal(d.i_signed, false);
  assert.deepEqual([d.signed_count, d.user_count], [1, 5]);   // 5 active users (two suspended earlier); 1 has signed version 2
  assert.equal((await as(U.second, `select * from library_status()`)).length, 0);
  assert.equal((await as(U.admin, `select * from library_status($1)`, [A])).length, 1);
  await rejects(as(U.director, `select create_document(null, 'hr', 'Master doc', 'x')`), /Only the platform admin/);
  const [{ id }] = await as(U.director, `select create_document($1, 'hr', 'Holiday booking procedure', 'Dana Director') id`, [A]);
  assert.ok(id);
  await rejects(as(U.second, `select create_document($1, 'hr', 'x', 'y')`, [A]), /Only a director/);
});

test('Companies and invitations: platform admin creates companies; directors invite only into their own', async () => {
  await rejects(as(U.director, `select create_company('X Ltd', 'x-ltd', 'standard', 5000, 500)`), /Only the platform admin/);
  const [{ id: co }] = await as(U.admin, `select create_company('Third Haulage Ltd', 'third-haulage', 'standard', 5000, 500) id`);
  assert.equal((await as(U.admin, `select status from companies where id = $1`, [co]))[0].status, 'setup');
  // The invite function runs with the service key; here we call the same database step directly.
  await raw(`insert into auth.users (id, email) values ('10000000-0000-4000-8000-0000000000aa', 'newtm@demo.test'), ('10000000-0000-4000-8000-0000000000ab', 'x@demo.test')`);
  await raw(`select app.add_profile($1, '10000000-0000-4000-8000-0000000000aa', $2, 'transport', 'New Transport', 'NewTM@demo.test', null, 'transport', false)`, [U.director, A]);
  await assert.rejects(raw(`select app.add_profile($1, '10000000-0000-4000-8000-0000000000ab', $2, 'transport', 'X', 'x@demo.test', null, 'transport', false)`, [U.director, B]), /Only a director or the platform admin/);
  await assert.rejects(raw(`select app.add_profile($1, '10000000-0000-4000-8000-0000000000ab', $2, 'platform_admin', 'X', 'x@demo.test', null, null, false)`, [U.admin, A]), /Your AI only/);
  await assert.rejects(raw(`select app.add_profile($1, '10000000-0000-4000-8000-0000000000ab', $2, 'warehouse', 'X', 'x@demo.test', null, null, false)`, [U.director, A]), /transport or warehouse/);
  await rejects(as(U.director, `select add_profile_for_invite($1, '10000000-0000-4000-8000-0000000000ab', $2, 'transport', 'X', 'x@demo.test', null, 'transport', false)`, [U.director, A]), /permission denied/);
  const NEW = '10000000-0000-4000-8000-0000000000aa';
  assert.equal(await count(NEW, 'jobs'), 0);                                   // invited, not yet active
  await rejects(as(NEW, `select accept_invitation()`, [], 'aal1'), /two-factor/);
  await as(NEW, `select accept_invitation()`);
  assert.equal(await count(NEW, 'jobs'), 10);
  const [{ p }] = await as(NEW, `select my_profile() p`);
  assert.deepEqual([p.email, p.status, p.company], ['newtm@demo.test', 'active', 'Demo Haulage Ltd']);
});

test('Dashboard: the platform admin picks a company; nobody else can', async () => {
  const d = (await as(U.admin, `select dashboard('2026-11-17', $1) d`, [B]))[0].d;
  assert.equal(d.company, 'Second Haulier Ltd');
  const own = (await as(U.director, `select dashboard('2026-11-17', $1) d`, [B]))[0].d;
  assert.equal(own.company, 'Demo Haulage Ltd');
  await rejects(as(U.admin, `select dashboard('2026-11-17')`), /Choose a company/);
});

test('File import: only checked records are written; a failed check writes nothing and flags the connection', async () => {
  const [{ id }] = await as(U.admin, `select save_connection($1, 'sharepoint', 'Accident log', 'file', '{incidents}', 'on_receipt', '{}'::jsonb, null, 'configured') id`, [A]);
  const recs = JSON.stringify([{ external_ref: 'SP-1', kind: 'Near miss', occurred_at: '2026-11-16T10:00:00Z', division: 'Transport', description: 'Trailer door swung open', status: 'Open', actions_open: 1 }]);
  await rejects(as(U.director, `select import_records($1, 'incidents', $2, '[]', 1)`, [id, recs]), /Only the platform/);
  await rejects(as(U.admin, `select import_records($1, 'jobs', $2, '[]', 1)`, [id, recs]), /does not fill jobs/);
  const bad = (await as(U.admin, `select import_records($1, 'incidents', $2, '[{"name":"rows readable","passed":false}]', 1) r`, [id, recs]))[0].r;
  assert.deepEqual([bad.status, bad.written], ['check_failed', 0]);
  assert.equal((await as(U.admin, `select status from connections where id = $1`, [id]))[0].status, 'failing');
  const ok = (await as(U.admin, `select import_records($1, 'incidents', $2, '[{"name":"rows readable","passed":true}]', 1) r`, [id, recs]))[0].r;
  assert.deepEqual([ok.status, ok.written], ['ok', 1]);
  await as(U.admin, `select import_records($1, 'incidents', $2, '[{"name":"rows readable","passed":true}]', 1)`, [id, recs]);   // same file again: updates, no duplicate
  assert.equal((await as(U.director, `select count(*)::int n from incidents where source = 'sharepoint'`))[0].n, 1);
  assert.equal((await as(U.admin, `select status from connections where id = $1`, [id]))[0].status, 'connected');
});

test('Signed-in users cannot write to or empty any table directly; everything goes through checked functions', async () => {
  await rejects(as(U.director, `insert into incidents (company_id, kind, occurred_at, description) values ($1, 'near_miss', now(), 'x')`, [A]), /permission denied/);
  await rejects(as(U.director, `update jobs set status = 'cancelled'`), /permission denied/);
  await rejects(as(U.director, `delete from comments`), /permission denied/);
  await rejects(as(U.admin, `truncate audit_log`), /permission denied/);
  await rejects(as(U.director, `select add_profile_for_invite($1, $1, $2, 'transport', 'X', 'x@x.test', null, 'transport', false)`, [U.director, A]), /permission denied/);
});
