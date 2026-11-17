-- =====================================================================================
-- Measures and the red / amber / green rules.
--
-- How a colour is decided
--  1. compute_measures() works out each measure for a day from the standard records,
--     for the whole company and for each division (so a Transport Manager's dashboard
--     uses transport figures only).
--  2. Each company has thresholds per measure (defaults below until Paul sets his own).
--     "higher is better": green if value >= green_at, amber if >= amber_at, else red.
--     "lower is better":  green if value <= green_at, amber if <= amber_at, else red.
--  3. No value means 'no_data' (grey), never green. A quadrant takes the worst colour of
--     the measures the person can see.
-- =====================================================================================

create table measures (
  code text primary key,
  quadrant text not null check (quadrant in ('hs', 'service', 'cost', 'people', 'compliance')),
  area text not null references areas(code),
  division division,                         -- null = applies to the whole company
  name text not null, unit text not null,
  better text not null check (better in ('higher', 'lower')),
  default_green numeric, default_amber numeric,
  headline boolean not null default false,   -- shown beside the bullseye
  company_only boolean not null default false, -- only meaningful company-wide (hidden from 'own' access)
  sort integer not null default 0,
  description text not null
);

insert into measures (code, quadrant, area, division, name, unit, better, default_green, default_amber, headline, sort, description) values
  ('service.otif',             'service',    'service',    'transport', 'On time in full',                   '%',      'higher', 98, 95, true,  1, 'Jobs delivered on the day that arrived by the due time and in full, as a share of all jobs delivered that day.'),
  ('service.on_time',          'service',    'service',    'transport', 'On time',                           '%',      'higher', 98, 95, false, 2, 'Jobs delivered on the day that arrived by the due time.'),
  ('service.picks_per_hour',   'service',    'service',    'warehouse', 'Picks per labour hour',             'picks',  'higher', null, null, false, 3, 'Warehouse picks divided by labour hours for the day.'),
  ('service.cases_per_hour',   'service',    'service',    'warehouse', 'Cases per labour hour (work rate)', 'cases',  'higher', null, null, false, 4, 'Cases handled divided by labour hours for the day.'),
  ('cost.revenue_vs_plan',     'cost',       'cost',       null,        'Revenue against plan',              '%',      'higher', 100, 95, true, 1, 'Revenue for the month so far against the monthly plan, pro rata to the day.'),
  ('cost.job_cost_vs_plan',    'cost',       'cost',       'transport', 'Job cost against plan',             '%',      'lower',  100, 105, false, 2, 'Actual cost of jobs delivered on the day as a percentage of their planned cost.'),
  ('cost.cost_per_case',       'cost',       'cost',       'warehouse', 'Warehouse cost per case',           '£',      'lower',  null, null, false, 3, 'Warehouse costs for the day divided by cases handled.'),
  ('people.absence_pct',       'people',     'people',     null,        'Absence',                           '%',      'lower',  3, 5, false, 1, 'Staff absent on the day as a share of active staff.'),
  ('people.holiday_pct',       'people',     'people',     null,        'On holiday',                        '%',      'lower',  15, 25, false, 2, 'Staff on holiday on the day as a share of active staff.'),
  ('people.overtime_pct',      'people',     'people',     null,        'Overtime (last 7 days)',            '%',      'lower',  10, 15, false, 3, 'Overtime hours in the last 7 days as a share of contracted hours.'),
  ('people.wtd_breaches',      'people',     'people',     null,        'Working time breaches (last 7 days)', 'count', 'lower',  0, 2, false, 4, 'Working time directive breaches recorded in the last 7 days.'),
  ('hs.accidents_mtd',         'hs',         'hs',         null,        'Accidents this month',              'count',  'lower',  0, 1, true,  1, 'Accidents and personal accidents recorded this month.'),
  ('hs.near_misses_open',      'hs',         'hs',         null,        'Open near misses',                  'count',  'lower',  0, 2, false, 2, 'Near misses still open.'),
  ('hs.days_since_accident',   'hs',         'hs',         null,        'Days since last accident',          'days',   'higher', 30, 7, false, 3, 'Days since the most recent accident or personal accident.'),
  ('compliance.infringements_7d', 'compliance', 'compliance', 'transport', 'Infringements (last 7 days)',    'count',  'lower',  0, 3, true,  1, 'Drivers'' hours infringements recorded in the last 7 days.'),
  ('compliance.overdue',       'compliance', 'compliance', null,        'Overdue items',                     'count',  'lower',  0, 0, false, 2, 'MOTs, inspections, checks, training and audit actions past their due date.'),
  ('compliance.due_14',        'compliance', 'compliance', null,        'Due in the next 14 days',           'count',  'lower',  2, 5, false, 3, 'Compliance items due in the next 14 days.'),
  ('compliance.open_defects',  'compliance', 'compliance', 'transport', 'Open vehicle defects',              'count',  'lower',  0, 2, false, 4, 'Defects reported and not yet rectified.');

