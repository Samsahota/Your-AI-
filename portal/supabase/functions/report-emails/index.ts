// Sends the daily and Monday report emails (reports/email.mjs builds each one).
// Called every 15 minutes by the database's scheduler; each company's send time and Monday rule
// are decided in the database (report_due), and each email is recorded once (report_sends).
// Refuses to run until the sending address is set up (RESEND_API_KEY, MAIL_FROM, APP_URL).
// Secrets: RESEND_API_KEY, MAIL_FROM (e.g. "Clearpath <reports@clearpathinsights.co.uk>"),
//          APP_URL (https://portal.clearpathinsights.co.uk), CRON_SECRET (same value as the vault's cron_secret).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { runReports } from '../../../reports/email.mjs';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CRON = Deno.env.get('CRON_SECRET');
  const authorised = (req.headers.get('Authorization') || '') === `Bearer ${SERVICE}` || (!!CRON && req.headers.get('x-cron-secret') === CRON);
  if (!authorised) return reply(401, { error: 'Platform only' });

  const KEY = Deno.env.get('RESEND_API_KEY'), FROM = Deno.env.get('MAIL_FROM'), APP_URL = Deno.env.get('APP_URL');
  if (!KEY || !FROM || !APP_URL || !/^https:\/\//.test(APP_URL)) return reply(503, { error: 'Report emails are not switched on yet.' });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE, { auth: { persistSession: false } });
  const db = {
    async rpc(fn: string, args: Record<string, unknown>) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    },
  };
  const send = async (m: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.idempotencyKey },
      body: JSON.stringify({ from: FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!r.ok) throw new Error(`Email provider returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json())?.id ?? null;
  };
  try { return reply(200, await runReports({ db, send, appUrl: APP_URL })); }
  catch (e) { return reply(500, { error: (e as Error).message }); }
});
