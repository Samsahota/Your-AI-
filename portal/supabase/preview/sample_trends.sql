-- PREVIEW ONLY (local database "portal_sample"): made-up figures to show the design with data in it.
-- Starts from the fictional test company and gives every figure 13 earlier days that drift around
-- its 17 November value, so the trend lines and charts have something to draw. Never loaded anywhere real.
update companies set name = 'Sample Haulier Ltd' where name = 'Demo Haulage Ltd';

insert into measure_values (company_id, measure_code, day, scope, value)
select mv.company_id, mv.measure_code, mv.day - g.n, mv.scope,
  case
    when m.unit = '%' then round(greatest(0, least(100, mv.value * (1 + 0.06 * sin(g.n * 1.3 + length(mv.measure_code)) + 0.012 * g.n * (case when m.better = 'higher' then 1 else -1 end))))::numeric, 1)
    when m.unit = '£' then round((mv.value * (1 + 0.08 * sin(g.n * 0.9 + length(mv.measure_code))))::numeric, 2)
    else round(greatest(0, mv.value + round(1.2 * sin(g.n * 1.7 + length(mv.measure_code)))))::numeric
  end
from measure_values mv
join measures m on m.code = mv.measure_code
cross join generate_series(1, 13) as g(n)
where mv.day = '2026-11-17'
on conflict do nothing;

-- A few made-up actions so the Actions page has something to show.
with a as (
  insert into actions (company_id, ref, area, title, notes, link_kind, link_id, link_label, owner, owner_name, priority, due_date, status, created_by, created_by_name, created_at, closed_at)
  values
   ('20000000-0000-4000-8000-00000000000a', 'A-0001', 'service', 'Agree revised delivery slots with Example Foods', 'Two late drops this week on the Leeds run.', 'measure', 'service.otif', 'On time in full',
    '10000000-0000-4000-8000-000000000002', 'Dana Director', 'high', '2026-11-14', 'open', '10000000-0000-4000-8000-000000000004', 'Olive Operations', '2026-11-10 08:10+00', null),
   ('20000000-0000-4000-8000-00000000000a', 'A-0002', 'cost', 'Review subcontract rates on the Leeds run', null, 'measure', 'cost.job_cost_vs_plan', 'Job cost against plan',
    '10000000-0000-4000-8000-000000000002', 'Dana Director', 'medium', '2026-11-28', 'open', '10000000-0000-4000-8000-000000000002', 'Dana Director', '2026-11-16 09:30+00', null),
   ('20000000-0000-4000-8000-00000000000a', 'A-0003', 'compliance', 'Book MOT for AB12 CDE', null, 'compliance_item', null, 'MOT, AB12 CDE',
    '10000000-0000-4000-8000-000000000005', 'Toni Transport', 'high', '2026-11-20', 'open', '10000000-0000-4000-8000-000000000002', 'Dana Director', '2026-11-15 14:00+00', null),
   ('20000000-0000-4000-8000-00000000000a', 'A-0004', 'hs', 'Re-brief night shift on yard speed', 'After two near misses by the loading bay.', 'measure', 'hs.near_misses_open', 'Open near misses',
    '10000000-0000-4000-8000-000000000006', 'Wes Warehouse', 'medium', '2026-11-12', 'done', '10000000-0000-4000-8000-000000000004', 'Olive Operations', '2026-11-08 07:45+00', '2026-11-12 16:20+00')
  returning id, ref, created_by, created_by_name, created_at, notes, status, closed_at, owner, owner_name
)
insert into action_updates (action_id, company_id, kind, note, by_user, by_name, at)
select id, '20000000-0000-4000-8000-00000000000a'::uuid, 'raised', notes, created_by, created_by_name, created_at from a
union all select id, '20000000-0000-4000-8000-00000000000a'::uuid, 'progress', 'Called the customer; they will confirm new slots by Friday.', owner, owner_name, created_at + interval '1 day' from a where ref = 'A-0001'
union all select id, '20000000-0000-4000-8000-00000000000a'::uuid, 'completed', 'Briefing done with all night shift drivers.', owner, owner_name, closed_at from a where status = 'done';
