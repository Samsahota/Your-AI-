-- =====================================================================================
-- Clearpath operations platform: core.
-- Companies (each haulier), people who sign in, the access matrix agreed on 17 Nov 2026,
-- two-factor enforcement and the audit log.
--
-- How access works
--  * Every row belongs to one company. Nobody sees another company's rows, except the
--    platform admin (Sam, Your AI), whose reads are allowed for support.
--  * Each role has a level per area: none, own (own division only) or full.
--    Directors can override a role's level for their own company (e.g. let the Transport
--    Manager see costs) through set_access_override().
--  * Nothing is readable unless the session has completed two-factor sign-in
--    (Supabase puts aal = 'aal2' in the token after the authenticator code).
-- =====================================================================================

create extension if not exists pgcrypto;

create type portal_role as enum ('platform_admin', 'director', 'consultant', 'operations', 'transport', 'warehouse', 'driver', 'customer');
create type access_level as enum ('none', 'own', 'full');
create type division as enum ('transport', 'warehouse');

-- Areas of the platform. 'pnl' = the company profit and loss (separate from operational
-- cost measures); 'people_detail' = disciplinary and grievance detail (counts sit in 'people').
create table areas (code text primary key, name text not null);
insert into areas values
  ('dashboard', 'Dashboard'), ('cost', 'Cost'), ('pnl', 'Company P&L'), ('service', 'Service'),
  ('people', 'People'), ('people_detail', 'Disciplinary and grievance detail'), ('payroll', 'Payroll'),
  ('hs', 'Health and Safety'), ('compliance', 'Compliance'), ('records', 'Records'), ('settings', 'Users and settings');

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  deal text not null check (deal in ('founding', 'standard')),
  setup_fee numeric(10, 2),
  monthly_fee numeric(10, 2),
  modules text[] not null default '{}',               -- add-ons switched on, e.g. {'driver_app'}
  settings jsonb not null default '{}'::jsonb,        -- timezone, report time, business_date_override (tests/demo only)
  inbox_token text not null unique default encode(gen_random_bytes(9), 'hex'),  -- report inbox address
  status text not null default 'setup' check (status in ('setup', 'active', 'suspended')),
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  role portal_role not null,
  name text not null,
  email text not null,
  job_title text,
  division division,                                   -- for 'own' access: transport or warehouse
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  is_test boolean not null default false,             -- e.g. Clearpath's test Transport Manager
  demo_view boolean not null default false,           -- hide staff names (for sales demos)
  created_at timestamptz not null default now(),
  check ((role = 'platform_admin') = (company_id is null))
);
create index on profiles (company_id);

-- The default access matrix (build pack, "Users and access levels"). Proposal until Paul confirms.
create table role_access (
  role portal_role not null,
  area text not null references areas(code),
  level access_level not null,
  primary key (role, area)
);
insert into role_access (role, area, level)
select r::portal_role, a, l::access_level from (values
  ('director', 'dashboard', 'full'), ('director', 'cost', 'full'), ('director', 'pnl', 'full'), ('director', 'service', 'full'),
  ('director', 'people', 'full'), ('director', 'people_detail', 'full'), ('director', 'payroll', 'full'), ('director', 'hs', 'full'),
  ('director', 'compliance', 'full'), ('director', 'records', 'full'), ('director', 'settings', 'full'),
  ('consultant', 'dashboard', 'full'), ('consultant', 'cost', 'full'), ('consultant', 'pnl', 'full'), ('consultant', 'service', 'full'),
  ('consultant', 'people', 'full'), ('consultant', 'people_detail', 'full'), ('consultant', 'payroll', 'full'), ('consultant', 'hs', 'full'),
  ('consultant', 'compliance', 'full'), ('consultant', 'records', 'full'), ('consultant', 'settings', 'none'),
  ('operations', 'dashboard', 'full'), ('operations', 'cost', 'full'), ('operations', 'pnl', 'none'), ('operations', 'service', 'full'),
  ('operations', 'people', 'full'), ('operations', 'people_detail', 'none'), ('operations', 'payroll', 'none'), ('operations', 'hs', 'full'),
  ('operations', 'compliance', 'full'), ('operations', 'records', 'full'), ('operations', 'settings', 'none'),
  ('transport', 'dashboard', 'own'), ('transport', 'cost', 'none'), ('transport', 'pnl', 'none'), ('transport', 'service', 'own'),
  ('transport', 'people', 'own'), ('transport', 'people_detail', 'none'), ('transport', 'payroll', 'none'), ('transport', 'hs', 'full'),
  ('transport', 'compliance', 'own'), ('transport', 'records', 'own'), ('transport', 'settings', 'none'),
  ('warehouse', 'dashboard', 'own'), ('warehouse', 'cost', 'own'), ('warehouse', 'pnl', 'none'), ('warehouse', 'service', 'own'),
  ('warehouse', 'people', 'own'), ('warehouse', 'people_detail', 'none'), ('warehouse', 'payroll', 'none'), ('warehouse', 'hs', 'full'),
  ('warehouse', 'compliance', 'own'), ('warehouse', 'records', 'own'), ('warehouse', 'settings', 'none')
) v(r, a, l);

-- A director's changes to the matrix for their own company.
create table access_overrides (
  company_id uuid not null references companies(id) on delete cascade,
  role portal_role not null check (role not in ('platform_admin', 'director')),
  area text not null references areas(code),
  level access_level not null,
  changed_by uuid, changed_at timestamptz not null default now(),
  primary key (company_id, role, area)
);

