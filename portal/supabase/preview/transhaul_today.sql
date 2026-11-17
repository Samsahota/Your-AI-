-- PREVIEW ONLY (local database "portal_preview"). Trans Haul as the live portal stands before any
-- system is connected: the company on its founding deal, one login per role, its nine connections
-- waiting for supplier access, and no figures or records at all. Nothing here is made up about
-- Trans Haul's performance. Logins use the reserved .test domain and are not real people.

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'admin@yourai.test'),
  ('10000000-0000-4000-8000-000000000002', 'director@transhaul.test'),
  ('10000000-0000-4000-8000-000000000003', 'consultant@transhaul.test'),
  ('10000000-0000-4000-8000-000000000004', 'ops@transhaul.test'),
  ('10000000-0000-4000-8000-000000000005', 'transport@transhaul.test'),
  ('10000000-0000-4000-8000-000000000006', 'warehouse@transhaul.test');

insert into companies (id, name, slug, deal, setup_fee, monthly_fee, status, settings) values
  ('20000000-0000-4000-8000-00000000000a', 'Trans Haul', 'trans-haul', 'founding', 3000, 300, 'setup', '{"timezone": "Europe/London"}');

insert into profiles (user_id, company_id, role, name, email, division, status, is_test) values
  ('10000000-0000-4000-8000-000000000001', null, 'platform_admin', 'Your AI', 'admin@yourai.test', null, 'active', false),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'director', 'Preview login', 'director@transhaul.test', null, 'active', false),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'consultant', 'Preview login', 'consultant@transhaul.test', null, 'active', false),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'operations', 'Preview login', 'ops@transhaul.test', null, 'active', false),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', 'transport', 'Preview login', 'transport@transhaul.test', 'transport', 'active', false),
  ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-00000000000a', 'warehouse', 'Preview login', 'warehouse@transhaul.test', 'warehouse', 'active', false);

insert into connections (company_id, system, label, method, status, feeds, schedule, notes) values
  ('20000000-0000-4000-8000-00000000000a', 'vigo', 'Jobs, customers and costs', 'api', 'waiting_access', '{customers,jobs,job_costs}', 'every_15_min', 'Waiting for API access from Vigo'),
  ('20000000-0000-4000-8000-00000000000a', 'tachomaster', 'Drivers'' hours and infringements', 'api', 'waiting_access', '{infringements,people_events}', 'nightly', 'Waiting for access from Road Tech'),
  ('20000000-0000-4000-8000-00000000000a', 'falcon', 'Vehicle tracking (delivery times)', 'api', 'waiting_access', '{jobs}', 'hourly', 'Waiting for access from Road Tech'),
  ('20000000-0000-4000-8000-00000000000a', 'predrive', 'Walkaround checks and defects', 'api', 'waiting_access', '{defects,compliance_items}', 'hourly', 'Waiting for access from Road Tech'),
  ('20000000-0000-4000-8000-00000000000a', 'xero', 'Accounts', 'oauth', 'waiting_access', '{pnl_lines,cost_daily}', 'nightly', 'Trans Haul approves the read-only connection'),
  ('20000000-0000-4000-8000-00000000000a', 'sharepoint', 'HR, incident and compliance files', 'oauth', 'waiting_access', '{staff,people_events,incidents,compliance_items,hr_cases}', 'nightly', 'Trans Haul''s Microsoft 365 admin approves the read-only connection'),
  ('20000000-0000-4000-8000-00000000000a', 'brightpay', 'Payroll', 'file', 'waiting_access', '{payroll_periods,people_events}', 'on_receipt', 'Waiting for the payroll export'),
  ('20000000-0000-4000-8000-00000000000a', 'bibby', 'Invoice finance', 'file', 'waiting_access', '{}', 'on_receipt', 'Waiting for the report format'),
  ('20000000-0000-4000-8000-00000000000a', 'warehouse', 'Warehouse daily figures', 'file', 'waiting_access', '{warehouse_daily,cost_daily}', 'nightly', 'Source to confirm with the Warehouse Manager');
