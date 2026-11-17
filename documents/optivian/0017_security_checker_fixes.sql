-- Optivian: fixes flagged by Supabase's security checker, 17 Nov 2026. No change to how the app behaves.
-- Applied by Claude (approved by Sam) to both projects in the "Your AI Ltd" Supabase organisation:
--   gateway-staging     (knldxodjnrbmhwtbfzkt)  migration version 20261117222835
--   gateway-production  (pjduqueauvmqcaqksbaq)  migration version 20261117222957
-- Add this file to the Optivian codebase's migrations so its history matches the databases.
-- Verified: security checker clean afterwards (apart from leaked password protection, a dashboard
-- setting); the trigger was run on staging inside a rolled-back transaction and worked.

-- 1. Pin the trigger function's search path (it only sets a date on the row being saved).
alter function app.application_decided_on() set search_path = '';

-- 2. Server-only tables: row security already blocked every row from the browser roles.
--    Remove the browser roles' table grants as a second layer, and add an explicit deny policy
--    so the intent is documented. The server (service role / table owner) bypasses row security.
do $$
declare t text;
begin
  foreach t in array array['portal_auth.credentials', 'public.login_attempts', 'public.password_resets',
                           'public.sessions', 'public.peep_access_log', 'public.peeps'] loop
    if to_regclass(t) is not null then
      execute format('revoke all on %s from anon, authenticated', t);
      execute format('drop policy if exists no_client_access on %s', t);
      execute format('create policy no_client_access on %s as restrictive for all to anon, authenticated using (false) with check (false)', t);
    end if;
  end loop;
end $$;
