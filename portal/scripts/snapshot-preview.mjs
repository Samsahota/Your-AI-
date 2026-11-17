// Captures what the real database returns for each test login, for the setup preview page.
// Uses the local test database and fictional companies; every change is rolled back.
//   node scripts/snapshot-preview.mjs > web/preview-data.json
import pg from 'pg';
import { CATALOGUE } from '../connectors/catalogue.mjs';

const db = new pg.Client({ connectionString: process.env.PGURL || 'postgres://postgres@localhost:54329/portal_test?host=/tmp' });
const A = '20000000-0000-4000-8000-00000000000a';
const USERS = [
  ['admin', '10000000-0000-4000-8000-000000000001', 'Platform admin (Sam, Your AI)'],
  ['director', '10000000-0000-4000-8000-000000000002', 'Director'],
  ['consultant', '10000000-0000-4000-8000-000000000003', 'Consultant (full access)'],
  ['operations', '10000000-0000-4000-8000-000000000004', 'Operations Manager'],
  ['transport', '10000000-0000-4000-8000-000000000005', 'Transport Manager'],
  ['warehouse', '10000000-0000-4000-8000-000000000006', 'Warehouse Manager'],
];
const TABLES = ['jobs', 'job_costs', 'warehouse_daily', 'cost_daily', 'pnl_lines', 'payroll_periods', 'staff', 'people_events', 'hr_cases', 'incidents', 'infringements', 'compliance_items', 'defects'];

async function as(user, sql, params = [], aal = 'aal2') {
  await db.query('savepoint q');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated', aal })]);
  await db.query('set local role authenticated');
  const r = await db.query(sql, params);
  await db.query('reset role'); await db.query('release savepoint q');
  return r.rows;
}

await db.connect();
await db.query('begin');
// Register Demo Haulage's eight systems as they will start for Trans Haul: waiting for access.
for (const [system, c] of Object.entries(CATALOGUE)) {
  await db.query(`select save_connection($1, $2, $3, $4, $5, 'nightly', '{}'::jsonb, null, 'waiting_access')`, [A, system, c.name, c.preferred, c.feeds]);
}
const out = { generated: new Date().toISOString(), day: '2026-11-17', users: {}, admin: {}, mfaCheck: {} };
for (const [key, id, label] of USERS) {
  const [{ a }] = await as(id, `select my_access() a`);
  let dash = null;
  if (key !== 'admin') [{ d: dash }] = await as(id, `select dashboard('2026-11-17') d`);
  const counts = {};
  for (const t of TABLES) counts[t] = (await as(id, `select count(*)::int n from ${t} where company_id = $1`, [A]))[0].n;
  out.users[key] = { label, access: a, dashboard: dash, counts };
}
out.mfaCheck = { jobsWithoutCode: (await as(USERS[1][1], `select count(*)::int n from jobs`, [], 'aal1'))[0].n, jobsWithCode: (await as(USERS[1][1], `select count(*)::int n from jobs`))[0].n };
out.admin.companies = await as(USERS[0][1], `select name, deal, setup_fee::float, monthly_fee::float, status, modules from companies order by name`);
out.admin.users = await as(USERS[0][1], `select p.name, p.role::text, p.division::text, p.status, p.is_test, c.name as company from profiles p left join companies c on c.id = p.company_id order by c.name nulls first, p.role`);
out.admin.connections = (await as(USERS[0][1], `select system, label, method, status, feeds from connections where company_id = $1 order by system`, [A]))
  .map(c => ({ ...c, verified: CATALOGUE[c.system]?.verified ?? false, notes: CATALOGUE[c.system]?.notes }));
out.admin.matrix = await as(USERS[0][1], `select role::text, area, level::text from role_access order by role, area`);
await db.query('rollback');
await db.end();
process.stdout.write(JSON.stringify(out, null, 2));
