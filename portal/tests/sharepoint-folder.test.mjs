// SharePoint folder pick-up, end to end against the local database: a stand-in for Microsoft Graph
// serves the folder; the real database functions check, store and import, acting as the platform.
// Needs the local database:  npm run db:reset && npm run test:sharepoint
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { pickUpFolder, runAll, makeGraph, rowsToCsv } from '../connectors/sharepoint-folder.mjs';

const URL = process.env.PGURL || 'postgres://postgres@localhost:54329/portal_test?host=/tmp';
const A = '20000000-0000-4000-8000-00000000000a';
let db, sql;
before(async () => { sql = new pg.Client({ connectionString: URL }); await sql.connect(); await sql.query('begin'); });
after(async () => { await sql.query('rollback'); await sql.end(); });          // every change is rolled back

// The database as the platform's server function sees it (service key).
const asService = async (text, params) => {
  await sql.query('savepoint s');
  try {
    await sql.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    await sql.query('set local role service_role');
    const r = await sql.query(text, params); await sql.query('reset role'); await sql.query('release savepoint s'); return r.rows;
  } catch (e) { await sql.query('rollback to savepoint s'); await sql.query('reset role'); throw e; }
};
db = {
  async rpc(fn, args) {
    const names = Object.keys(args);
    const types = { p_records: '::jsonb', p_checks: '::jsonb' };
    const rows = await asService(`select ${fn}(${names.map((k, i) => `${k} => $${i + 1}${types[k] || ''}`).join(', ')}) as r`,
      names.map(k => (k === 'p_records' || k === 'p_checks') ? JSON.stringify(args[k]) : args[k]));
    return rows[0].r;
  },
  listConnections: () => asService(`select * from connections where method = 'sharepoint_folder' and status in ('configured', 'connected', 'failing')`),
};

// A stand-in for Microsoft Graph: one site, folders of files, Excel sheets as cell text.
function fakeGraph(folders) {
  return {
    siteId: async site => { if (site !== 'demo.sharepoint.com:/sites/Finance') throw new Error('The SharePoint site or folder was not found. Check the name in the connection settings.'); return 'site-1'; },
    list: async (siteId, folder) => (folders[folder] || []).map(f => ({ id: f.name, name: f.name, file: {}, lastModifiedDateTime: f.modified })),
    download: async (siteId, id) => Object.values(folders).flat().find(f => f.name === id).text,
    usedRange: async (siteId, id) => Object.values(folders).flat().find(f => f.name === id).cells,
  };
}
const PAYROLL = 'Period end,Gross pay,Employer costs,Hours,Overtime hours\n30/11/2026,"£61,250.00",8120.50,7100,320\n';
let n = 0;
const connFor = async (system, feeds, cfg) => {
  const [{ id }] = await asService(`select save_connection($1, $2, $3, 'sharepoint_folder', $4, 'monthly', $5::jsonb, null, 'configured') id`,
    [A, system, `Folder test ${++n}`, feeds, JSON.stringify({ sharepoint: cfg })]);
  return (await asService(`select * from connections where id = $1`, [id]))[0];
};

