-- LOCAL TEST DATA ONLY. Two fictional companies; no real Trans Haul data.
-- Business day under test: Tuesday 17 November 2026.

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'director@demo.test'),
  ('10000000-0000-4000-8000-000000000003', 'consultant@demo.test'),
  ('10000000-0000-4000-8000-000000000004', 'ops@demo.test'),
  ('10000000-0000-4000-8000-000000000005', 'transport@demo.test'),
  ('10000000-0000-4000-8000-000000000006', 'warehouse@demo.test'),
  ('10000000-0000-4000-8000-000000000007', 'testtm@demo.test'),
  ('10000000-0000-4000-8000-000000000008', 'leaver@demo.test'),
  ('10000000-0000-4000-8000-000000000009', 'director@second.test');

insert into companies (id, name, slug, deal, setup_fee, monthly_fee, status, settings) values
  ('20000000-0000-4000-8000-00000000000a', 'Demo Haulage Ltd', 'demo-haulage', 'founding', 3000, 300, 'active', '{"timezone": "Europe/London"}'),
  ('20000000-0000-4000-8000-00000000000b', 'Second Haulier Ltd', 'second-haulier', 'standard', 5000, 500, 'active', '{"timezone": "Europe/London"}');

insert into profiles (user_id, company_id, role, name, email, division, status, is_test) values
  ('10000000-0000-4000-8000-000000000001', null, 'platform_admin', 'Platform Admin', 'admin@example.test', null, 'active', false),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'director', 'Dana Director', 'director@demo.test', null, 'active', false),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'consultant', 'Connor Consultant', 'consultant@demo.test', null, 'active', false),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'operations', 'Olive Operations', 'ops@demo.test', null, 'active', false),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', 'transport', 'Toni Transport', 'transport@demo.test', 'transport', 'active', false),
  ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-00000000000a', 'warehouse', 'Wes Warehouse', 'warehouse@demo.test', 'warehouse', 'active', false),
  ('10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-00000000000a', 'transport', 'Tess Tester', 'testtm@demo.test', 'transport', 'active', true),
  ('10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-00000000000a', 'operations', 'Lee Leaver', 'leaver@demo.test', null, 'suspended', false),
  ('10000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-00000000000b', 'director', 'Sid Second', 'director@second.test', null, 'active', false);

-- Staff: 10 transport (drivers, 45h), 10 warehouse (40h)
insert into staff (company_id, name, employee_no, division, is_driver, contracted_hours)
select '20000000-0000-4000-8000-00000000000a', 'Driver ' || g, 'T' || g, 'transport', true, 45 from generate_series(1, 10) g;
insert into staff (company_id, name, employee_no, division, is_driver, contracted_hours)
select '20000000-0000-4000-8000-00000000000a', 'Operative ' || g, 'W' || g, 'warehouse', false, 40 from generate_series(1, 10) g;

insert into customers (id, company_id, name, account_code) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'Example Foods Ltd', 'EXF01');

