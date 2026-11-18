# Clearpath operations platform (Trans Haul first)

The new platform agreed at the 17 November 2026 meeting, built from scratch. The November demo (`../src`, `../platform`) stays as it is and is only a reference.

## How it fits together

1. **Connections** bring data in from each haulier's systems (Vigo, Road Tech, Xero, SharePoint, BrightPay, Bibby, files). The engine in `connectors/` reads each file or report, checks the columns are still there, maps them into standard records, and checks totals against the source. **If any check fails, nothing is written** and the run is recorded as failed.
2. **Standard records** (`supabase/migrations/..._records.sql`) are the same for every haulier: jobs, job costs, warehouse days, staff, people events, incidents, infringements, compliance items, defects, P&L and payroll.
3. **Measures** (`..._measures.sql`) are worked out each night from the records, for the whole company and for each division.
4. **Colours**: each company's targets decide red, amber or green. Missing data shows as "no data", and a failing connection shows its figures as "not updated", never green.
5. **The dashboard** (`dashboard()` in `..._connections_dashboard.sql`) returns the bullseye (Health and Safety at the centre; Service, Cost, People and Compliance around it), already filtered to what the signed-in person may see.

## Who sees what

Enforced by the database itself, not by hiding screens:

- **Two-factor sign-in** is required. Without it, every table reads as empty.
- **Each company's data is separate.** Only the platform admin can see across companies.
- **Access levels** per role and area: none, own division, or full (`role_access`). These are the defaults from the build pack.
- **Directors can change access** for their own company with `set_access_override` (for example, to let the Transport Manager see transport costs).
- **Money and personal data** sit in their own tables. Roles without access to them receive nothing.

## What's built and tested

| Part | Status |
| --- | --- |
| Companies, roles, access matrix, two-factor enforcement, audit log | Built, tested |
| Standard records for all eight Trans Haul systems plus warehouse | Built, tested |
| 18 measures, targets, red / amber / green, dashboard data | Built, tested |
| Connections: setup, run records, failing feeds mark figures "not updated", secrets refused | Built, tested |
| Comments, policy library (master and company documents, read and sign) | Built, tested |
| Connection engine: CSV and report reading, UK dates and times, mapping, checks | Built, tested |
| Screens: sign-in with two-factor, invitation and password reset, dashboard, Health and Safety, Service, Cost, People, Compliance, Links, Records, comments, My account (demo view) | Built, tested in a browser |
| Users and settings (directors): users and invitations, access levels, targets, connections, documents, activity | Built, tested in a browser |
| Admin console: companies, connections, file import with checks, master library, health | Built, tested in a browser |
| Invitation edge function | Deployed to clearpath-production; switched off until APP_URL is set (refuses to send until then) |
| Actions: raise against any red or amber figure, incident, compliance item, defect or infringement; owner, priority, follow-up date, progress timeline, complete and reopen; counted in the menu | Built, tested in a browser |
| Feed freshness follows each connection's schedule (2 hours to 35 days); admin health list uses the same rule | Built, tested |
| File import for every record table, with an untouched, fingerprinted copy of each file kept | Built, tested |
| Revenue plan: entered in Targets, imported from a file, or from a Xero budget | Built, tested |
| Design: Clearpath's own look, statistic tiles, trend lines, charts, view and date drop-downs, account menu | Built, tested in a browser |
| Real connectors for each supplier | Waiting for access and sample files (file import works now for spreadsheets and exports) |
| Other edge functions (report inbox, nightly schedule, daily and weekly emails, Xero, Microsoft) | Not started (November versions to adapt) |
| Uploading document files (PDFs) to the library | Switched on with hosting (storage) |
| Supabase project `clearpath-production` (London, Your AI Ltd Pro organisation) | Set up 17 Nov 2026: all 9 migrations applied (18 Nov), security checker clear apart from the intended signed-in functions (each checks access itself). Trans Haul added 17 Nov (founding deal, nine connections waiting for access; BrightPay monthly, Xero also brings the revenue plan); no users yet |
| Web hosting and email | Not set up |

Connectors marked `verified: false` in `connectors/catalogue.mjs` are based on public information only. None goes live until a real sample from Trans Haul has been mapped and checked.

## Trying it locally

Uses the local test database and fictional companies (Demo Haulage Ltd, Second Haulier Ltd).

```bash
npm run db:reset
```

```bash
npm run serve
```

Open http://localhost:54410 and sign in with `director@demo.test` (or `consultant@`, `ops@`, `transport@`, `warehouse@demo.test`, or `admin@example.test`). The password is printed when the server starts. Two-factor works as it will live: add the key it shows to an authenticator app and enter the code.

Screenshots of every screen are in `web/screens/`.

## Running the tests locally

Needs Postgres 16 on port 54329 (the same local server as the November build).

```bash
npm install
```

```bash
npm run db:reset
```

```bash
npm run test:db
```

```bash
npm run test:unit
```

```bash
npm run test:e2e
```

The browser tests need a fresh database (`npm run db:reset`) and drive every screen in Chromium, including two-factor sign-in.

The test data is fictional (Demo Haulage Ltd and Second Haulier Ltd). No Trans Haul data is used in tests.
