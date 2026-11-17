-- =====================================================================================
-- Standard records. Every connector (Vigo, Road Tech, Xero, SharePoint, BrightPay, files)
-- maps its data into these tables, so the rest of the platform never needs to know which
-- system a figure came from.
--
-- Common columns
--   company_id   which haulier
--   division     transport or warehouse (null = company-wide); drives 'own' access
--   source       the connection (or 'manual' / 'import') that supplied the row
--   external_ref the record's id in the source system, so re-imports update instead of duplicate
--
-- Money lives only in cost, pnl and payroll tables, so roles without those areas never
-- receive a single figure, whatever screen they open.
-- Writes come from connectors (service role) or the functions in later migrations.
-- =====================================================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null, account_code text,
  source text not null default 'manual', external_ref text,
  updated_at timestamptz not null default now(),
  unique (company_id, source, external_ref)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  registration text not null, vehicle_type text, make_model text,
  division division not null default 'transport',
  status text not null default 'active' check (status in ('active', 'off_road', 'disposed')),
  source text not null default 'manual', external_ref text,
  updated_at timestamptz not null default now(),
  unique (company_id, registration)
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null, employee_no text, job_title text,
  division division,
  is_driver boolean not null default false,
  contracted_hours numeric(5, 2),
  status text not null default 'active' check (status in ('active', 'left')),
  source text not null default 'manual', external_ref text,
  updated_at timestamptz not null default now(),
  unique (company_id, employee_no)
);

-- Jobs (from the TMS). No money here: revenue and costs are in job_costs.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_ref text not null,
  customer_id uuid references customers(id),
  division division not null default 'transport',
  job_date date not null,
  due_at timestamptz, delivered_at timestamptz,
  in_full boolean,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'delivered', 'cancelled')),
  pod_received boolean not null default false,
  source text not null default 'manual', external_ref text,
  updated_at timestamptz not null default now(),
  unique (company_id, job_ref)
);
create index on jobs (company_id, job_date);

create table job_costs (
  job_id uuid primary key references jobs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  division division not null default 'transport',
  revenue numeric(12, 2), planned_cost numeric(12, 2), actual_cost numeric(12, 2),
  source text not null default 'manual', updated_at timestamptz not null default now()
);

-- Daily warehouse activity (warehouse system or spreadsheet).
create table warehouse_daily (
  company_id uuid not null references companies(id) on delete cascade,
  day date not null,
  cases integer, picks integer, units integer, labour_hours numeric(8, 2),
  source text not null default 'manual', updated_at timestamptz not null default now(),
  primary key (company_id, day)
);

-- Operational costs by day (fuel, labour, vehicle, warehouse overheads), for cost per case etc.
create table cost_daily (
  company_id uuid not null references companies(id) on delete cascade,
  day date not null, division division not null, category text not null,
  amount numeric(12, 2) not null,
  source text not null default 'manual', updated_at timestamptz not null default now(),
  primary key (company_id, day, division, category)
);

-- Revenue budget per month, for "revenue against plan".
create table revenue_plan (
  company_id uuid not null references companies(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  division division, amount numeric(12, 2) not null,
  primary key (company_id, month)
);

-- Company profit and loss lines (from Xero).
create table pnl_lines (
  company_id uuid not null references companies(id) on delete cascade,
  month date not null, account text not null, category text not null check (category in ('revenue', 'cost_of_sales', 'overheads', 'other')),
  amount numeric(12, 2) not null,
  source text not null default 'xero', updated_at timestamptz not null default now(),
  primary key (company_id, month, account)
);

-- Holiday, absence, overtime and working time events (SharePoint sheets, BrightPay, Tachomaster).
create table people_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  kind text not null check (kind in ('holiday', 'absence', 'overtime', 'wtd_breach')),
  day date not null, hours numeric(6, 2),
  note text,
  source text not null default 'manual', external_ref text,
  unique (company_id, source, external_ref)
);
create index on people_events (company_id, day);

