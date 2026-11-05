// Database tests: reconciliation, role security (RLS) and workflow rules.
// Each query runs exactly as Supabase's API runs it: SET ROLE authenticated + JWT claims for the user.
// Needs a Postgres with the stub, migrations and demo seed applied:  PGURL=postgres://postgres@/thp?host=/tmp&port=54329 npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const URL = process.env.PGURL || 'postgres://postgres@localhost:54329/thp?host=/tmp';
const U = { paul: '00000000-0000-4000-8000-000000000001', lisa: '00000000-0000-4000-8000-000000000002', tm: '00000000-0000-4000-8000-000000000003', d04: '00000000-0000-4000-8000-000000000004', cust: '00000000-0000-4000-8000-000000000005' };
let db;
before(async () => { db = new pg.Client({ connectionString: URL }); await db.connect(); await db.query('begin'); });
after(async () => { await db.query('rollback'); await db.end(); });   // every change is rolled back

async function as(user, sql, params = []) {
  await db.query('savepoint q');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated' })]);
    await db.query('set local role authenticated');
    const r = await db.query(sql, params);
    await db.query('reset role'); await db.query('release savepoint q');
    return r.rows;
  } catch (e) { await db.query('rollback to savepoint q'); await db.query('reset role'); throw e; }
}
const rejects = async (p, re) => { await assert.rejects(p, e => re.test(e.message), `expected error ${re}`); };
const num = v => v == null ? null : Number(v);

test('Director: yesterday reconciles to the canonical figures', async () => {
  const [d] = await as(U.paul, `select * from v_day_summary where date = '2026-11-04'`);
  assert.deepEqual([num(d.delivered), num(d.on_time), num(d.late)], [20, 18, 2]);
  assert.deepEqual([num(d.revenue), num(d.planned_cost), num(d.actual_cost)], [16490, 10475, 11110]);
  assert.equal(((d.revenue - d.planned_cost) / d.revenue * 100).toFixed(2), '36.48');
  assert.equal(((d.revenue - d.actual_cost) / d.revenue * 100).toFixed(2), '32.63');
  const [w] = await as(U.paul, `select sum(planned_cost) p, sum(actual_cost) a from v_day_summary where date between '2026-11-02' and '2026-11-04'`);
  assert.deepEqual([num(w.p), num(w.a)], [31225, 32120]);
  const flagged = await as(U.paul, `select f.job_id from job_financials f join jobs j on j.tenant_id=f.tenant_id and j.id=f.job_id
    where j.status='delivered' and f.actual_cost is not null and (f.actual_cost-f.planned_cost)/f.planned_cost*100 > 10 order by 1`);
  assert.deepEqual(flagged.map(r => r.job_id), ['TH-001', 'TH-002', 'TH-003']);
});

test('Director: PODs, cash, headroom and today cover reconcile', async () => {
  const [p] = await as(U.paul, `select * from v_pod_billing`);
  assert.deepEqual([p.pods_missing, p.not_invoiced, p.blocked_by_pod, p.ready_to_invoice].map(Number), [4, 7, 4, 3]);
  const b = await as(U.paul, `select bucket, amount from v_debtor_ageing order by bucket`);
  assert.deepEqual(Object.fromEntries(b.map(r => [r.bucket, Number(r.amount)])), { '0-30': 28000, '31-60': 43000, '61-90': 18000, '90+': 9000 });
  const [h] = await as(U.paul, `select * from v_funding_headroom`);
  assert.deepEqual([num(h.eligible), num(h.funding_value), num(h.headroom)], [80000, 68000, 17000]);
  const [c] = await as(U.paul, `select * from v_today_cover`);
  assert.deepEqual([c.booked, c.confirmed, c.proposed, c.uncovered].map(Number), [21, 19, 0, 2]);
});

test('Transport: no monetary data is readable anywhere', async () => {
  for (const t of ['job_financials', 'job_variances', 'recharge_candidates', 'recharges', 'rate_cards', 'invoices', 'payments', 'funding_positions']) {
    const r = await as(U.tm, `select count(*)::int n from ${t}`); assert.equal(r[0].n, 0, t);
  }
  const [d] = await as(U.tm, `select * from v_day_summary where date = '2026-11-04'`);
  assert.equal(d.delivered, '20'); assert.equal(d.revenue, null);
  const [n] = await as(U.tm, `select count(*)::int n from jobs`); assert.equal(n.n, 122);
  await rejects(as(U.tm, `select * from activity`), /permission denied/);
  await rejects(as(U.tm, `select * from integration_credentials`), /permission denied/);
});

