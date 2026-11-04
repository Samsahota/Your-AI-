-- =====================================================================================
-- Security: identity helpers, row-level security, grants.
-- Principles
--  * Tenant isolation on every table.
--  * Reads: granted per role through RLS policies.
--  * Writes: no direct table writes for signed-in users. All changes go through the
--    workflow functions in 20261105000300_workflows.sql, which validate and log.
--  * Money: job_financials, job_variances, recharge_candidates, recharges, rate_cards need
--    financial permission; invoices, payments, funding_positions need cash permission.
-- =====================================================================================

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create or replace function app.me() returns profiles
language sql stable security definer set search_path = public as $$
  select p.* from profiles p where p.user_id = auth.uid() and p.status = 'active' limit 1
$$;
create or replace function app.tenant() returns uuid language sql stable security definer set search_path = public as $$ select (app.me()).tenant_id $$;
create or replace function app.role() returns app_role language sql stable security definer set search_path = public as $$ select (app.me()).role $$;
create or replace function app.driver_id() returns text language sql stable security definer set search_path = public as $$ select (app.me()).driver_id $$;
create or replace function app.contact_id() returns text language sql stable security definer set search_path = public as $$ select (app.me()).contact_id $$;
create or replace function app.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.role() in ('director', 'operations', 'transport', 'viewonly'), false) $$;
create or replace function app.can_act() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.role() in ('director', 'operations', 'transport'), false) $$;
create or replace function app.can_money() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.role() in ('director', 'operations') or (app.role() = 'viewonly' and (app.me()).can_view_money), false) $$;
create or replace function app.can_cash() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.role() = 'director' or (app.role() = 'viewonly' and (app.me()).can_view_money and 'cash' = any((app.me()).sections)), false) $$;
create or replace function app.has_role(variadic roles app_role[]) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.role() = any(roles), false) $$;

-- Business date: the tenant's local date, unless a fixed date is configured (used by the demo tenant).
create or replace function app.business_date(t uuid default null) returns date language sql stable security definer set search_path = public as $$
  select coalesce((settings ->> 'business_date_override')::date, (now() at time zone coalesce(settings ->> 'timezone', 'Europe/London'))::date)
  from tenants where id = coalesce(t, app.tenant())
$$;

create or replace function app.strip_money(s text) returns text language sql immutable as $$
  select regexp_replace(coalesce(s, ''), '[−+-]?£\s?[0-9,]+(\.[0-9]+)?', '[amount restricted]', 'g')
$$;

create or replace function app.next_id(p_tenant uuid, p_prefix text) returns text language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into id_counters as c (tenant_id, prefix, n) values (p_tenant, p_prefix, 1)
  on conflict (tenant_id, prefix) do update set n = c.n + 1 returning c.n into v;
  return p_prefix || '-' || lpad(v::text, 4, '0');
end $$;

create or replace function app.log(action text, record_type text, record_id text, prev text, next text, money boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare p profiles := app.me();
begin
  insert into activity (tenant_id, actor_id, actor_name, actor_role, action, record_type, record_id, prev, next, prev_safe, next_safe, money)
  values (p.tenant_id, p.user_id, p.name, initcap(p.role::text), action, record_type, record_id,
          coalesce(prev, '—'), coalesce(next, '—'), app.strip_money(coalesce(prev, '—')), app.strip_money(coalesce(next, '—')), money);
end $$;
revoke all on function app.log(text, text, text, text, text, boolean) from public;
revoke all on function app.next_id(uuid, text) from public;

-- ----------------------------------------------------------------- RLS
do $$ declare t text;
begin
  foreach t in array array['tenants','profiles','customers','contacts','vehicles','drivers','driver_days','jobs','job_financials','job_variances',
    'recharge_candidates','recharges','job_checkins','invoices','payments','funding_positions','compliance_items','defects','walkarounds','actions',
    'shares','notifications','documents','connections','integration_credentials','integration_runs','rate_cards','activity','id_counters'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;
grant usage on all sequences in schema public to service_role;

-- read grants (RLS still filters rows)
grant select on tenants, profiles, customers, contacts, vehicles, drivers, driver_days, jobs, job_financials, job_variances,
  recharge_candidates, recharges, job_checkins, invoices, payments, funding_positions, compliance_items, defects, walkarounds,
  actions, shares, notifications, documents, connections, integration_runs, rate_cards to authenticated;

create policy tenant_read on tenants for select to authenticated using (id = app.tenant());

create policy staff_read on profiles for select to authenticated using (tenant_id = app.tenant() and (app.is_staff() or user_id = auth.uid()));

-- Operational records: staff in the tenant
create policy staff_read on customers for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy staff_read on contacts for select to authenticated using (tenant_id = app.tenant() and (app.is_staff() or id = app.contact_id()));
create policy staff_read on vehicles for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy driver_read on vehicles for select to authenticated using (tenant_id = app.tenant() and app.role() = 'driver'
  and id in (select vehicle_id from jobs j where j.tenant_id = app.tenant() and j.driver_id = app.driver_id() and j.date >= app.business_date() - 1));
create policy staff_read on drivers for select to authenticated using (tenant_id = app.tenant() and (app.is_staff() or id = app.driver_id()));
create policy staff_read on driver_days for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy staff_read on jobs for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy driver_read on jobs for select to authenticated using (tenant_id = app.tenant() and app.role() = 'driver' and driver_id = app.driver_id()
  and date between app.business_date() - 7 and app.business_date() + 1);
create policy staff_read on job_checkins for select to authenticated using (tenant_id = app.tenant() and (app.is_staff()
  or (app.role() = 'driver' and job_id in (select id from jobs where tenant_id = app.tenant() and driver_id = app.driver_id()))));
create policy staff_read on compliance_items for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy staff_read on defects for select to authenticated using (tenant_id = app.tenant() and (app.is_staff()
  or (app.role() = 'driver' and vehicle_id in (select vehicle_id from jobs where tenant_id = app.tenant() and driver_id = app.driver_id() and date = app.business_date()))));
create policy staff_read on walkarounds for select to authenticated using (tenant_id = app.tenant() and (app.is_staff() or driver_id = app.driver_id()));
create policy staff_read on actions for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy staff_read on shares for select to authenticated using (tenant_id = app.tenant() and (app.is_staff() or contact_id = app.contact_id()));
create policy staff_read on notifications for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy staff_read on documents for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy staff_read on connections for select to authenticated using (tenant_id = app.tenant() and app.is_staff());
create policy director_read on integration_runs for select to authenticated using (tenant_id = app.tenant() and app.role() = 'director');

-- Money
create policy money_read on job_financials for select to authenticated using (tenant_id = app.tenant() and app.can_money());
create policy money_read on job_variances for select to authenticated using (tenant_id = app.tenant() and app.can_money());
create policy money_read on recharge_candidates for select to authenticated using (tenant_id = app.tenant() and app.can_money());
create policy money_read on recharges for select to authenticated using (tenant_id = app.tenant() and app.can_money());
create policy money_read on rate_cards for select to authenticated using (tenant_id = app.tenant() and app.can_money());
-- Cash
create policy cash_read on invoices for select to authenticated using (tenant_id = app.tenant() and app.can_cash());
create policy cash_read on payments for select to authenticated using (tenant_id = app.tenant() and app.can_cash());
create policy cash_read on funding_positions for select to authenticated using (tenant_id = app.tenant() and app.can_cash());
-- activity, integration_credentials, id_counters: no user policies (activity is read through activity_feed)
