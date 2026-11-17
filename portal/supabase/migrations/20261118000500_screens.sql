-- =====================================================================================
-- Functions the screens use: incidents, the policy library, company setup, invitations,
-- demo view and file imports. Every write goes through one of these, which check access
-- and leave an audit trail. Signed-in users never write to tables directly.
-- =====================================================================================

-- The platform admin works inside one company at a time; everyone else is fixed to their own.
create or replace function app.target_company(p_company uuid) returns uuid language sql stable security definer set search_path = public as $$
  select case when app.is_admin() then p_company else app.company() end $$;

-- Dashboard: same as before, but the platform admin can name the company to look at.
drop function if exists dashboard(date);
create or replace function dashboard(p_day date default null, p_company uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles := app.me();
  co uuid := app.target_company(p_company);
  d date; stale text[]; items jsonb := '[]'::jsonb;
  m measures; lvl access_level; sc text; val numeric; g numeric; a numeric; st text;
  quads jsonb := '{}'::jsonb; q text; worst text; incomplete boolean; any_access boolean;
begin
  if me.user_id is null or not app.mfa_ok() then raise exception 'Sign in with two-factor authentication to see the dashboard'; end if;
  if co is null then raise exception 'Choose a company first'; end if;
  d := coalesce(p_day, (select max(day) from measure_values where company_id = co));
  stale := app.stale_tables(co);
  for m in select * from measures order by quadrant, sort loop
    lvl := app.access(m.area);
    continue when lvl = 'none';
    if lvl = 'full' then sc := 'all';
    else
      continue when me.division is null or m.company_only;
      continue when m.division is not null and m.division <> me.division;
      sc := me.division::text;
    end if;
    select value into val from measure_values where company_id = co and measure_code = m.code and day = d and scope = sc;
    select coalesce(t.green_at, m.default_green), coalesce(t.amber_at, m.default_amber) into g, a
      from (select 1) x left join thresholds t on t.company_id = co and t.measure_code = m.code;
    st := case when m.sources && stale then 'stale' else app.rag(val, m.better, g, a) end;
    items := items || jsonb_build_object('code', m.code, 'quadrant', m.quadrant, 'name', m.name, 'unit', m.unit, 'value', val,
      'status', st, 'green_at', g, 'amber_at', a, 'better', m.better, 'headline', m.headline, 'description', m.description, 'scope', sc);
  end loop;
  foreach q in array array['hs', 'service', 'cost', 'people', 'compliance'] loop
    select count(*) > 0 into any_access from jsonb_array_elements(items) i where i ->> 'quadrant' = q;
    select case
        when bool_or(i ->> 'status' = 'red') then 'red'
        when bool_or(i ->> 'status' = 'amber') then 'amber'
        when bool_or(i ->> 'status' = 'green') then 'green'
        when bool_or(i ->> 'status' = 'no_target') then 'no_target'
        else 'no_data' end,
      coalesce(bool_or(i ->> 'status' in ('no_data', 'stale', 'no_target')), false)
      into worst, incomplete
      from jsonb_array_elements(items) i where i ->> 'quadrant' = q;
    quads := quads || jsonb_build_object(q, jsonb_build_object('status', case when any_access then worst else 'no_access' end, 'incomplete', incomplete));
  end loop;
  return jsonb_build_object('day', d, 'company_id', co, 'company', (select name from companies where id = co), 'quadrants', quads,
    'measures', items, 'stale_sources', to_jsonb(stale),
    'connections', case when app.access('settings') = 'full' then
      (select coalesce(jsonb_agg(jsonb_build_object('system', system, 'label', label, 'status', status, 'last_success_at', last_success_at) order by system), '[]'::jsonb)
         from connections where company_id = co) else null end);
end $$;
grant execute on function dashboard(date, uuid) to authenticated;

-- ---------------------------------------------------------------- incidents
-- Anyone with Health and Safety access can report an accident or near miss from the portal.
create or replace function log_incident(p_kind text, p_occurred_at timestamptz, p_description text,
  p_division division default null, p_severity text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; co uuid := app.company();
begin
  if co is null or app.access('hs') = 'none' then raise exception 'You do not have access to report incidents'; end if;
  if p_kind not in ('accident', 'personal_accident', 'near_miss') then raise exception 'Choose accident, personal accident or near miss'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Describe what happened'; end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'The date and time cannot be in the future'; end if;
  insert into incidents (company_id, kind, occurred_at, division, description, severity, status, actions_open, source, external_ref)
  values (co, p_kind, p_occurred_at, p_division, trim(p_description), p_severity, 'open', 0, 'portal', gen_random_uuid()::text)
  returning id into v;
  perform app.audit(co, 'incident_reported', p_kind, jsonb_build_object('id', v));
  return v;
end $$;
grant execute on function log_incident(text, timestamptz, text, division, text) to authenticated;

-- Close or reopen an incident, and record how many actions are still open (Director, Operations, consultant).
create or replace function update_incident(p_id uuid, p_status text, p_actions_open integer) returns void
language plpgsql security definer set search_path = public as $$
declare i incidents;
begin
  select * into i from incidents where id = p_id;
  if i is null or not app.sees(i.company_id, 'hs', i.division) then raise exception 'Incident not found'; end if;
  if not (app.is_admin() or (app.me()).role in ('director', 'operations', 'consultant')) then
    raise exception 'Only a director or the operations manager can close incidents';
  end if;
  if p_status not in ('open', 'closed') or p_actions_open < 0 then raise exception 'Status must be open or closed'; end if;
  if p_status = 'closed' and p_actions_open > 0 then raise exception 'Close the open actions before closing the incident'; end if;
  update incidents set status = p_status, actions_open = p_actions_open where id = p_id;
  perform app.audit(i.company_id, 'incident_updated', i.kind, jsonb_build_object('id', p_id, 'status', p_status, 'actions_open', p_actions_open));
end $$;
grant execute on function update_incident(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------- library
-- Documents this person can see, with the current version, whether they've signed it, and
-- (for anyone with full Compliance access) how many of the company's users have.
create or replace function library_status(p_company uuid default null) returns table (
  id uuid, category text, title text, owner_name text, review_due date, needs_signature boolean,
  current_version integer, summary text, storage_path text, published_at timestamptz,
  master boolean, i_signed boolean, signed_count integer, user_count integer)
language sql stable security definer set search_path = public as $$
  with co as (select app.target_company(p_company) as id),
  users as (select count(*)::int n from profiles, co where profiles.company_id = co.id and status = 'active')
  select d.id, d.category, d.title, d.owner_name, d.review_due, d.needs_signature, d.current_version,
    v.summary, v.storage_path, v.published_at, d.company_id is null,
    exists (select 1 from acknowledgements a where a.document_id = d.id and a.version = d.current_version and a.user_id = auth.uid()),
    case when app.access('compliance') = 'full' then (select count(*)::int from acknowledgements a, co where a.document_id = d.id and a.version = d.current_version and a.company_id = co.id) end,
    case when app.access('compliance') = 'full' then (select n from users) end
  from library_documents d
  left join library_versions v on v.document_id = d.id and v.version = d.current_version
  cross join co
  where (d.company_id = co.id or (d.company_id is null and exists (select 1 from library_subscriptions s where s.document_id = d.id and s.company_id = co.id)))
    and (app.is_admin() or (app.mfa_ok() and app.company() = co.id))
  order by d.category, d.title $$;
grant execute on function library_status(uuid) to authenticated;

-- A new document: master (platform admin, on Clearpath's behalf) or the company's own (director).
create or replace function create_document(p_company uuid, p_category text, p_title text, p_owner_name text,
  p_review_due date default null, p_needs_signature boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if p_company is null and not app.is_admin() then raise exception 'Only the platform admin can add master documents'; end if;
  if p_company is not null and not (app.is_admin() or coalesce(p_company = app.company() and (app.me()).role = 'director' and app.mfa_ok(), false)) then
    raise exception 'Only a director can add documents';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the document a title'; end if;
  insert into library_documents (company_id, category, title, owner_name, review_due, needs_signature)
  values (p_company, p_category, trim(p_title), p_owner_name, p_review_due, p_needs_signature) returning id into v;
  perform app.audit(p_company, 'document_created', p_title, '{}'::jsonb);
  return v;
end $$;
grant execute on function create_document(uuid, text, text, text, date, boolean) to authenticated;

create or replace function set_subscription(p_company uuid, p_document uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Only the platform admin manages the master library'; end if;
  if not exists (select 1 from library_documents where id = p_document and company_id is null) then raise exception 'Not a master document'; end if;
  if p_on then insert into library_subscriptions values (p_company, p_document) on conflict do nothing;
  else delete from library_subscriptions where company_id = p_company and document_id = p_document; end if;
  perform app.audit(p_company, case when p_on then 'library_subscribed' else 'library_unsubscribed' end, p_document::text, '{}'::jsonb);
end $$;
grant execute on function set_subscription(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- companies and users
create or replace function create_company(p_name text, p_slug text, p_deal text, p_setup_fee numeric, p_monthly_fee numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not app.is_admin() then raise exception 'Only the platform admin can add companies'; end if;
  insert into companies (name, slug, deal, setup_fee, monthly_fee, status) values (trim(p_name), lower(trim(p_slug)), p_deal, p_setup_fee, p_monthly_fee, 'setup')
  returning id into v;
  perform app.audit(v, 'company_created', p_name, jsonb_build_object('deal', p_deal, 'setup_fee', p_setup_fee, 'monthly_fee', p_monthly_fee));
  return v;
end $$;
grant execute on function create_company(text, text, text, numeric, numeric) to authenticated;

create or replace function set_company_status(p_company uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Only the platform admin can change a company''s status'; end if;
  update companies set status = p_status where id = p_company;
  perform app.audit(p_company, 'company_' || p_status, null, '{}'::jsonb);
end $$;
grant execute on function set_company_status(uuid, text) to authenticated;

-- Called by the invite function (service role) after creating the sign-in account.
create or replace function app.add_profile(p_inviter uuid, p_user uuid, p_company uuid, p_role portal_role, p_name text, p_email text,
  p_job_title text, p_division division, p_is_test boolean) returns void
language plpgsql security definer set search_path = public as $$
declare inviter profiles;
begin
  select * into inviter from profiles where user_id = p_inviter and status = 'active';
  if inviter is null then raise exception 'Unknown inviter'; end if;
  if not (inviter.role = 'platform_admin' or (inviter.role = 'director' and inviter.company_id = p_company)) then
    raise exception 'Only a director or the platform admin can invite users';
  end if;
  if p_role = 'platform_admin' then raise exception 'Platform admins are created by Your AI only'; end if;
  if p_role in ('transport', 'warehouse') and p_division is null then raise exception 'Choose transport or warehouse for this role'; end if;
  insert into profiles (user_id, company_id, role, name, email, job_title, division, status, is_test)
  values (p_user, p_company, p_role, trim(p_name), lower(trim(p_email)), p_job_title, p_division, 'invited', coalesce(p_is_test, false));
  insert into audit_log (company_id, actor, actor_role, action, target, detail)
  values (p_company, p_inviter, inviter.role::text, 'user_invited', lower(p_email), jsonb_build_object('role', p_role));
end $$;
revoke all on function app.add_profile(uuid, uuid, uuid, portal_role, text, text, text, division, boolean) from public;
grant execute on function app.add_profile(uuid, uuid, uuid, portal_role, text, text, text, division, boolean) to service_role;

-- The invite function (service key only) reaches app.add_profile through this public wrapper.
create or replace function add_profile_for_invite(p_inviter uuid, p_user uuid, p_company uuid, p_role portal_role, p_name text, p_email text,
  p_job_title text, p_division division, p_is_test boolean) returns void
language sql security definer set search_path = public as $$
  select app.add_profile(p_inviter, p_user, p_company, p_role, p_name, p_email, p_job_title, p_division, p_is_test) $$;
revoke all on function add_profile_for_invite(uuid, uuid, uuid, portal_role, text, text, text, division, boolean) from public, authenticated, anon;
grant execute on function add_profile_for_invite(uuid, uuid, uuid, portal_role, text, text, text, division, boolean) to service_role;

-- First sign-in: an invited user becomes active once they've set up two-factor.
create or replace function accept_invitation() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.mfa_ok() then raise exception 'Set up two-factor sign-in first'; end if;
  update profiles set status = 'active' where user_id = auth.uid() and status = 'invited';
end $$;
grant execute on function accept_invitation() to authenticated;

-- My own profile, whatever my status (the app uses it to explain "suspended" or "invited").
create or replace function my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) - 'user_id' || jsonb_build_object('company', c.name)
  from profiles p left join companies c on c.id = p.company_id where p.user_id = auth.uid() $$;
grant execute on function my_profile() to authenticated;

-- Hide staff names on screen (for Paul's sales demos). Applies to the person who switches it on.
create or replace function set_demo_view(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set demo_view = p_on where user_id = auth.uid() and app.mfa_ok() $$;
grant execute on function set_demo_view(boolean) to authenticated;

-- Colleagues' names for comments, owners etc. (names only, no contact details).
create or replace function company_people() returns table (user_id uuid, name text, role portal_role)
language sql stable security definer set search_path = public as $$
  select user_id, name, role from profiles where company_id = app.company() and status = 'active' and app.mfa_ok() order by name $$;
grant execute on function company_people() to authenticated;

-- ---------------------------------------------------------------- file imports
-- Writes records that passed every check in the connection engine, then records the run.
-- Platform admin (from the admin console) or the platform's own functions only.
create or replace function import_records(p_connection uuid, p_target text, p_records jsonb, p_checks jsonb, p_rows_in integer, p_raw_sha text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c connections; r jsonb; n integer := 0; run uuid; sid uuid;
begin
  if not (app.is_service() or app.is_admin()) then raise exception 'Only the platform can import records'; end if;
  select * into c from connections where id = p_connection;
  if c is null then raise exception 'Unknown connection'; end if;
  if not (p_target = any(c.feeds)) then raise exception 'This connection does not fill %', p_target; end if;
  if exists (select 1 from jsonb_array_elements(p_checks) x where (x ->> 'passed')::boolean is false) then
    run := record_run(c.id, 'check_failed', p_rows_in, 0, p_checks, p_raw_sha, null);
    return jsonb_build_object('status', 'check_failed', 'written', 0, 'run_id', run);
  end if;
  for r in select * from jsonb_array_elements(p_records) loop
    if p_target = 'incidents' then
      insert into incidents (company_id, kind, occurred_at, division, description, status, actions_open, source, external_ref)
      values (c.company_id, replace(lower(r ->> 'kind'), ' ', '_'), (r ->> 'occurred_at')::timestamptz, nullif(lower(r ->> 'division'), '')::division,
        r ->> 'description', lower(r ->> 'status'), coalesce((r ->> 'actions_open')::int, 0), c.system, r ->> 'external_ref')
      on conflict (company_id, source, external_ref) do update set kind = excluded.kind, occurred_at = excluded.occurred_at,
        division = excluded.division, description = excluded.description, status = excluded.status, actions_open = excluded.actions_open;
    elsif p_target = 'people_events' then
      select id into sid from staff where company_id = c.company_id and employee_no = r ->> 'employee_no';
      if sid is null then raise exception 'Row %: employee number % is not in the staff list', n + 1, r ->> 'employee_no'; end if;
      insert into people_events (company_id, staff_id, kind, day, hours, source, external_ref)
      values (c.company_id, sid, lower(r ->> 'kind'), (r ->> 'day')::date, (r ->> 'hours')::numeric, c.system, r ->> 'external_ref')
      on conflict (company_id, source, external_ref) do update set staff_id = excluded.staff_id, kind = excluded.kind, day = excluded.day, hours = excluded.hours;
    elsif p_target = 'staff' then
      insert into staff (company_id, name, employee_no, job_title, division, is_driver, contracted_hours, source, external_ref)
      values (c.company_id, r ->> 'name', r ->> 'employee_no', r ->> 'job_title', nullif(lower(r ->> 'division'), '')::division,
        coalesce((r ->> 'is_driver')::boolean, false), (r ->> 'contracted_hours')::numeric, c.system, r ->> 'employee_no')
      on conflict (company_id, employee_no) do update set name = excluded.name, job_title = excluded.job_title, division = excluded.division,
        is_driver = excluded.is_driver, contracted_hours = excluded.contracted_hours, updated_at = now();
    elsif p_target = 'compliance_items' then
      insert into compliance_items (company_id, kind, subject, division, due_date, done_date, source, external_ref)
      values (c.company_id, lower(r ->> 'kind'), r ->> 'subject', nullif(lower(r ->> 'division'), '')::division,
        (r ->> 'due_date')::date, nullif(r ->> 'done_date', '')::date, c.system, r ->> 'external_ref')
      on conflict (company_id, source, external_ref) do update set kind = excluded.kind, subject = excluded.subject, division = excluded.division,
        due_date = excluded.due_date, done_date = excluded.done_date;
    elsif p_target = 'warehouse_daily' then
      insert into warehouse_daily (company_id, day, cases, picks, units, labour_hours, source)
      values (c.company_id, (r ->> 'day')::date, (r ->> 'cases')::int, (r ->> 'picks')::int, (r ->> 'units')::int, (r ->> 'labour_hours')::numeric, c.system)
      on conflict (company_id, day) do update set cases = excluded.cases, picks = excluded.picks, units = excluded.units,
        labour_hours = excluded.labour_hours, source = excluded.source, updated_at = now();
    else
      raise exception 'Importing % from a file is not supported yet', p_target;
    end if;
    n := n + 1;
  end loop;
  run := record_run(c.id, 'ok', p_rows_in, n, p_checks, p_raw_sha, null);
  return jsonb_build_object('status', 'ok', 'written', n, 'run_id', run);
end $$;
grant execute on function import_records(uuid, text, jsonb, jsonb, integer, text) to authenticated, service_role;