create table thresholds (
  company_id uuid not null references companies(id) on delete cascade,
  measure_code text not null references measures(code),
  green_at numeric not null, amber_at numeric not null,
  changed_by uuid, changed_at timestamptz not null default now(),
  primary key (company_id, measure_code)
);

-- scope: 'all' (whole company), 'transport' or 'warehouse'
create table measure_values (
  company_id uuid not null references companies(id) on delete cascade,
  measure_code text not null references measures(code),
  day date not null,
  scope text not null check (scope in ('all', 'transport', 'warehouse')),
  value numeric,
  computed_at timestamptz not null default now(),
  primary key (company_id, measure_code, day, scope)
);

alter table measures enable row level security;
alter table thresholds enable row level security;
alter table measure_values enable row level security;
create policy read_measures on measures for select using (true);
create policy read_thresholds on thresholds for select using (app.is_admin() or (app.mfa_ok() and company_id = app.company()));
create policy read_values on measure_values for select using (
  app.sees(company_id, (select m.area from measures m where m.code = measure_code),
           case scope when 'all' then null else scope::division end)
  and (scope <> 'all' or app.access((select m.area from measures m where m.code = measure_code)) = 'full' or app.is_admin()));
grant select on measures, thresholds, measure_values to authenticated;

-- ---------------------------------------------------------------- computing a measure
create or replace function app.measure_value(p_company uuid, p_code text, p_day date, p_div division) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v numeric; n numeric; d numeric;
  m_start date := date_trunc('month', p_day)::date;
  tz text := coalesce((select settings ->> 'timezone' from companies where id = p_company), 'Europe/London');
begin
  if p_code in ('service.otif', 'service.on_time') then
    select count(*) filter (where delivered_at <= due_at and (p_code = 'service.on_time' or in_full is not false)), count(*)
      into n, d from jobs
     where company_id = p_company and status = 'delivered' and (delivered_at at time zone tz)::date = p_day
       and due_at is not null and (p_div is null or division = p_div);
    return case when d > 0 then round(100 * n / d, 1) end;

  elsif p_code in ('service.picks_per_hour', 'service.cases_per_hour') then
    select case when labour_hours > 0 then round((case when p_code = 'service.picks_per_hour' then picks else cases end) / labour_hours, 1) end
      into v from warehouse_daily where company_id = p_company and day = p_day;
    return v;

  elsif p_code = 'cost.revenue_vs_plan' then
    select sum(c.revenue) into n from job_costs c join jobs j on j.id = c.job_id
     where j.company_id = p_company and j.status = 'delivered'
       and (j.delivered_at at time zone tz)::date between m_start and p_day and (p_div is null or j.division = p_div);
    select sum(amount) into d from revenue_plan where company_id = p_company and month = m_start and (p_div is null or division = p_div);
    if d is null or d = 0 then return null; end if;
    d := d * extract(day from p_day) / extract(day from (m_start + interval '1 month' - interval '1 day'));
    return round(100 * coalesce(n, 0) / d, 1);

  elsif p_code = 'cost.job_cost_vs_plan' then
    select sum(c.actual_cost), sum(c.planned_cost) into n, d from job_costs c join jobs j on j.id = c.job_id
     where j.company_id = p_company and j.status = 'delivered' and (j.delivered_at at time zone tz)::date = p_day
       and c.actual_cost is not null and c.planned_cost > 0 and (p_div is null or j.division = p_div);
    return case when d > 0 then round(100 * n / d, 1) end;

  elsif p_code = 'cost.cost_per_case' then
    select sum(amount) into n from cost_daily where company_id = p_company and day = p_day and division = 'warehouse';
    select cases into d from warehouse_daily where company_id = p_company and day = p_day;
    return case when d > 0 and n is not null then round(n / d, 2) end;

  elsif p_code in ('people.absence_pct', 'people.holiday_pct') then
    select count(*) into d from staff where company_id = p_company and status = 'active' and (p_div is null or division = p_div);
    select count(distinct e.staff_id) into n from people_events e join staff s on s.id = e.staff_id
     where e.company_id = p_company and e.day = p_day and s.status = 'active'
       and e.kind = case p_code when 'people.absence_pct' then 'absence' else 'holiday' end and (p_div is null or s.division = p_div);
    return case when d > 0 then round(100 * n / d, 1) end;

  elsif p_code = 'people.overtime_pct' then
    select sum(contracted_hours) into d from staff where company_id = p_company and status = 'active' and (p_div is null or division = p_div);
    select sum(e.hours) into n from people_events e join staff s on s.id = e.staff_id
     where e.company_id = p_company and e.kind = 'overtime' and e.day between p_day - 6 and p_day and (p_div is null or s.division = p_div);
    return case when d > 0 then round(100 * coalesce(n, 0) / d, 1) end;

  elsif p_code = 'people.wtd_breaches' then
    select count(*) into n from people_events e join staff s on s.id = e.staff_id
     where e.company_id = p_company and e.kind = 'wtd_breach' and e.day between p_day - 6 and p_day and (p_div is null or s.division = p_div);
    return n;

  elsif p_code = 'hs.accidents_mtd' then
    select count(*) into n from incidents where company_id = p_company and kind in ('accident', 'personal_accident')
       and (occurred_at at time zone tz)::date between m_start and p_day and (p_div is null or division = p_div or division is null);
    return n;

  elsif p_code = 'hs.near_misses_open' then
    select count(*) into n from incidents where company_id = p_company and kind = 'near_miss' and status = 'open'
       and (occurred_at at time zone tz)::date <= p_day and (p_div is null or division = p_div or division is null);
    return n;

  elsif p_code = 'hs.days_since_accident' then
    select p_day - max((occurred_at at time zone tz)::date) into n from incidents
     where company_id = p_company and kind in ('accident', 'personal_accident') and (occurred_at at time zone tz)::date <= p_day
       and (p_div is null or division = p_div or division is null);
    return n;

  elsif p_code = 'compliance.infringements_7d' then
    select count(*) into n from infringements where company_id = p_company and occurred_on between p_day - 6 and p_day and (p_div is null or division = p_div);
    return n;

  elsif p_code in ('compliance.overdue', 'compliance.due_14') then
    select count(*) into n from compliance_items where company_id = p_company and done_date is null
       and (p_div is null or division = p_div or division is null)
       and case p_code when 'compliance.overdue' then due_date < p_day else due_date between p_day and p_day + 14 end;
    return n;

  elsif p_code = 'compliance.open_defects' then
    select count(*) into n from defects where company_id = p_company and rectified_at is null
       and (reported_at at time zone tz)::date <= p_day and (p_div is null or division = p_div);
    return n;
  end if;
  raise exception 'Unknown measure %', p_code;