test('Operations: job money yes, debtors and funding no', async () => {
  assert.equal((await as(U.lisa, `select count(*)::int n from job_financials`))[0].n, 122);
  for (const t of ['invoices', 'payments', 'funding_positions']) assert.equal((await as(U.lisa, `select count(*)::int n from ${t}`))[0].n, 0, t);
  assert.equal((await as(U.lisa, `select count(*)::int n from v_funding_headroom`))[0].n, 0);
});

test('Scene B: recharges — drafts, limits, roles, and revenue unchanged', async () => {
  await as(U.lisa, `select draft_recharge('TH-001', 180, null)`);
  await rejects(as(U.lisa, `select draft_recharge('TH-001', 180, null)`), /already exists/);
  await rejects(as(U.lisa, `select draft_recharge('TH-002', 80, null)`), /cannot exceed .*£75/);
  await rejects(as(U.lisa, `select draft_recharge('TH-004', 10, null)`), /no identified recharge/);
  await rejects(as(U.tm, `select draft_recharge('TH-002', 75, null)`), /Only directors and operations/);
  await as(U.lisa, `select draft_recharge('TH-002', 75, 'Waiting and tolls')`);
  const [s] = await as(U.paul, `select sum(amount)::int total from recharges where status='draft'`); assert.equal(s.total, 255);
  const [d] = await as(U.paul, `select revenue from v_day_summary where date = '2026-11-04'`); assert.equal(num(d.revenue), 16490);
  const id = (await as(U.lisa, `select id from recharges where job_id='TH-002'`))[0].id;
  await as(U.lisa, `select set_recharge_status($1, 'cancelled')`, [id]);
  await as(U.lisa, `select set_recharge_status($1, 'draft')`, [id]);
  await as(U.lisa, `select edit_recharge($1, 'Updated note')`, [id]);
});

test('Scene B: cover — D07 rejected, D12 proposed, 20/21 planned', async () => {
  await rejects(as(U.lisa, `select propose_cover('TODAY-01', 'D07')`), /D07 has an estimated 2h 10m .* not planning-eligible/);
  await as(U.lisa, `select propose_cover('TODAY-01', 'D12')`);
  const [c] = await as(U.paul, `select * from v_today_cover`);
  assert.deepEqual([Number(c.confirmed) + Number(c.proposed), Number(c.uncovered)], [20, 1]);
  await rejects(as(U.lisa, `select propose_cover('TODAY-02', 'D07')`), /vehicle is unavailable/);
  const [j] = await as(U.paul, `select proposed_driver_id, driver_id from jobs where id='TODAY-01'`);
  assert.deepEqual([j.proposed_driver_id, j.driver_id], ['D12', null]);  // never written as a confirmed (Vigo) allocation
});

test('Scene C: transport follow-up; activity hides £ from transport', async () => {
  await as(U.tm, `select record_followup('CMP-01', 'Licence seen; DVLA check booked', 'Reminder issued to driver', '2026-11-12')`);
  const [c] = await as(U.paul, `select status from compliance_items where id='CMP-01'`); assert.equal(c.status, 'followup');
  await rejects(as(U.lisa, `select record_followup('CMP-02', 'x', 'y', null)`), /Only transport and directors/);
  const feedT = await as(U.tm, `select next from activity_feed`);
  assert.ok(feedT.length > 0 && feedT.every(r => !String(r.next).includes('£')), 'transport feed contains £');
  const feedP = await as(U.paul, `select next, actor_name from activity_feed where action = 'Drafted recharge'`);
  assert.ok(feedP.some(r => r.next.includes('£180')) && feedP.every(r => r.actor_name === 'Lisa Grant'));
});

