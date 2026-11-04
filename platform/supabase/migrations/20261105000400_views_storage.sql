-- =====================================================================================
-- Views and storage.
--  * activity_feed and portal_deliveries are owner-privilege views with explicit tenant,
--    role and share filters (the base tables are not readable for these purposes).
--  * v_* reporting views use security_invoker, so the caller's RLS applies: a user without
--    financial permission sees null money columns because job_financials rows are withheld.
-- =====================================================================================

create view activity_feed as
  select a.id, a.at, a.actor_id, a.actor_name, a.actor_role, a.action, a.record_type, a.record_id,
         case when app.can_money() then a.prev else a.prev_safe end as prev,
         case when app.can_money() then a.next else a.next_safe end as next
  from activity a
  where a.tenant_id = app.tenant() and app.is_staff() and (a.record_type is distinct from 'export' or app.role() = 'director');
grant select on activity_feed to authenticated;

-- Customer portal: only explicitly shared, active jobs for the signed-in contact; only permitted fields.
create view portal_deliveries as
  select s.id as share_id, j.id as job_id, j.date, j.dest, j.customer_ref, j.slot, j.status, j.delivered_at, j.eta,
         s.show_pod, s.show_invoice,
         case when s.show_pod then j.pod_status end as pod_status,
         case when s.show_pod then j.pod_at end as pod_at,
         case when s.show_pod then j.pod_path end as pod_path,
         case when s.show_invoice and j.invoice_status = 'invoiced' then j.invoice_id end as invoice_id,
         case when s.show_invoice and j.invoice_status = 'invoiced' then f.price end as invoice_amount,
         case when s.show_invoice and j.invoice_status = 'invoiced' then i.date end as invoice_date,
         (select coalesce(jsonb_agg(jsonb_build_object('stage', c.stage, 'at', c.at) order by c.at), '[]'::jsonb)
            from job_checkins c where c.tenant_id = j.tenant_id and c.job_id = j.id and c.stage in ('depart', 'arrive', 'complete')) as checkins
  from shares s
  join jobs j on j.tenant_id = s.tenant_id and j.id = s.job_id
  left join job_financials f on f.tenant_id = j.tenant_id and f.job_id = j.id
  left join invoices i on i.tenant_id = j.tenant_id and i.id = j.invoice_id
  where s.active and s.tenant_id = app.tenant() and app.role() = 'customer' and s.contact_id = app.contact_id();
grant select on portal_deliveries to authenticated;

create view v_day_summary with (security_invoker = true) as
  select j.tenant_id, j.date,
         count(*) filter (where j.status = 'delivered') as delivered,
         count(*) filter (where j.status = 'delivered' and not j.late) as on_time,
         count(*) filter (where j.status = 'delivered' and j.late) as late,
         sum(f.price) filter (where j.status = 'delivered' and f.actual_cost is not null) as revenue,
         sum(f.planned_cost) filter (where j.status = 'delivered' and f.actual_cost is not null) as planned_cost,
         sum(f.actual_cost) filter (where j.status = 'delivered') as actual_cost
  from jobs j left join job_financials f on f.tenant_id = j.tenant_id and f.job_id = j.id
  group by j.tenant_id, j.date;

create view v_pod_billing with (security_invoker = true) as
  select j.tenant_id,
         count(*) filter (where j.pod_status = 'missing') as pods_missing,
         count(*) filter (where j.invoice_status = 'pending') as not_invoiced,
         count(*) filter (where j.invoice_status = 'pending' and j.pod_status <> 'received') as blocked_by_pod,
         count(*) filter (where j.invoice_status = 'pending' and j.pod_status = 'received') as ready_to_invoice
  from jobs j where j.status = 'delivered' group by j.tenant_id;

create view v_debtor_ageing with (security_invoker = true) as
  select i.tenant_id,
         case when app.business_date(i.tenant_id) - i.date <= 30 then '0-30' when app.business_date(i.tenant_id) - i.date <= 60 then '31-60'
              when app.business_date(i.tenant_id) - i.date <= 90 then '61-90' else '90+' end as bucket,
         sum(i.amount) as amount, count(*) as invoices
  from invoices i where i.status = 'outstanding' group by 1, 2;

create view v_funding_headroom with (security_invoker = true) as
  with e as (
    select i.tenant_id, sum(i.amount) filter (where i.eligible and app.business_date(i.tenant_id) - i.date <= 90) as eligible
    from invoices i where i.status = 'outstanding' group by i.tenant_id
  ), p as (select distinct on (tenant_id) * from funding_positions order by tenant_id, as_at desc)
  select e.tenant_id, e.eligible, p.advance_rate, round(e.eligible * p.advance_rate, 2) as funding_value, p.facility_ceiling, p.drawn,
         greatest(0, least(round(e.eligible * p.advance_rate, 2), p.facility_ceiling) - p.drawn) as headroom, p.as_at
  from e join p on p.tenant_id = e.tenant_id;

create view v_today_cover with (security_invoker = true) as
  select j.tenant_id, count(*) as booked,
         count(*) filter (where j.subcontract or (j.driver_id is not null and v.status = 'available')) as confirmed,
         count(*) filter (where not j.subcontract and j.driver_id is null and j.proposed_driver_id is not null and v.status = 'available') as proposed,
         count(*) filter (where not j.subcontract and (v.status = 'vor' or (j.driver_id is null and j.proposed_driver_id is null))) as uncovered
  from jobs j left join vehicles v on v.tenant_id = j.tenant_id and v.id = j.vehicle_id
  where j.date = app.business_date(j.tenant_id) group by j.tenant_id;

grant select on v_day_summary, v_pod_billing, v_debtor_ageing, v_funding_headroom, v_today_cover to authenticated;

-- ----------------------------------------------------------------- storage: POD images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pods', 'pods', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Path convention: <tenant_id>/<job_id>/<file>
create policy pod_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'pods' and (storage.foldername(name))[1] = app.tenant()::text and (
    app.can_act()
    or (app.role() = 'driver' and exists (select 1 from jobs j where j.tenant_id = app.tenant() and j.id = (storage.foldername(name))[2] and j.driver_id = app.driver_id()))
  ));
create policy pod_read on storage.objects for select to authenticated using (
  bucket_id = 'pods' and (storage.foldername(name))[1] = app.tenant()::text and (
    app.is_staff()
    or (app.role() = 'driver' and exists (select 1 from jobs j where j.tenant_id = app.tenant() and j.id = (storage.foldername(name))[2] and j.driver_id = app.driver_id()))
    or (app.role() = 'customer' and exists (select 1 from shares s where s.tenant_id = app.tenant() and s.job_id = (storage.foldername(name))[2]
         and s.contact_id = app.contact_id() and s.active and s.show_pod))
  ));
