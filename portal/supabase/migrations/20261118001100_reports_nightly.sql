-- =====================================================================================
-- Daily and Monday report emails, and the nightly recalculation.
--
-- Report emails
--  * Each active person gets a daily email (and a Monday weekly email) unless they turn it off.
--    Directors can turn them on or off for their own people, and set the company's send time.
--  * What goes in each email is built by report_digest(), which looks at the dashboard exactly as
--    that person would: same access levels, same division, same "not updated" rules. Nobody is
--    emailed a figure they couldn't see when signed in.
--  * report_due() lists who is due an email now. Nothing is sent for a company still being set up,
--    or one with no figures yet. Every send is recorded once (report_sends), so a retry never
--    emails anyone twice; a failed send is retried up to three times.
--
-- Nightly recalculation
--  * run_nightly() works out every measure for the last few days, for each company that has a
--    working connection, so late-arriving data is picked up.
-- =====================================================================================

alter table profiles add column if not exists email_daily boolean not null default true;
alter table profiles add column if not exists email_weekly boolean not null default true;

create table report_sends (
  id bigserial primary key,
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references profiles(user_id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly')),
  period date not null,                                 -- the day (daily) or the Monday (weekly)
  status text not null check (status in ('sent', 'failed', 'skipped')),
  attempts integer not null default 1,
  detail text, provider_id text,
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, kind, period)
);
create index report_sends_company_idx on report_sends (company_id, period desc);
create index report_sends_user_idx on report_sends (user_id);
alter table report_sends enable row level security;
create policy read_report_sends on report_sends for select using (app.is_admin() or (company_id = app.company() and app.access('settings') = 'full'));
grant select on report_sends to authenticated;
grant all on report_sends to service_role;
grant usage, select on sequence report_sends_id_seq to service_role;

-- The company's local date and time (settings.timezone, default UK). business_date_override is for tests only.
create or replace function app.local_now(p_company uuid, p_now timestamptz default now()) returns timestamp
language sql stable security definer set search_path = public as $$
  select coalesce(
    ((select settings ->> 'business_date_override' from companies where id = p_company)::date
       + ((p_now at time zone coalesce((select settings ->> 'timezone' from companies where id = p_company), 'Europe/London'))::time)),
    p_now at time zone coalesce((select settings ->> 'timezone' from companies where id = p_company), 'Europe/London')) $$;