end $$;
revoke all on function app.measure_value(uuid, text, date, division) from public;

-- Works out every measure for one company and day, for each scope. Run nightly after the
-- connections update (and on demand from the admin console).
create or replace function compute_measures(p_company uuid, p_day date) returns integer
language plpgsql security definer set search_path = public as $$
declare m measures; s text; n integer := 0;
begin
  if not (app.is_service() or app.is_admin()) then
    raise exception 'Only the platform can recompute measures';
  end if;
  for m in select * from measures loop
    foreach s in array array['all', 'transport', 'warehouse'] loop
      continue when m.division is not null and s not in ('all', m.division::text);
      insert into measure_values (company_id, measure_code, day, scope, value)
      values (p_company, m.code, p_day, s, app.measure_value(p_company, m.code, p_day, case s when 'all' then null else s::division end))
      on conflict (company_id, measure_code, day, scope) do update set value = excluded.value, computed_at = now();
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function compute_measures(uuid, date) from public;
grant execute on function compute_measures(uuid, date) to authenticated, service_role;

create or replace function app.rag(p_value numeric, p_better text, p_green numeric, p_amber numeric) returns text
language sql immutable as $$
  select case
    when p_value is null then 'no_data'
    when p_green is null or p_amber is null then 'no_target'
    when p_better = 'higher' then case when p_value >= p_green then 'green' when p_value >= p_amber then 'amber' else 'red' end
    else case when p_value <= p_green then 'green' when p_value <= p_amber then 'amber' else 'red' end
  end $$;

-- A director (or the platform admin) sets the thresholds for their company.
create or replace function set_threshold(p_measure text, p_green numeric, p_amber numeric, p_company uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid := coalesce(p_company, app.company()); m measures;
begin
  select * into m from measures where code = p_measure;
  if m is null then raise exception 'Unknown measure %', p_measure; end if;
  if not (app.is_admin() or coalesce(c = app.company() and (app.me()).role = 'director' and app.mfa_ok(), false)) then
    raise exception 'Only a director can change targets';
  end if;
  if (m.better = 'higher' and p_amber > p_green) or (m.better = 'lower' and p_amber < p_green) then
    raise exception 'For "%", the amber level must be % the green level', m.name, case m.better when 'higher' then 'at or below' else 'at or above' end;
  end if;
  insert into thresholds (company_id, measure_code, green_at, amber_at, changed_by) values (c, p_measure, p_green, p_amber, auth.uid())
  on conflict (company_id, measure_code) do update set green_at = excluded.green_at, amber_at = excluded.amber_at, changed_by = excluded.changed_by, changed_at = now();
  perform app.audit(c, 'threshold_changed', p_measure, jsonb_build_object('green', p_green, 'amber', p_amber));
end $$;
grant execute on function set_threshold(text, numeric, numeric, uuid) to authenticated;
