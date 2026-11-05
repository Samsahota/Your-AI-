-- Drivers can undo their own last check-in within 10 minutes (e.g. an accidental tap).
-- Undoing "Delivery complete" cancels the customer email if it has not been sent yet.
-- Not allowed once a POD has been recorded — the transport office corrects that.
alter table notifications drop constraint if exists notifications_status_check;
alter table notifications add constraint notifications_status_check check (status in ('pending', 'sent', 'failed', 'suppressed', 'cancelled'));

create or replace function public.undo_checkin(p_job text) returns text language plpgsql security definer set search_path = public as $$
declare t uuid := app.tenant(); j jobs := app.driver_job(p_job); c job_checkins; n int;
begin
  select * into c from job_checkins where tenant_id = t and job_id = p_job and stage in ('depart', 'arrive', 'unloading', 'complete') order by at desc, id desc limit 1;
  perform app.require(c.id is not null, 'There is nothing to undo.');
  perform app.require(now() - c.at <= interval '10 minutes', 'This step can no longer be undone here — contact the transport office.');
  perform app.require(not (c.stage = 'complete' and j.pod_status = 'received'), 'The POD has been recorded, so the delivery can no longer be undone here — contact the transport office.');
  delete from job_checkins where id = c.id;
  if c.stage = 'depart' then update jobs set status = 'not_started', eta = null where tenant_id = t and id = p_job;
  elsif c.stage = 'arrive' then update jobs set status = 'en_route' where tenant_id = t and id = p_job;
  elsif c.stage = 'complete' then
    update jobs set status = 'on_site', delivered_at = null, late = null, pod_status = 'n/a', invoice_status = 'not_due' where tenant_id = t and id = p_job;
    update notifications set status = 'cancelled', error = 'Check-in undone before sending' where tenant_id = t and job_id = p_job and kind = 'delivery' and status = 'pending';
    get diagnostics n = row_count;
    if n > 0 then perform app.log('Delivery notification cancelled', 'job', p_job, 'Queued', 'Cancelled before sending (check-in undone)'); end if;
  end if;
  perform app.log('Driver undid check-in', 'job', p_job, initcap(replace(j.status, '_', ' ')) || ' — ' || c.stage,
    case c.stage when 'depart' then 'Not started' when 'arrive' then 'En route' else 'On site' end);
  return c.stage;
end $$;
revoke all on function public.undo_checkin(text) from public, anon;
grant execute on function public.undo_checkin(text) to authenticated;
