---
title: "Trans Haul build pack: after the 17 November meeting"
date: "17 November 2026 · Sam Sahota, Your AI Ltd · confidential under the Clearpath and Your AI NDA"
---

# What today changed

Paul and Samantha want to see the platform working on Trans Haul's own systems before they put real money in. So the first version has one job: **run on Trans Haul's live data, correctly, from day one.** A demo with sample data won't move them now.

The product also changed shape. Paul's version covers the warehouse as well as transport (cost per case, picking rates, BRC), puts Health and Safety at the centre of the dashboard, and adds People, Compliance, Cost and Service around it. That is different enough from the November demo that **we rebuild the screens from scratch, but keep the foundations** already built and tested: the database, sign-in, roles and permissions, audit trail, user invitations, the Xero connection and file imports.

**Agreed in the room**

- Price for Trans Haul: £3,000 setup plus £300 a month, shared with Clearpath. Other hauliers: £5,000 setup and £500 a month (see Commercials)
- Core modules: Dashboard, Cost, Service, People, Health and Safety, Compliance, Links, records pages, comments, daily and weekly reports
- Add-ons for later: driver portal (only if it can be DVSA compliant) and customer portal
- Access levels for Director, Transport Manager, Operations Manager, Warehouse Manager, a consultant with full access, and Sam as master administrator across all companies
- Two-factor sign-in for everyone
- A central library of policies and procedures that every new company can use
- Your AI to get indemnity insurance; a light-touch agreement between Clearpath and Your AI; the NDA adjusted

**One useful discovery:** Tachomaster, Falcon Tracking and PreDrive are all made by the same company, Road Tech Computer Systems. One conversation with Road Tech covers three of the eight systems.

**Next three things to do**

1. Send the follow-up email, with the data request workbook, to Paul and Samantha's Clearpath addresses.
2. Get Trans Haul to authorise Your AI with each supplier (Vigo, Road Tech, Microsoft, Xero, BrightPay, Bibby) so access requests can start.
3. Start the foundations: companies, users, roles, two-factor sign-in and the admin console. None of that waits for anyone.

# How it all works, step by step

The whole journey, in order, with who does each step. Nothing moves to the next step until the one before it is confirmed.