-- 10 transport jobs delivered on 17 Nov: job 10 is late; job 9 is on time but not in full.
-- OTIF 8/10 = 80%, on time 9/10 = 90%.
insert into jobs (id, company_id, job_ref, customer_id, division, job_date, due_at, delivered_at, in_full, status, pod_received)
select ('40000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, '20000000-0000-4000-8000-00000000000a', 'J-' || g,
  '30000000-0000-4000-8000-000000000001', 'transport', '2026-11-17',
  '2026-11-17 12:00+00', case when g = 10 then timestamptz '2026-11-17 13:30+00' else timestamptz '2026-11-17 11:00+00' end,
  g <> 9, 'delivered', g <= 7
from generate_series(1, 10) g;
-- Revenue 1,000 each (10,000); planned 600, actual 650 each => job cost 108.3% of plan.
insert into job_costs (job_id, company_id, division, revenue, planned_cost, actual_cost)
select id, company_id, 'transport', 1000, 600, 650 from jobs where company_id = '20000000-0000-4000-8000-00000000000a';
-- November plan 20,000 => pro rata to 17 Nov = 11,333.33; revenue 10,000 => 88.2%.
insert into revenue_plan (company_id, month, amount) values ('20000000-0000-4000-8000-00000000000a', '2026-11-01', 20000);

-- Warehouse: 1,000 cases, 2,000 picks, 100 labour hours, £1,500 cost => 20 picks/h, 10 cases/h, £1.50 per case.
insert into warehouse_daily (company_id, day, cases, picks, units, labour_hours) values ('20000000-0000-4000-8000-00000000000a', '2026-11-17', 1000, 2000, 5000, 100);
insert into cost_daily (company_id, day, division, category, amount) values ('20000000-0000-4000-8000-00000000000a', '2026-11-17', 'warehouse', 'labour', 1500);
insert into pnl_lines (company_id, month, account, category, amount) values ('20000000-0000-4000-8000-00000000000a', '2026-10-01', '4000 Sales', 'revenue', 250000);
insert into payroll_periods (company_id, period_end, gross_pay, employer_costs, hours, overtime_hours) values ('20000000-0000-4000-8000-00000000000a', '2026-10-31', 60000, 8000, 7000, 300);

-- People on 17 Nov: driver T1 absent (all 5%, transport 10%); operatives W1, W2 on holiday (all 10%, warehouse 20%).
-- Overtime: 20 hours by T2 in the last 7 days => all 20/850 = 2.4%.
insert into people_events (company_id, staff_id, kind, day, hours, source, external_ref)
select company_id, id, 'absence', '2026-11-17', 9, 'test', 'abs-' || employee_no from staff where employee_no = 'T1';
insert into people_events (company_id, staff_id, kind, day, hours, source, external_ref)
select company_id, id, 'holiday', '2026-11-17', 8, 'test', 'hol-' || employee_no from staff where employee_no in ('W1', 'W2');
insert into people_events (company_id, staff_id, kind, day, hours, source, external_ref)
select company_id, id, 'overtime', '2026-11-14', 20, 'test', 'ot-' || employee_no from staff where employee_no = 'T2';
insert into hr_cases (company_id, staff_id, kind, opened_on, detail)
select company_id, id, 'disciplinary', '2026-11-03', 'Confidential case detail' from staff where employee_no = 'T3';

-- Health and Safety: one open near miss; last accident 1 Oct (47 days); none this month.
insert into incidents (company_id, kind, occurred_at, division, description, status, source, external_ref) values
  ('20000000-0000-4000-8000-00000000000a', 'near_miss', '2026-11-12 09:00+00', 'warehouse', 'Pallet slipped from racking', 'open', 'test', 'nm-1'),
  ('20000000-0000-4000-8000-00000000000a', 'accident', '2026-10-01 15:00+00', 'transport', 'Minor reversing damage', 'closed', 'test', 'acc-1');

-- Compliance: 2 infringements in the last 7 days; one overdue MOT (transport); a BRC action due in 5 days; one open defect.
insert into vehicles (id, company_id, registration, vehicle_type) values ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'AB12 CDE', 'Tractor unit');
insert into infringements (company_id, staff_id, occurred_on, infringement_type, source, external_ref)
select company_id, id, '2026-11-15', 'Insufficient daily rest', 'test', 'inf-' || employee_no from staff where employee_no in ('T4', 'T5');
insert into compliance_items (company_id, kind, subject, vehicle_id, division, due_date, source, external_ref) values
  ('20000000-0000-4000-8000-00000000000a', 'mot', 'AB12 CDE', '50000000-0000-4000-8000-000000000001', 'transport', '2026-11-10', 'test', 'mot-1'),
  ('20000000-0000-4000-8000-00000000000a', 'brc', 'BRC audit action 4', null, 'warehouse', '2026-11-22', 'test', 'brc-4');
insert into defects (company_id, vehicle_id, reported_at, description, severity, source, external_ref) values
  ('20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000001', '2026-11-16 06:10+00', 'Nearside indicator not working', 'minor', 'test', 'def-1');

-- The second company has its own job and incident, which the first must never see.
insert into jobs (company_id, job_ref, division, job_date, due_at, delivered_at, in_full, status)
values ('20000000-0000-4000-8000-00000000000b', 'S-1', 'transport', '2026-11-17', '2026-11-17 12:00+00', '2026-11-17 10:00+00', true, 'delivered');
insert into incidents (company_id, kind, occurred_at, description, source, external_ref)
values ('20000000-0000-4000-8000-00000000000b', 'accident', '2026-11-05 10:00+00', 'Second company accident', 'test', 'b-acc-1');

-- Master policy library: one document, subscribed by the first company only.
insert into library_documents (id, company_id, category, title, owner_name) values
  ('60000000-0000-4000-8000-000000000001', null, 'health_safety', 'Manual handling policy', 'Clearpath');
insert into library_subscriptions (company_id, document_id) values ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000001');

select compute_measures('20000000-0000-4000-8000-00000000000a', '2026-11-17');
select compute_measures('20000000-0000-4000-8000-00000000000b', '2026-11-17');
