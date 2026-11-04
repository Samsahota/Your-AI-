# Haulage Portal — production platform

The working system behind the demo. It uses the same screens as the offline demo (`../index.html`). The data now comes from a real database, sign-in is real, and every change goes through checked, logged database functions.

```
Browser (static app on Vercel)  ──►  Supabase
  same screens as the demo            Postgres + row-level security  ← every rule lives here
  src/*.js + src/live.js              Auth (invitations, passwords, one-time email links)
                                      Storage (POD photos, private bucket)
                                      Edge functions (Deno): invite-user · notify-outbox · xero · vigo-sync · import-file
                                      pg_cron schedules → edge functions
Source systems (read-only):  Vigo API or export · Xero OAuth · Bibby / Tachomaster / Paragon file imports
Email: Resend (delivery notifications with one-time links)
```

## How security works

- **Every table carries `tenant_id`.** Each haulier sees only its own rows, enforced by the database for every query.
- **Money is stored separately** (`job_financials`, `job_variances`, `recharges`, `rate_cards`, `invoices`, `payments`, `funding_positions`). Roles without financial permission (Transport, drivers, customers, View Only by default) never receive those rows. The browser isn't trusted to hide them.
- **The activity feed** shows £ amounts only to roles allowed to see them.
- **Customers** can only see jobs explicitly shared with them, through `portal_deliveries`, which returns only the permitted fields. The invoice amount appears only when the share allows it.
- **Drivers** see only their own recent jobs, and only the vehicles and defects relevant to those jobs.
- **No signed-in user can write to a table directly.** All changes go through the functions in `migrations/…_workflows.sql`, which check the role, validate the input and write the activity log. Examples:
  - a recharge can't exceed the evidenced amount
  - D07 can't be proposed for TODAY-01
  - a driver can't depart with an open safety defect
  - a proposed driver is never written as the confirmed (Vigo) allocation
- **Suspended users** read nothing.
- **Integration secrets** sit in `integration_credentials`, which no user can read. Only server functions can.

## What's in here

| Path | What it is |
|---|---|
| `supabase/migrations/` | Schema, security (RLS), workflow functions, views, storage policies, realtime |
| `supabase/functions/` | `invite-user`, `notify-outbox` (email + one-time link), `xero` (OAuth + sync), `vigo-sync` (configurable mapping), `import-file` (CSV imports) |
| `supabase/seed/` | Demo company data, generated from the offline demo so the figures match exactly |
| `supabase/schedule.sql` | Scheduled jobs (pg_cron) |
| `scripts/` | `build-web.mjs`, `create-tenant.mjs`, `bootstrap-demo.mjs`, `gen-seed.mjs`, `reset-local-db.sh` |
| `tests/` | Database tests, unit tests, live end-to-end browser test |
| `../src/live.js` | Connects the shared screens to Supabase |

## Tests (all passing)

- **`tests/db.test.mjs`, 13 test groups.** Each signs in as a role and queries exactly as Supabase's API does. Covers:
  - the canonical figures (£16,490 / £10,475 / £11,110 / 36.48% / 32.63%, week to date £31,225 / £32,120, PODs 4/7/4/3, debtors £98,000 by bucket, headroom £17,000, cover 21/19/2)
  - each role's limits, including "Transport reads no money anywhere"
  - every workflow rule, the driver check-in order and safety-defect block, customer field restrictions, suspension, and isolation between two companies
- **`tests/pure.test.mjs`:** CSV parsing, UK money and dates, job and Xero mapping, email escaping.
- **`tests/e2e-live.mjs`, 36 checks.** A real browser runs the production build through Scenes A–F plus administration. It goes through a local stand-in for Supabase's API that applies the real RLS against the real database.

Run locally (needs PostgreSQL 16 on port 54329 and Playwright):

