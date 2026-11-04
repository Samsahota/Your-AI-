-- =====================================================================================
-- Workflow functions. The only way signed-in users change data.
-- Each validates role + tenant, applies the change and writes an activity entry.
-- Called from the app through supabase.rpc('<name>', {...}).
-- =====================================================================================

create or replace function app.fail(msg text) returns void language plpgsql as $$ begin raise exception using message = msg, errcode = 'P0001'; end $$;
create or replace function app.require(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then perform app.fail(msg); end if; end $$;
create or replace function app.gbp(n numeric) returns text language sql immutable as $$
  select case when n < 0 then '−' else '' end || '£' || to_char(abs(n), case when abs(n) = trunc(abs(n)) then 'FM999,999,990' else 'FM999,999,990.00' end) $$;
create or replace function app.hm(m int) returns text language sql immutable as $$ select (m / 60) || 'h ' || lpad((m % 60)::text, 2, '0') || 'm' $$;
create or replace function app.local_hhmm(ts timestamptz, t uuid) returns text language sql stable security definer set search_path = public as $$
  select to_char(ts at time zone coalesce((select settings ->> 'timezone' from tenants where id = t), 'Europe/London'), 'HH24:MI') $$;

-- ------------------------------------------------------------------ session
create or replace function public.accept_invitation() returns void language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where user_id = auth.uid();
  perform app.require(p.user_id is not null, 'No portal account exists for this sign-in.');
  perform app.require(p.status <> 'suspended', 'This account is suspended. Contact your director.');
  if p.status = 'invited' then
    update profiles set status = 'active' where user_id = p.user_id;
    perform app.log('Accepted invitation', 'user', p.user_id::text, 'Invited', 'Active');
  end if;
end $$;

-- ------------------------------------------------------------------ recharges
create or replace function public.draft_recharge(p_job text, p_amount numeric, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); c recharge_candidates; j jobs; rid text;
begin
  perform app.require(app.has_role('director', 'operations'), 'Only directors and operations can draft recharges.');
  select * into j from jobs where tenant_id = t and id = p_job;
  select * into c from recharge_candidates where tenant_id = t and job_id = p_job;
  perform app.require(c.job_id is not null, 'This job has no identified recharge opportunity.');
  perform app.require(not exists (select 1 from recharges where tenant_id = t and job_id = p_job and status = 'draft'), 'A draft recharge already exists for ' || p_job || '.');
  perform app.require(p_amount > 0, 'Enter a recharge amount greater than zero.');
  perform app.require(p_amount <= c.amount, 'Amount cannot exceed the evidenced recharge candidate of ' || app.gbp(c.amount) || '.');
  rid := app.next_id(t, 'RCH');
  insert into recharges (tenant_id, id, job_id, customer_id, amount, note, created_by)
  values (t, rid, p_job, j.customer_id, p_amount, coalesce(nullif(trim(p_note), ''), c.basis), auth.uid());
  perform app.log('Drafted recharge', 'job', p_job, 'No draft', 'Draft ' || app.gbp(p_amount) || ' (not invoiced)', true);
  return rid;
end $$;

create or replace function public.edit_recharge(p_id text, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); r recharges;
begin
  perform app.require(app.has_role('director', 'operations'), 'Not permitted.');
  perform app.require(length(trim(coalesce(p_note, ''))) > 0, 'The note cannot be empty.');
  select * into r from recharges where tenant_id = t and id = p_id;
  perform app.require(r.id is not null, 'Recharge not found.');
  update recharges set note = trim(p_note), history = history || jsonb_build_object('t', now(), 'by', auth.uid(), 'change', 'Note edited') where tenant_id = t and id = p_id;
  perform app.log('Edited recharge note', 'job', r.job_id, left(r.note, 60), left(trim(p_note), 60));
end $$;

create or replace function public.set_recharge_status(p_id text, p_status text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); r recharges;
begin
  perform app.require(app.has_role('director', 'operations'), 'Not permitted.');
  perform app.require(p_status in ('draft', 'cancelled'), 'Unknown status.');
  select * into r from recharges where tenant_id = t and id = p_id;
  perform app.require(r.id is not null, 'Recharge not found.');
  if p_status = 'draft' then
    perform app.require(not exists (select 1 from recharges where tenant_id = t and job_id = r.job_id and status = 'draft' and id <> p_id), 'Another draft already exists for this job.');
  end if;
  update recharges set status = p_status, history = history || jsonb_build_object('t', now(), 'by', auth.uid(), 'change', case when p_status = 'draft' then 'Restored' else 'Cancelled' end) where tenant_id = t and id = p_id;
  perform app.log(case when p_status = 'draft' then 'Restored recharge draft' else 'Cancelled recharge draft' end, 'job', r.job_id,
    case when p_status = 'draft' then 'Cancelled' else 'Draft ' || app.gbp(r.amount) end, case when p_status = 'draft' then 'Draft ' || app.gbp(r.amount) else 'Cancelled' end, true);
end $$;

-- ------------------------------------------------------------------ driver cover
create or replace function public.propose_cover(p_job text, p_driver text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); j jobs; dd driver_days; v vehicles;
begin
  perform app.require(app.can_act(), 'Not permitted.');
  select * into j from jobs where tenant_id = t and id = p_job;
  perform app.require(j.id is not null, 'Job not found.');
  perform app.require(j.date = app.business_date(), 'Cover can only be proposed for today''s jobs.');
  select * into v from vehicles where tenant_id = t and id = j.vehicle_id;
  perform app.require(v.id is not null and not (v.status = 'vor'), 'The booked vehicle is unavailable, so driver cover cannot be proposed.');
  perform app.require(j.driver_id is null and j.proposed_driver_id is null, 'This job already has a driver or a proposal.');
  select * into dd from driver_days where tenant_id = t and driver_id = p_driver and date = j.date;
  perform app.require(dd.state = 'available', p_driver || ' is not available today.');
  perform app.require(dd.hours_avail_min >= coalesce(j.required_min, 0),
    format('%s has an estimated %s available. This job needs an illustrative %s, so %s is not planning-eligible.', p_driver, app.hm(dd.hours_avail_min), app.hm(j.required_min), p_driver));
  update jobs set proposed_driver_id = p_driver, proposed_by = auth.uid(), proposed_at = now() where tenant_id = t and id = p_job;
  update driver_days set state = 'proposed' where tenant_id = t and driver_id = p_driver and date = j.date;
  perform app.log('Proposed driver cover', 'job', p_job, 'No driver', p_driver || ' proposed — awaiting Vigo confirmation');
end $$;

create or replace function public.withdraw_cover(p_job text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); j jobs;
begin
  perform app.require(app.can_act(), 'Not permitted.');
  select * into j from jobs where tenant_id = t and id = p_job;
  perform app.require(j.proposed_driver_id is not null, 'There is no proposal to withdraw.');
  update driver_days set state = 'available' where tenant_id = t and driver_id = j.proposed_driver_id and date = j.date;
  update jobs set proposed_driver_id = null, proposed_by = null, proposed_at = null where tenant_id = t and id = p_job;
  perform app.log('Withdrew proposed cover', 'job', p_job, j.proposed_driver_id || ' proposed', 'No driver');
end $$;

-- ------------------------------------------------------------------ actions
create or replace function public.raise_action(p_title text, p_owner uuid, p_priority text, p_due date, p_record_type text default null, p_record_id text default null, p_notes text default null)
returns text language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); aid text; o profiles;
begin
  perform app.require(app.can_act(), 'Not permitted.');
  perform app.require(length(trim(coalesce(p_title, ''))) > 0, 'Give the action a short title.');
  perform app.require(p_due is not null, 'Set a follow-up date.');
  select * into o from profiles where user_id = p_owner and tenant_id = t and status = 'active' and role in ('director', 'operations', 'transport');
  perform app.require(o.user_id is not null, 'Choose an active owner.');
  aid := app.next_id(t, 'ACT');
  insert into actions (tenant_id, id, title, record_type, record_id, owner_id, priority, due, notes, created_by)
  values (t, aid, trim(p_title), nullif(p_record_type, ''), nullif(p_record_id, ''), p_owner, coalesce(p_priority, 'medium'), p_due, nullif(trim(coalesce(p_notes, '')), ''), auth.uid());
  perform app.log('Raised action', coalesce(nullif(p_record_type, ''), 'action'), coalesce(nullif(p_record_id, ''), aid), null, trim(p_title) || ' · owner ' || o.name || ' · ' || coalesce(p_priority, 'medium'));
  return aid;
