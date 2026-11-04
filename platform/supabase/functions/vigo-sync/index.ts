// Vigo (read-only). Access is agreed in principle; the API specification has not been supplied yet,
// so endpoints and field names are CONFIGURATION, stored per tenant in integration_credentials (provider 'vigo'):
// { base_url, api_key, auth_header: 'Authorization' | 'X-Api-Key', jobs_path: '/jobs', since_param: 'modifiedSince',
//   list_key: 'data', field_map: { job: 'JobNumber', date: 'CollectionDate', customer: 'Customer.Name', destination: 'Delivery.Town',
//   slot: 'Delivery.BookedTime', vehicle: 'Vehicle.FleetNo', driver: 'Driver.Code', status: 'Status', delivered_at: 'Delivery.ActualTime',
//   price: 'Charges.Total', planned_cost: 'Costs.Planned', actual_cost: 'Costs.Actual', pallets: 'Pallets', miles: 'Miles', pod_status: 'Pod.Received', invoice_number: 'InvoiceNo' } }
// Once Vigo's documentation is available, confirm the field_map and run with { dry_run: true } to check the mapping before writing.
//   POST { dry_run?: boolean }  (director)  |  scheduled with x-cron-secret for all configured tenants
import { handler, caller, admin, json, isCron, HttpError, activity, startRun, finishRun } from '../_shared/runtime.ts';
import { mapJobRow } from '../_shared/pure.ts';
import { ensureCustomers, upsertJobs } from '../_shared/upsert.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

const pick = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

async function syncTenant(db: SupabaseClient, tenantId: string, dryRun: boolean) {
  const { data: cred } = await db.from('integration_credentials').select('data').eq('tenant_id', tenantId).eq('provider', 'vigo').maybeSingle();
  if (!cred) throw new HttpError(400, 'Vigo is not configured for this company yet.');
  const c = cred.data;
  const since = c.cursor || new Date(Date.now() - 14 * 864e5).toISOString();
  const url = `${c.base_url.replace(/\/$/, '')}${c.jobs_path}?${encodeURIComponent(c.since_param)}=${encodeURIComponent(since)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  headers[c.auth_header || 'Authorization'] = (c.auth_header || 'Authorization') === 'Authorization' ? `Bearer ${c.api_key}` : c.api_key;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`Vigo returned ${r.status}`);
  const body = await r.json(); const list: any[] = c.list_key ? pick(body, c.list_key) : body;
  if (!Array.isArray(list)) throw new Error('Vigo response did not contain a job list — check list_key in the configuration.');
  const flat = list.map(x => Object.fromEntries(Object.entries(c.field_map as Record<string, string>).map(([k, p]) => [k, pick(x, p) == null ? '' : String(pick(x, p))])));
  const errors: string[] = [];
  const custFor = dryRun ? (n: string) => n : await ensureCustomers(db, tenantId, flat.map(f => f.customer));
  const mapped = flat.map((f, i) => { try { return mapJobRow(f, custFor); } catch (e) { errors.push(`Record ${i + 1}: ${e instanceof Error ? e.message : e}`); return null; } }).filter(Boolean) as any[];
  if (dryRun) return { dry_run: true, received: list.length, valid: mapped.length, errors, sample: mapped.slice(0, 3) };
  const run = await startRun(db, tenantId, 'vigo');
  try {
    const n = await upsertJobs(db, tenantId, mapped);
    await db.from('integration_credentials').update({ data: { ...c, cursor: new Date().toISOString() } }).eq('tenant_id', tenantId).eq('provider', 'vigo');
    await db.from('connections').update({ last_run_at: new Date().toISOString(), last_run_status: 'ok' }).eq('tenant_id', tenantId).eq('id', 'vigo');
    await finishRun(db, run, 'ok', { rows_in: list.length, rows_upserted: n, detail: { errors } });
    return { received: list.length, upserted: n, errors };
  } catch (e) { await finishRun(db, run, 'error', { rows_in: list.length, error: String(e instanceof Error ? e.message : e) }); throw e; }
}

Deno.serve(handler(async (req) => {
  const db = admin(); const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  if (isCron(req)) {
    const ts = ((await db.from('integration_credentials').select('tenant_id').eq('provider', 'vigo')).data ?? []).map(r => r.tenant_id);
    const out: Record<string, unknown> = {};
    for (const t of ts) { try { out[t] = await syncTenant(db, t, false); } catch (e) { out[t] = { error: String(e instanceof Error ? e.message : e) }; } }
    return json(out);
  }
  const me = await caller(req, ['director']);
  const res = await syncTenant(db, me.tenantId, !!b.dry_run);
  if (!b.dry_run) await activity(db, me.tenantId, { id: me.userId, name: me.name, role: 'Director' }, 'Ran Vigo sync', 'setting', 'vigo', null, JSON.stringify(res).slice(0, 120));
  return json(res);
}));
