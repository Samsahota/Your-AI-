-- =====================================================================================
-- Connections (how data gets in), the dashboard, comments and the policy library.
-- =====================================================================================

-- ---------------------------------------------------------------- connections
-- One row per system per company. Keys and passwords are never stored here: secret_name
-- points at the secret in the platform's vault (Supabase secrets), set by the platform admin.
create table connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  system text not null check (system in ('vigo', 'tachomaster', 'falcon', 'predrive', 'xero', 'sharepoint', 'brightpay', 'bibby', 'warehouse', 'other')),
  label text not null,
  method text not null check (method in ('api', 'oauth', 'email_report', 'file')),
  status text not null default 'waiting_access' check (status in ('waiting_access', 'configured', 'connected', 'failing', 'paused')),
  feeds text[] not null default '{}',            -- record tables this connection fills, e.g. {jobs,job_costs}
  schedule text not null default 'nightly',      -- nightly, hourly, every_15_min, on_receipt
  config jsonb not null default '{}'::jsonb,     -- field mapping, report format, checks (never secrets)
  secret_name text,                              -- name of the vault secret holding the key, if any
  last_run_at timestamptz, last_success_at timestamptz, last_error text,
  notes text,
  created_at timestamptz not null default now(),
  unique (company_id, system, label)
);

create table connection_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null check (status in ('ok', 'failed', 'check_failed')),
  rows_in integer, rows_written integer,
  checks jsonb not null default '[]'::jsonb,     -- each check: name, expected, actual, passed
  raw_path text,                                 -- where the untouched copy of the input is stored
  error text
);
create index on connection_runs (connection_id, started_at desc);

-- Emails received at a company's report inbox (suppliers' scheduled reports).
create table inbound_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  received_at timestamptz not null default now(),
  from_address text, subject text,
  attachments jsonb not null default '[]'::jsonb,  -- name, content type, storage path, sha256
  connection_id uuid references connections(id),
  run_id uuid references connection_runs(id),
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed'))
);

alter table connections enable row level security;
alter table connection_runs enable row level security;
alter table inbound_messages enable row level security;
create policy read_connections on connections for select using (app.sees(company_id, 'settings'));
create policy read_runs on connection_runs for select using (app.sees(company_id, 'settings'));
create policy read_inbound on inbound_messages for select using (app.is_admin());
grant select on connections, connection_runs, inbound_messages to authenticated;

