// Runtime helpers for Supabase Edge Functions (Deno).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

export const env = (k: string, required = true) => { const v = Deno.env.get(k); if (!v && required) throw new Error(`Missing secret ${k}`); return v ?? ''; };
export const APP_URL = () => env('APP_URL');                  // e.g. https://portal.transhaul.co.uk

export const cors = { 'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const fail = (message: string, status = 400) => json({ error: message }, status);

/** Service-role client: bypasses RLS. Only used server-side after the caller has been authorised. */
export const admin = (): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

export type Caller = { userId: string; tenantId: string; role: string; name: string };
/** Verifies the caller's JWT and loads their active profile. */
export async function caller(req: Request, roles?: string[]): Promise<Caller> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first.');
  const db = admin();
  const { data: u, error } = await db.auth.getUser(token);
  if (error || !u?.user) throw new HttpError(401, 'Your session has expired. Sign in again.');
  const { data: p } = await db.from('profiles').select('user_id, tenant_id, role, name, status').eq('user_id', u.user.id).maybeSingle();
  if (!p || p.status !== 'active') throw new HttpError(403, 'Your account is not active.');
  if (roles && !roles.includes(p.role)) throw new HttpError(403, 'Your role cannot do this.');
  return { userId: p.user_id, tenantId: p.tenant_id, role: p.role, name: p.name };
}
/** Scheduled calls authenticate with the CRON_SECRET header instead of a user session. */
export function isCron(req: Request) { const s = Deno.env.get('CRON_SECRET'); return !!s && req.headers.get('x-cron-secret') === s; }

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try { return await fn(req); }
    catch (e) { const st = e instanceof HttpError ? e.status : 500; if (st === 500) console.error(e); return fail(e instanceof Error ? e.message : String(e), st); }
  };
}

export async function activity(db: SupabaseClient, tenantId: string, who: { id?: string | null; name: string; role: string }, action: string, recordType: string, recordId: string, prev: string | null, next: string | null, money = false) {
  const strip = (s: string | null) => (s ?? '—').replace(/[−+-]?£\s?[0-9,]+(\.[0-9]+)?/g, '[amount restricted]');
  await db.from('activity').insert({ tenant_id: tenantId, actor_id: who.id ?? null, actor_name: who.name, actor_role: who.role, action, record_type: recordType, record_id: recordId,
    prev: prev ?? '—', next: next ?? '—', prev_safe: strip(prev), next_safe: strip(next), money });
}

export async function startRun(db: SupabaseClient, tenantId: string, source: string) {
  const { data } = await db.from('integration_runs').insert({ tenant_id: tenantId, source }).select('id').single();
  return data!.id as number;
}
export async function finishRun(db: SupabaseClient, id: number, status: 'ok' | 'error', o: { rows_in?: number; rows_upserted?: number; error?: string; detail?: unknown } = {}) {
  await db.from('integration_runs').update({ status, finished_at: new Date().toISOString(), ...o }).eq('id', id);
}