end $$;

create or replace function public.update_action(p_id text, p_op text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); a actions; entry jsonb;
begin
  perform app.require(app.can_act(), 'Not permitted.');
  select * into a from actions where tenant_id = t and id = p_id;
  perform app.require(a.id is not null, 'Action not found.');
  entry := jsonb_build_object('t', now(), 'by', auth.uid(), 'note', p_note);
  if p_op = 'progress' then
    perform app.require(length(trim(coalesce(p_note, ''))) > 0, 'Write a short progress note.');
    update actions set progress = progress || entry where tenant_id = t and id = p_id;
    perform app.log('Recorded action progress', coalesce(a.record_type, 'action'), coalesce(a.record_id, a.id), a.title, left(p_note, 80));
  elsif p_op = 'complete' then
    update actions set status = 'done', completed_at = now(), completed_by = auth.uid(),
      progress = case when nullif(trim(coalesce(p_note, '')), '') is null then progress else progress || entry end where tenant_id = t and id = p_id;
    perform app.log('Completed action', coalesce(a.record_type, 'action'), coalesce(a.record_id, a.id), 'Open', 'Completed — ' || a.title);
  elsif p_op = 'reopen' then
    update actions set status = 'open', completed_at = null, completed_by = null where tenant_id = t and id = p_id;
    perform app.log('Reopened action', coalesce(a.record_type, 'action'), coalesce(a.record_id, a.id), 'Completed', 'Open');
  else perform app.fail('Unknown operation.'); end if;
