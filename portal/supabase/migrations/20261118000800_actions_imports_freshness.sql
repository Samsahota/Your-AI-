-- =====================================================================================
-- 1. Actions: raise an action against a figure or a record, give it an owner, a priority and a
--    follow-up date, record progress, complete or reopen it. Internal to Clearpath: nothing is
--    ever written back to Vigo, Xero or any other system.
-- 2. How old a feed may be before its figures show "Not updated" now follows its schedule
--    (weekly and monthly feeds added), and the admin health list uses the same rule.
-- 3. An untouched copy of every imported file (or API reply) is kept, with its fingerprint.
-- 4. File import covers every record table, and directors can enter the monthly revenue plan.
-- =====================================================================================

-- ---------------------------------------------------------------- 1. actions
create table actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  ref text not null,                                   -- A-0001, per company
  area text not null references areas(code),
  division division,
  title text not null check (length(trim(title)) between 3 and 200),
  notes text check (length(notes) <= 2000),
  link_kind text not null default 'none' check (link_kind in ('none', 'measure', 'incident', 'compliance_item', 'defect', 'infringement', 'job', 'vehicle', 'staff', 'connection', 'document')),
  link_id text, link_label text,
  owner uuid not null, owner_name text not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid, created_by_name text not null,
  created_at timestamptz not null default now(), closed_at timestamptz,
  unique (company_id, ref)
);
create index actions_open_idx on actions (company_id, status, due_date);
create index actions_owner_idx on actions (owner, status);
create index actions_area_idx on actions (area);

create table action_updates (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  kind text not null check (kind in ('raised', 'progress', 'completed', 'reopened', 'reassigned')),
  note text check (length(note) <= 2000),
  by_user uuid, by_name text not null,
  at timestamptz not null default now()
);
create index action_updates_action_idx on action_updates (action_id, at);
create index action_updates_company_idx on action_updates (company_id);

alter table actions enable row level security;
alter table action_updates enable row level security;
-- Seen by anyone who can see that area (and division), and always by the owner.
create policy read_actions on actions for select using (
  app.sees(company_id, area, division) or (app.mfa_ok() and owner = (select auth.uid()) and company_id = app.company()));
create policy read_action_updates on action_updates for select using (exists (select 1 from actions a where a.id = action_id));
grant select on actions, action_updates to authenticated;
grant all on actions, action_updates to service_role;

-- Another user's access level to an area (same rule as app.access, for someone else).
create or replace function app.level_for(p_user uuid, p_area text) returns access_level
language sql stable security definer set search_path = public as $$
  select case when p.role = 'platform_admin' then 'full'::access_level else coalesce(
    (select o.level from access_overrides o where o.company_id = p.company_id and o.role = p.role and o.area = p_area),
    (select r.level from role_access r where r.role = p.role and r.area = p_area), 'none'::access_level) end
  from profiles p where p.user_id = p_user and p.status = 'active' $$;

-- Can this person own an action in this company, area and division?
create or replace function app.can_own(p_user uuid, p_company uuid, p_area text, p_division division) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.company_id = p_company and case app.level_for(p.user_id, p_area)
      when 'full' then true when 'own' then p_division is null or p_division = p.division else false end
    from profiles p where p.user_id = p_user and p.status = 'active'), false) $$;

-- People who can own an action here, for the owner list.
create or replace function action_owners(p_area text, p_division division default null, p_company uuid default null)
returns table (user_id uuid, name text, role portal_role)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.name, p.role from profiles p
  where p.company_id = app.target_company(p_company) and p.status = 'active' and app.mfa_ok()
    and app.sees(app.target_company(p_company), p_area, p_division)
    and app.can_own(p.user_id, app.target_company(p_company), p_area, p_division)
  order by p.name $$;

