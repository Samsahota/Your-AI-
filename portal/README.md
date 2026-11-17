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
| Invitation edge function | Written; runs once hosted |
| Real connectors for each supplier | Waiting for access and sample files (file import works now for spreadsheets and exports) |
| Other edge functions (report inbox, nightly schedule, daily and weekly emails, Xero, Microsoft) | Not started (November versions to adapt) |
| Uploading document files (PDFs) to the library | Switched on with hosting (storage) |
| Hosting (Supabase, web hosting, email) | Not set up: needs accounts in Your AI's name |

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