end $$;

-- ------------------------------------------------------------------ compliance & defects
create or replace function public.record_followup(p_id text, p_note text, p_method text, p_next date) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); c compliance_items;
begin
  perform app.require(app.has_role('director', 'transport'), 'Only transport and directors record compliance follow-ups.');
  perform app.require(length(trim(coalesce(p_note, ''))) > 0, 'Describe the follow-up that took place.');
  select * into c from compliance_items where tenant_id = t and id = p_id;
  perform app.require(c.id is not null, 'Compliance item not found.');
  update compliance_items set status = 'followup', follow_up_at = now(), follow_up_by = auth.uid(), next_review = p_next,
    history = history || jsonb_build_object('t', now(), 'by', auth.uid(), 'note', p_note, 'method', p_method, 'next', p_next)
  where tenant_id = t and id = p_id;
  if c.driver_id is not null then
    update drivers set licence_status = case when c.kind = 'licence' then 'followup' else licence_status end,
                       tacho_status = case when c.kind = 'tacho' then 'followup' else tacho_status end
    where tenant_id = t and id = c.driver_id;
  end if;
  perform app.log('Recorded compliance follow-up', case when c.driver_id is not null then 'driver' else 'vehicle' end, coalesce(c.driver_id, c.vehicle_id),
    initcap(c.status), 'Follow-up recorded (internal record)');
end $$;

create or replace function public.resolve_defect(p_id text, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); d defects;
begin
  perform app.require(app.has_role('director', 'transport'), 'Only transport and directors can clear defects.');
  perform app.require(length(trim(coalesce(p_note, ''))) > 0, 'Record what was done to rectify or assess the defect.');
  select * into d from defects where tenant_id = t and id = p_id;
  perform app.require(d.id is not null and d.status <> 'rectified', 'Defect not found or already rectified.');
  update defects set status = 'rectified', history = history || jsonb_build_object('t', now(), 'by', auth.uid(), 'note', p_note) where tenant_id = t and id = p_id;
  if d.status = 'vor' and not exists (select 1 from defects where tenant_id = t and vehicle_id = d.vehicle_id and status = 'vor') then
    update vehicles set status = 'available', vor_until = app.business_date() where tenant_id = t and id = d.vehicle_id;
  end if;
  perform app.log('Recorded defect rectification', 'vehicle', d.vehicle_id, case when d.status = 'vor' then 'VOR' else 'Open defect' end, 'Rectified — ' || left(p_note, 60));
end $$;

-- ------------------------------------------------------------------ driver app
create or replace function app.driver_job(p_job text) returns jobs language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  perform app.require(app.role() = 'driver', 'Only drivers can check in.');
  select * into j from jobs where tenant_id = app.tenant() and id = p_job;
  perform app.require(j.id is not null and j.driver_id = app.driver_id() and j.date = app.business_date(), 'This job is not assigned to you today.');
  return j;
end $$;

