-- =====================================================================================
-- Dashboard views and trends.
--  * dashboard(): people with full access to an area can switch the view to Transport or
--    Warehouse figures only; everyone else keeps their own-area view.
--  * measure_trend(): the last N days of every figure the person can see, for trend lines and
--    charts. Same access rules as the dashboard.
-- =====================================================================================

-- Which figures (and which scope of each) this person sees. One rule for the dashboard and trends.
create or replace function app.visible_measures(p_scope text default null)
returns table (code text, scope text) language plpgsql stable security definer set search_path = public as $$
declare me profiles := app.me(); m measures; lvl access_level; sc text;
begin
  for m in select * from measures order by quadrant, sort loop
    lvl := app.access(m.area);
    continue when lvl = 'none';
    if lvl = 'full' then
      sc := case when p_scope in ('transport', 'warehouse') then p_scope else 'all' end;
      continue when sc <> 'all' and (m.company_only or (m.division is not null and m.division::text <> sc));
    else
      continue when me.division is null or m.company_only;
      continue when m.division is not null and m.division <> me.division;
      sc := me.division::text;
    end if;
    code := m.code; scope := sc; return next;
  end loop;
end $$;

drop function if exists dashboard(date, uuid);
create or replace function dashboard(p_day date default null, p_company uuid default null, p_scope text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles := app.me();
  co uuid := app.target_company(p_company);
  d date; stale text[]; items jsonb := '[]'::jsonb;
  v record; m measures; val numeric; g numeric; a numeric; st text;
  quads jsonb := '{}'::jsonb; q text; worst text; incomplete boolean; any_access boolean;
  days jsonb;
begin
  if me.user_id is null or not app.mfa_ok() then raise exception 'Sign in with two-factor authentication to see the dashboard'; end if;
  if co is null then raise exception 'Choose a company first'; end if;
  d := coalesce(p_day, (select max(day) from measure_values where company_id = co));
  stale := app.stale_tables(co);
  for v in select * from app.visible_measures(p_scope) loop
    select * into m from measures where code = v.code;
    select value into val from measure_values where company_id = co and measure_code = m.code and day = d and scope = v.scope;
    select coalesce(t.green_at, m.default_green), coalesce(t.amber_at, m.default_amber) into g, a
      from (select 1) x left join thresholds t on t.company_id = co and t.measure_code = m.code;
    st := case when m.sources && stale then 'stale' else app.rag(val, m.better, g, a) end;
    items := items || jsonb_build_object('code', m.code, 'quadrant', m.quadrant, 'name', m.name, 'unit', m.unit, 'value', val,
      'status', st, 'green_at', g, 'amber_at', a, 'better', m.better, 'headline', m.headline, 'description', m.description, 'scope', v.scope);
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
  select coalesce(jsonb_agg(x.day order by x.day desc), '[]'::jsonb) into days
    from (select distinct day from measure_values where company_id = co order by day desc limit 31) x;
  return jsonb_build_object('day', d, 'company_id', co, 'company', (select name from companies where id = co), 'quadrants', quads,
    'measures', items, 'stale_sources', to_jsonb(stale), 'days', days,
    'scope', case when p_scope in ('transport', 'warehouse') then p_scope else 'all' end,
    'can_switch_scope', exists (select 1 from areas ar where ar.code in ('service', 'cost', 'people', 'compliance', 'hs') and app.access(ar.code) = 'full')
                        and (me.role <> 'platform_admin' or co is not null),
    'connections', case when app.access('settings') = 'full' then
      (select coalesce(jsonb_agg(jsonb_build_object('system', system, 'label', label, 'status', status, 'last_success_at', last_success_at) order by system), '[]'::jsonb)
         from connections where company_id = co) else null end);
end $$;

-- The last p_days days of each visible figure, oldest first, with its colour on each day.
create or replace function measure_trend(p_days integer default 14, p_company uuid default null, p_scope text default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare co uuid := app.target_company(p_company); d date; out jsonb := '{}'::jsonb; v record;
begin
  if (app.me()).user_id is null or not app.mfa_ok() or co is null then return '{}'::jsonb; end if;
  d := coalesce(p_to, (select max(day) from measure_values where company_id = co));
  if d is null then return '{}'::jsonb; end if;
  for v in select * from app.visible_measures(p_scope) loop
    out := out || jsonb_build_object(v.code, (
      select coalesce(jsonb_agg(jsonb_build_object('day', mv.day, 'value', mv.value,
          'status', app.rag(mv.value, m.better, coalesce(t.green_at, m.default_green), coalesce(t.amber_at, m.default_amber))) order by mv.day), '[]'::jsonb)
      from measure_values mv join measures m on m.code = mv.measure_code
      left join thresholds t on t.company_id = co and t.measure_code = m.code
      where mv.company_id = co and mv.measure_code = v.code and mv.scope = v.scope
        and mv.day between d - (least(greatest(p_days, 2), 92) - 1) and d));
  end loop;
  return out;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on function dashboard(date, uuid, text), measure_trend(integer, uuid, text, date) to authenticated, service_role;
revoke execute on function app.visible_measures(text) from anon, public, authenticated;
grant execute on function app.visible_measures(text) to service_role;
