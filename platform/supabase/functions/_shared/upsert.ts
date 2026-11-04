// Upserting source data without overwriting what the portal owns.
// Source systems (Vigo, imports) own booking fields; the portal owns proposals, POD uploads and
// driver check-in progress. A source refresh never moves a job backwards.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
const ORDER: Record<string, number> = { not_started: 0, en_route: 1, on_site: 2, delivered: 3 };

export async function ensureCustomers(db: SupabaseClient, tenantId: string, names: string[]) {
  const { data } = await db.from('customers').select('id, name, account_ref').eq('tenant_id', tenantId);
  const byName = new Map((data ?? []).map(c => [c.name.toLowerCase(), c.id]));
  const byRef = new Map((data ?? []).filter(c => c.account_ref).map(c => [String(c.account_ref).toLowerCase(), c.id]));
  const missing = [...new Set(names)].filter(n => n && !byName.has(n.toLowerCase()) && !byRef.has(n.toLowerCase()));
  for (const n of missing) {
    const id = 'C-' + n.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10);
    await db.from('customers').upsert({ tenant_id: tenantId, id, name: n }, { onConflict: 'tenant_id,id', ignoreDuplicates: true });
    byName.set(n.toLowerCase(), id);
  }
  return (name: string) => byName.get(name.toLowerCase()) ?? byRef.get(name.toLowerCase()) ?? name;
}

export async function upsertJobs(db: SupabaseClient, tenantId: string, rows: { job: any; fin: any }[]) {
  if (!rows.length) return 0;
  const ids = rows.map(r => r.job.id);
  const { data: existing } = await db.from('jobs').select('id, status, pod_status, invoice_status, delivered_at, late').eq('tenant_id', tenantId).in('id', ids);
  const cur = new Map((existing ?? []).map(e => [e.id, e]));
  const jobs = rows.map(({ job }) => {
    const e = cur.get(job.id); const j = { ...job, tenant_id: tenantId, source_updated_at: new Date().toISOString() };
    if (e) {
      if (ORDER[e.status] > ORDER[j.status]) { j.status = e.status; j.delivered_at = e.delivered_at; j.late = e.late; }
      if (e.pod_status === 'received') j.pod_status = 'received';
      if (e.invoice_status === 'invoiced' && j.invoice_status !== 'invoiced') { j.invoice_status = 'invoiced'; delete j.invoice_id; }
    }
    return j;
  });
  const { error } = await db.from('jobs').upsert(jobs, { onConflict: 'tenant_id,id' });
  if (error) throw error;
  const fins = rows.filter(r => r.fin).map(r => { const f: any = { ...r.fin, tenant_id: tenantId }; if (f.actual_cost == null) delete f.actual_cost; return f; });
  if (fins.length) { const { error: fe } = await db.from('job_financials').upsert(fins, { onConflict: 'tenant_id,job_id' }); if (fe) throw fe; }
  return jobs.length;
}
