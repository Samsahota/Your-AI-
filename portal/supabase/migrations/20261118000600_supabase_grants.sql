-- =====================================================================================
-- Hosted Supabase gives the browser roles (anon, authenticated) full rights on every new
-- table and function by default. Clearpath's rule is narrower:
--   * anon (not signed in): nothing at all, except the functions the sign-in screens need (none).
--   * authenticated: read only, and only rows its row security allows; every write goes
--     through a checked database function. TRUNCATE is removed because row security
--     doesn't apply to it.
-- This migration also refuses to finish if any table is missing row security.
-- =====================================================================================

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'Table public.% has no row security: fix before going live', t.relname;
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;     -- row security decides which rows

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
-- The invitation wrapper stays server-only.
revoke execute on function add_profile_for_invite(uuid, uuid, uuid, portal_role, text, text, text, division, boolean) from authenticated;

-- Functions in the app schema are helpers for row security and other functions.
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on function app.add_profile(uuid, uuid, uuid, portal_role, text, text, text, division, boolean) from authenticated;
revoke execute on function app.audit(uuid, text, text, jsonb) from authenticated;

-- Anything created later in public starts with no browser access until granted on purpose.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