-- Platform admin sets up or updates a connection.
create or replace function save_connection(p_company uuid, p_system text, p_label text, p_method text, p_feeds text[],
  p_schedule text default 'nightly', p_config jsonb default '{}'::jsonb, p_secret_name text default null, p_status text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not (app.is_service() or app.is_admin()) then raise exception 'Only the platform admin can set up connections'; end if;
  if p_config::text ~* '"(password|secret|api_?key|token)"\s*:' then
    raise exception 'Keys and passwords must go in the vault, not in the connection settings';
  end if;
  insert into connections (company_id, system, label, method, feeds, schedule, config, secret_name, status)
  values (p_company, p_system, p_label, p_method, p_feeds, p_schedule, p_config, p_secret_name, coalesce(p_status, 'waiting_access'))
  on conflict (company_id, system, label) do update set method = excluded.method, feeds = excluded.feeds, schedule = excluded.schedule,
    config = excluded.config, secret_name = excluded.secret_name, status = coalesce(p_status, connections.status)
  returning id into v;
  perform app.audit(p_company, 'connection_saved', p_system || ':' || p_label, jsonb_build_object('method', p_method, 'status', p_status));
  return v;
end $$;
grant execute on function save_connection(uuid, text, text, text, text[], text, jsonb, text, text) to authenticated, service_role;

-- A connector reports how a run went. Any failed check marks the connection failing, so the
-- dashboard shows its figures as "not updated" instead of trusting them.
create or replace function record_run(p_connection uuid, p_status text, p_rows_in integer, p_rows_written integer,
  p_checks jsonb default '[]'::jsonb, p_raw_path text default null, p_error text default null, p_started_at timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare c connections; v uuid;
begin
  if not (app.is_service() or app.is_admin()) then raise exception 'Only the platform records runs'; end if;
  select * into c from connections where id = p_connection;
  if c is null then raise exception 'Unknown connection'; end if;
  if p_status = 'ok' and exists (select 1 from jsonb_array_elements(p_checks) x where (x ->> 'passed')::boolean is false) then
    p_status := 'check_failed';
  end if;
  insert into connection_runs (connection_id, company_id, started_at, finished_at, status, rows_in, rows_written, checks, raw_path, error)
  values (c.id, c.company_id, p_started_at, now(), p_status, p_rows_in, p_rows_written, coalesce(p_checks, '[]'::jsonb), p_raw_path, p_error)
  returning id into v;
  update connections set last_run_at = now(),
    last_success_at = case when p_status = 'ok' then now() else last_success_at end,
    last_error = case when p_status = 'ok' then null else coalesce(p_error, 'A check did not match the source system') end,
    status = case when p_status = 'ok' then 'connected' else 'failing' end
  where id = c.id;
  return v;
end $$;
grant execute on function record_run(uuid, text, integer, integer, jsonb, text, text, timestamptz) to authenticated, service_role;

-- Record tables whose figures can't be trusted right now: a feeding connection is failing,
-- or hasn't succeeded within its allowed age (36 hours for nightly feeds).
create or replace function app.stale_tables(p_company uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct f), '{}') from connections c, unnest(c.feeds) f
  where c.company_id = p_company and c.status <> 'paused' and (
    c.status = 'failing' or
    (c.status = 'connected' and c.last_success_at < now() - case c.schedule when 'every_15_min' then interval '2 hours' when 'hourly' then interval '6 hours' else interval '36 hours' end))
$$;

alter table measures add column sources text[] not null default '{}';
update measures set company_only = true where code = 'cost.revenue_vs_plan';
update measures set sources = case
  when code in ('service.otif', 'service.on_time') then '{jobs}'
  when code like 'service.%' then '{warehouse_daily}'
  when code = 'cost.revenue_vs_plan' then '{jobs,job_costs,revenue_plan}'
  when code = 'cost.job_cost_vs_plan' then '{jobs,job_costs}'
  when code = 'cost.cost_per_case' then '{cost_daily,warehouse_daily}'
  when code like 'people.%' then '{staff,people_events}'
  when code like 'hs.%' then '{incidents}'
  when code = 'compliance.infringements_7d' then '{infringements}'
  when code = 'compliance.open_defects' then '{defects}'
  else '{compliance_items}' end::text[];

-- ---------------------------------------------------------------- dashboard
-- Everything the dashboard needs, already filtered to what this person may see.
create or replace function dashboard(p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles := app.me();
  co uuid := app.company();
  d date;
  stale text[];
  items jsonb := '[]'::jsonb;
  m measures; lvl access_level; sc text; val numeric; g numeric; a numeric; st text;
  quads jsonb := '{}'::jsonb; q text; qs jsonb; worst text; incomplete boolean; any_access boolean;
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
        else 'no_data' end,
      coalesce(bool_or(i ->> 'status' in ('no_data', 'stale', 'no_target')), false)
      into worst, incomplete
      from jsonb_array_elements(items) i where i ->> 'quadrant' = q;
    quads := quads || jsonb_build_object(q, jsonb_build_object('status', case when any_access then worst else 'no_access' end, 'incomplete', incomplete));
  end loop;

  return jsonb_build_object('day', d, 'company', (select name from companies where id = co), 'quadrants', quads,
    'measures', items, 'stale_sources', to_jsonb(stale),
    'connections', case when app.access('settings') = 'full' then
      (select coalesce(jsonb_agg(jsonb_build_object('system', system, 'label', label, 'status', status, 'last_success_at', last_success_at) order by system), '[]'::jsonb)
         from connections where company_id = co) else null end);
end $$;
grant execute on function dashboard(date) to authenticated;

-- ---------------------------------------------------------------- comments
create table comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  area text not null references areas(code),
  target text,                                   -- measure code or record reference
  body text not null check (length(body) between 1 and 2000),
  author uuid not null, author_name text not null,
  created_at timestamptz not null default now()
);
alter table comments enable row level security;
create policy read_comments on comments for select using (app.sees(company_id, area));
grant select on comments to authenticated;

create or replace function add_comment(p_area text, p_target text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if app.company() is null or app.access(p_area) = 'none' then raise exception 'You do not have access to comment here'; end if;
  insert into comments (company_id, area, target, body, author, author_name)
  values (app.company(), p_area, p_target, trim(p_body), auth.uid(), (app.me()).name) returning id into v;
  return v;
end $$;
grant execute on function add_comment(text, text, text) to authenticated;

-- ---------------------------------------------------------------- policy library
-- company_id null = the master library run by Clearpath; it reaches a company through a
-- subscription. Companies can also hold their own documents.
create table library_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  category text not null check (category in ('hr', 'health_safety', 'transport', 'warehouse', 'legal', 'other')),
  title text not null, owner_name text, review_due date,
  needs_signature boolean not null default true,
  current_version integer not null default 0,
  created_at timestamptz not null default now()
);
create table library_versions (
  document_id uuid not null references library_documents(id) on delete cascade,
  version integer not null, storage_path text not null, summary text not null,
  published_at timestamptz not null default now(), published_by uuid,
  primary key (document_id, version)
);
create table library_subscriptions (
  company_id uuid not null references companies(id) on delete cascade,
  document_id uuid not null references library_documents(id) on delete cascade,
  primary key (company_id, document_id)
);
create table acknowledgements (
  company_id uuid not null references companies(id) on delete cascade,
  document_id uuid not null references library_documents(id) on delete cascade,
  version integer not null, user_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  primary key (document_id, version, user_id)
);

create or replace function app.doc_visible(p_doc library_documents) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.is_admin() or (app.mfa_ok() and (app.me()).user_id is not null and (
    p_doc.company_id = app.company() or
    (p_doc.company_id is null and exists (select 1 from library_subscriptions s where s.document_id = p_doc.id and s.company_id = app.company())))), false) $$;

