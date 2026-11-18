# Go-live: hosting, report emails and schedules

Everything below is built and tested. Each step waits on something outside the code, noted in brackets.

## 1. Web hosting (waiting on: choice of host)

The portal is a set of plain files with strict security headers. `npm run build:site` writes them to `dist/`, already pointed at the live project.

- **Recommended: Cloudflare Pages.** The free plan allows commercial use, and `dist/_headers` is Cloudflare's format.
- **Alternative: Vercel Pro** (about $20 a month). The current Vercel account looks like a personal (Hobby) team, and Hobby is for non-commercial use only. `dist/vercel.json` carries the same headers.

Steps once the host is chosen:

1. Create the project and upload `dist/`. On Cloudflare that's Workers & Pages, then Create, then Pages, then Upload assets. On Vercel, run `vercel deploy dist --prod`.
2. Add the custom domain `portal.clearpathinsights.co.uk`. The host shows one CNAME record to add.
3. Check that the page opens over https and sends the security headers (`npm run test:site` checks the build locally).

## 2. Domain records (waiting on: access to Clearpath's domain account)

Add these where clearpathinsights.co.uk is managed. The existing website and email are not touched.

| Record | For |
| --- | --- |
| CNAME `portal` → the address the host gives | The portal's web address |
| The records Resend lists for `clearpathinsights.co.uk` (SPF and DKIM; a return-path record) | Report and invitation emails sent from a Clearpath address |

## 3. Supabase settings (dashboard)

- Authentication > URL Configuration: Site URL `https://portal.clearpathinsights.co.uk`; add the same to Redirect URLs.
- Authentication > Emails > SMTP: Resend (smtp.resend.com, port 465, user `resend`, password = a Resend API key), sender `Clearpath <no-reply@clearpathinsights.co.uk>`. Invitation and password-reset emails then come from Clearpath, not Supabase's test sender.

## 4. Server functions and their secrets

Set these as Edge Function secrets (Supabase dashboard > Edge Functions > Secrets), never in code or email:

| Secret | Value |
| --- | --- |
| `APP_URL` | `https://portal.clearpathinsights.co.uk` |
| `RESEND_API_KEY` | From Resend (sending access only) |
| `MAIL_FROM` | `Clearpath <reports@clearpathinsights.co.uk>` |
| `CRON_SECRET` | A long random value (also stored in the vault, step 5) |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Once Trans Haul's Microsoft admin approves (SharePoint pick-up) |

Deploy from the `portal` folder:

```bash
supabase functions deploy report-emails --project-ref vpsqrwjqrunpxcoxsixl --no-verify-jwt
```

```bash
supabase functions deploy sharepoint-folder --project-ref vpsqrwjqrunpxcoxsixl --no-verify-jwt
```

`invite-user` is already deployed. It starts working once `APP_URL` is set.

## 5. Schedules

In the SQL editor, store the two vault values named at the top of `supabase/schedule.sql`, then run the file. It sets up:

- the nightly recalculation, at 02:30 UTC;
- report emails, checked every 15 minutes. Each company's send time defaults to 07:00 UK time, and the weekly email goes on Mondays;
- the SharePoint folder pick-up, hourly.

## 6. Switching a company on

Report emails go only to companies whose status is **active** and that have figures. Trans Haul stays at **setup** until its figures have been checked against its own reports. Then set it to active in the admin console.