-- ---------------------------------------------------------------- settings
-- A person turns their own emails on or off; a director can do it for their own people.
create or replace function set_report_emails(p_daily boolean, p_weekly boolean, p_user uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles := app.me(); target profiles;
begin
  if me.user_id is null or not app.mfa_ok() then raise exception 'Sign in with two-factor authentication first'; end if;
  select * into target from profiles where user_id = coalesce(p_user, me.user_id);
  if target.user_id is null then raise exception 'Unknown person'; end if;
  if not (target.user_id = me.user_id or app.is_admin()
          or (me.role = 'director' and target.company_id = me.company_id)) then
    raise exception 'Only a director can change someone else''s emails';
  end if;
  update profiles set email_daily = coalesce(p_daily, email_daily), email_weekly = coalesce(p_weekly, email_weekly)
   where user_id = target.user_id;
  perform app.audit(target.company_id, 'report_emails_changed', target.email, jsonb_build_object('daily', p_daily, 'weekly', p_weekly));
end $$;

-- A director sets when the daily email goes out (UK time, between 05:00 and 10:00).
create or replace function set_report_time(p_time text, p_company uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid := coalesce(p_company, app.company());
begin
  if not (app.is_admin() or coalesce(c = app.company() and (app.me()).role = 'director' and app.mfa_ok(), false)) then
    raise exception 'Only a director can change the report time';
  end if;
  if p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_time::time not between '05:00' and '10:00' then
    raise exception 'Choose a time between 05:00 and 10:00';
  end if;
  update companies set settings = settings || jsonb_build_object('report_time', p_time) where id = c;
  perform app.audit(c, 'report_time_changed', p_time);
end $$;

-- ---------------------------------------------------------------- who is due an email
create or replace function report_due(p_now timestamptz default now())
returns table (company_id uuid, company text, user_id uuid, email text, name text, kind text, period date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_service() then raise exception 'Only the platform can list report emails'; end if;
  return query
  with co as (
    select c.id, c.name, app.local_now(c.id, p_now) as lt,
           coalesce(nullif(c.settings ->> 'report_time', ''), '07:00')::time as rt
    from companies c
    where c.status = 'active' and exists (select 1 from measure_values mv where mv.company_id = c.id)
  ), due as (
    select co.id, co.name, 'daily'::text as kind, co.lt::date as period from co where co.lt::time >= co.rt
    union all
    select co.id, co.name, 'weekly', co.lt::date from co where co.lt::time >= co.rt and extract(isodow from co.lt) = 1
  )
  select due.id, due.name, p.user_id, p.email, p.name, due.kind, due.period
  from due join profiles p on p.company_id = due.id and p.status = 'active' and not p.is_test
  left join report_sends s on s.company_id = due.id and s.user_id = p.user_id and s.kind = due.kind and s.period = due.period
  where (due.kind = 'daily' and p.email_daily or due.kind = 'weekly' and p.email_weekly)
    and (s.id is null or (s.status = 'failed' and s.attempts < 3))
  order by due.name, p.name, due.kind;
end $$;

-- ---------------------------------------------------------------- what goes in an email
-- Built as the person themselves: the dashboard and trend functions run with their identity and
-- two-factor status, so every access rule applies exactly as it does on screen.
create or replace function report_digest(p_user uuid, p_kind text, p_day date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  saved text := current_setting('request.jwt.claims', true);
  p profiles; d jsonb; trend jsonb := null; d0 date; reds text[];
  my_actions jsonb; week jsonb := null; notes jsonb; out jsonb;
begin
  if not app.is_service() then raise exception 'Only the platform can build report emails'; end if;
  if p_kind not in ('daily', 'weekly') then raise exception 'Unknown report %', p_kind; end if;
  select * into p from profiles where user_id = p_user and status = 'active' and company_id is not null;
  if p.user_id is null then raise exception 'That person has no active login'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', p.user_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin
    d := dashboard(p_day, null, null);
    d0 := (d ->> 'day')::date;
    if p_kind = 'weekly' and d0 is not null then trend := measure_trend(7, null, null, d0); end if;

    select coalesce(array_agg(i ->> 'code'), '{}') into reds
      from jsonb_array_elements(d -> 'measures') i where i ->> 'status' in ('red', 'amber');

    -- The person's own open actions that are overdue or due in the next 7 days.
    select coalesce(jsonb_agg(jsonb_build_object('ref', a.ref, 'title', a.title, 'due_date', a.due_date, 'priority', a.priority,
             'overdue', a.due_date < app.local_now(p.company_id)::date) order by a.due_date, a.ref), '[]'::jsonb)
      into my_actions
      from actions a
     where a.company_id = p.company_id and a.owner = p.user_id and a.status = 'open'
       and a.due_date <= app.local_now(p.company_id)::date + 7;

    -- Comments from the last day explaining a red or amber figure the person can see.
    select coalesce(jsonb_agg(jsonb_build_object('target', c.target, 'body', c.body, 'author', c.author_name, 'at', c.created_at) order by c.created_at desc), '[]'::jsonb)
      into notes
      from (select * from comments c
             where c.company_id = p.company_id and c.target = any (reds)
               and c.created_at >= now() - interval '26 hours' and app.sees(c.company_id, c.area)
             order by c.created_at desc limit 10) c;

    if p_kind = 'weekly' then
      select jsonb_build_object(
          'raised', count(*) filter (where a.created_at >= now() - interval '7 days'),
          'completed', count(*) filter (where a.status = 'done' and a.closed_at >= now() - interval '7 days'),
          'open', count(*) filter (where a.status = 'open'),
          'overdue', count(*) filter (where a.status = 'open' and a.due_date < app.local_now(p.company_id)::date))
        into week
        from actions a
       where a.company_id = p.company_id and (app.sees(a.company_id, a.area, a.division) or a.owner = p.user_id);
    end if;
  exception when others then
    perform set_config('request.jwt.claims', coalesce(saved, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(saved, ''), true);

  out := jsonb_build_object(
    'kind', p_kind, 'name', p.name, 'email', p.email, 'role', p.role, 'division', p.division,
    'company', d ->> 'company', 'day', d ->> 'day', 'today', app.local_now(p.company_id)::date,
    'quadrants', d -> 'quadrants', 'measures', d -> 'measures', 'stale_sources', d -> 'stale_sources',
    'my_actions', my_actions, 'comments', notes, 'trend', trend, 'week', week);
  return out;
end $$;

-- Records the outcome of one email (sent, failed or skipped). A retry adds to the attempts.
create or replace function record_report_send(p_company uuid, p_user uuid, p_kind text, p_period date, p_status text,
  p_detail text default null, p_provider_id text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_service() then raise exception 'Only the platform can record report emails'; end if;
  insert into report_sends (company_id, user_id, kind, period, status, detail, provider_id)
  values (p_company, p_user, p_kind, p_period, p_status, left(p_detail, 500), p_provider_id)
  on conflict (company_id, user_id, kind, period) do update
    set status = excluded.status, detail = excluded.detail, provider_id = coalesce(excluded.provider_id, report_sends.provider_id),
        attempts = report_sends.attempts + 1, updated_at = now();
end $$;

-- ---------------------------------------------------------------- nightly recalculation
-- Recalculates the last p_days days (up to yesterday, local time) for every company that has at
-- least one connection that has worked. Run by the database's scheduler each night.
create or replace function run_nightly(p_days integer default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; d date; n integer := 0; done jsonb := '[]'::jsonb;
begin
  if not app.is_service() then raise exception 'Only the platform can run the nightly recalculation'; end if;
  for c in select co.id, co.name from companies co
            where co.status <> 'suspended'
              and exists (select 1 from connections x where x.company_id = co.id and x.last_success_at is not null) loop
    for d in select generate_series(app.local_now(c.id)::date - least(greatest(p_days, 1), 31), app.local_now(c.id)::date - 1, interval '1 day')::date loop
      n := n + compute_measures(c.id, d);
    end loop;
    done := done || jsonb_build_object('company', c.name);
    insert into audit_log (company_id, actor_role, action, target, detail)
    values (c.id, 'system', 'nightly_recalculation', null, jsonb_build_object('days', p_days));
  end loop;
  return jsonb_build_object('companies', done, 'values', n);
end $$;

revoke execute on function report_due(timestamptz), report_digest(uuid, text, date),
  record_report_send(uuid, uuid, text, date, text, text, text), run_nightly(integer) from public, anon, authenticated;
grant execute on function report_due(timestamptz), report_digest(uuid, text, date),
  record_report_send(uuid, uuid, text, date, text, text, text), run_nightly(integer) to service_role;
revoke execute on function set_report_emails(boolean, boolean, uuid), set_report_time(text, uuid) from public, anon;
grant execute on function set_report_emails(boolean, boolean, uuid), set_report_time(text, uuid) to authenticated;
revoke execute on function app.local_now(uuid, timestamptz) from public, anon, authenticated;
grant execute on function app.local_now(uuid, timestamptz) to service_role;