test('A payroll export saved to the folder is picked up, kept untouched and imported; nothing is uploaded by hand', async () => {
  const conn = await connFor('brightpay', '{payroll_periods,people_events}', { site: 'demo.sharepoint.com:/sites/Finance', folder: 'Clearpath/Payroll', target: 'payroll_periods' });
  const graph = fakeGraph({ 'Clearpath/Payroll': [{ name: 'payroll-nov.csv', modified: '2026-11-16T09:00:00Z', text: PAYROLL }, { name: 'notes.docx', modified: '2026-11-16T09:00:00Z', text: 'x' }] });
  const res = await pickUpFolder({ conn, graph, db });
  assert.deepEqual(res.map(r => [r.file, r.status, r.written]), [['payroll-nov.csv', 'ok', 1]]);          // the Word file is ignored
  const [p] = await sql.query(`select gross_pay, employer_costs, hours, overtime_hours from payroll_periods where company_id = $1 and period_end = '2026-11-30'`, [A]).then(r => r.rows);
  assert.deepEqual([Number(p.gross_pay), Number(p.employer_costs), Number(p.hours), Number(p.overtime_hours)], [61250, 8120.5, 7100, 320]);
  const sha = createHash('sha256').update(PAYROLL, 'utf8').digest('hex');
  const [kept] = (await sql.query(`select file_name, sha256, content from source_files where connection_id = $1`, [conn.id])).rows;
  assert.deepEqual([kept.file_name, kept.sha256, kept.content], ['payroll-nov.csv', sha, PAYROLL]);
  const [c] = (await sql.query(`select status, last_success_at from connections where id = $1`, [conn.id])).rows;
  assert.equal(c.status, 'connected');
  // Next run: nothing new in the folder, so nothing is read again.
  const again = await pickUpFolder({ conn: { ...conn, last_success_at: c.last_success_at }, graph, db });
  assert.deepEqual(again, []);
});

test('An Excel sheet in SharePoint is read directly (no export) and goes through the same checks', async () => {
  const conn = await connFor('warehouse', '{warehouse_daily,cost_daily}', { site: 'demo.sharepoint.com:/sites/Finance', folder: 'Warehouse', target: 'warehouse_daily', sheet: 'Daily' });
  const cells = [['Date', 'Cases', 'Picks', 'Units', 'Labour hours'], ['01/12/2026', '1,180', '2400', '9000', '94'], ['02/12/2026', '1,240', '2510', '9400', '97.5']];
  const res = await pickUpFolder({ conn, graph: fakeGraph({ Warehouse: [{ name: 'Warehouse figures.xlsx', modified: '2026-11-16T18:00:00Z', cells }] }), db });
  assert.deepEqual(res.map(r => [r.status, r.written]), [['ok', 2]]);
  const rows = (await sql.query(`select day::text, cases, labour_hours from warehouse_daily where company_id = $1 and day >= '2026-12-01' order by day`, [A])).rows;
  assert.deepEqual(rows.map(r => [r.day, r.cases, Number(r.labour_hours)]), [['2026-12-01', 1180, 94], ['2026-12-02', 1240, 97.5]]);
  const [kept] = (await sql.query(`select file_name, content from source_files where connection_id = $1`, [conn.id])).rows;
  assert.equal(kept.file_name, 'Warehouse figures.xlsx (Daily).csv');
  assert.equal(kept.content, rowsToCsv(cells));
});

test('A file with a renamed column is refused: nothing written, the connection shows as failing, the copy is kept', async () => {
  const conn = await connFor('brightpay', '{payroll_periods,people_events}', { site: 'demo.sharepoint.com:/sites/Finance', folder: 'Clearpath/Payroll2', target: 'payroll_periods' });
  const bad = PAYROLL.replace('Gross pay', 'Gross');
  const res = await pickUpFolder({ conn, graph: fakeGraph({ 'Clearpath/Payroll2': [{ name: 'payroll-dec.csv', modified: '2026-11-16T10:00:00Z', text: bad }] }), db });
  assert.equal(res[0].status, 'check_failed');
  assert.match(res[0].error, /Gross pay/);
  assert.equal((await sql.query(`select status from connections where id = $1`, [conn.id])).rows[0].status, 'failing');
  assert.equal((await sql.query(`select count(*)::int n from source_files where connection_id = $1`, [conn.id])).rows[0].n, 1);
});

test('A wrong site, or a folder not set up, is recorded as a failed run with a plain message', async () => {
  const conn = await connFor('bibby', '{}', { site: 'wrong.sharepoint.com:/sites/X', folder: 'Bibby', target: 'payroll_periods' });
  const res = await pickUpFolder({ conn, graph: fakeGraph({}), db });
  assert.match(res[0].error, /does not fill payroll_periods/);
  const conn2 = await connFor('warehouse', '{warehouse_daily}', { site: 'wrong.sharepoint.com:/sites/X', folder: 'W', target: 'warehouse_daily' });
  const res2 = await pickUpFolder({ conn: conn2, graph: fakeGraph({}), db });
  assert.match(res2[0].error, /not found/);
  const runs = (await sql.query(`select status, error from connection_runs where connection_id = $1`, [conn2.id])).rows;
  assert.deepEqual(runs.map(r => r.status), ['failed']);
});