test('Scene E: driver sees only own work and must follow the check-in order', async () => {
  const jobs = await as(U.d04, `select id, driver_id from jobs order by id`);
  assert.ok(jobs.length >= 4 && jobs.every(r => r.driver_id === 'D04'), 'driver sees only own jobs');
  assert.ok(['TODAY-05', 'TODAY-19', 'TH-007'].every(id => jobs.some(r => r.id === id)));
  const [all] = await as(U.paul, `select count(*)::int n from jobs where driver_id = 'D04'`);
  assert.ok(jobs.length <= all.n);
  assert.equal((await as(U.d04, `select count(*)::int n from job_financials`))[0].n, 0);
  await rejects(as(U.d04, `select driver_checkin('TODAY-05', 'depart')`), /walkaround/);
  await rejects(as(U.d04, `select driver_checkin('TODAY-03', 'depart')`), /not assigned to you/);
  await as(U.d04, `select submit_walkaround('TODAY-05', $1::jsonb)`, [JSON.stringify([{ item: 'Tyres', result: 'pass' }, { item: 'Mirrors', result: 'defect', severity: 'minor', note: 'Nearside mirror cracked' }])]);
  const [d] = await as(U.tm, `select count(*)::int n from defects where vehicle_id='V011' and status='open'`); assert.equal(d.n, 1);
  await rejects(as(U.d04, `select driver_checkin('TODAY-05', 'arrive')`), /Depart before arriving/);
  for (const s of ['depart', 'arrive', 'unloading', 'complete']) await as(U.d04, `select driver_checkin('TODAY-05', $1)`, [s]);
  // accidental "complete": undo restores on-site and cancels the queued customer email, then redo
  assert.equal((await as(U.d04, `select undo_checkin('TODAY-05') as s`))[0].s, 'complete');
  const [u] = await as(U.paul, `select status, pod_status, invoice_status from jobs where id='TODAY-05'`);
  assert.deepEqual([u.status, u.pod_status, u.invoice_status], ['on_site', 'n/a', 'not_due']);
  assert.deepEqual((await as(U.paul, `select status from notifications`)).map(x => x.status), ['cancelled']);
  await rejects(as(U.lisa, `select undo_checkin('TODAY-05')`), /Only drivers/);
  await db.query(`update notifications set status = 'cancelled'`);
  await as(U.d04, `select driver_checkin('TODAY-05', 'complete')`);
  await db.query(`delete from notifications where status = 'cancelled'`);
  const [j] = await as(U.paul, `select status, pod_status, invoice_status from jobs where id='TODAY-05'`);
  assert.deepEqual([j.status, j.pod_status, j.invoice_status], ['delivered', 'missing', 'pending']);
  const n = await as(U.paul, `select contact_id, status, subject from notifications`);
  assert.deepEqual(n.map(x => [x.contact_id, x.status]), [['CT01', 'pending']]);
  // POD: storage object first (policy-checked), then record
  const T = (await as(U.d04, `select tenant_id from jobs where id='TODAY-05'`))[0].tenant_id;
  await as(U.d04, `insert into storage.objects (bucket_id, name, owner) values ('pods', $1, auth.uid())`, [`${T}/TODAY-05/pod.jpg`]);
  await rejects(as(U.d04, `insert into storage.objects (bucket_id, name) values ('pods', $1)`, [`${T}/TODAY-03/pod.jpg`]), /row-level security/);
  await as(U.d04, `select record_pod('TODAY-05', $1, 'pod.jpg')`, [`${T}/TODAY-05/pod.jpg`]);
  await rejects(as(U.d04, `select undo_checkin('TODAY-05')`), /POD has been recorded/);
  const [p] = await as(U.paul, `select * from v_pod_billing`);
  assert.deepEqual([p.pods_missing, p.not_invoiced, p.ready_to_invoice].map(Number), [4, 8, 4]);
});

test('Safety defect blocks departure until transport rectifies it', async () => {
  // simulate the TODAY-19 check (same vehicle V011): add a safety defect, then try to depart
  await as(U.d04, `select submit_walkaround('TODAY-19', $1::jsonb)`, [JSON.stringify([{ item: 'Brakes', result: 'defect', severity: 'safety', note: 'Air leak' }])]);
  await rejects(as(U.d04, `select driver_checkin('TODAY-19', 'depart')`), /safety-critical defect/);
  const id = (await as(U.tm, `select id from defects where vehicle_id='V011' and severity='safety' and status='open'`))[0].id;
  await rejects(as(U.lisa, `select resolve_defect($1, 'fixed')`, [id]), /Only transport/);
  await as(U.tm, `select resolve_defect($1, 'Air line replaced by workshop, tested')`, [id]);
  await as(U.d04, `select driver_checkin('TODAY-19', 'depart')`);
});