-- Disciplinary and grievance cases. Detail is restricted; counts are published through hr_case_counts.
create table hr_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  kind text not null check (kind in ('disciplinary', 'grievance')),
  opened_on date not null, closed_on date,
  detail text,
  source text not null default 'manual', external_ref text
);

create table payroll_periods (
  company_id uuid not null references companies(id) on delete cascade,
  period_end date not null, division division,
  gross_pay numeric(12, 2), employer_costs numeric(12, 2), hours numeric(10, 2), overtime_hours numeric(10, 2),
  source text not null default 'brightpay', updated_at timestamptz not null default now(),
  primary key (company_id, period_end)
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind text not null check (kind in ('accident', 'personal_accident', 'near_miss')),
  occurred_at timestamptz not null,
  division division,
  description text, severity text check (severity in ('minor', 'serious', 'riddor')),
  status text not null default 'open' check (status in ('open', 'closed')),
  actions_open integer not null default 0,
  source text not null default 'manual', external_ref text,
  unique (company_id, source, external_ref)
);
create index on incidents (company_id, occurred_at);

create table infringements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  occurred_on date not null, infringement_type text not null, severity text,
  division division not null default 'transport',
  source text not null default 'tachomaster', external_ref text,
  unique (company_id, source, external_ref)
);

-- Anything with a due date: MOT, safety inspection, tacho calibration, licence check, CPC,
-- training, O-licence obligations, BRC and FORS actions, policy reviews.
create table compliance_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind text not null check (kind in ('mot', 'pmi', 'tacho_calibration', 'licence_check', 'cpc', 'driver_card', 'training', 'o_licence', 'brc', 'fors', 'policy_review', 'other')),
  subject text not null,                       -- e.g. a registration, a person, 'BRC audit action 4'
  vehicle_id uuid references vehicles(id) on delete cascade,
  staff_id uuid references staff(id) on delete cascade,
  division division,
  due_date date not null, done_date date,
  source text not null default 'manual', external_ref text,
  unique (company_id, source, external_ref)
);

create table defects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete cascade,
  reported_at timestamptz not null, description text not null,
  severity text check (severity in ('minor', 'dangerous')),
  rectified_at timestamptz,
  division division not null default 'transport',
  source text not null default 'predrive', external_ref text,
  unique (company_id, source, external_ref)
);

-- ---------------------------------------------------------------- row-level security
do $$
declare t record;
begin
  for t in select * from (values
    ('customers', 'records', 'null'), ('vehicles', 'records', 'division'), ('staff', 'people', 'division'),
    ('jobs', 'service', 'division'), ('job_costs', 'cost', 'division'), ('warehouse_daily', 'service', '''warehouse''::division'),
    ('cost_daily', 'cost', 'division'), ('revenue_plan', 'cost', 'division'), ('pnl_lines', 'pnl', 'null'),
    ('payroll_periods', 'payroll', 'division'), ('incidents', 'hs', 'division'), ('infringements', 'compliance', 'division'),
    ('compliance_items', 'compliance', 'division'), ('defects', 'compliance', 'division'), ('hr_cases', 'people_detail', 'null')
  ) v(tbl, area, divexpr) loop
    execute format('alter table %I enable row level security', t.tbl);
    execute format('create policy read_rows on %I for select using (app.sees(company_id, %L, %s))', t.tbl, t.area, t.divexpr);
    execute format('grant select on %I to authenticated', t.tbl);
  end loop;
end $$;

-- People events follow the person's division.
alter table people_events enable row level security;
create policy read_rows on people_events for select using (
  app.sees(company_id, 'people', (select s.division from staff s where s.id = staff_id)));
grant select on people_events to authenticated;

-- Counts of open disciplinary and grievance cases, for anyone with People access.
create or replace function hr_case_counts() returns table (division division, kind text, open_cases bigint)
language sql stable security definer set search_path = public as $$
  select s.division, c.kind, count(*) from hr_cases c left join staff s on s.id = c.staff_id
  where c.company_id = app.company() and c.closed_on is null and app.sees(c.company_id, 'people', s.division)
  group by 1, 2 $$;
grant execute on function hr_case_counts() to authenticated;

grant all on all tables in schema public to service_role;