create or replace function raise_action(p_area text, p_title text, p_owner uuid, p_due date, p_priority text default 'medium',
  p_notes text default null, p_link_kind text default 'none', p_link_id text default null, p_link_label text default null,
  p_division division default null, p_company uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profiles := app.me(); co uuid := app.target_company(p_company); v uuid; r text; own text;
begin
  if me.user_id is null or not app.mfa_ok() then raise exception 'Sign in with two-factor authentication first'; end if;
  if co is null then raise exception 'Choose a company first'; end if;
  if not app.sees(co, p_area, p_division) then raise exception 'You do not have access to raise actions here'; end if;
  if coalesce(length(trim(p_title)), 0) < 3 then raise exception 'Say what needs to happen'; end if;
  if p_due is null then raise exception 'Choose a follow-up date'; end if;
  if p_due < (now() at time zone 'Europe/London')::date then raise exception 'The follow-up date cannot be in the past'; end if;
  if not app.can_own(p_owner, co, p_area, p_division) then raise exception 'That person cannot see this area, so cannot own the action'; end if;
  select name into own from profiles where user_id = p_owner;
  perform pg_advisory_xact_lock(hashtext('actions:' || co::text));
  r := 'A-' || lpad(((select count(*) from actions where company_id = co) + 1)::text, 4, '0');
  insert into actions (company_id, ref, area, division, title, notes, link_kind, link_id, link_label, owner, owner_name, priority, due_date, created_by, created_by_name)
  values (co, r, p_area, p_division, trim(p_title), nullif(trim(p_notes), ''), coalesce(p_link_kind, 'none'), p_link_id, p_link_label, p_owner, own,
    coalesce(p_priority, 'medium'), p_due, me.user_id, me.name)
  returning id into v;
  insert into action_updates (action_id, company_id, kind, note, by_user, by_name) values (v, co, 'raised', nullif(trim(p_notes), ''), me.user_id, me.name);
  perform app.audit(co, 'action_raised', r || ': ' || trim(p_title), jsonb_build_object('owner', own, 'due', p_due, 'priority', p_priority, 'link', p_link_label));
  return jsonb_build_object('id', v, 'ref', r);
end $$;

-- Progress, complete, reopen or reassign. Allowed for the owner, the person who raised it, and
-- managers (director, operations, consultant, platform admin) who can see the area.
create or replace function update_action(p_action uuid, p_kind text, p_note text default null, p_owner uuid default null, p_due date default null)
returns void language plpgsql security definer set search_path = public as $$
declare me profiles := app.me(); a actions; own text;
begin
  select * into a from actions where id = p_action;
  if a is null or me.user_id is null or not app.mfa_ok()
     or not (app.sees(a.company_id, a.area, a.division) or (a.owner = me.user_id and a.company_id = app.company())) then
    raise exception 'Action not found';
  end if;
  if not (a.owner = me.user_id or a.created_by = me.user_id or app.is_admin()
          or (me.role in ('director', 'operations', 'consultant') and app.sees(a.company_id, a.area, a.division))) then
    raise exception 'Only the owner, the person who raised it or a manager can update this action';
  end if;
  if p_kind = 'progress' then
    if coalesce(trim(p_note), '') = '' then raise exception 'Say what has happened'; end if;
    if a.status = 'done' then raise exception 'Reopen the action to add progress'; end if;
  elsif p_kind = 'completed' then
    if a.status = 'done' then raise exception 'This action is already complete'; end if;
    update actions set status = 'done', closed_at = now() where id = a.id;
  elsif p_kind = 'reopened' then
    if a.status = 'open' then raise exception 'This action is already open'; end if;
    update actions set status = 'open', closed_at = null where id = a.id;
  elsif p_kind = 'reassigned' then
    if p_owner is null and p_due is null then raise exception 'Choose a new owner or follow-up date'; end if;
    if p_owner is not null and not app.can_own(p_owner, a.company_id, a.area, a.division) then raise exception 'That person cannot see this area, so cannot own the action'; end if;
    if p_due is not null and p_due < (now() at time zone 'Europe/London')::date then raise exception 'The follow-up date cannot be in the past'; end if;
    select name into own from profiles where user_id = coalesce(p_owner, a.owner);
    update actions set owner = coalesce(p_owner, owner), owner_name = own, due_date = coalesce(p_due, due_date) where id = a.id;
    p_note := concat_ws('. ', case when p_owner is not null and p_owner <> a.owner then 'Owner changed to ' || own end,
                              case when p_due is not null and p_due <> a.due_date then 'Follow-up moved to ' || to_char(p_due, 'DD/MM/YYYY') end, nullif(trim(p_note), ''));
  else
    raise exception 'Unknown update';
  end if;
  insert into action_updates (action_id, company_id, kind, note, by_user, by_name) values (a.id, a.company_id, p_kind, nullif(trim(p_note), ''), me.user_id, me.name);
  perform app.audit(a.company_id, 'action_' || p_kind, a.ref || ': ' || a.title, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------- 2. how old a feed may be
create or replace function app.max_age(p_schedule text) returns interval language sql immutable set search_path = '' as $$
  select case p_schedule
    when 'every_15_min' then interval '2 hours' when 'hourly' then interval '6 hours'
    when 'weekly' then interval '8 days' when 'monthly' then interval '35 days'
    else interval '36 hours' end $$;

create or replace function app.stale_tables(p_company uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct f), '{}') from connections c, unnest(c.feeds) f
  where c.company_id = p_company and c.status <> 'paused' and (
    c.status = 'failing' or (c.status = 'connected' and c.last_success_at < now() - app.max_age(c.schedule)))
$$;

-- Every connection across every company, with whether it needs attention (platform admin only).
create or replace function connection_health() returns table (connection_id uuid, company_id uuid, company text, system text, label text,
  status text, schedule text, last_success_at timestamptz, last_error text, allowed_age text, needs_attention boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.company_id, co.name, c.system, c.label, c.status, c.schedule, c.last_success_at, c.last_error,
    case c.schedule when 'every_15_min' then '2 hours' when 'hourly' then '6 hours' when 'weekly' then '8 days' when 'monthly' then '35 days' else '36 hours' end,
    c.status = 'failing' or (c.status = 'connected' and c.last_success_at < now() - app.max_age(c.schedule))
  from connections c join companies co on co.id = c.company_id
  where app.is_admin() or app.is_service()
  order by co.name, c.system $$;

-- ---------------------------------------------------------------- 3. untouched copies
create table source_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  connection_id uuid not null references connections(id) on delete cascade,
  file_name text not null, sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null, content text not null,
  received_at timestamptz not null default now(), received_by uuid,
  unique (connection_id, sha256)
);
create index source_files_company_idx on source_files (company_id, received_at desc);
alter table source_files enable row level security;
create policy read_source_files on source_files for select using (app.is_admin());
grant select on source_files to authenticated;
grant all on source_files to service_role;

-- Keeps the file exactly as received; the fingerprint is worked out here, not trusted from the browser.
create or replace function store_source_file(p_connection uuid, p_file_name text, p_content text) returns text
language plpgsql security definer set search_path = public as $$
declare c connections; v uuid; h text;
begin
  if not (app.is_service() or app.is_admin()) then raise exception 'Only the platform can store source files'; end if;
  select * into c from connections where id = p_connection;
  if c is null then raise exception 'Unknown connection'; end if;
  if p_content is null or octet_length(p_content) = 0 then raise exception 'The file is empty'; end if;
  if octet_length(p_content) > 10 * 1024 * 1024 then raise exception 'Files over 10 MB need to be split'; end if;
  h := encode(sha256(convert_to(p_content, 'UTF8')), 'hex');
  insert into source_files (company_id, connection_id, file_name, sha256, size_bytes, content, received_by)
  values (c.company_id, c.id, coalesce(nullif(trim(p_file_name), ''), 'file'), h, octet_length(p_content), p_content, auth.uid())
  on conflict (connection_id, sha256) do update set file_name = excluded.file_name
  returning id into v;
  perform app.audit(c.company_id, 'source_file_stored', p_file_name, jsonb_build_object('sha256', h, 'bytes', octet_length(p_content)));
  return 'source_files/' || v || '#' || h;
end $$;

-- ---------------------------------------------------------------- 4. revenue plan
create or replace function set_revenue_plan(p_month date, p_amount numeric, p_company uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare co uuid := app.target_company(p_company); m date := date_trunc('month', p_month)::date;
begin
  if co is null or not (app.is_admin() or (app.mfa_ok() and coalesce((app.me()).role in ('director', 'consultant'), false) and app.access('cost') = 'full')) then
    raise exception 'Only a director or the consultant can set the revenue plan';
  end if;
  if p_amount is null then delete from revenue_plan where company_id = co and month = m;
  elsif p_amount < 0 then raise exception 'The plan cannot be negative';
  else insert into revenue_plan (company_id, month, amount) values (co, m, p_amount)
       on conflict (company_id, month) do update set amount = excluded.amount; end if;
  perform app.audit(co, 'revenue_plan_set', to_char(m, 'Mon YYYY'), jsonb_build_object('amount', p_amount));
end $$;

-- ---------------------------------------------------------------- file import: every record table
create or replace function import_records(p_connection uuid, p_target text, p_records jsonb, p_checks jsonb, p_rows_in integer, p_raw_sha text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c connections; r jsonb; n integer := 0; run uuid; sid uuid; vid uuid; cid uuid; jid uuid;
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
    elsif p_target = 'customers' then
      insert into customers (company_id, name, account_code, source, external_ref)
      values (c.company_id, r ->> 'name', r ->> 'account_code', c.system, r ->> 'account_code')
      on conflict (company_id, source, external_ref) do update set name = excluded.name, account_code = excluded.account_code, updated_at = now();
    elsif p_target = 'vehicles' then
      insert into vehicles (company_id, registration, vehicle_type, make_model, division, status, source, external_ref)
      values (c.company_id, upper(replace(r ->> 'registration', ' ', '')), r ->> 'vehicle_type', r ->> 'make_model',
        coalesce(nullif(lower(r ->> 'division'), '')::division, 'transport'), coalesce(nullif(replace(lower(r ->> 'status'), ' ', '_'), ''), 'active'), c.system, r ->> 'registration')
      on conflict (company_id, registration) do update set vehicle_type = excluded.vehicle_type, make_model = excluded.make_model,
        division = excluded.division, status = excluded.status, updated_at = now();
    elsif p_target = 'jobs' then
      cid := null;
      if coalesce(r ->> 'customer', '') <> '' then
        select id into cid from customers where company_id = c.company_id and (account_code = r ->> 'customer' or lower(name) = lower(r ->> 'customer')) limit 1;
        if cid is null then raise exception 'Row %: customer % is not in the customer list', n + 1, r ->> 'customer'; end if;
      end if;
      insert into jobs (company_id, job_ref, customer_id, division, job_date, due_at, delivered_at, in_full, status, pod_received, source, external_ref)
      values (c.company_id, r ->> 'job_ref', cid, coalesce(nullif(lower(r ->> 'division'), '')::division, 'transport'), (r ->> 'job_date')::date,
        nullif(r ->> 'due_at', '')::timestamptz, nullif(r ->> 'delivered_at', '')::timestamptz, (r ->> 'in_full')::boolean,
        coalesce(nullif(replace(lower(r ->> 'status'), ' ', '_'), ''), 'planned'), coalesce((r ->> 'pod_received')::boolean, false), c.system, r ->> 'job_ref')
      on conflict (company_id, job_ref) do update set customer_id = excluded.customer_id, division = excluded.division, job_date = excluded.job_date,
        due_at = excluded.due_at, delivered_at = excluded.delivered_at, in_full = excluded.in_full, status = excluded.status,
        pod_received = excluded.pod_received, source = excluded.source, updated_at = now();
    elsif p_target = 'job_costs' then
      select id into jid from jobs where company_id = c.company_id and job_ref = r ->> 'job_ref';
      if jid is null then raise exception 'Row %: job % is not in the jobs list; import jobs first', n + 1, r ->> 'job_ref'; end if;
      insert into job_costs (job_id, company_id, division, revenue, planned_cost, actual_cost, source)
      values (jid, c.company_id, coalesce(nullif(lower(r ->> 'division'), '')::division, 'transport'), (r ->> 'revenue')::numeric,
        (r ->> 'planned_cost')::numeric, (r ->> 'actual_cost')::numeric, c.system)
      on conflict (job_id) do update set division = excluded.division, revenue = excluded.revenue, planned_cost = excluded.planned_cost,
        actual_cost = excluded.actual_cost, source = excluded.source, updated_at = now();
    elsif p_target = 'defects' then
      vid := null;
      if coalesce(r ->> 'registration', '') <> '' then
        select id into vid from vehicles where company_id = c.company_id and registration = upper(replace(r ->> 'registration', ' ', ''));
        if vid is null then raise exception 'Row %: vehicle % is not in the fleet list', n + 1, r ->> 'registration'; end if;
      end if;
      insert into defects (company_id, vehicle_id, reported_at, description, severity, rectified_at, division, source, external_ref)
      values (c.company_id, vid, (r ->> 'reported_at')::timestamptz, r ->> 'description', nullif(lower(r ->> 'severity'), ''),
        nullif(r ->> 'rectified_at', '')::timestamptz, coalesce(nullif(lower(r ->> 'division'), '')::division, 'transport'), c.system, r ->> 'external_ref')
      on conflict (company_id, source, external_ref) do update set vehicle_id = excluded.vehicle_id, reported_at = excluded.reported_at,
        description = excluded.description, severity = excluded.severity, rectified_at = excluded.rectified_at, division = excluded.division;
    elsif p_target = 'infringements' then
      sid := null;
      if coalesce(r ->> 'employee_no', '') <> '' then
        select id into sid from staff where company_id = c.company_id and employee_no = r ->> 'employee_no';
        if sid is null then raise exception 'Row %: employee number % is not in the staff list', n + 1, r ->> 'employee_no'; end if;
      end if;
      insert into infringements (company_id, staff_id, occurred_on, infringement_type, severity, division, source, external_ref)
      values (c.company_id, sid, (r ->> 'occurred_on')::date, r ->> 'infringement_type', nullif(r ->> 'severity', ''),
        coalesce(nullif(lower(r ->> 'division'), '')::division, 'transport'), c.system, r ->> 'external_ref')
      on conflict (company_id, source, external_ref) do update set staff_id = excluded.staff_id, occurred_on = excluded.occurred_on,
        infringement_type = excluded.infringement_type, severity = excluded.severity, division = excluded.division;
    elsif p_target = 'cost_daily' then
      insert into cost_daily (company_id, day, division, category, amount, source)
      values (c.company_id, (r ->> 'day')::date, lower(r ->> 'division')::division, lower(r ->> 'category'), (r ->> 'amount')::numeric, c.system)
      on conflict (company_id, day, division, category) do update set amount = excluded.amount, source = excluded.source, updated_at = now();
    elsif p_target = 'pnl_lines' then
      insert into pnl_lines (company_id, month, account, category, amount, source)
      values (c.company_id, date_trunc('month', (r ->> 'month')::date)::date, r ->> 'account', replace(lower(r ->> 'category'), ' ', '_'), (r ->> 'amount')::numeric, c.system)
      on conflict (company_id, month, account) do update set category = excluded.category, amount = excluded.amount, source = excluded.source, updated_at = now();
    elsif p_target = 'payroll_periods' then
      insert into payroll_periods (company_id, period_end, division, gross_pay, employer_costs, hours, overtime_hours, source)
      values (c.company_id, (r ->> 'period_end')::date, nullif(lower(r ->> 'division'), '')::division, (r ->> 'gross_pay')::numeric,
        (r ->> 'employer_costs')::numeric, (r ->> 'hours')::numeric, (r ->> 'overtime_hours')::numeric, c.system)
      on conflict (company_id, period_end) do update set division = excluded.division, gross_pay = excluded.gross_pay, employer_costs = excluded.employer_costs,
        hours = excluded.hours, overtime_hours = excluded.overtime_hours, source = excluded.source, updated_at = now();
    elsif p_target = 'revenue_plan' then
      insert into revenue_plan (company_id, month, division, amount)
      values (c.company_id, date_trunc('month', (r ->> 'month')::date)::date, nullif(lower(r ->> 'division'), '')::division, (r ->> 'amount')::numeric)
      on conflict (company_id, month) do update set division = excluded.division, amount = excluded.amount;
    else
      raise exception 'Importing % from a file is not supported', p_target;
    end if;
    n := n + 1;
  end loop;
  run := record_run(c.id, 'ok', p_rows_in, n, p_checks, p_raw_sha, null);
  return jsonb_build_object('status', 'ok', 'written', n, 'run_id', run);
end $$;

-- ---------------------------------------------------------------- rights (as 0006: browser reads only, through checked functions)
revoke execute on all functions in schema public from anon, public;
grant execute on function action_owners(text, division, uuid), raise_action(text, text, uuid, date, text, text, text, text, text, division, uuid),
  update_action(uuid, text, text, uuid, date), connection_health(), store_source_file(uuid, text, text), set_revenue_plan(date, numeric, uuid),
  import_records(uuid, text, jsonb, jsonb, integer, text) to authenticated, service_role;
revoke execute on all functions in schema app from anon, public;
-- Helpers used only inside the checked functions above: not callable from the browser.
revoke execute on function app.level_for(uuid, text), app.can_own(uuid, uuid, text, division), app.max_age(text) from authenticated;
grant execute on function app.level_for(uuid, text), app.can_own(uuid, uuid, text, division), app.max_age(text) to service_role;
