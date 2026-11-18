-- Scheduled jobs for the live project. Run once, AFTER the server functions are deployed and their
-- secrets are set. Times are UTC (the database's clock); each function works in UK time itself.
--
-- Before running, store two values in the database's vault (Supabase dashboard > Project Settings > Vault,
-- or in the SQL editor), never in this file or in code:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<long random value>', 'cron_secret');   -- same value as the CRON_SECRET function secret
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Calls one of the platform's server functions with the cron secret. Not callable by any user.
create or replace function app.call_function(fn text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000) $$;
revoke all on function app.call_function(text) from public, anon, authenticated;

-- 1. Nightly recalculation, 02:30 UTC (02:30 or 03:30 UK): runs inside the database, no function needed.
select cron.schedule('nightly-recalculation', '30 2 * * *', $$ select public.run_nightly(3) $$);

-- 2. Report emails: checked every 15 minutes; each company's send time (default 07:00 UK) and the
--    Monday weekly email are decided in the database, and nobody is emailed twice.
select cron.schedule('report-emails', '*/15 * * * *', $$ select app.call_function('report-emails') $$);

-- 3. SharePoint folder pick-up, hourly at 7 minutes past (once Microsoft access is approved).
select cron.schedule('sharepoint-folder', '7 * * * *', $$ select app.call_function('sharepoint-folder') $$);

-- To see what has run:      select * from cron.job_run_details order by start_time desc limit 20;
-- To pause one job:         select cron.unschedule('report-emails');
