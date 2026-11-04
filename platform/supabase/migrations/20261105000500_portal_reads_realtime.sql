-- Drivers and customer contacts may read the customer record behind their own work, so screens can show the name.
create policy driver_read on customers for select to authenticated using (tenant_id = app.tenant() and app.role() = 'driver'
  and id in (select customer_id from jobs where tenant_id = app.tenant() and driver_id = app.driver_id()));
create policy contact_read on customers for select to authenticated using (tenant_id = app.tenant() and app.role() = 'customer'
  and id = (select customer_id from contacts where tenant_id = app.tenant() and id = app.contact_id()));

-- Live updates for the Today Board and driver/customer screens (Supabase Realtime honours RLS).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table jobs, job_checkins, defects, actions, recharges, compliance_items;
  end if;
end $$;