create table audit_log (
  id bigserial primary key,
  company_id uuid references companies(id) on delete cascade,
  actor uuid, actor_role text,
  action text not null, target text, detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index on audit_log (company_id, at desc);

-- ---------------------------------------------------------------- identity helpers
create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create or replace function app.me() returns profiles language sql stable security definer set search_path = public as $$
  select p.* from profiles p where p.user_id = auth.uid() and p.status = 'active' limit 1 $$;

-- Two-factor: Supabase sets aal = 'aal2' once the authenticator code has been entered.
create or replace function app.mfa_ok() returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' $$;

create or replace function app.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select app.mfa_ok() and coalesce((app.me()).role = 'platform_admin', false) $$;

-- Calls made by the platform itself: the service key (connectors, edge functions) or scheduled
-- jobs run directly in the database. A signed-in user never passes this check.
create or replace function app.is_service() returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or (session_user = 'postgres' and coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon')) $$;

create or replace function app.company() returns uuid language sql stable security definer set search_path = public as $$
  select (app.me()).company_id $$;

create or replace function app.access(p_area text) returns access_level language sql stable security definer set search_path = public as $$
  select case
    when not app.mfa_ok() or (app.me()).user_id is null then 'none'::access_level
    when (app.me()).role = 'platform_admin' then 'full'::access_level
    else coalesce(
      (select o.level from access_overrides o where o.company_id = (app.me()).company_id and o.role = (app.me()).role and o.area = p_area),
      (select r.level from role_access r where r.role = (app.me()).role and r.area = p_area),
      'none'::access_level)
  end $$;

-- Can the signed-in person see a row in this area, for this company and division?
-- Rows with no division (company-wide) are visible at 'own' level too.
create or replace function app.sees(p_company uuid, p_area text, p_division division default null) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when app.is_admin() then true
    when p_company is distinct from app.company() then false
    else case app.access(p_area)
      when 'full' then true
      when 'own' then p_division is null or p_division = (app.me()).division
      else false end
  end $$;

create or replace function app.audit(p_company uuid, p_action text, p_target text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (company_id, actor, actor_role, action, target, detail)
  values (p_company, auth.uid(), (app.me()).role::text, p_action, p_target, coalesce(p_detail, '{}'::jsonb)) $$;
revoke all on function app.audit(uuid, text, text, jsonb) from public;

-- ---------------------------------------------------------------- row-level security
alter table companies enable row level security;
alter table profiles enable row level security;
alter table role_access enable row level security;
alter table access_overrides enable row level security;
alter table audit_log enable row level security;
alter table areas enable row level security;

create policy read_own_company on companies for select using (app.is_admin() or (app.mfa_ok() and id = app.company()));
-- Everyone signed in can read their own profile (needed to show "account suspended" etc.);
-- colleagues are visible to anyone with access to the company's users screen.
create policy read_profiles on profiles for select using (
  user_id = auth.uid() or app.is_admin() or (app.mfa_ok() and company_id = app.company() and app.access('settings') = 'full'));
create policy read_matrix on role_access for select using (true);
create policy read_areas on areas for select using (true);
create policy read_overrides on access_overrides for select using (app.sees(company_id, 'settings'));
create policy read_audit on audit_log for select using (app.is_admin() or (company_id = app.company() and app.access('settings') = 'full'));

grant select on companies, profiles, role_access, access_overrides, audit_log, areas to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- What the signed-in person may see, for the app to build its menu. Safe to call any time.
create or replace function my_access() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mfa', app.mfa_ok(),
    'role', (app.me()).role,
    'name', (app.me()).name,
    'company_id', (app.me()).company_id,
    'division', (app.me()).division,
    'areas', coalesce((select jsonb_object_agg(a.code, app.access(a.code)) from areas a), '{}'::jsonb)) $$;
grant execute on function my_access() to authenticated;

-- A director changes what a role can see in their company (e.g. Transport Manager may see costs).
create or replace function set_access_override(p_role portal_role, p_area text, p_level access_level) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(app.access('settings') = 'full' and (app.me()).role in ('director', 'platform_admin'), false) then
    raise exception 'Only a director can change access levels';
  end if;
  if app.company() is null then raise exception 'Platform admins change access through set_access_override_for'; end if;
  if p_role in ('platform_admin', 'director') then raise exception 'Director and platform admin access cannot be changed'; end if;
  insert into access_overrides (company_id, role, area, level, changed_by) values (app.company(), p_role, p_area, p_level, auth.uid())
  on conflict (company_id, role, area) do update set level = excluded.level, changed_by = excluded.changed_by, changed_at = now();
  perform app.audit(app.company(), 'access_changed', p_role::text || ':' || p_area, jsonb_build_object('level', p_level));
end $$;
grant execute on function set_access_override(portal_role, text, access_level) to authenticated;

-- Suspend or reactivate a user (leavers suspended the same day).
create or replace function set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare target profiles;
begin
  select * into target from profiles where user_id = p_user;
  if target is null then raise exception 'User not found'; end if;
  if not (app.is_admin() or coalesce(target.company_id = app.company() and app.access('settings') = 'full', false)) then
    raise exception 'You do not have permission to change users';
  end if;
  if p_status not in ('active', 'suspended') then raise exception 'Status must be active or suspended'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own status'; end if;
  update profiles set status = p_status where user_id = p_user;
  perform app.audit(target.company_id, 'user_' || p_status, target.email, '{}'::jsonb);
end $$;
grant execute on function set_user_status(uuid, text) to authenticated;