alter table library_documents enable row level security;
alter table library_versions enable row level security;
alter table library_subscriptions enable row level security;
alter table acknowledgements enable row level security;
create policy read_docs on library_documents for select using (app.doc_visible(library_documents));
create policy read_versions on library_versions for select using (app.doc_visible((select d from library_documents d where d.id = document_id)));
create policy read_subs on library_subscriptions for select using (app.is_admin() or (app.mfa_ok() and company_id = app.company()));
create policy read_acks on acknowledgements for select using (
  user_id = auth.uid() or app.is_admin() or (company_id = app.company() and app.access('compliance') = 'full'));
grant select on library_documents, library_versions, library_subscriptions, acknowledgements to authenticated;

-- Publish a new version. Master documents: platform admin (on Clearpath's behalf).
-- Company documents: that company's director.
create or replace function publish_document_version(p_document uuid, p_storage_path text, p_summary text) returns integer
language plpgsql security definer set search_path = public as $$
declare doc library_documents; v integer;
begin
  select * into doc from library_documents where id = p_document;
  if doc is null then raise exception 'Unknown document'; end if;
  if not (app.is_admin() or coalesce(doc.company_id = app.company() and (app.me()).role = 'director' and app.mfa_ok(), false)) then
    raise exception 'You cannot publish this document';
  end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'Say what changed in this version'; end if;
  v := doc.current_version + 1;
  insert into library_versions (document_id, version, storage_path, summary, published_by) values (doc.id, v, p_storage_path, p_summary, auth.uid());
  update library_documents set current_version = v where id = doc.id;
  perform app.audit(doc.company_id, 'document_published', doc.title, jsonb_build_object('version', v));
  return v;
end $$;
grant execute on function publish_document_version(uuid, text, text) to authenticated;

create or replace function acknowledge_document(p_document uuid) returns void
language plpgsql security definer set search_path = public as $$
declare doc library_documents;
begin
  select * into doc from library_documents where id = p_document;
  if doc is null or not app.doc_visible(doc) or app.company() is null then raise exception 'Document not available'; end if;
  if doc.current_version = 0 then raise exception 'This document has not been published yet'; end if;
  insert into acknowledgements (company_id, document_id, version, user_id) values (app.company(), doc.id, doc.current_version, auth.uid())
  on conflict do nothing;
end $$;
grant execute on function acknowledge_document(uuid) to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
