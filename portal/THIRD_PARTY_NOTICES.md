# Third-party software and licences

Clearpath is written by Your AI Ltd. It uses the following third-party components. All permit commercial use. Keep this list current when a component is added.

| Component | Used for | Where | Licence |
| --- | --- | --- | --- |
| Inter (font) | Body text | Loaded from Google Fonts | SIL Open Font License 1.1 |
| Space Grotesk (font) | Headings | Loaded from Google Fonts | SIL Open Font License 1.1 |
| @supabase/supabase-js | Invitation function (server side) | supabase/functions/invite-user | MIT |
| pg (node-postgres) | Tests only, not shipped | tests/ | MIT |
| Playwright | Browser tests only, not shipped | tests/ | Apache License 2.0 |

The browser app has no third-party JavaScript: everything in `web/app` and `connectors/` is Your AI's own code.

## Services (accepted under each provider's business terms, in Your AI Ltd's name)

| Service | Used for | Terms to accept | Data processing agreement |
| --- | --- | --- | --- |
| Supabase | Database, sign-in, storage, server functions | Supabase Terms of Service | Supabase DPA (sign in the dashboard) |
| Vercel or Cloudflare Pages | Hosting the screens | A plan that allows commercial use | Provider DPA |
| Resend | Emails and the report inbox | Resend Terms | Resend DPA |
| Xero | Reading accounts (read-only) | Xero Developer Platform Terms | Covered by the developer terms |
| Microsoft | Reading SharePoint (read-only) | Microsoft APIs Terms of Use | Covered by the customer's Microsoft 365 agreement |