test('Scene F: customer sees only shared jobs and permitted fields', async () => {
  const rows = await as(U.cust, `select * from portal_deliveries order by job_id`);
  assert.deepEqual(rows.map(r => r.job_id), ['TH-006', 'TODAY-05']);
  assert.ok(rows.every(r => r.invoice_amount === null), 'invoice hidden unless enabled');
  assert.ok(rows.find(r => r.job_id === 'TODAY-05').pod_path.endsWith('pod.jpg'));
  assert.deepEqual((await as(U.cust, `select id from customers`)).map(r => r.id), ['C01'], 'only their own company');
  for (const t of ['jobs', 'job_financials', 'vehicles', 'drivers', 'invoices', 'actions']) assert.equal((await as(U.cust, `select count(*)::int n from ${t}`))[0].n, 0, t);
  assert.deepEqual((await as(U.cust, `select id from contacts`)).map(r => r.id), ['CT01']);
  assert.equal((await as(U.cust, `select count(*)::int n from activity_feed`))[0].n, 0);
  const T = (await as(U.paul, `select tenant_id from jobs where id='TODAY-05'`))[0].tenant_id;
  assert.equal((await as(U.cust, `select count(*)::int n from storage.objects where name = $1`, [`${T}/TODAY-05/pod.jpg`]))[0].n, 1);
  await rejects(as(U.cust, `select share_job('TH-011', 'CT01', true, false)`), /Only directors and operations/);
  // enabling invoice visibility exposes only that job's own price
  const sid = rows.find(r => r.job_id === 'TH-006').share_id;
  await as(U.lisa, `select update_share($1, 'invoice', true)`, [sid]);
  const [inv] = await as(U.cust, `select invoice_id, invoice_amount from portal_deliveries where job_id='TH-006'`);
  assert.deepEqual([inv.invoice_id, num(inv.invoice_amount)], ['INV-264101', 650]);
  await as(U.cust, `select set_notify(false)`);
  await as(U.lisa, `select request_link('TH-006', 'CT01')`).then(() => assert.fail('should refuse opted-out contact'), e => assert.match(e.message, /opted out/));
  await rejects(as(U.lisa, `select share_job('TH-002', 'CT01', true, false)`), /contact at that job's customer/);
});

test('Administration: threshold, suspension and validation', async () => {
  await rejects(as(U.lisa, `select set_threshold(20)`), /Only the director/);
  await as(U.paul, `select set_threshold(20)`);
  const flagged = await as(U.paul, `select f.job_id from job_financials f join jobs j on j.tenant_id=f.tenant_id and j.id=f.job_id, tenants t
    where t.id=f.tenant_id and j.status='delivered' and f.actual_cost is not null and (f.actual_cost-f.planned_cost)/f.planned_cost*100 > (t.settings->>'variance_threshold_pct')::numeric`);
  assert.equal(flagged.length, 2);
  await rejects(as(U.paul, `select set_user_status($1, 'suspended')`, [U.paul]), /your own account/);
  await as(U.paul, `select set_user_status($1, 'suspended')`, [U.lisa]);
  assert.equal((await as(U.lisa, `select count(*)::int n from jobs`))[0].n, 0, 'suspended user reads nothing');
  await rejects(as(U.lisa, `select draft_recharge('TH-003', 1, null)`), /Only directors/);
  await as(U.paul, `select set_user_status($1, 'active')`, [U.lisa]);
  await rejects(as(U.paul, `select publish_rates('{"artic":1.7}'::jsonb, 'x')`), /Every rate/);
  await as(U.paul, `select publish_rates(rates || '{"artic":1.70}'::jsonb, 'Fuel review') from rate_cards limit 1`);
  const [f] = await as(U.paul, `select planned_cost from job_financials where job_id='TH-001'`); assert.equal(num(f.planned_cost), 920, 'history unchanged');
  const owner = U.lisa;
  const [{ raise_action: aid }] = await as(U.tm, `select raise_action('Hire in 26t rigid for TODAY-02', $1, 'high', '2026-11-05', 'job', 'TODAY-02', 'Escalated')`, [owner]);
  await as(U.lisa, `select update_action($1, 'progress', 'Two hire quotes requested')`, [aid]);
  await as(U.lisa, `select update_action($1, 'complete', null)`, [aid]);
  await rejects(as(U.cust, `select raise_action('x', $1, 'high', '2026-11-05')`, [owner]), /Not permitted/);
});

test('Tenant isolation: a second haulier sees none of the first', async () => {
  await db.query(`insert into auth.users (id, email) values ('99999999-0000-4000-8000-000000000001', 'md@other.example')`);
  await db.query(`insert into tenants (id, slug, name) values ('22222222-2222-4222-8222-222222222222', 'other', 'Other Haulier')`);
  await db.query(`insert into profiles (user_id, tenant_id, name, email, role, status) values ('99999999-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Other MD', 'md@other.example', 'director', 'active')`);
  const other = '99999999-0000-4000-8000-000000000001';
  for (const t of ['jobs', 'job_financials', 'invoices', 'customers', 'drivers', 'activity_feed', 'profiles']) {
    const r = await as(other, `select count(*)::int n from ${t} where tenant_id is distinct from '22222222-2222-4222-8222-222222222222' or true`).catch(async () => as(other, `select count(*)::int n from ${t}`));
    const own = t === 'profiles' ? 1 : 0;
    assert.equal(r[0].n, own, t);
  }
  await rejects(as(other, `select draft_recharge('TH-003', 10, null)`), /no identified recharge/);
  await rejects(as(other, `select propose_cover('TODAY-01', 'D12')`), /Job not found/);
});

test('Anonymous callers get nothing', async () => {
  await db.query('savepoint a'); await db.query('set local role anon');
  await assert.rejects(db.query('select * from jobs'), /permission denied/);
  await db.query('rollback to savepoint a'); await db.query('reset role');
});
