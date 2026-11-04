// Xero (read-only) — each haulier connects its own Xero organisation.
//   POST ?action=connect   (director)  → { url } to send the director to Xero's consent screen
//   GET  ?action=callback  (from Xero) → stores tokens, redirects back to the portal
//   POST ?action=sync      (cron or director) → pulls receivable invoices; paid invoices feed days-to-pay
// Secrets: XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, XERO_SCOPES (confirm current scope names with Xero), STATE_SECRET
import { handler, caller, admin, json, env, isCron, HttpError, APP_URL, activity, startRun, finishRun } from '../_shared/runtime.ts';
import { mapXeroInvoice, ukDate } from '../_shared/pure.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

const enc = new TextEncoder();
async function sign(s: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(env('STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(s))))).replace(/[+/=]/g, '');
}
const basic = () => 'Basic ' + btoa(`${env('XERO_CLIENT_ID')}:${env('XERO_CLIENT_SECRET')}`);

async function token(db: SupabaseClient, tenantId: string) {
  const { data } = await db.from('integration_credentials').select('data').eq('tenant_id', tenantId).eq('provider', 'xero').single();
  let c = data!.data;
  if (Date.now() > c.expires_at - 60_000) {
    const r = await fetch('https://identity.xero.com/connect/token', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token }) });
    if (!r.ok) throw new Error('Xero token refresh failed — reconnect Xero in Administration.');
    const t = await r.json();
    c = { ...c, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
    await db.from('integration_credentials').update({ data: c, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('provider', 'xero');
  }
  return c;
}

async function syncTenant(db: SupabaseClient, tenantId: string) {
  const run = await startRun(db, tenantId, 'xero');
  try {
    const c = await token(db, tenantId);
    const { data: custs } = await db.from('customers').select('id, name, account_ref').eq('tenant_id', tenantId);
    const byRef = new Map((custs ?? []).filter(x => x.account_ref).map(x => [x.account_ref, x.id]));
    const byName = new Map((custs ?? []).map(x => [x.name.toLowerCase(), x.id]));
    const newCust: any[] = [];
    const custFor = (contactId: string, name: string) => {
      const id = byRef.get(contactId) ?? byName.get((name || '').toLowerCase());
      if (id) return id;
      const nid = 'X-' + contactId.slice(0, 8); byRef.set(contactId, nid); newCust.push({ tenant_id: tenantId, id: nid, name, account_ref: contactId }); return nid;
    };
    const invoices: any[] = []; const payments: any[] = [];
    for (let page = 1; page <= 50; page++) {
      const url = `https://api.xero.com/api.xro/2.0/Invoices?page=${page}&Statuses=AUTHORISED,PAID&where=${encodeURIComponent('Type=="ACCREC"')}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${c.access_token}`, 'xero-tenant-id': c.xero_tenant_id, Accept: 'application/json' } });
      if (r.status === 429) throw new Error('Xero rate limit reached — the next scheduled run will continue.');
      if (!r.ok) throw new Error(`Xero returned ${r.status}`);
      const body = await r.json(); const list = body.Invoices ?? [];
      for (const x of list) {
        const m = mapXeroInvoice(x, custFor); if (!m) continue;
        invoices.push({ ...m, tenant_id: tenantId });
        if (x.Status === 'PAID' && x.FullyPaidOnDate) payments.push({ tenant_id: tenantId, id: 'XP-' + (x.InvoiceNumber || x.InvoiceID), customer_id: m.customer_id, invoice_id: m.id, invoice_date: m.date, paid_date: ukDate(x.FullyPaidOnDate), amount: Number(x.Total) });
      }
      if (list.length < 100) break;
    }
    if (newCust.length) await db.from('customers').upsert(newCust, { onConflict: 'tenant_id,id', ignoreDuplicates: true });
    for (let i = 0; i < invoices.length; i += 500) { const { error } = await db.from('invoices').upsert(invoices.slice(i, i + 500), { onConflict: 'tenant_id,id' }); if (error) throw error; }
    for (let i = 0; i < payments.length; i += 500) { const { error } = await db.from('payments').upsert(payments.slice(i, i + 500), { onConflict: 'tenant_id,id' }); if (error) throw error; }
    await db.from('connections').update({ last_run_at: new Date().toISOString(), last_run_status: 'ok' }).eq('tenant_id', tenantId).eq('id', 'xero');
    await finishRun(db, run, 'ok', { rows_in: invoices.length, rows_upserted: invoices.length + payments.length });
    return { invoices: invoices.length, payments: payments.length };
  } catch (e) {
    await db.from('connections').update({ last_run_at: new Date().toISOString(), last_run_status: 'error' }).eq('tenant_id', tenantId).eq('id', 'xero');
    await finishRun(db, run, 'error', { error: String(e instanceof Error ? e.message : e) }); throw e;
  }
}

Deno.serve(handler(async (req) => {
  const action = new URL(req.url).searchParams.get('action');
  const db = admin();
  if (action === 'connect') {
    const me = await caller(req, ['director']);
    const state = `${me.tenantId}.${Date.now()}`;
    const q = new URLSearchParams({ response_type: 'code', client_id: env('XERO_CLIENT_ID'), redirect_uri: env('XERO_REDIRECT_URI'),
      scope: Deno.env.get('XERO_SCOPES') || 'openid profile email offline_access accounting.transactions.read accounting.contacts.read', state: `${state}.${await sign(state)}` });
    return json({ url: `https://login.xero.com/identity/connect/authorize?${q}` });
  }
  if (action === 'callback') {
    const u = new URL(req.url); const [tenantId, ts, sig] = (u.searchParams.get('state') || '').split('.');
    if (!sig || sig !== await sign(`${tenantId}.${ts}`) || Date.now() - Number(ts) > 15 * 60_000) throw new HttpError(400, 'Invalid or expired Xero connection request. Start again from Administration.');
    const r = await fetch('https://identity.xero.com/connect/token', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: u.searchParams.get('code') || '', redirect_uri: env('XERO_REDIRECT_URI') }) });
    if (!r.ok) throw new HttpError(400, 'Xero did not accept the connection. Try again.');
    const t = await r.json();
    const conns = await (await fetch('https://api.xero.com/connections', { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
    if (!conns?.length) throw new HttpError(400, 'No Xero organisation was authorised.');
    await db.from('integration_credentials').upsert({ tenant_id: tenantId, provider: 'xero', data: { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000, xero_tenant_id: conns[0].tenantId, org: conns[0].tenantName } });
    await db.from('connections').update({ state: 'Configured', method: `Xero OAuth 2.0 (read-only) · ${conns[0].tenantName}` }).eq('tenant_id', tenantId).eq('id', 'xero');
    await activity(db, tenantId, { name: 'System', role: 'System' }, 'Connected Xero', 'setting', 'xero', 'Proposed', `Configured · ${conns[0].tenantName}`);
    return Response.redirect(`${APP_URL()}/#/admin/connections`, 302);
  }
  if (action === 'sync') {
    let tenants: string[];
    if (isCron(req)) tenants = ((await db.from('integration_credentials').select('tenant_id').eq('provider', 'xero')).data ?? []).map(r => r.tenant_id);
    else tenants = [(await caller(req, ['director'])).tenantId];
    const out: Record<string, unknown> = {};
    for (const t of tenants) { try { out[t] = await syncTenant(db, t); } catch (e) { out[t] = { error: String(e instanceof Error ? e.message : e) }; } }
    return json(out);
  }
  throw new HttpError(400, 'Unknown action.');
}));
