-- Scheduled jobs. Run once in the Supabase SQL editor AFTER deploying the edge functions.
-- Requires the pg_cron and pg_net extensions (Database → Extensions) and two Vault secrets:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.call_function(fn text) returns void language sql security definer as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb);
$$;
revoke all on function public.call_function(text) from public, anon, authenticated;

select cron.schedule('notify-outbox', '* * * * *', $$ select public.call_function('notify-outbox') $$);       -- customer emails, every minute
select cron.schedule('vigo-sync', '7 * * * *', $$ select public.call_function('vigo-sync') $$);               -- hourly (once Vigo is configured)
select cron.schedule('xero-sync', '17 6,10,14,18 * * *', $$ select public.call_function('xero?action=sync') $$); -- four times a day
