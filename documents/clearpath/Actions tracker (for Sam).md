---
title: "Clearpath: actions tracker"
subtitle: "Kept up to date by Claude · last updated 18 November 2026, evening"
---

# For you (Sam)

| # | Action | Status |
| --- | --- | --- |
| 1 | Final read of the email, then send to Paul and Samantha (now includes website and domain access) | Tonight or tomorrow morning |
| 2 | Supabase: Enforce SSL (Database > Settings > SSL Configuration) | To do: see the steps in chat |
| 3 | Supabase: confirm the authenticator app (TOTP) shows Enabled (Authentication > Multi-Factor) | To check: on by default |
| 4 | Supabase: "Prevent use of leaked passwords" (Authentication > Sign In / Providers > Email) | To do |
| 5 | Your own Supabase login: add an authenticator app (Account > Security) | Recommended |
| 6 | ICO registration number: send it to me when it arrives, and I'll add it to the privacy notice and data agreements | Waiting: due tomorrow |
| 7 | Choose the web host: Cloudflare Pages (free, commercial use allowed; recommended) or Vercel Pro | To decide |
| 8 | Create a Resend account for the sending address (free tier is enough to start) | Once Clearpath's domain access arrives |
| 9 | Check Companies House lists you (and Pritesh, if he signs as a director) as officers of YourAI Ltd | Before signing |
| 10 | Professional indemnity and cyber insurance | Before go-live |
| 11 | Your admin login email | After the follow-up with Paul and Samantha |
| — | Done: sign-up off, 12-character minimum password, ICO application, YourAI company details | Done |

# Waiting on Clearpath and Trans Haul (all in the email)

- NDA agreed and signed
- Answer on invoicing: option A or B
- Clearpath's company number and registered office
- Access to the account that hosts clearpathinsights.co.uk (website and domain)
- Vigo API access; one Road Tech request (Tachomaster, Falcon, PreDrive); Microsoft 365 and Xero approvals
- SharePoint folder names; the warehouse figures source
- The logins list, targets, the morning report, logo and colours

# Built (not live until the steps above)

| Part | Status |
| --- | --- |
| Portal, security, actions, SharePoint pick-up | Built and tested |
| Daily and Monday report emails | Built and tested; database part live; sends nothing until the address is set up and Trans Haul is switched on |
| Nightly recalculation | Built and tested; database part live; scheduled at go-live |
| Hosting build (security headers, live settings) | Built and tested; waiting on the host choice and domain access |

# Still to build

- Report inbox (reads supplier reports that arrive by email)
- Vigo, Road Tech and Xero connectors (need access and sample data)
- Fleet list import
- Later: cash view, driver app, customer portal