test('Bibby statements: kept untouched in the folder pick-up even before the cash view uses them', async () => {
  const conn = await connFor('bibby', '{}', { site: 'demo.sharepoint.com:/sites/Finance', folder: 'Bibby', target: 'keep' });
  const res = await pickUpFolder({ conn, graph: fakeGraph({ Bibby: [{ name: 'statement-nov.csv', modified: '2026-11-16T07:00:00Z', text: 'Date,Drawn\n30/11/2026,51000\n' }] }), db });
  assert.deepEqual(res.map(r => [r.status, r.kept]), [['ok', true]]);
  assert.equal((await sql.query(`select count(*)::int n from source_files where connection_id = $1`, [conn.id])).rows[0].n, 1);
  assert.equal((await sql.query(`select status from connections where id = $1`, [conn.id])).rows[0].status, 'connected');
});

test('runAll: every folder connection that is set up, then figures recalculated for the companies touched', async () => {
  await asService(`update connections set status = 'paused' where method = 'sharepoint_folder'`);   // earlier tests' connections out of the way
  const conn = await connFor('brightpay', '{payroll_periods,people_events}', { site: 'demo.sharepoint.com:/sites/Finance', folder: 'Run/All', target: 'payroll_periods' });
  await asService(`insert into connections (company_id, system, label, method, status, feeds) values ($1, 'bibby', 'Waiting one', 'sharepoint_folder', 'waiting_access', '{}')`, [A]);
  const csv = PAYROLL.replace('30/11/2026', '31/12/2026');
  const out = await runAll({ graph: fakeGraph({ 'Run/All': [{ name: 'dec.csv', modified: '2026-11-16T08:00:00Z', text: csv }] }), db, today: '2026-11-17' });
  assert.deepEqual(Object.keys(out), [conn.id]);                         // the connection still waiting for access is skipped
  assert.equal(out[conn.id][0].status, 'ok');
});

test('Microsoft Graph client: one sign-in token reused; site, folder and Excel addresses built correctly', async () => {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push([url, opts.method || 'GET']);
    const body = url.includes('/oauth2/') ? { access_token: 't1', expires_in: 3600 }
      : url.includes('/children') ? { value: [{ id: 'i1', name: 'a.csv', file: {} }] }
      : url.includes('/usedRange') ? { text: [['A'], ['1']] } : { id: 'site-9' };
    return { ok: true, status: 200, json: async () => body, text: async () => 'csv' };
  };
  const g = makeGraph({ tenant: 'tenant-1', clientId: 'c', clientSecret: 's', fetch });
  assert.equal(await g.siteId('demo.sharepoint.com:/sites/Finance Team'), 'site-9');
  assert.equal((await g.list('site-9', 'Clearpath/Payroll exports')).length, 1);
  assert.deepEqual(await g.usedRange('site-9', 'i1', 'Daily figures'), [['A'], ['1']]);
  assert.equal(calls.filter(c => c[0].includes('/oauth2/')).length, 1);
  assert.ok(calls.some(c => c[0].endsWith('/sites/demo.sharepoint.com:/sites/Finance%20Team')));
  assert.ok(calls.some(c => c[0].includes('/drive/root:/Clearpath/Payroll%20exports:/children')));
  assert.ok(calls.some(c => c[0].includes('/worksheets/Daily%20figures/usedRange')));
  const refusing = makeGraph({ tenant: 't', clientId: 'c', clientSecret: 's', fetch: async u => u.includes('/oauth2/') ? { ok: true, json: async () => ({ access_token: 'x', expires_in: 3600 }) } : { ok: false, status: 403 } });
  await assert.rejects(refusing.siteId('a:/b'), /not been approved/);
});