```bash
npm install
./scripts/reset-local-db.sh
npm run test:db && node --test tests/pure.test.mjs
SUPABASE_URL=https://x.supabase.co SUPABASE_ANON_KEY=x.eyJyb2xlIjoiYW5vbiJ9.x node scripts/build-web.mjs && node tests/e2e-live.mjs
```

## Not yet verified

These need real accounts and can't be exercised without them:

- **Hosted Supabase Auth emails:** invitations, one-time links, 24-hour expiry.
- **Resend delivery.**
- **The Xero OAuth round trip.** Confirm the current scope names with Xero, because Xero is moving to granular scopes; set `XERO_SCOPES` to match.
- **Vigo's API.** No documentation has been supplied yet. `vigo-sync` takes the endpoint and field names as configuration and has a dry-run "Test mapping" button. Until then, Vigo data comes in through the **Jobs CSV import**.
- **Realtime updates** on hosted Supabase. The app also refreshes every two minutes as a fallback.
- **The edge functions themselves** have only been compile-checked; their pure logic is unit-tested. They run for real once deployed.

## Go-live runbook (about half a day)

1. **Supabase** (London region, Pro plan): create a project.
   - Auth → URL configuration: set the Site URL to the app address.
   - Auth → Email: set the OTP expiry to 86,400 seconds, and plug in SMTP via Resend so invitations come from your domain.
   - Turn sign-ups off.
2. **Database:** run `supabase link` then `supabase db push`, which applies `supabase/migrations`.
3. **Edge functions:** run `supabase functions deploy`, then set the secrets:
   - `APP_URL`, `CRON_SECRET`, `STATE_SECRET` (random strings)
   - `RESEND_API_KEY`, `MAIL_FROM` (e.g. `Trans Haul <deliveries@transhaul.co.uk>`, with the domain verified in Resend)
   - `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` (`https://<ref>.supabase.co/functions/v1/xero?action=callback`), `XERO_SCOPES`
4. **Schedules:** enable `pg_cron` and `pg_net`, add the two Vault secrets, and run `supabase/schedule.sql`.
5. **Web app:** create a Vercel project from this repository.
   - Build command: `cd platform && npm ci && npm run build:web`
   - Output directory: `platform/web/dist`
   - Environment: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the public anon key; the build refuses the service-role key). Optionally `COMPANY_FOOTER`.
6. **Company:** run `scripts/create-tenant.mjs` for Trans Haul. Paul receives an invitation, sets a password and invites the team from Administration → Team & Access.
7. **Data:**
   - In Administration → Connections, import a Vigo jobs export, a Xero aged-debtors export and a Bibby statement. Each file is checked before anything is written.
   - Connect Xero.
   - Configure Vigo when its documentation arrives.
8. **Optional demo company on the same system:** run `scripts/bootstrap-demo.mjs`, then load `supabase/seed/demo_tenant.sql`. Its business date is fixed at 5 Nov 2026, so the demo story always works.

## What we need from Trans Haul

- **Vigo:** API documentation and a read-only key, or a scheduled CSV export of jobs (job, date, customer, destination, slot, vehicle, driver, status, delivered time, price, planned cost, actual cost, POD received, invoice number).
- **Xero:** the director authorises the connection (read-only).
- **Bibby:** monthly or weekly statement export. **Tachomaster:** infringement and licence export. **Paragon:** route plan export.
- **Email:** a sending domain, e.g. `deliveries@transhaul.co.uk`, plus DNS access to verify it with Resend.
- **Customer contacts:** who should receive delivery notifications, per customer.

## Running cost (approximate; check current prices before quoting)

| Item | Typical cost | Note |
|---|---|---|
| Supabase Pro | about $25 a month | Comfortably covers this scale: around 440 jobs and 800 POD photos (≈250 MB) a month |
| Vercel Pro | about $20 a month per member | Static hosting only |
| Resend | free up to around 3,000 emails a month, then about $20 a month | |

So roughly **£50–£60 a month** to run, before support time. Each additional haulier is a new company record on the same system, not a new deployment.
