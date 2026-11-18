// SharePoint folder pick-up. Files saved into a named SharePoint folder (a payroll export, a Bibby
// statement, the warehouse spreadsheet) are picked up automatically: read through Microsoft Graph
// (read-only, Sites.Selected: only the sites Trans Haul's Microsoft admin approves), checked by the
// connection engine, stored untouched with their fingerprint, and imported. Nobody uploads anything.
//
// Each connection with method 'sharepoint_folder' holds its folder details in its settings:
//   config.sharepoint = { site: 'transhaul.sharepoint.com:/sites/Finance', folder: 'Clearpath/Payroll',
//                         target: 'payroll_periods', sheet: 'Sheet1' (Excel only), template: 'payroll' (optional) }
// Keys never go in the settings: the Microsoft app's secret is in the vault (MS_CLIENT_SECRET).
//
// Pure module: Graph and the database are passed in, so it runs the same in tests and on the server.
import { processCsv } from './core.mjs';
import { TEMPLATES } from './catalogue.mjs';

const FILES = /\.(csv|xlsx)$/i;

/** Microsoft Graph, read-only, with the app's own (client credentials) token. */
export function makeGraph({ tenant, clientId, clientSecret, fetch = globalThis.fetch }) {
  let token = null, expires = 0;
  async function auth() {
    if (token && Date.now() < expires - 60000) return token;
    const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Microsoft sign-in refused: ${j.error_description || j.error || r.status}`);
    token = j.access_token; expires = Date.now() + j.expires_in * 1000; return token;
  }
  async function get(path, asText = false) {
    const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${await auth()}` } });
    if (r.status === 403 || r.status === 401) throw new Error('Microsoft access to this SharePoint site has not been approved yet (or was removed).');
    if (r.status === 404) throw new Error('The SharePoint site or folder was not found. Check the name in the connection settings.');
    if (!r.ok) throw new Error(`SharePoint returned an error (${r.status}).`);
    return asText ? r.text() : r.json();
  }
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  return {
    siteId: async site => (await get(`/sites/${site.split(':').map((x, i) => i ? enc(x) : x).join(':')}`)).id,
    list: async (siteId, folder) => (await get(`/sites/${siteId}/drive/root:/${enc(folder)}:/children?$select=id,name,file,size,lastModifiedDateTime&$top=200`)).value || [],
    download: (siteId, itemId) => get(`/sites/${siteId}/drive/items/${itemId}/content`, true),
    // Excel: the sheet's cells as displayed (so dates stay DD/MM/YYYY), not raw serial numbers.
    usedRange: async (siteId, itemId, sheet) => (await get(`/sites/${siteId}/drive/items/${itemId}/workbook/worksheets/${encodeURIComponent(sheet)}/usedRange?$select=text`)).text,
  };
}

/** Spreadsheet cells to CSV, so Excel and CSV files go through exactly the same checks. */
export function rowsToCsv(rows) {
  const cell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}

const templateFor = (cfg) => cfg.template ? TEMPLATES[cfg.template] : Object.values(TEMPLATES).find(t => t.target === cfg.target);

/**
 * One connection: every file in its folder changed since the last good run is checked and imported,
 * oldest first. Returns what happened to each file.
 * db: { rpc(fn, args) } with the platform's (service) rights.
 */
export async function pickUpFolder({ conn, graph, db }) {
  const cfg = conn.config?.sharepoint || {};
  const fail = async msg => { await db.rpc('record_run', { p_connection: conn.id, p_status: 'failed', p_rows_in: 0, p_rows_written: 0, p_error: msg }); return [{ file: null, status: 'failed', error: msg }]; };
  if (!cfg.site || !cfg.folder || !cfg.target) return fail('The SharePoint folder is not set up: add the site, folder and what the files contain.');
  // target 'keep': collect and store the files untouched, with no figures yet (e.g. Bibby statements before the cash view).
  const keepOnly = cfg.target === 'keep';
  if (!keepOnly && !conn.feeds.includes(cfg.target)) return fail(`This connection does not fill ${cfg.target}.`);
  const mapping = keepOnly ? null : templateFor(cfg);
  if (!keepOnly && !mapping) return fail(`No template for ${cfg.target}.`);
  let siteId, items;
  try { siteId = await graph.siteId(cfg.site); items = await graph.list(siteId, cfg.folder); }
  catch (e) { return fail(e.message); }
  const since = conn.last_success_at ? new Date(conn.last_success_at).getTime() : 0;
  const files = items.filter(i => i.file && FILES.test(i.name) && new Date(i.lastModifiedDateTime).getTime() > since)
    .sort((a, b) => new Date(a.lastModifiedDateTime) - new Date(b.lastModifiedDateTime));
  const out = [];
  for (const f of files) {
    let text, kept = null, rowsIn = 0, checks = [];
    try {
      text = /\.xlsx$/i.test(f.name) ? rowsToCsv(await graph.usedRange(siteId, f.id, cfg.sheet || 'Sheet1')) : await graph.download(siteId, f.id);
      const name = /\.xlsx$/i.test(f.name) ? `${f.name} (${cfg.sheet || 'Sheet1'}).csv` : f.name;
      kept = await db.rpc('store_source_file', { p_connection: conn.id, p_file_name: name, p_content: text });   // untouched copy first
      if (keepOnly) {
        await db.rpc('record_run', { p_connection: conn.id, p_status: 'ok', p_rows_in: 0, p_rows_written: 0, p_raw_path: kept });
        out.push({ file: f.name, status: 'ok', written: 0, kept: true }); continue;
      }
      const r = processCsv(text, mapping); rowsIn = r.rowsIn; checks = r.checks;
      const res = await db.rpc('import_records', { p_connection: conn.id, p_target: cfg.target, p_records: r.records, p_checks: r.checks, p_rows_in: r.rowsIn, p_raw_sha: kept });
      out.push({ file: f.name, status: res.status, written: res.written, error: r.error || null });
    } catch (e) {
      // A row the database refuses (e.g. an employee not in the staff list): record it as failed, keep going.
      await db.rpc('record_run', { p_connection: conn.id, p_status: 'failed', p_rows_in: rowsIn, p_rows_written: 0, p_checks: checks, p_raw_path: kept, p_error: `${f.name}: ${e.message}` });
      out.push({ file: f.name, status: 'failed', error: e.message });
    }
  }
  return out;
}

/** Every SharePoint-folder connection that is set up, then the figures recalculated for each company touched. */
export async function runAll({ graph, db, today }) {
  const conns = await db.listConnections();
  const results = {}; const touched = new Set();
  for (const conn of conns) {
    results[conn.id] = await pickUpFolder({ conn, graph, db });
    if (results[conn.id].some(r => r.status === 'ok')) touched.add(conn.company_id);
  }
  for (const company of touched) await db.rpc('compute_measures', { p_company: company, p_day: today });
  return results;
}
