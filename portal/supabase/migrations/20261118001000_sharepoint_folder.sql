-- =====================================================================================
-- A new way for data to arrive: "SharePoint folder". Files saved into a named SharePoint folder
-- (a payroll export, a Bibby statement, the warehouse spreadsheet) are picked up automatically
-- by the sharepoint-folder function, checked, stored untouched and imported. Nobody uploads anything.
-- The folder details live in the connection's settings (site, folder, what the files contain);
-- access comes from Trans Haul's Microsoft approval, kept in the vault, never in the settings.
-- =====================================================================================
alter table connections drop constraint if exists connections_method_check;
alter table connections add constraint connections_method_check
  check (method in ('api', 'oauth', 'email_report', 'file', 'sharepoint_folder'));
