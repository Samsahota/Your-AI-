---
title: "Clearpath: licences, security and running costs"
date: "18 November 2026 · Sam Sahota, Your AI Ltd · confidential"
---

# Summary

- **Running costs:** Clearpath can run on accounts Your AI already pays for. The extra cost is about **£8 a month**: one more small database in the existing Supabase Pro organisation. That holds if Optivian's Vercel team is on the Pro plan; if it isn't, see section 1.
- **Licences:** Your AI needs business terms and data processing agreements with each provider, an ICO registration, insurance, and three agreements of its own (with Clearpath, with each haulier, and a data processing agreement). The full list is in section 2.
- **Security:** no system can honestly be called unhackable, and no one should promise that to Paul. What Clearpath can be is very hard to break into, quick to detect problems, and limited in what a single mistake could expose. Section 3 shows what is already built, what is set at go-live, and what stays ongoing.

# 1. Keeping costs down: use what you already pay for

Checked on 17 November 2026 in your accounts:

| Account | What's there | Plan |
| --- | --- | --- |
| Supabase organisation "Your AI Ltd" | gateway-staging and gateway-production (London region) | Pro |
| Vercel team "samsahota's projects" | optivian-portal, optivian-portal-staging, yourai-portal, pink-tax (two projects) | Not visible from here: check in Vercel under Settings > Billing |

**Supabase.**
- **The Pro fee doesn't repeat.** It is charged per organisation, not per system, so Clearpath doesn't need a second $25 subscription.
- **Each project still pays for its own computing.** A small database is about $10 a month. The $10 monthly credit is already used by the gateway projects.
- **Clearpath production: about $10 a month (about £8).**
- **No paid staging copy.** Clearpath's full test setup runs locally (35 automated tests), so there's no need for one. Add one later only if it's needed.
- **Keep Clearpath in its own project, not inside Optivian's database.** Separate projects mean separate keys, backups and access. A mistake or breach in one client's system can't reach the other. This also keeps Your AI's promises under the NDA and data protection rules.

**Web hosting.**
- **If the Vercel team is on Pro** (about $20 per person a month): add Clearpath as another project at no extra cost.
- **If it's on the free Hobby plan:** that plan is for personal, non-commercial use only. That would also be a licence problem for Optivian today. Either move the team to Pro, or host Clearpath on Cloudflare Pages, whose free plan reportedly allows business use.

**Email (Resend).**
- **If Optivian already has a Resend account,** add Clearpath's sending domain to it.
- **The free plan covers both** until they send more than 3,000 emails a month or 100 a day between them. After that it's $20 a month.

**The property app** sits on a separate login. That's fine for now. Over time, moving every system's accounts under Your AI Ltd means one place for billing, two-factor and access reviews, and nothing is lost if a personal login is compromised.

| Running cost for Clearpath | Monthly |
| --- | --- |
| Supabase: extra small project in the existing Pro organisation | about £8 |
| Web hosting: existing Vercel Pro team, or Cloudflare Pages free | £0 |
| Email: existing or free Resend plan | £0 |
| Xero connection: free for up to 5 connected companies | £0 |
| **Total** | **about £8** |

# 2. Licences and agreements Your AI needs

