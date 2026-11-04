-- =====================================================================================
-- Haulage Portal · core schema
-- Every business table carries tenant_id. Records use the source system's own IDs
-- (e.g. Vigo job numbers) as text keys, unique within a tenant.
-- Monetary values live in separate tables (job_financials, job_variances, recharges,
-- invoices, payments, funding_positions) so row-level security can withhold them whole.
-- =====================================================================================

create type app_role as enum ('director', 'operations', 'transport', 'viewonly', 'driver', 'customer');
create type user_status as enum ('invited', 'active', 'suspended');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  legal_name text,
  settings jsonb not null default jsonb_build_object(
    'variance_threshold_pct', 10,
    'revenue_target_daily', 17000,
    'link_hours', 24,
    'timezone', 'Europe/London',
    'business_date_override', null
  ),
  fleet_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email text not null,
  role app_role not null,
  title text,
  sections text[] not null default '{}',        -- view-only: permitted sections
  can_view_money boolean not null default false, -- view-only: explicit financial permission
  driver_id text,                                -- role = driver
  contact_id text,                               -- role = customer
  status user_status not null default 'invited',
  invited_by uuid references auth.users(id),
  invited_at timestamptz default now(),
  created_at timestamptz not null default now()
);
create index on profiles (tenant_id);

create table customers (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  name text not null,
  type text,
  terms_days int,
  account_ref text,
  ref_prefix text,
  primary key (tenant_id, id)
);

create table contacts (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  customer_id text not null,
  name text not null,
  title text,
  email text not null,
  notify boolean not null default true,
  user_id uuid references auth.users(id) on delete set null,
  primary key (tenant_id, id),
  foreign key (tenant_id, customer_id) references customers(tenant_id, id)
);

create table vehicles (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  type text not null,
  type_key text not null check (type_key in ('A', 'R26', 'R18', 'OTHER')),
  depot text,
  status text not null default 'available' check (status in ('available', 'vor')),
  vor_since date,
  vor_until date,
  vor_reason text,
  mot_due date,
  primary key (tenant_id, id)
);

create table drivers (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  name text not null,
  engagement text not null check (engagement in ('Employed', 'Limited company', 'Agency')),
  agency text,
  status text not null default 'active',
  licence_review_due date,
  licence_status text not null default 'ok',
  tacho_status text not null default 'ok',
  cpc_due date,
  primary key (tenant_id, id)
);

-- Day-specific planning state (from Tachomaster / Vigo in production). Illustrative planning only.
create table driver_days (
  tenant_id uuid not null references tenants(id) on delete cascade,
  driver_id text not null,
  date date not null,
  state text not null check (state in ('allocated', 'available', 'proposed', 'rest', 'leave', 'not_booked')),
  hours_avail_min int,
  source text default 'Tachomaster (planning estimate)',
  primary key (tenant_id, driver_id, date),
  foreign key (tenant_id, driver_id) references drivers(tenant_id, id)
);

create table jobs (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  date date not null,
  dest text not null,
  customer_id text not null,
  customer_ref text,
  vehicle_id text,
  driver_id text,
  planned_driver_id text,
  proposed_driver_id text,
  proposed_by uuid references auth.users(id),
  proposed_at timestamptz,
  slot text not null,                       -- HH:MM booked slot
  status text not null default 'not_started' check (status in ('not_started', 'en_route', 'on_site', 'delivered')),
  delivered_at text,                        -- HH:MM
  late boolean,
  eta timestamptz,
  miles numeric, actual_miles numeric, empty_miles numeric, hours numeric, pallets int,
  address text[], address_note text, instructions text, note text,
  subcontract boolean not null default false, subcontractor text,
  required_min int default 300,
  pod_status text not null default 'n/a' check (pod_status in ('n/a', 'missing', 'received')),
  pod_at timestamptz, pod_by text, pod_path text, pod_name text, pod_source text,
  invoice_status text not null default 'not_due' check (invoice_status in ('not_due', 'pending', 'invoiced', 'unmodelled')),
  invoice_id text,
  src text not null default 'vigo',          -- vigo | import | synthetic | supplied
  source_updated_at timestamptz,
  primary key (tenant_id, id),
  foreign key (tenant_id, customer_id) references customers(tenant_id, id)
);
create index on jobs (tenant_id, date);
create index on jobs (tenant_id, driver_id, date);

-- Money for a job. Withheld entirely from roles without financial permission.
create table job_financials (
  tenant_id uuid not null,
  job_id text not null,
  price numeric(12,2) not null,
  planned_cost numeric(12,2) not null,
  actual_cost numeric(12,2),
  overhead numeric(12,2),
  rate_card_version text,
  primary key (tenant_id, job_id),
  foreign key (tenant_id, job_id) references jobs(tenant_id, id) on delete cascade
);

create table job_variances (
  tenant_id uuid not null,
  job_id text not null,
  seq int not null,
  reason text not null,
  cat text not null,
  amount numeric(12,2) not null,
  primary key (tenant_id, job_id, seq),
  foreign key (tenant_id, job_id) references jobs(tenant_id, id) on delete cascade
);

create table recharge_candidates (
  tenant_id uuid not null,
  job_id text not null,
  amount numeric(12,2) not null,
  basis text not null,
  primary key (tenant_id, job_id),
  foreign key (tenant_id, job_id) references jobs(tenant_id, id) on delete cascade
);