create or replace function public.submit_walkaround(p_job text, p_results jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); j jobs := app.driver_job(p_job); wid text; r jsonb; did text; ids text[] := '{}';
begin
  perform app.require(jsonb_typeof(p_results) = 'array' and jsonb_array_length(p_results) >= 1, 'Complete every walkaround item.');
  for r in select * from jsonb_array_elements(p_results) loop
    if r ->> 'result' = 'defect' then
      perform app.require(length(trim(coalesce(r ->> 'note', ''))) > 0, 'Describe the defect for “' || (r ->> 'item') || '”.');
      perform app.require(r ->> 'severity' in ('safety', 'minor'), 'Choose a severity for each defect.');
      did := app.next_id(t, 'DEF');
      insert into defects (tenant_id, id, vehicle_id, item, severity, note, reported_by, status, source)
      values (t, did, j.vehicle_id, r ->> 'item', r ->> 'severity', r ->> 'note', app.driver_id(), 'open', 'Driver app walkaround');
      ids := ids || did;
      perform app.log('Reported vehicle defect', 'vehicle', j.vehicle_id, 'No open defect', case when r ->> 'severity' = 'safety' then 'Safety-critical' else 'Minor' end || ': ' || (r ->> 'item'));
    end if;
  end loop;
  wid := app.next_id(t, 'WLK');
  insert into walkarounds (tenant_id, id, job_id, vehicle_id, driver_id, results, defect_ids) values (t, wid, p_job, j.vehicle_id, app.driver_id(), p_results, ids);
  insert into job_checkins (tenant_id, job_id, stage, by_label, note) values (t, p_job, 'walkaround', app.driver_id(),
    case when cardinality(ids) > 0 then cardinality(ids) || ' defect(s) reported' else 'No defects' end);
  perform app.log('Completed walkaround check', 'vehicle', j.vehicle_id, null,
    case when cardinality(ids) > 0 then 'Completed with ' || cardinality(ids) || ' defect(s) — not cleared' else 'Completed — no defects' end);
  return jsonb_build_object('id', wid, 'defects', to_jsonb(ids));
end $$;

create or replace function public.driver_checkin(p_job text, p_stage text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); j jobs := app.driver_job(p_job); hhmm text; s shares; c contacts; walked boolean;
begin
  perform app.require(p_stage in ('depart', 'arrive', 'unloading', 'complete'), 'Unknown check-in stage.');
  select exists (select 1 from walkarounds w join jobs x on x.tenant_id = w.tenant_id and x.id = w.job_id
                 where w.tenant_id = t and w.vehicle_id = j.vehicle_id and w.driver_id = app.driver_id() and x.date = j.date) into walked;
  if p_stage = 'depart' then
    perform app.require(walked, 'Complete the walkaround check before departing.');
    perform app.require(j.status = 'not_started', 'This job has already departed.');
    perform app.require(not exists (select 1 from defects where tenant_id = t and vehicle_id = j.vehicle_id and status <> 'rectified' and severity = 'safety'),
      'A safety-critical defect is open on ' || j.vehicle_id || '. Do not depart until the transport office clears the vehicle.');
    update jobs set status = 'en_route', eta = now() + interval '75 minutes' where tenant_id = t and id = p_job;
  elsif p_stage = 'arrive' then
    perform app.require(j.status = 'en_route', 'Depart before arriving.');
    update jobs set status = 'on_site' where tenant_id = t and id = p_job;
  elsif p_stage = 'unloading' then
    perform app.require(j.status = 'on_site', 'Arrive before unloading.');
  elsif p_stage = 'complete' then
    perform app.require(j.status = 'on_site' and exists (select 1 from job_checkins where tenant_id = t and job_id = p_job and stage = 'unloading'), 'Start unloading before completing.');
    hhmm := app.local_hhmm(now(), t);
    update jobs set status = 'delivered', delivered_at = hhmm, late = hhmm > slot, pod_status = 'missing', invoice_status = 'pending' where tenant_id = t and id = p_job;
  end if;
  insert into job_checkins (tenant_id, job_id, stage, by_label) values (t, p_job, p_stage, app.driver_id());
  perform app.log('Driver check-in: ' || case p_stage when 'depart' then 'Departed depot' when 'arrive' then 'Arrived at customer' when 'unloading' then 'Unloading started' else 'Delivery complete' end,
    'job', p_job, initcap(replace(j.status, '_', ' ')), case p_stage when 'depart' then 'En route' when 'arrive' then 'On site' when 'unloading' then 'On site' else 'Completed' end);
  if p_stage = 'complete' then
    for s in select * from shares where tenant_id = t and job_id = p_job and active loop
      select * into c from contacts where tenant_id = t and id = s.contact_id;
      insert into notifications (tenant_id, contact_id, job_id, kind, subject, status)
      values (t, c.id, p_job, 'delivery', 'Delivered: ' || p_job || ' to ' || j.dest, case when c.notify then 'pending' else 'suppressed' end);
    end loop;
  end if;
