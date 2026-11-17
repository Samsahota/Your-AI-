-- =====================================================================================
-- Fixes from Supabase's security and performance checker on clearpath-production.
-- =====================================================================================

-- 1. Fix the search path on the three helper functions that didn't have one, so nobody can
--    change what they resolve to. They only use fully named functions (auth.jwt), so an
--    empty search path is safe.
alter function app.mfa_ok() set search_path = '';
alter function app.is_service() set search_path = '';
alter function app.rag(numeric, text, numeric, numeric) set search_path = '';

-- 2. Recording a connection run is for the platform's own functions only. The screens never
--    call it: file imports reach it through import_records, which checks the caller itself.
revoke execute on function record_run(uuid, text, integer, integer, jsonb, text, text, timestamptz) from authenticated;

-- 3. Work out who is signed in once per query, not once per row.
drop policy read_profiles on profiles;
create policy read_profiles on profiles for select using (
  user_id = (select auth.uid()) or app.is_admin() or (app.mfa_ok() and company_id = app.company() and app.access('settings') = 'full'));
drop policy read_acks on acknowledgements;
create policy read_acks on acknowledgements for select using (
  user_id = (select auth.uid()) or app.is_admin() or (company_id = app.company() and app.access('compliance') = 'full'));

-- 4. Indexes on every link between tables, so lookups and deletes stay fast as data grows.
create index if not exists access_overrides_area_idx on access_overrides (area);
create index if not exists acknowledgements_company_idx on acknowledgements (company_id);
create index if not exists comments_area_idx on comments (area);
create index if not exists comments_company_idx on comments (company_id, created_at desc);
create index if not exists compliance_items_staff_idx on compliance_items (staff_id);
create index if not exists compliance_items_vehicle_idx on compliance_items (vehicle_id);
create index if not exists connection_runs_company_idx on connection_runs (company_id);
create index if not exists defects_vehicle_idx on defects (vehicle_id);
create index if not exists hr_cases_company_idx on hr_cases (company_id);
create index if not exists hr_cases_staff_idx on hr_cases (staff_id);
create index if not exists inbound_messages_company_idx on inbound_messages (company_id, received_at desc);
create index if not exists inbound_messages_connection_idx on inbound_messages (connection_id);
create index if not exists inbound_messages_run_idx on inbound_messages (run_id);
create index if not exists infringements_staff_idx on infringements (staff_id);
create index if not exists job_costs_company_idx on job_costs (company_id);
create index if not exists jobs_customer_idx on jobs (customer_id);
create index if not exists library_documents_company_idx on library_documents (company_id);
create index if not exists library_subscriptions_document_idx on library_subscriptions (document_id);
create index if not exists measure_values_measure_idx on measure_values (measure_code);
create index if not exists measures_area_idx on measures (area);
create index if not exists people_events_staff_idx on people_events (staff_id);
create index if not exists role_access_area_idx on role_access (area);
create index if not exists thresholds_measure_idx on thresholds (measure_code);