| # | Step | What happens | Who |
| --- | --- | --- | --- |
| 1 | Paperwork | NDA amended and signed; light-touch agreement between Clearpath and Your AI signed; Trans Haul confirms the order | Sam, Paul, Samantha (and Pritesh) |
| 2 | First invoice | Your AI invoices Trans Haul £1,500 + VAT (half the setup); Clearpath invoices Your AI for its share once paid | Sam |
| 3 | Supplier authorisation | Trans Haul emails each supplier saying Your AI may read its data (wording is in the workbook) | Paul |
| 4 | Access arrives | Each supplier sends API details or sets up a scheduled report; Xero and Microsoft are approved by Trans Haul clicking "allow" | Suppliers, Trans Haul |
| 5 | Keys stored | Every key or login goes into the platform's locked vault through the admin console, never by email | Sam |
| 6 | Build | The platform is built in the repository: screens, access levels, two-factor sign-in, admin console, connections, reports | Claude builds; Sam reviews |
| 7 | Connect each system | For each system: pull a sample, map the fields, check totals against the supplier's own screen, schedule it | Claude builds; Sam runs it with Trans Haul |
| 8 | Side-by-side check | A week of our figures against Trans Haul's own, page by page; nothing goes live until they match | Sam with Paul, Monica, Daljit |
| 9 | Go live | Users invited in small groups; each sets up two-factor sign-in; second invoice (£1,500 + VAT) | Sam |
| 10 | Every day after | Overnight updates, then checks, then a health email to Sam at 6:30, then client reports at 7:00 | Automatic; Sam acts on alerts |
| 11 | Every month | Monthly invoice to Trans Haul (£300 + VAT); Clearpath invoices its share | Sam |
| 12 | New haulier | Clearpath sells (Paul demos Trans Haul's system); Sam sets the company up in the admin console and reuses connectors from the catalogue | Clearpath, Sam |

**What Claude can and can't do.** Claude writes and tests the platform code in the repository, drafts documents and emails, and explains each step. Claude can't send emails, sign anything, contact suppliers, open or pay for accounts (hosting, insurance, ICO), or connect to Trans Haul's live systems. Those are yours, and each one shows as "not done" in the tracker below until you confirm it.

# Status tracker

Everything starts as **Not done**. An item only changes when Sam confirms it has happened.

| Item | Owner | Status |
| --- | --- | --- |
| Follow-up email to Paul and Samantha | Sam | Draft ready (Gmail drafts); not sent |
| Data request workbook returned | Paul, Samantha | Not done |
| NDA changes sent to Clearpath | Sam | Not done |
| NDA signed with changes | All | Not done |
| Clearpath and Your AI agreement drafted | Sam (Claude can draft) | Not done |
| Clearpath and Your AI agreement signed | All | Not done |
| Invoice YAI-0001 issued | Sam | Draft ready; not issued |
| Invoice YAI-0001 paid | Trans Haul | Not done |
| Authorisation email to Vigo | Paul | Not done |
| Authorisation email to Road Tech (Tachomaster, Falcon, PreDrive) | Paul | Not done |
| Authorisation email to BrightPay | Paul | Not done |
| Authorisation email to Bibby | Paul | Not done |
| Microsoft 365 contact identified | Paul | Not done |
| Xero read-only approval | Trans Haul Xero admin | Not done |
| Microsoft (SharePoint) approval | Trans Haul IT | Not done |
| Lucas's logins for the Clearpath site | Paul | Not done |
| Policy library supplier and licence terms | Paul | Not done |
| Professional indemnity and cyber insurance | Sam | Not done |
| ICO registration for Your AI | Sam | Not done |
| Hosting accounts in Your AI's name (database, web hosting, email) | Sam | Not done |
| Portal web address agreed and pointed | Paul, Sam | Not done |
| Platform foundations built (code in the repository) | Claude | In progress |

# Everything we need from Trans Haul

The same list is in the workbook (Trans Haul data request.xlsx), with a tab per item. Priority 1 blocks the pilot; priority 2 is needed before go-live; priority 3 can follow.

**System access**

| System | What we need | From | Priority |
| --- | --- | --- | --- |
| Vigo (TMS) | Authorisation email to Vigo; Vigo contact; API documentation and a read-only key, or a scheduled daily export of jobs | Paul, then Vigo | 1 |
| Tachomaster | Authorisation email to Road Tech; API or data feed details, or the scheduled reports (infringements, drivers' hours, working time) sent to our inbox | Paul, then Road Tech | 1 |
| Falcon Tracking | Same Road Tech request: mileage, arrival times, idling; API or scheduled reports | Paul, then Road Tech | 1 |
| PreDrive | Same Road Tech request: defect reports and walkaround completion | Paul, then Road Tech | 2 |
| Xero | Someone with Xero admin rights to approve a read-only connection (one click, once) | Paul or the bookkeeper | 1 |
| SharePoint | Microsoft 365 admin to approve read-only access to named sites only; list of which files hold what | Trans Haul's IT contact | 1 |
| BrightPay | Who runs payroll; a monthly export of hours, overtime and absence (no bank details) | Payroll contact | 2 |
| Bibby | Who has Client Online access; a monthly statement export | Paul | 3 |
| Warehouse data | Where picking rates, volumes and hours come from (system or spreadsheets) | Daljit | 1 |
| Existing Clearpath portal | Login details from Lucas; who hosts it | Paul | 2 |
| Paul's morning report | A copy of the email and who sends it | Paul | 1 |

**Documents and spreadsheets**

| Item | Why we need it | Priority |
| --- | --- | --- |
| Staff list with name, email, role and login level | To create logins and access levels | 1 |
| Vehicle list (registration, type, MOT, inspection and tacho calibration dates) | Fleet and compliance pages | 1 |
| Driver list (licence check, CPC, tacho card expiry) | Compliance and infringements | 1 |
| Customer list | Service by customer, jobs | 2 |
| Rate card or cost model (cost per mile, hour, day, case) | Planned against actual cost, cost per case | 1 |
| Targets and RAG rules for each measure | What makes each area red, amber or green | 1 |
| Holiday, absence, overtime sheets | People page | 1 |
| Accident, personal accident and near miss logs | Health and Safety page | 1 |
| Disciplinary and grievance tracker (counts only on screen) | People page | 2 |
| Training matrix and records | Compliance page | 2 |
| O-licence details and undertakings | Compliance page | 2 |
| BRC and FORS certificates, audit dates and actions | Compliance page | 2 |
| Policy library provider and licence terms | Central library | 1 |
| Example of each existing report or KPI pack they use | So our figures match theirs | 1 |

**Decisions**

| Decision | Who decides |
| --- | --- |
| Exact definition of Service %, OTIF, work rate and picking rate | Paul and Daljit |
| RAG thresholds for each quadrant | Paul |
| Who sees money and who sees personal data | Paul |
| Who the Operations Manager is | Paul |
| Daily email time and recipients | Paul |
| Where the platform lives (web address) and who hosts the existing Clearpath site | Paul and Sam |

# How connecting a system works

**An API is a locked door into another company's system.** The supplier gives us a key (or Trans Haul clicks "allow" once), and our platform uses it to ask questions like "give me every job delivered yesterday". The answer comes back as data, not a web page. We only ever ask to read; we never change anything in their systems.

**The path every figure takes**

1. **Their system** (Vigo, Xero, Road Tech and so on) holds the data.
2. **Connector:** signs in with the key and asks for new data on a timer.
3. **Raw copy:** exactly what came in, kept for checking.
4. **Mapping:** their fields are turned into our standard records.
5. **Checks:** counts and totals must match the source system.
6. **Dashboard and reports:** only checked data is shown.

If a check fails, Sam is alerted, and the figure shows as "not updated", never a wrong number.

**There are four ways to get data out of a system.** We use the best one each supplier offers, and the first version never waits for the ideal one:

| Way | How it works | Example | Speed |
| --- | --- | --- | --- |
| API with a key | The supplier issues a key; we ask for data on a timer (every 15 minutes or nightly) | Vigo, Road Tech if they offer one | Near live |
| "Allow" button (OAuth) | Trans Haul signs in to the supplier and approves our app once; no password is ever shared with us | Xero, Microsoft SharePoint | Near live |
| Scheduled email report | The supplier's system already emails a report; it goes to an inbox only our platform reads, which picks out the figures | Tachomaster, Falcon reports, Paul's morning email | Daily |
| File export | Someone exports a spreadsheet, or the system drops one in a folder; the platform reads it | BrightPay, Bibby statements | Weekly or monthly |

We never "screen-scrape" (log in as a person and copy from web pages). It breaks easily, and usually breaks the supplier's terms.

**Words you'll hear, and what they mean**

| Word | Meaning |
| --- | --- |
| Endpoint | One specific question you can ask, such as "list jobs" or "list invoices" |
| API key or token | The password the system gives our software. Stored in a locked vault, never in emails or code |
| OAuth | The "sign in and click allow" method. Trans Haul approves; we get a token that can be withdrawn at any time |
| Read-only scope | Permission to look, not change |
| Sandbox | A test copy of the system with fake data, to build against safely |
| Rate limit | How many questions per minute the supplier allows |
| Webhook | The supplier tells us when something changes, instead of us asking |
| Field mapping | Matching their column names to ours, e.g. their "Del_Date" is our "delivery date" |

**The eight steps for every connection**

1. **Authorise.** Trans Haul emails the supplier: "Your AI Ltd may access our data on our behalf, read-only." Suppliers won't talk to us without this.
2. **Get the documentation.** Ask the supplier for their API guide (or report format), and test access if they have it.
3. **Get credentials.** A key, an "allow" approval, or a report sent to our inbox. Keys go straight into the secure vault.
4. **Pull a sample.** Fetch one day of data and look at it with Trans Haul: is it what they expect?
5. **Map it.** Match their fields to our standard records (job, vehicle, driver, person, cost, incident).
6. **Check it.** Compare our totals with the supplier's own screen for the same day: number of jobs, revenue, infringements. They must match exactly.
7. **Schedule and watch it.** Set how often it runs. If a run fails or a check doesn't match, Sam gets an alert and the dashboard says "not updated since…" instead of showing a wrong figure.
8. **Sign off.** Paul or the system owner confirms the figures for a week of real data before the page goes live.

You set each connection up once per company, in the admin console. The connector code is reused for every haulier on the same system, which is why the second customer on Vigo or Xero is much quicker than the first.

# System by system

Only Xero and Microsoft (SharePoint) have public, self-serve APIs. The others hand out API details to customers on request, or not at all, so for those we ask now and **plan a fallback (emailed report or file) that works from day one**. That way the pilot never waits on a supplier.

| System | Feeds | Public API? | Plan A | Fallback (day one) | Priority |
| --- | --- | --- | --- | --- | --- |
| Vigo (TMS) | Jobs, customers, revenue, on-time, PODs | Not public. Vigo takes orders by API and EDI; documentation comes from the supplier | Ask Vigo for read API documentation and a key | Scheduled daily export of jobs (CSV) emailed to our inbox | 1 |
| Tachomaster (Road Tech) | Infringements, drivers' hours, working time | Not public. Road Tech has built integrations for partners | Ask Road Tech for an API or data feed | Scheduled emailed reports, which Tachomaster already supports | 1 |
| Falcon Tracking (Road Tech, now branded DOT Tracking) | Mileage, arrival times, idling, location | Not public | Same Road Tech request | Scheduled daily reports, which Falcon supports | 1 |
| PreDrive (Road Tech) | Walkaround checks, defects, rectification | Not public | Same Road Tech request | Export or emailed report | 2 |
| Xero | Revenue, costs, P&L, debtors | Yes, public | Trans Haul clicks "allow" once; read-only | Monthly P&L export | 1 |
| SharePoint (Microsoft 365) | Holiday, absence, accidents, training, policies | Yes, public (Microsoft Graph) | IT admin approves access to named sites only | They upload the sheets to us | 1 |
| BrightPay | Hours, overtime, absence, payroll cost | No general API found; it links to Xero and pensions | Payroll cost already reaches Xero as a journal | Monthly CSV export | 2 |
| Bibby (invoice finance) | Funds available, debtors | No API found | Ask Bibby | Monthly statement export | 3 |

**Vigo.** Vigo is now part of Kerridge Commercial Systems (rebranded Klipboard), so the API conversation may go through them. Ask Trans Haul's Vigo account manager for: read-only API documentation, a test account, a key for Trans Haul, and any cost. While waiting, ask Vigo to schedule a daily jobs export (job number, customer, collection and delivery dates and times, status, POD received, price) emailed to the platform's inbox. That alone powers jobs, customers, revenue and on-time.

**Road Tech: one request for three systems.** Tachomaster, Falcon and PreDrive all come from Road Tech Computer Systems. Send one request covering all three: "Do you offer an API or data feed for Tachomaster, Falcon and PreDrive? If not, can scheduled reports be sent to an email address we provide?" Road Tech already runs integrations with other platforms (for example a scheduled tachograph file sync with Samsara), and both Tachomaster and Falcon can send scheduled emailed reports. **Paul's morning email is probably one of these.** If so, we read that same report automatically.

**Xero (the easiest, and partly built already).** The November build already has a Xero connection. How it works: Trans Haul's Xero admin signs in through our "Connect Xero" button and approves read-only access. Xero gives us a token that renews itself, and Trans Haul can cut it off at any time. Xero moved its developer API to paid tiers in March 2026, based on the number of connected companies and data volume. Check the current tier cost at developer.xero.com before pricing future clients.

**SharePoint (Microsoft 365).** Through Microsoft Graph. Trans Haul's Microsoft admin approves our app with a permission called "Sites.Selected", then grants it to only the specific sites holding HR and H&S files. We can't see their email or anything else. What matters most: **the spreadsheets must keep the same columns.** If someone renames a column, the check fails and you get an alert rather than wrong figures. Agree with Trans Haul which file holds what, and ideally lock those sheets' layouts.

**BrightPay.** No general API for pulling data out was found; its links go to accounting packages (including Xero) and pension providers. So: payroll cost arrives through Xero as BrightPay's payroll journal, and hours, overtime and absence come from a monthly CSV export. Payroll data is the most sensitive in the system, so only the Director and the consultant should see it.

**Bibby.** No API found. Bibby's Client Online portal holds the facility; ask Bibby whether statements can be emailed or exported. This feeds the cash view, which is lower priority.

**Not on the list, but needed: warehouse data.** Picking rates, cases, volumes and hours (for cost per case and work rate) have to come from somewhere: a warehouse system, Vigo, or spreadsheets. Ask Daljit first; it decides how much of the Service and Cost pages work at launch.

**How to ask each supplier (wording for Trans Haul to send)**

> To [supplier], from Trans Haul (THEL (Midlands) Ltd): We authorise Your AI Ltd to access Trans Haul's data in [system] on our behalf, read-only, to feed our operations reporting platform. Please provide Sam Sahota with your API or data export documentation and arrange read-only access or scheduled reports. Contact: Paul Dyer, Director.

# The product as agreed

**Left-hand menu (core)**

1. Dashboard
2. Cost
3. Service
4. People
5. Health and Safety
6. Compliance
7. Links
8. Records: Jobs, Customers, HR documents, Payroll, Fleet and vehicles, H&S documents

Plus a comments section, the daily and Monday reports, and (later) the driver and customer portals. To confirm with Paul: the "Service" list in the meeting notes (jobs, customers, HR, payroll, fleet, documents) has been read as these records pages.

**The dashboard**

- **Health and Safety is the bullseye**; Cost, Service, People and Compliance are the four quadrants around it.
- **Each part takes the worst colour of its measures.** One overdue MOT makes Compliance red. Paul sets the thresholds; the platform applies them.
- **Clicking any part opens its page.** On that page, the measures behind the colour are listed worst first, with what to do.
- **Four headline figures** sit beside the circle, each linking to its page: Service %, infringements, accidents, and revenue against plan.

**What each page shows, and where it comes from**

| Page | Measures | Source | To agree |
| --- | --- | --- | --- |
| Cost | P&L; revenue planned against actual; cost per case and per user; overall warehouse rate; transport cost per mile | Xero, Vigo, rate card, warehouse volumes, Falcon mileage | What "per user" means; warehouse rate definition |
| Service | On-time, in full (OTIF); overall work rate (hours against volume); picking rates; jobs completed | Vigo, Falcon arrival times, warehouse data, BrightPay hours | Which OTIF definition; picking rate units |
| People | Holiday %, absence %, overtime %, working time directive %, open disciplinary and grievance cases (counts only) | SharePoint sheets, BrightPay, Tachomaster (drivers' working time) | Who sees it |
| Health and Safety | Accidents, personal accidents, near misses, days since last accident, open actions, policies and processes | SharePoint logs, central library | What makes it red |
| Compliance | Training due and overdue; vehicle compliance (MOT, inspections, tacho calibration, open defects); O-licence obligations; BRC; FORS; driver licence and CPC checks | Fleet list, PreDrive, Tachomaster, training records, audit documents | Alert days before due dates |
| Links | Logistics UK (transport) and UKWA (warehousing), plus any others Paul wants | Fixed list | Full list |
| Records | Jobs, customers, HR documents, payroll, fleet and vehicles, H&S documents | As above | What each user may open |

**Comments.** Anyone can add a comment on a page or a figure ("absence high because of flu week"), mention a colleague, and see the history. Comments also appear in the daily email when they explain a red.

**Design rule for launch:** a measure only appears once its source is connected and checked. If warehouse data isn't ready, the Service page shows transport measures and says "warehouse figures: coming soon", rather than an empty or estimated number.

# Users and access levels

The defaults below are a proposal for Paul to confirm. The principle: everyone sees what they need to run their area; money and personal data are limited to the fewest people.

| Role | Person | Dashboard | Cost and revenue (£) | Service | People | Payroll | H&S | Compliance | Users and settings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Platform admin (all companies) | Sam Sahota, Your AI | All | All | All | All | All | All | All | All, every company |
| Director | Paul Dyer | Full | Full | Full | Full | Full | Full | Full | Own company |
| Consultant, full access | Paul Atkinson | Full | Full | Full | Full | Full | Full | Full | View only |
| Operations Manager | To confirm | Full | Operational costs, no company P&L | Full | Own team, no disciplinary detail | No | Full | Full | No |
| Transport Manager | Monica | Transport | No £ (to confirm) | Transport | Drivers: absence, working time | No | Full | Transport: vehicles, drivers, O-licence, FORS | No |
| Warehouse Manager | Daljit | Warehouse | Warehouse rate and cost per case only | Warehouse | Warehouse staff: absence, holiday | No | Full | Warehouse: BRC, training | No |
| Clearpath test Transport Manager | Samantha Hardy | As Transport Manager | As Transport Manager | As Transport Manager | See note | No | As Transport Manager | As Transport Manager | No |
| Driver (add-on, later) | Each driver | No | No | Own jobs | Own record | No | Report incidents | Own checks | No |
| Customer (add-on, later) | Customer contacts | No | No | Own deliveries | No | No | No | No | No |

**Samantha's test login.** She works for Clearpath, not Trans Haul, so a login on Trans Haul's live data means she sees Trans Haul staff's personal data. Two options: (a) her test login uses a demo company with sample data; or (b) Paul confirms in writing that she may see Trans Haul's data, and the data processing agreement names Clearpath. Ask Paul which.

**Sam's master access (admin console)**

- **Companies:** create a company, its name and logo, modules switched on, and its plan and price.
- **Users:** invite by email, set the role, reset two-factor, suspend leavers. Every change is logged.
- **Connections:** for each system, its status (connected, waiting for access, failing), last successful update, record counts, and the last check result. Add or replace a key, or send the Xero or Microsoft "allow" link to the client.
- **Inboxes:** each company gets its own report inbox address for suppliers' scheduled reports.
- **Thresholds:** the red, amber and green rules per measure, which the Director can also edit.
- **Library:** publish policy updates to every company at once.
- **Health:** one list of anything failing, across all companies, emailed to Sam each morning before the clients' reports go out.

**Rules that protect everyone**

- Two-factor sign-in for every user, with no exceptions for admins.
- Sam's support access to a client's data is logged, and the data processing agreement says he can see it to provide support.
- Leavers are suspended the same day; the Director can do it themselves.
- Nobody shares a login.

# Daily and weekly reports

**Daily report:** emailed every morning (time to agree, for example 7am) covering the previous day. Each person gets the version for their access level, so the Transport Manager's email has no money in it.

| Section | Content |
| --- | --- |
| Headline | The bullseye colours in one line, and what changed since yesterday |
| Health and Safety | Accidents, personal accidents and near misses reported yesterday; open actions |
| Service | Yesterday's OTIF, late deliveries by customer, work rate and picking rate |
| Cost | Revenue against plan, cost against plan, cost per case (Director and Operations only) |
| People | Absence today, overtime yesterday, working time warnings |
| Compliance | Infringements, new defects, anything due in the next 7 days |
| Comments | Notes added yesterday that explain a red or amber |
| Data status | Any source that didn't update, so nobody acts on stale figures |

**Weekly report:** every Monday, the same sections for the previous week, plus the trend against the four weeks before and the open actions list, with a one-page PDF Paul can forward.

**Paul's existing morning email.** Find out which system sends it (most likely Tachomaster or Falcon). If it's a supplier report, we read it as a data source. Don't switch his off until he's happy with ours.

# Central policy library

Paul pays an annual fee to a registered company for a full set of legal, HR and Health and Safety documents, which they keep updated as regulations change. Every company that joins the platform would get those documents centrally.

**Check the licence before building around it.** Bought document packs are usually licensed for use by the buyer's own business. Ask Paul for the supplier's name and the licence terms, then ask the supplier for one of:

1. **A multi-company or partner licence** (Clearpath pays, and every haulier on the platform may use the documents). Best result; could be charged as an add-on.
2. **Each haulier subscribes directly**, and the platform organises and tracks their copy.
3. **Clearpath writes its own templates**, using the bought set only as Trans Haul's own.

**How the library works in the platform:** one master library managed by Clearpath; version numbers, dates and change summaries; updates pushed to every company with a note to each Director; each company adds its own details and documents without editing the master; read-and-sign tracking on the Compliance page; review dates and owners.

# Hosting, sign-in and security

**Who hosts it?** Recommendation: **Your AI hosts the platform; it sits on a Clearpath web address.**

- The platform runs on the setup built and tested in November: a managed database in the UK or EU (London region) and a hosting service for the web pages, all in Your AI's business accounts, covered by the backend costs.
- Clearpath's existing HTML site stays as the public website, with a "Sign in" button pointing to something like portal.clearpathinsights.co.uk.
- Lucas's logins are needed to point that address at our hosting and to add the sign-in button.
- Clearpath owns the domain and brand; Your AI owns and runs the hosting, code and database.

**Two-factor sign-in.** Email and password, then a six-digit code from an authenticator app (Microsoft or Google Authenticator), for every role including admins. If someone loses their phone, the Director or Sam resets their two-factor from the admin console, and that is logged.

| Question | Answer |
| --- | --- |
| Where is the data? | UK/EU data centres, encrypted in storage and in transit |
| Who can see it? | Only the users and roles Trans Haul approves, enforced by the database itself |
| Can other companies see our data? | No. Each company's data is separated at database level |
| What if something goes wrong? | Daily backups; full audit trail of who changed what |
| Do you change our systems? | No. Every connection is read-only |
| Is our data used to train AI? | No. Any AI services used are on business terms that exclude training |
| Paperwork | A data processing agreement with Trans Haul; Your AI registers with the ICO |

**Driver portal and DVSA.** Trans Haul already uses PreDrive, which Road Tech describes as a DVSA-compliant vehicle check system, so **don't rebuild walkaround checks**: read PreDrive's results into Compliance. A later driver portal can cover documents, incident and near-miss reporting, holiday requests and job details. Building walkaround checks ourselves would have to follow DVSA's Guide to maintaining roadworthiness (driver, vehicle, date and time, items checked, defects and rectification, records kept at least 15 months and protected from change), and would be a separate, priced add-on.

**Customer portal:** a later add-on (delivery tracking and PODs), only where Vigo doesn't already give customers this.

# Commercials

Two price lists: a founding deal for Trans Haul, and a standard deal for every other haulier. All prices are plus VAT if Your AI is VAT registered.

## The two deals

| | Trans Haul (founding pilot) | Every other haulier (standard) |
| --- | --- | --- |
| Setup fee | £3,000 | £5,000 |
| Setup split (Your AI / Clearpath) | 50/50: £1,500 / £1,500 | 60/40: £3,000 / £2,000 |
| Monthly fee | £300 | £500 |
| How the monthly fee is split | £100 backend costs to Your AI first, then the remaining £200 split 50/50 | Straight 50/50. Your AI pays the backend costs out of its half |
| **Monthly to Your AI / Clearpath** | **£200 / £100** | **£250 / £250** |
| First year to Your AI | £3,900 (about £2,700 after running costs) | £6,000 (about £4,800 after running costs) |
| First year to Clearpath | £2,700 | £5,000 |
| Add-ons and extra connections | Priced separately (below) | Priced separately (below) |

**Why the standard setup leans to Your AI:** Sam sets up the connections (APIs) for each new business. The monthly fee is shared equally because Clearpath sells and owns the relationship, and Your AI runs the platform.

**Still to confirm in writing with Paul:**

- The Trans Haul setup split: "50% to Clearpath" is read here as £1,500 each.
- That Trans Haul's £3,000 covers all eight of its systems (Vigo, Tachomaster, Falcon, PreDrive, Xero, SharePoint, BrightPay, Bibby).
- The add-on and connection prices below. These are a proposal, not agreed yet.

## Add-ons and connections: the pricing structure (proposal)

This is where the growth is. Every extra system connected and every module switched on adds a monthly fee, so each haulier is worth more the longer they stay.

**1. Connections (getting data in from their systems)**

| What | Setup | Monthly | Split |
| --- | --- | --- | --- |
| Connections included in the £5,000 setup | Up to 4 from the catalogue (typically TMS, tachograph, accounts, documents) | Included | As the core |
| Extra catalogue connection (a system we already connect to) | £500 | £50 | Setup 100% Your AI; monthly 50/50 |
| New connection (a system we haven't connected before) | £1,500 | £50 | Setup 100% Your AI; monthly 50/50 |
| Report or file feed (emailed report or export, no API) | £350 | £25 | Setup 100% Your AI; monthly 50/50 |
| "Connect everything" bundle (every system they run, up to 10) | £2,500 | £200 | Setup 100% Your AI; monthly 50/50 |

Connection setup is Sam's build work, so it's Your AI's. The monthly fee is shared so Clearpath is motivated to sell more connections. Once a new connection is built, it joins the catalogue, and the next haulier on that system costs a fraction of the effort.

**2. Modules (extra features)**

| Module | Setup | Monthly | Split |
| --- | --- | --- | --- |
| Driver app (documents, incident and near-miss reporting, holiday requests, job details; reads PreDrive or similar for walkarounds) | £1,500 | £150 | Setup 60/40 Your AI; monthly 50/50 |
| Customer portal (tracking and PODs) | £1,500 | £150 | As above |
| Central policy library (subject to the document licence) | £500 | £100 | As above |
| Cash and invoice finance view | £750 | £75 | As above |
| Supplier invoice reading (fuel, subcontractors, repairs) | £1,500 | £100 | As above |
| Extra site, depot or group company | £1,000 | £150 | As above |

**3. Services (Sam's time, 100% Your AI)**

| Service | Price |
| --- | --- |
| Custom report, dashboard change or feature | Day rate: [£ ] |
| Extra training beyond go-live | [£ ] per half day |
| Technical meetings for Clearpath's sales | First call per prospect included; then [£ ] per hour |

**4. Price review:** every price rises once a year with inflation and supplier costs.

**Worked example: a standard haulier taking the core, 4 extra connections and the driver app**

| | Setup | Monthly | Year one |
| --- | --- | --- | --- |
| Core | £5,000 | £500 | £11,000 |
| 4 extra catalogue connections | £2,000 | £200 | £4,400 |
| Driver app | £1,500 | £150 | £3,300 |
| **Total** | **£8,500** | **£850** | **£18,700** |
| To Your AI | £5,900 | £425 | £11,000 |
| To Clearpath | £2,600 | £425 | £7,700 |

Compare the core alone: £6,000 to Your AI in year one. The add-ons almost double it, and Clearpath earns more too.

**For connections to make money, they have to work every time.** Each connection is built once, properly, with the checks described earlier, and kept in the catalogue so it's reused rather than rebuilt.

## Ongoing support and technical meetings

**Included in the monthly fee:** hosting, backups, monitoring, keeping connections running (including when a supplier changes something small), bug fixes, user changes, and email support.

**Not included (quoted, or charged at the day or hourly rate):** new features or reports, new connections, re-work after a supplier changes its system significantly, and extra training beyond go-live.

**Technical meetings for Clearpath's sales:** one technical call per prospect included; anything beyond that charged at an hourly rate, to the client or to Clearpath. Put the number in the agreement.

**Sales demos:** Paul demos Trans Haul's own live system when he sells the platform to other hauliers. It's his company's data, so that's his call. Your AI's part is a **demo view** that hides names on the People, payroll and disciplinary screens ("Driver 1", "Employee 4"), so staff personal data isn't shown to prospects. Sam joins only for the technical questions.

## Protections to put in the agreement

1. **Define what setup includes:** one company, the core modules, the listed connections and an agreed number of users. Anything else is an add-on or quoted.
2. **Minimum term:** 12 months from go-live, then rolling monthly with 3 months' notice.
3. **Annual price review** in line with inflation and supplier costs, such as Xero's API tiers.
4. **Backend costs:** for Trans Haul, if running costs go above £100 a month the excess comes off before the split; for standard clients, Your AI covers them from its half, so watch them.
5. **Your AI owns the code and connectors** and reuses them, which is what makes each new haulier cheaper to set up than the last.

## Who invoices whom (recommended)

- **Your AI invoices the haulier** for the full setup and monthly fee, because Your AI carries the running costs and delivers the service.
- **Clearpath invoices Your AI** for its share once the haulier has paid ("paid when paid"), with a monthly statement showing what was received.
- Setup is invoiced **50% on order, 50% on go-live**.

**First Trans Haul invoice (draft, in the folder as Invoice YAI-0001):** Operations platform setup for THEL (Midlands) Ltd, first instalment, 50% of £3,000: £1,500.00, VAT at 20% (if registered) £300.00, total £1,800.00, due 14 days from invoice date. Then £1,500 + VAT on go-live and £300 + VAT a month from go-live. Clearpath's matching invoice to Your AI: £750 + VAT (if registered), due 14 days after Trans Haul's payment arrives.

# Clearpath agreement, NDA and insurance

## Light-touch agreement between Clearpath and Your AI

Two or three pages, plain English. Have a solicitor glance over it before signing.

| Term | Proposal |
| --- | --- |
| Parties | Clearpath Insights Ltd and Your AI Ltd (plus Pritesh if he is to be a party; confirm his role) |
| What each does | Clearpath: concept, sales, customer relationships, the policy content, first-line customer contact, demos. Your AI: builds, hosts, connects, supports and maintains the platform |
| Ownership | Clearpath owns its brand, concept and policy content. Your AI owns the platform, code and connectors, and licenses them for the Clearpath service |
| Exclusivity | Your AI supplies the platform for UK hauliers only through Clearpath, while Clearpath meets an agreed minimum (for example X new companies a year) |
| Pricing and split | Standard: £5,000 setup split 60/40 to Your AI; £500 a month split 50/50 (£250 each), Your AI paying backend costs from its half. Trans Haul (founding): £3,000 setup split 50/50; £300 a month with £100 backend to Your AI and the rest 50/50. Add-ons and extra connections priced separately (connection setup 100% Your AI, module setup 60/40, all monthly fees 50/50); custom work 100% Your AI |
| Invoicing | Your AI invoices customers; Clearpath invoices its share when paid |
| Customer data | Each haulier owns its data. Your AI is the data processor; data processing agreement with each customer |
| Liability | Each party's total liability capped at the fees it received in the previous 12 months; no cap for fraud or deliberate breach |
| Insurance | Your AI holds professional indemnity and cyber cover |
| Term and exit | 12 months, then rolling. On exit: existing customers keep their service for at least 6 months; Clearpath's share continues on customers it brought; Your AI keeps its code; Clearpath keeps its content |
| Disputes | Talk first, then mediation, then the courts of England and Wales |

## NDA changes to send back

1. **Clause 6.1 (non-compete):** replace with a mirror of 6.2: Your AI won't use Clearpath's confidential information to build a competing platform, rather than an outright ban.
2. **Clause 5.5 (derivatives):** add that Your AI's software, code, designs, connectors and platform, including work done before 17 November 2026, remain Your AI's.
3. **Clause 2.1(f) (AI tools):** allow AI and hosting services under business terms that don't train on or share the data.
4. **Clause 9.2 (indemnity):** replace with: *"Each Party shall indemnify the other against direct losses, costs and reasonable legal fees arising from its breach of clauses 2, 5 or 6, up to a total of £25,000. This limit does not apply to fraud or deliberate disclosure. Neither Party is liable for indirect or consequential loss, or loss of profit."* Set the amount below the professional indemnity limit.
5. **Pritesh:** add him as agreed, either as a signatory for Your AI (if he's a director) or by name as one of Your AI's Representatives. Confirm which.
6. **Signature block:** Samantha's notice email should change to her Clearpath address.

## Insurance for Your AI

| Cover | Why | Typical starting limit |
| --- | --- | --- |
| Professional indemnity (technology errors and omissions) | A wrong figure, a missed alert or a failed connection that costs a client money | £1m |
| Cyber liability | A data breach: the platform holds payroll, HR and driver data | £1m |
| Public liability | Visits to Trans Haul's sites | £1m to £2m |
| Employers' liability | A legal requirement once Your AI employs anyone | £5m minimum by law |

Also register Your AI with the ICO as a data processor if it isn't already.

# Risks, and how we avoid a slip-up

| Risk | What it would look like | How we prevent it |
| --- | --- | --- |
| A wrong number on screen | Paul sees revenue or infringements that don't match his own system | Every figure checked against the source's own totals; a week of side-by-side checks before each page goes live; stale data labelled |
| A supplier is slow to give access | Vigo or Road Tech takes weeks | Ask all suppliers at once; emailed reports and exports as a day-one fallback; Xero and SharePoint first |
| Measures defined differently | "Service 94%" where Paul works it out as 91% | Agree each definition in writing first, using their existing KPI pack as the reference |
| Spreadsheets change shape | Someone renames a column in the absence sheet | Checks catch it and alert Sam; agree locked templates |
| Personal data exposed | A manager sees payroll or disciplinary details they shouldn't | Access agreed with Paul in writing, enforced by the database; two-factor sign-in; audit log; demo view for sales demos |
| Login problems at launch | Staff can't get in on day one | Invite in small groups; Sam on hand the first morning; a one-page sign-in guide |
| Scope creeps | Warehouse, driver portal and customer portal all expected in version one | The core list is the scope; anything else is quoted |
| Licence breach on the policy library | Documents shared with companies not covered | Check the licence first |
| Single point of failure | Sam is unavailable and a connection breaks | Monitoring emails, documented connections in the admin console, a runbook per connection |
| Passwords shared by email | Credentials leaked | Never by email: read-only users, "allow" buttons or a secure link; keys in the vault |
| Cost overrun | The build takes longer than the price covers | The protections in the commercials section; extras quoted |

**The single most important habit:** never show Paul a page until it has been compared with his own system for the same days and it matches.

# Build plan

The dates assume supplier access arrives within two weeks. If one is late, its pages launch with the fallback (reports or exports) and switch to the API later.

| Week | Dates | Build | Needs from Trans Haul |
| --- | --- | --- | --- |
| 1 | 17–21 Nov | Email, NDA changes and draft agreement. Foundations: companies, users, roles, two-factor sign-in, admin console | Supplier authorisation emails |
| 2 | 24–28 Nov | Xero connection on Trans Haul; SharePoint connection; report inbox; dashboard and bullseye with sample data; definitions and RAG rules agreed | Xero approval, Microsoft admin approval, staff list, definitions |
| 3 | 1–5 Dec | Road Tech reports or API; Vigo export; Health and Safety, People and Compliance pages on live data | Road Tech and Vigo access; accident, absence and training sheets |
| 4 | 8–12 Dec | Cost and Service pages; warehouse data; daily email; comments; Links | Rate card, warehouse data source |
| 5 | 15–19 Dec | Side-by-side checks against Trans Haul's own figures; fixes; first live screens shown to Paul | An hour with Paul, Monica and Daljit |
| — | Christmas | Break; connections keep running and checks keep watching | |
| 6 | 5–9 Jan | Go live with the Trans Haul team in small groups; Monday report starts | Users ready to sign in |
| 7–8 | 12–23 Jan | Pilot running; weekly check-ins; fixes | Feedback |
| End of Jan | | Review against the agreed success measures; decide add-ons and the next haulier | Paul and Samantha |

**Carried over from the November build:** database design, company separation, roles and permissions, audit trail, user invitations, the Xero connection, file imports and the email service.

**New:** the dashboard and pages, warehouse measures, the report inbox reader, the Road Tech and Vigo connections, the SharePoint connection, the policy library, the admin console's connections screen, two-factor sign-in and the Monday report.