end $$;

-- POD: staff (director/operations/transport) or the assigned driver. Image is uploaded to storage first; path may be null for a paper POD.
create or replace function public.record_pod(p_job text, p_path text, p_name text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); j jobs;
begin
  select * into j from jobs where tenant_id = t and id = p_job;
  perform app.require(j.id is not null, 'Job not found.');
  if app.role() = 'driver' then perform app.driver_job(p_job); else perform app.require(app.can_act(), 'Not permitted.'); end if;
  perform app.require(j.status = 'delivered', 'A POD can only be recorded for a delivered job.');
  if p_path is not null then perform app.require(p_path like t::text || '/' || p_job || '/%', 'Invalid POD file location.'); end if;
  update jobs set pod_status = 'received', pod_at = now(), pod_by = (app.me()).name, pod_path = p_path, pod_name = coalesce(p_name, 'Paper POD logged'),
    pod_source = 'Uploaded in portal' where tenant_id = t and id = p_job;
  if j.date = app.business_date() then insert into job_checkins (tenant_id, job_id, stage, by_label) values (t, p_job, 'pod', (app.me()).name); end if;
  perform app.log('POD uploaded', 'job', p_job, case when j.pod_status = 'missing' then 'POD missing' else j.pod_status end,
    case when j.invoice_status = 'pending' then 'POD received — ready to invoice' else 'POD received' end);
end $$;

-- ------------------------------------------------------------------ customer sharing
create or replace function public.share_job(p_job text, p_contact text, p_pod boolean default true, p_invoice boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); j jobs; c contacts; sid text;
begin
  perform app.require(app.has_role('director', 'operations'), 'Only directors and operations can share jobs.');
  select * into j from jobs where tenant_id = t and id = p_job;
  select * into c from contacts where tenant_id = t and id = p_contact;
  perform app.require(j.id is not null and c.id is not null, 'Job or contact not found.');
  perform app.require(c.customer_id = j.customer_id, 'A job can only be shared with a contact at that job''s customer.');
  perform app.require(not exists (select 1 from shares where tenant_id = t and job_id = p_job and contact_id = p_contact and active), 'Already shared with this contact.');
  sid := app.next_id(t, 'SH');
  insert into shares (tenant_id, id, job_id, contact_id, show_pod, show_invoice, shared_by) values (t, sid, p_job, p_contact, p_pod, p_invoice, auth.uid());
  perform app.log('Shared job with customer', 'job', p_job, 'Not shared', 'Shared with ' || c.name || ' (' || (select name from customers where tenant_id = t and id = c.customer_id) || ')');
  return sid;
end $$;

create or replace function public.update_share(p_id text, p_key text, p_val boolean) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); s shares;
begin
  perform app.require(app.has_role('director', 'operations'), 'Not permitted.');
  select * into s from shares where tenant_id = t and id = p_id;
  perform app.require(s.id is not null, 'Share not found.');
  if p_key = 'pod' then update shares set show_pod = p_val where tenant_id = t and id = p_id;
  elsif p_key = 'invoice' then update shares set show_invoice = p_val where tenant_id = t and id = p_id;
  elsif p_key = 'active' then update shares set active = p_val where tenant_id = t and id = p_id;
  else perform app.fail('Unknown setting.'); end if;
  perform app.log(case when p_key = 'active' then 'Stopped sharing job' else 'Updated customer sharing' end, 'job', s.job_id,
    case p_key when 'pod' then 'POD ' when 'invoice' then 'Invoice ' else 'Share ' end || case when p_val then 'hidden' else 'visible' end,
    case p_key when 'pod' then 'POD ' when 'invoice' then 'Invoice ' else 'Share ' end || case when p_val then 'visible' else 'hidden' end);
end $$;

