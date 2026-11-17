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
| Screens (dashboard, pages, admin console) | Not started |
| Real connectors for each supplier | Waiting for access and sample files |
| Edge functions (inbox, schedules, invitations, Xero) | Not started (November versions to adapt) |
| Hosting (Supabase, web hosting, email) | Not set up: needs accounts in Your AI's name |

Connectors marked `verified: false` in `connectors/catalogue.mjs` are based on public information only. None goes live until a real sample from Trans Haul has been mapped and checked.

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

The test data is fictional (Demo Haulage Ltd and Second Haulier Ltd). No Trans Haul data is used in tests.