create table recharges (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  job_id text not null,
  customer_id text not null,
  amount numeric(12,2) not null check (amount > 0),
  note text not null,
  status text not null default 'draft' check (status in ('draft', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  history jsonb not null default '[]'::jsonb,
  primary key (tenant_id, id),
  foreign key (tenant_id, job_id) references jobs(tenant_id, id)
);
create unique index one_draft_per_job on recharges (tenant_id, job_id) where status = 'draft';

create table job_checkins (
  id bigserial primary key,
  tenant_id uuid not null,
  job_id text not null,
  stage text not null check (stage in ('walkaround', 'depart', 'arrive', 'unloading', 'complete', 'pod')),
  at timestamptz not null default now(),
  by_label text,
  note text,
  foreign key (tenant_id, job_id) references jobs(tenant_id, id) on delete cascade
);

create table invoices (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  customer_id text not null,
  date date not null,
  due_date date,
  amount numeric(12,2) not null,
  status text not null default 'outstanding' check (status in ('outstanding', 'paid', 'void')),
  eligible boolean not null default true,
  ineligible_reason text,
  job_ids text[],
  synthetic boolean not null default false,
  source text default 'xero',
  primary key (tenant_id, id),
  foreign key (tenant_id, customer_id) references customers(tenant_id, id)
);

create table payments (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  customer_id text not null,
  invoice_id text,
  invoice_date date not null,
  paid_date date not null,
  amount numeric(12,2) not null,
  synthetic boolean not null default false,
  primary key (tenant_id, id)
);

create table funding_positions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  as_at date not null,
  provider text not null default 'Bibby',
  advance_rate numeric(5,4) not null,
  facility_ceiling numeric(12,2) not null,
  drawn numeric(12,2) not null,
  rule text,
  primary key (tenant_id, as_at)
);

create table compliance_items (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  kind text not null,
  driver_id text,
  vehicle_id text,
  title text not null,
  detail text,
  due date,
  status text not null check (status in ('overdue', 'unsigned', 'upcoming', 'followup')),
  source text,
  follow_up_at timestamptz,
  follow_up_by uuid references auth.users(id),
  next_review date,
  history jsonb not null default '[]'::jsonb,
  primary key (tenant_id, id)
);

create table defects (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  vehicle_id text not null,
  item text not null,
  severity text not null check (severity in ('safety', 'minor')),
  note text,
  reported_by text,
  reported_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'vor', 'rectified')),
  source text,
  history jsonb not null default '[]'::jsonb,
  primary key (tenant_id, id),
  foreign key (tenant_id, vehicle_id) references vehicles(tenant_id, id)
);

create table walkarounds (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  job_id text,
  vehicle_id text not null,
  driver_id text not null,
  at timestamptz not null default now(),
  results jsonb not null,
  defect_ids text[] not null default '{}',
  primary key (tenant_id, id)
);

create table actions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  title text not null,
  record_type text,
  record_id text,
  owner_id uuid references auth.users(id),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due date not null,
  status text not null default 'open' check (status in ('open', 'done')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  progress jsonb not null default '[]'::jsonb,
  primary key (tenant_id, id)
);

create table shares (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  job_id text not null,
  contact_id text not null,
  show_pod boolean not null default true,
  show_invoice boolean not null default false,
  shared_by uuid references auth.users(id),
  shared_at timestamptz not null default now(),
  active boolean not null default true,
  primary key (tenant_id, id),
  foreign key (tenant_id, job_id) references jobs(tenant_id, id),
  foreign key (tenant_id, contact_id) references contacts(tenant_id, id)
);
create unique index one_active_share on shares (tenant_id, job_id, contact_id) where active;

-- Outbound notifications. Processed by the notify-outbox edge function (sends email + magic link).
create table notifications (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id text not null,
  job_id text not null,
  kind text not null check (kind in ('delivery', 'signin')),
  subject text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'suppressed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

create table documents (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  title text not null,
  category text,
  updated date,
  summary text,
  related text[] not null default '{}',
  source text,
  source_url text,
  owner text,
  primary key (tenant_id, id)
);

create table connections (
  tenant_id uuid not null references tenants(id) on delete cascade,
  id text not null,
  name text not null,
  purpose text,
  state text not null check (state in ('Demo only', 'Proposed', 'Awaiting access', 'Access agreed', 'Configured', 'Supplier to confirm', 'Error')),
  method text,
  owner text,
  data text,
  last_run_at timestamptz,
  last_run_status text,
  primary key (tenant_id, id)
);

-- Secrets for integrations. No policy grants user access; only service_role (edge functions) can read.
create table integration_credentials (
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, provider)
);

create table integration_runs (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  rows_in int default 0,
  rows_upserted int default 0,
  error text,
  detail jsonb
);

create table rate_cards (
  tenant_id uuid not null references tenants(id) on delete cascade,
  version text not null,
  effective timestamptz not null default now(),
  created_by uuid references auth.users(id),
  note text,
  rates jsonb not null,
  primary key (tenant_id, version)
);

create table activity (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  record_type text,
  record_id text,
  prev text,
  next text,
  prev_safe text,
  next_safe text,
  money boolean not null default false
);
create index on activity (tenant_id, at desc);

create table id_counters (tenant_id uuid not null, prefix text not null, n int not null default 0, primary key (tenant_id, prefix));