create or replace function public.request_link(p_job text, p_contact text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); c contacts;
begin
  perform app.require(app.has_role('director', 'operations'), 'Not permitted.');
  perform app.require(exists (select 1 from shares where tenant_id = t and job_id = p_job and contact_id = p_contact and active), 'Share the job with this contact first.');
  select * into c from contacts where tenant_id = t and id = p_contact;
  perform app.require(c.notify, c.email || ' has opted out of notifications.');
  insert into notifications (tenant_id, contact_id, job_id, kind, subject) values (t, p_contact, p_job, 'signin', 'Your sign-in link for ' || p_job);
  perform app.log('Sign-in link requested', 'job', p_job, null, 'Email with one-time link queued for ' || c.email);
end $$;

create or replace function public.set_notify(p_on boolean) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); cid text := app.contact_id();
begin
  perform app.require(app.role() = 'customer' and cid is not null, 'Not permitted.');
  update contacts set notify = p_on where tenant_id = t and id = cid;
  perform app.log(case when p_on then 'Opted in to delivery notifications' else 'Opted out of delivery notifications' end, 'contact', cid,
    case when p_on then 'Opted out' else 'Opted in' end, case when p_on then 'Opted in' else 'Opted out' end);
end $$;

-- ------------------------------------------------------------------ administration
create or replace function public.set_threshold(p_pct numeric) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); prev numeric;
begin
  perform app.require(app.role() = 'director', 'Only the director can change the threshold.');
  perform app.require(p_pct > 0 and p_pct <= 100, 'Enter a threshold between 1% and 100%.');
  select (settings ->> 'variance_threshold_pct')::numeric into prev from tenants where id = t;
  update tenants set settings = settings || jsonb_build_object('variance_threshold_pct', p_pct) where id = t;
  perform app.log('Changed cost-variance threshold', 'setting', 'threshold', prev || '%', p_pct || '%');
end $$;

create or replace function public.publish_rates(p_rates jsonb, p_note text) returns text language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); v text; prev text; k text;
begin
  perform app.require(app.role() = 'director', 'Only the director can publish rates.');
  foreach k in array array['artic','artFuel','rigid26','rigid18','employed','ltd','agency','otMult','pallet','overheadStd'] loop
    perform app.require((p_rates ->> k) is not null and (p_rates ->> k)::numeric >= 0, 'Every rate needs a number of zero or more.');
  end loop;
  select version into prev from rate_cards where tenant_id = t order by effective desc limit 1;
  v := 'RC-' || to_char(now(), 'YYYY-MM-DD-HH24MISS');
  insert into rate_cards (tenant_id, version, created_by, note, rates) values (t, v, auth.uid(), coalesce(nullif(trim(p_note), ''), 'Rate update'), p_rates);
  perform app.log('Published rate card version', 'setting', 'rates', prev, v || ' (applies to new costings only)');
  return v;
end $$;

create or replace function public.set_user_status(p_user uuid, p_status user_status) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); u profiles;
begin
  perform app.require(app.role() = 'director', 'Only the director manages team access.');
  perform app.require(p_user <> auth.uid(), 'You cannot suspend your own account.');
  perform app.require(p_status in ('active', 'suspended'), 'Unknown status.');
  select * into u from profiles where user_id = p_user and tenant_id = t;
  perform app.require(u.user_id is not null, 'User not found.');
  update profiles set status = p_status where user_id = p_user;
  perform app.log(case when p_status = 'suspended' then 'Suspended user' else 'Restored user' end, 'user', p_user::text, initcap(u.status::text), initcap(p_status::text));
end $$;

create or replace function public.log_export(p_name text, p_rows int) returns void language plpgsql security definer set search_path = public as $$
begin
  perform app.require(app.is_staff(), 'Not permitted.');
  perform app.log('Exported CSV', 'export', p_name, null, p_rows || ' rows (' || case when app.can_money() then 'with' else 'without' end || ' financial columns)');
end $$;

-- execute grants
do $$ declare f text;
begin
  foreach f in array array['accept_invitation()','draft_recharge(text,numeric,text)','edit_recharge(text,text)','set_recharge_status(text,text)',
    'propose_cover(text,text)','withdraw_cover(text)','raise_action(text,uuid,text,date,text,text,text)','update_action(text,text,text)',
    'record_followup(text,text,text,date)','resolve_defect(text,text)','submit_walkaround(text,jsonb)','driver_checkin(text,text)','record_pod(text,text,text)',
    'share_job(text,text,boolean,boolean)','update_share(text,text,boolean)','request_link(text,text)','set_notify(boolean)','set_threshold(numeric)',
    'publish_rates(jsonb,text)','set_user_status(uuid,user_status)','log_export(text,int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
