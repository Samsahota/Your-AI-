// Runs the SharePoint folder pick-up for every connection set up that way (connectors/sharepoint-folder.mjs).
// Called on a schedule (hourly) by the database's scheduler with the cron secret (or the service key); refuses anyone else.
// Secrets (vault): MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET for Trans Haul's approved Microsoft app.
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// Deploy with the connectors folder alongside (the import below), once Microsoft access is approved.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { makeGraph, runAll } from '../../../connectors/sharepoint-folder.mjs';

const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
  const CRON = Deno.env.get('CRON_SECRET');
  const authorised = (req.headers.get('Authorization') || '') === `Bearer ${SERVICE}` || (!!CRON && req.headers.get('x-cron-secret') === CRON);
  if (!authorised) return reply(401, { error: 'Platform only' });
  const tenant = Deno.env.get('MS_TENANT_ID'), clientId = Deno.env.get('MS_CLIENT_ID'), clientSecret = Deno.env.get('MS_CLIENT_SECRET');
  if (!tenant || !clientId || !clientSecret) return reply(503, { error: 'Microsoft access is not set up yet.' });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE, { auth: { persistSession: false } });
  const db = {
    async listConnections() {
      const { data, error } = await sb.from('connections').select('*').eq('method', 'sharepoint_folder').in('status', ['configured', 'connected', 'failing']);
      if (error) throw new Error(error.message); return data;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(error.message); return data;
    },
  };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  try { return reply(200, await runAll({ graph: makeGraph({ tenant, clientId, clientSecret }), db, today })); }
  catch (e) { return reply(500, { error: (e as Error).message }); }
});
