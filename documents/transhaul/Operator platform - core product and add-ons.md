---
title: "Operator platform: core product and add-ons"
date: "16 November 2026 · Sam Sahota, Your AI Ltd"
---

# Has the demo changed since 6 November?

No. The last change to the demo was on 5 November, the day before the meeting (the driver app's undo button, and the dashboard reading 1 to 5 top to bottom). Since the meeting we have only added paperwork around it: the read-out and draft agreement (7 November), and the discovery pack, options sheet and screenshots (16 November).

That matters for tomorrow, because the demo still shows the version Paul and Samantha reacted to. It does not yet answer their main points:

| What they said on 6 November | What the demo shows today |
| --- | --- |
| "How does the data get in?" (asked three times) | Sample data that looks typed in. No live feed shown working |
| It must be a system that does things, not just a dashboard to look at | Some workflows (actions, recharges, cover, PODs), but it opens on numbers, so it reads as reporting |
| "Looks like a Tableau dashboard" | Still leads with the director dashboard |
| Operations and transport views matter most | Both exist, but sit behind the director story |
| Read Tachomaster's emailed reports automatically | Not built |
| Compliance, H&S, HR and policies in one place | Fleet compliance only; no policies or HR |

So tomorrow is not about the demo. It is about agreeing what the core product must produce, so the full build starts from that and not from the demo.

# The vision

**One system where a haulier's operation runs itself as far as it safely can: data arrives on its own, the system works out what is wrong, gives each problem to a named person, and chases it until it is closed.** The dashboard is just the window onto that. The value is what happens behind it.

Three tests every feature must pass:

1. **Nobody types anything a system already holds.** The TMS, tachograph, accounts and telematics feed it. People only enter what no system holds today: a walkaround check, a note, a decision.
2. **Every number leads to an action.** A late POD, a cost overrun or an expiring MOT is a task with an owner and a due date, not a red tile.
3. **It never does the TMS's job.** It reads Vigo. It doesn't book jobs, plan routes, raise invoices or calculate drivers' hours.

That is the answer to "is this a portal or a system?". It is a system with a portal on top. It is also the answer to "is this a TMS?": no, it is the layer that sits on top of the TMS and the other systems, and joins them up.

# How it works as a system

This is the answer to Paul's question about complexity. The system has three layers, and only the middle one is ours to build every time. The left column changes per haulier (which systems they run); the right column is what they pay for.

**Data comes in once, the engine acts on it, people get tasks not tables.**

| Comes in | The engine (core) | Goes out |
| --- | --- | --- |
| Vigo (TMS): jobs, drivers, PODs | One record per job: plan, actual, POD, bill | 7am morning brief: email to each manager |
| Tachomaster: hours, infringements | Cost model: planned vs actual cost | Role home screens: director, ops, transport |
| Accounts (Xero): invoices, debtors | Rules you set: thresholds, due dates | Alerts and tasks: overruns, PODs, expiries |
| Telematics, fuel: location, fuel spend | Actions with owners: who, by when, chased | Reports and exports: weekly pack, audits |
| People and drivers: walkarounds, notes | Audit trail: who did what, when | Customer updates: tracking, delivery email |

- **Comes in:** each source is connected once, by API where the supplier has one, or by reading the scheduled email report or export they already get. This is the per-client connection work you do.
- **The engine:** joins everything onto one record per job and per vehicle and driver, compares it with the plan and the rules the haulier sets, and turns anything outside the rules into an action with an owner. This is the core product, and it is the same for every haulier.
- **Goes out:** what people actually receive. Most users should get what they need from the morning email and their task list without opening a dashboard at all.

Why this is buildable and not a TMS: the engine only reads and compares. It never writes back to Vigo, Xero or Tachomaster, so it can't break them, and it doesn't need to do their jobs.

# What the product produces

Define the product by what lands in front of people, not by screens. If Paul agrees this list, the build is scoped. Each line is something we can show working before the full build.

| # | Output | Who gets it | When | What it does |
| --- | --- | --- | --- | --- |
| 1 | Morning brief | Director, ops, transport (each their own version) | Email at 7am, every working day | Yesterday's jobs, cost against plan, missing PODs, today's gaps, anything due. Three to five lines each, with links |
| 2 | Task list | Everyone in the office | Live, all day | Every problem as a task: owner, due date, what to do. Overdue tasks escalate to the next person up |
| 3 | Job profit, plan vs actual | Director, ops | Next morning, per job | Planned cost from the rate card against actual cost from Tachomaster, fuel and telematics. Flags jobs over the threshold |
| 4 | Unbilled work | Ops, accounts | Daily | Delivered jobs with no POD, and PODs in but not invoiced. Chases the missing PODs |
| 5 | Recharge drafts | Ops, director to approve | When a job overruns | Waiting time or extra drops worked out against the customer's terms, ready to approve and add to the invoice in Xero |
| 6 | Compliance calendar and alerts | Transport manager | 30, 14 and 7 days before | MOTs, inspections, licence checks, CPC, tacho downloads, infringements. Overdue items block nothing but escalate |
| 7 | Defect log | Transport manager | When reported | Each defect from a walkaround, its status and who fixed it. Audit-ready for DVSA |
| 8 | Policies and sign-off | All staff and drivers | When a policy changes | The current version of each policy, and who has read and signed it |
| 9 | Weekly pack | Director | Monday morning | One page: revenue, margin, cost per mile, on-time, debtors, compliance. PDF to forward to the bank or board |
| 10 | Audit trail | Anyone with permission | Always | Who changed what and when, for every record |

Outputs 1 to 10 are the core. The add-ons below add more outputs; they don't change these.

# The core product

The core is what every haulier gets, whatever add-ons they choose. It is a working system for the office team, not a reporting screen for the director.

| Part | What it does | Data it needs |
| --- | --- | --- |
| Connections | Reads the TMS, tachograph system and accounts every night (or every hour), by API or by reading the emailed reports | Read-only access or the scheduled reports |
| Job record | One line per job joining plan, actual cost, POD and invoice status | TMS jobs, tachograph mileage and hours, fuel |
| Cost model and rate card | The haulier's own costs per mile, per hour and per day, so every job has a planned cost | Their rate card, set up once |
| Rules | The haulier's thresholds: cost overrun %, POD chase days, alert days before an expiry | Set up once, changed any time |
| Tasks and escalation | Turns every rule breach into a task with an owner and due date, and escalates when overdue | Who owns what (set up once) |
| Fleet and driver compliance | Vehicles, drivers, due dates, infringements, defects | TMS or a one-off spreadsheet import; tachograph system |
| Policies library | Current policies and procedures, with read-and-sign | Their existing documents |
| Three home screens | Director, operations and transport, each showing their own priorities first | Nothing extra |
| Morning brief and weekly pack | The emails and PDF in the outputs list | Nothing extra |
| Users and permissions | Invite people, set roles, hide money from roles that shouldn't see it | Staff list |

**Data entry in the core is limited to setup** (rate card, rules, owners) **and decisions** (approve a recharge, close a task, add a note). Everything else is read in.

**How complex is this to build?** Medium. The hard part is not the screens; it is the connections and getting the cost model right for each haulier. Most of the engine already exists in the production build we tested in November (database, permissions, workflows, audit trail). What is new is the email-report reader, the morning brief, escalation and the policies library.

# Add-ons

Each add-on plugs into the same engine and switches on per haulier. None of them is needed for the core to work, and each one is worth offering only if it saves a haulier something they pay for today.

| Add-on | What it adds | Who it suits | Skip if |
| --- | --- | --- | --- |
| Driver app | Walkaround checks with photos, defect reporting, arrival and departure check-ins, photo PODs. Feeds the defect log and unbilled work | Hauliers still on paper walkarounds or chasing PODs | The TMS app already does it well |
| Customer tracking | A tracking link per delivery, delivery emails with the POD attached | Hauliers whose customers ring to ask "where is it?" | The TMS already sends these |
| Cash and invoice finance | Debtors, finance headroom, 13-week cash view from the accounts and finance statements | Directors watching cash closely | The accountant already covers it |
| Supplier invoice reading | Reads fuel, subcontractor and repair invoices from an inbox, matches them to jobs and flags differences | Hauliers with lots of subcontracted work | Few supplier invoices |
| Driver cover planning | Shows which jobs have no driver or vehicle and who is free | Busy planning offices | Planning is done in the TMS; this is the closest add-on to TMS work, so keep it read-only |
| HR and training | Driver records, training due, inductions, holiday | Hauliers without an HR system | They already have one |
| Extra connections | Any further system with an API or a report | Anyone | |

The split between core and add-ons is a proposal for Paul to change. Two things to test: is policies and sign-off core or an add-on, and is the driver app core for Trans Haul (walkarounds are still on paper)?

# What stays out

Say these out loud early. Each one is a TMS or accounts job, and each one would make the build open-ended.

- Booking and quoting jobs
- Planning and routing (the cover add-on shows gaps; it doesn't plan)
- Raising sales invoices (we prepare recharges; Xero raises the invoice)
- Calculating drivers' hours (Tachomaster does it; we read the result)
- Payroll
- Writing anything back into Vigo, Xero or Tachomaster in the first version

# Before the full build

Don't build everything at once. Prove the hard parts first, in small steps Paul can see, each with a clear yes or no before the next.

| Stage | What we build | What Paul sees | Decision at the end |
| --- | --- | --- | --- |
| 0. Proof | One feed: Tachomaster's emailed reports read automatically into planned vs actual cost for real jobs | His own jobs costed with nobody typing anything | Is the cost picture right? Go ahead? |
| 1. Core | All core connections, job record, rules, tasks, compliance, three home screens, morning brief | The office team using it daily for two weeks alongside what they do now | Does it replace the spreadsheets and SharePoint? |
| 2. Add-ons | Those chosen, one at a time | Each one switched on and used | Keep it, change it, or drop it |
| 3. Resale version | Setup for a second haulier with different systems | The same core running for someone else | Ready for Clearpath to sell |

Stage 0 needs only two or three sample Tachomaster emails and the rate card, and doesn't need Paul's time.

# Questions for tomorrow

Twenty questions in five groups. The full set of 46 is in the discovery pack if there's time.

**What it must produce**

| # | Question | Notes |
| --- | --- | --- |
| 1 | If you got one email at 7am, what must it tell you? And the ops and transport managers? | |
| 2 | Which of the ten outputs above would you pay for on its own? Which would you not miss? | |
| 3 | What do you do today that this should stop you doing: which spreadsheets, SharePoint pages, phone calls? | |
| 4 | When something goes wrong (a late POD, a cost overrun, an expiring MOT), who should own it, and who should hear if it's not fixed? | |

**How it works with everything else**

| # | Question | Notes |
| --- | --- | --- |
| 5 | When you said "a system, not just a portal", what did you picture it doing on its own? | |
| 6 | Which systems does it have to read from on day one, and which can wait? | |
| 7 | Is it enough for it to read only, or do you expect it to write back (for example, recharges into Xero)? | |
| 8 | Where should people work: in this system, or still in Vigo with this one telling them what to do? | |
| 9 | Which data, if wrong, would make you stop trusting it? | |

**Scope and complexity**

| # | Question | Notes |
| --- | --- | --- |
| 10 | Does the core list match what you'd expect every haulier to need? What's missing, what should move to an add-on? | |
| 11 | Policies, H&S and HR: core for everyone, or an add-on? | |
| 12 | Driver app: core for Trans Haul, given walkarounds are on paper? | |
| 13 | Where's the line with Vigo? Is there anything on the "stays out" list you expected us to do? | |

**Data and access**

| # | Question | Notes |
| --- | --- | --- |
| 14 | Can we have two or three Tachomaster report emails and your rate card this week, for the proof? | |
| 15 | Has the Vigo API introduction (via Dagmar) happened? Who signs the letter of authority? | |
| 16 | How do you work out a job's actual cost today, and which parts of it do you trust? | |

**Commercials and timing**

| # | Question | Notes |
| --- | --- | --- |
| 17 | Are you happy with a staged build (proof, core, add-ons) with a go or no-go after each? | |
| 18 | Setup, monthly fee and a charge per connection: does that shape work for you and for Clearpath's hauliers? | |
| 19 | Who on your side signs off each stage while you're stretched? | |
| 20 | What would make the first version a success by the end of January? | |

# Leave the meeting with

- [ ] Agreement that it is a system with a dashboard on top, not a TMS and not just a portal
- [ ] The outputs list, with any changes (this becomes the scope)
- [ ] Core and add-on split agreed, including policies and the driver app
- [ ] Read-only for version one, or what must write back
- [ ] Tachomaster sample emails and the rate card promised, with a date
- [ ] Vigo API contact and letter of authority, with a date
- [ ] Go-ahead for stage 0 (the proof), and who signs it off
- [ ] Pricing shape agreed in principle: setup, monthly, per connection

# Built for many hauliers, not just Trans Haul

Every haulier runs different systems and works differently. The core stays the same code for all of them; the differences live in setup, never in the code. One rule protects the product: **if only one haulier needs something, it is a setting or a paid extra, never a change to the core.**

| What differs between hauliers | How the core handles it |
| --- | --- |
| Which systems they run (Vigo or another TMS; Tachomaster or another tachograph service; Xero, Sage or QuickBooks) | A connector per system turns its data into the same standard records: job, vehicle, driver, cost, event. The core never knows which system it came from |
| How they cost a job | Their rate card: per mile, per hour, per day, per drop or per pallet, plus overheads |
| Their thresholds and process | Their rules: overrun %, POD chase days, alert days, who approves what |
| Who owns what | Roles and owners, set per haulier |
| What they call things | Labels: "job" or "load", "depot" or "site" |
| What they check for compliance | Checklist templates they can edit |
| What they've bought | Modules switched on or off |

**What the core can see depends on what a haulier can supply.** Each output needs certain data; if a haulier can't supply it, that output switches off and the rest still works.

| Output | Needs | Without it |
| --- | --- | --- |
| Job list, POD and unbilled work | Jobs from the TMS (reference, customer, date, status, price) | Nothing works; this is the minimum |
| Planned cost per job | Jobs + their rate card | No margin figures |
| Actual cost, plan vs actual | Mileage and hours (tachograph or telematics), fuel | Planned cost only |
| Compliance alerts | Vehicles, drivers, due dates (TMS or a one-off import) | Compliance section empty |
| Debtors and invoice status | Accounts system | Unbilled work stops at "POD in" |

The minimum to sign a haulier up is jobs from their TMS. Everything else adds outputs.

# Pricing strategy

Price in four parts so every haulier pays for what they use, and new features and connectors always have a price. All figures are starting ranges to test, not quotes.

| Part | How it's charged | Starting range |
| --- | --- | --- |
| Core subscription | Monthly, by fleet size | Up to 10 vehicles £300–400 · 11–30 £450–750 · 31–75 £800–1,200 · over 75 quoted |
| Add-on modules | Monthly each, plus a setup fee | £100–250 a month · £750–2,500 setup |
| Connections | One-off per system, plus monthly upkeep | See below |
| Setup and training | One-off, by size | £1,500–3,000 |
| Custom work for one haulier | Your day rate, quoted separately | Never folded into the subscription |

**Connections are where the per-haulier differences cost money, so price them in two tiers:**

- **Catalogue connection** (a system you've already connected for another haulier): £500 setup, £50 a month. Cheap because it's reused.
- **New connection** (a system you've not connected before): £1,500–3,000 setup, £75 a month. Offer a discount if the haulier lets you reuse it for others. Once built, it joins the catalogue.
- **Report or file feed** (emailed reports, exports): £500–1,000 setup, £50 a month.

This makes every new haulier cheaper to onboard than the last, and the catalogue becomes what Clearpath sells: "we already connect to Vigo, Tachomaster and Xero". Clearpath's share should come from the subscription, not setup, so they are paid for hauliers that stay.

For Trans Haul as founding customer: 50% off setup and connections, monthly fee fixed for 12 months, and the right for you to reuse every connector built for them.

# What we can build now

Most of the core doesn't depend on tomorrow's answers. Start on the parts that are the same for every haulier:

| Build now | Waits for |
| --- | --- |
| Standard records (job, vehicle, driver, cost, event) and the per-haulier settings | Nothing |
| Connector framework: API connector, email-report inbox reader, file upload with field mapping | Nothing |
| Rules, tasks and escalation | Nothing |
| Morning brief email and weekly pack | Nothing |
| Module switches and setup screens | Nothing |
| Tachomaster report reader | Two or three sample emails |
| Vigo connector | API documentation and a read-only key |
| Trans Haul's cost model | Their rate card |

Much of the first column already exists in the production build tested in November: the database, permissions, workflows, audit trail, file import and a configurable Vigo mapping. The head start is mainly turning it into a multi-haulier setup and adding the inbox reader, rules and morning brief.