| What | Why | Cost | Status |
| --- | --- | --- | --- |
| Provider accounts in Your AI Ltd's name (Supabase, hosting, Resend) on plans that allow commercial use | Personal or free plans can breach the provider's terms and leave the business exposed | As section 1 | Supabase done; hosting plan to check |
| Data processing agreements with Supabase, the hosting provider and Resend | UK GDPR requires one with every company that handles personal data for you (your "sub-processors") | £0, accepted in each dashboard | Not done |
| UK transfer terms (the UK addendum or IDTA) for any US provider | Resend and Vercel are US companies; their DPAs normally include these | £0 | Check each DPA |
| ICO registration (data protection fee) | Required for a business that processes personal data | £52 a year (£47 by direct debit) | Not done |
| Professional indemnity and cyber insurance | Claims from a wrong figure or a data breach | Quotation | Not done |
| Cyber Essentials certification | UK government-backed security standard; clients and insurers increasingly ask for it | About £320 + VAT for a micro business (check for a government-funded discount) | Recommended before the second client |
| Xero Developer Platform terms | Reading Trans Haul's accounts | Free for up to 5 companies; AUD 35 a month up to 50 | At Xero connection |
| Microsoft app registration | Reading SharePoint; Trans Haul's admin approves it | £0 | At SharePoint connection |
| Agreement between Clearpath and Your AI | Ownership (Your AI owns the code), revenue split, liability cap, use of the Clearpath name | Solicitor review | Drafting |
| Customer terms for each haulier (subscription terms, acceptable use) | What each haulier agrees to; limits Your AI's liability | Solicitor review | Not done |
| Data processing agreement with each haulier | The haulier controls its data; Your AI processes it; lists the sub-processors | Solicitor review | Not done |
| Privacy notice for Clearpath users | Tells staff and drivers what's held and why | £0 (template plus review) | Not done |
| Third-party software licences | Fonts and code libraries must allow commercial use | £0 | Done: all permit it (THIRD_PARTY_NOTICES.md in the code) |
| The "Clearpath" name | It belongs to Clearpath Insights Ltd | — | Clearpath should check the name is clear to use and register it; the agreement should license Your AI to use it on the platform |

# 3. Security

## What's already built and tested

| Protection | What it stops |
| --- | --- |
| Two-factor sign-in required by the database itself | A stolen password alone gets nothing: without the authenticator code, every table reads as empty |
| Invitation only, no public sign-up | Strangers creating accounts |
| Each company's data separated in the database | One haulier seeing another's data, even if a screen has a bug |
| Access levels enforced in the database (money, payroll, disciplinary detail) | A manager seeing figures they shouldn't, whatever they type into the browser |
| Every change goes through a checked function and is logged | Unauthorised changes, and changes nobody can trace |
| Every connection is read-only | Clearpath ever altering Vigo, Xero or any other system |
| Keys never stored in the code or settings (refused if tried) | A leaked file exposing supplier keys |
| The powerful service key only on the server | Someone in the browser gaining admin powers |
| Strict security headers: only Clearpath's own scripts run, no framing, HTTPS only | Script injection and clickjacking attacks |
| Automatic sign-out after 30 minutes idle; sessions end when the browser closes | An unattended office PC staying signed in |
| 35 automated tests proving the rules | A change quietly breaking access, before it reaches anyone |

## Set at go-live (Supabase dashboard and settings)

- Public sign-up off, minimum 12-character passwords, refresh-token rotation, and rate limits on sign-in attempts. These are already written into the project's settings file.
- Leaked password protection on: it blocks passwords known from other breaches.
- SSL enforced on database connections, with direct database access restricted to Your AI's own IP addresses.
- Sending email through Resend from a verified domain.
- Running Supabase's security checker and clearing every warning before go-live.

## The biggest real risk: the accounts behind it

Most breaches of small companies come through the owner's own accounts, not the software. Protect every account that controls Clearpath:

- **Turn on two-factor with an authenticator app** for Supabase, Vercel or Cloudflare, Resend, GitHub, Google, Microsoft and the domain registrar.
- **Use a password manager:** a unique password for every account, and no shared logins.
- **Keep the recovery codes offline,** in a safe place.
- **Limit who has access:** only Sam, plus Pritesh if agreed, has admin access to the live systems. Review access every quarter.

## Ongoing

| When | What |
| --- | --- |
| Monthly | Run the Supabase security checker; update dependencies; review the admin health list |
| Quarterly | Review who has access to every account; restore a backup to prove it works |
| Before the second haulier | Independent penetration test by a CREST-accredited tester (quotation); Cyber Essentials |
| If something goes wrong | Follow a written incident plan; report a personal data breach to the ICO within 72 hours where required, and tell the haulier |

## Found today on the Optivian projects (for information; nothing has been changed)

Supabase's own security checker flagged these on gateway-staging and gateway-production:

1. **Leaked password protection is off** on both. Turn it on: Authentication > Providers > Email.
2. **One function, `app.application_decided_on`, has no fixed search path.** It's a small fix to the function definition.
3. **Several tables have row security on but no rules** (for example `sessions` and `password_resets`). That blocks all access from the browser, which is usually intended for tables only the server uses. Check that it is.
