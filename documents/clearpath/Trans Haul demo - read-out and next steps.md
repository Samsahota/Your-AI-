---
title: "Trans Haul demo — read-out and next steps"
date: "7 November 2026 · Sam Sahota, Your AI Ltd"
---

The demo on Friday 6 November landed: Paul said the platform has "definitely legs" as an operator platform that pulls manual workarounds into one place. The deal now turns on two things: proving the data arrives automatically, and the scope Paul and Samantha send back next week.

# How the meeting went

Paul and Samantha bought the direction. They did not yet buy how the data gets in, and that is now the deciding question.

| Topic | What was said | What it tells us |
|---|---|---|
| Director dashboard | Paul: the measures are "exactly what I'm looking for" | The five questions are right; keep them as the front page |
| Driver app and customer tracking | Paul checked the driver app is part of the setup: "Yeah, okay, good" | Wanted, not a distraction; keep it in the offer |
| Overall | Paul: "definitely legs"; it brings the manual workarounds into one place and gives the team structure | Strong buying signal |
| Data input | Paul asked three times how the data gets in. Our answer in the room was "it would still be manual input" | The biggest objection, and our answer made it worse. Correct it in writing (follow-up email) |
| Product identity | Paul: "Is this an operating platform, or is it a TMS?" He does not want to build a TMS | Position it as an operator platform that sits on top of Vigo |
| Look and feel | Samantha: "looks very much like a Tableau dashboard" | Visuals alone won't set us apart. The value is the automation and the workflow |
| Who it is for | Samantha: the operations and transport manager views matter most; it must help them do their job | Lead the next round with those two views, not the director view |
| Market feedback | Paul told ~150 hauliers; a reporting dashboard alone is not enough | The resale product must cover compliance, plan vs actual P&L, and H&S and HR processes, not just charts |
| Automation ask | Paul: read Tachomaster's scheduled email reports (daily odometer, drivers' hours) and fill plan vs actual with no one clicking | Prove this one feed working and the objection goes away |
| Commercials | No trial price agreed. Samantha suggested passing software costs through open-book. Sam offered a large discount, half up front | Price after scope; separate build, platform fee and pass-through costs |
| Timing | Paul is at full stretch: peak season, a 12-week course, a two-day tribunal. Likely pause to January unless Sam can build on his own | Agree scope and price fast, then build without needing Paul's time |

The correction we owe them: the portal does not need anyone to retype data. It reads Vigo, Tachomaster and Xero directly, or reads the exports and scheduled email reports they already produce. Manual entry is only for things no system holds today, such as walkaround checks and actions.

# What it means for the product

Sell an operator platform: one place for compliance, plan vs actual costs, PODs, actions and policies, fed automatically from the systems a haulier already runs. It sits on top of the TMS and never replaces it.

This is wider than the dashboard-only product we discussed before the meeting. Paul's 150-haulier feedback and his own description of what he built in SharePoint both point to it. The line we hold is Paul's: no routing, invoicing, job booking or drivers' hours calculation. Those stay in Vigo, Xero and Tachomaster.

| Module | Proposed | Why |
|---|---|---|
| Director dashboard (the five questions) | Core | What Paul asked for; the front page for every haulier |
| Operations and transport manager views | Core | Samantha's priority: the daily working tool |
| Plan vs actual costs and contribution | Core | Paul's "worth its weight" use of Tachomaster data |
| PODs and unbilled work | Core | Direct cash impact; every haulier has it |
| Fleet and driver compliance (licences, infringements, MOTs, defects) | Core | Part of Paul's operator-platform list |
| Actions and follow-ups | Core | Turns exceptions into owned tasks |
| Policies and procedures (H&S, HR, SOPs) | Core | Part of Paul's operator-platform list; replaces the SharePoint hub |
| Automated data feeds (Vigo, Tachomaster emails, Xero, file imports) | Core | Without this nobody buys; set up per haulier |
| Driver app (walkarounds, check-ins, photo PODs) | Add-on | Some hauliers prefer paper or their TMS app (Samantha's point) |
| Customer tracking portal and delivery emails | Add-on | Customer-facing; only where the TMS doesn't already do it |
| Cash and invoice-finance view (debtors, Bibby) | Add-on | Director-only; needs a finance connection |
| Driver cover planning | Add-on | Edges towards TMS planning; offer where wanted |

This split is our proposal. Paul and Samantha set the final list in their scope session (workbook below).

# Risks to manage before pricing

The biggest risk is pricing a build before we know how each data source can be read. Settle that first.

| Risk | Effect | How we handle it |
|---|---|---|
| Vigo API access is only a verbal yes (via Dagmar); Tachomaster will build one only "if requests are specific" | Automation, the main selling point, could slip or cost more | Request API documentation now. Price a fallback that reads scheduled email reports and CSV exports, so go-live never waits on a vendor |
| Scope drifts towards a TMS | Open-ended build, margin erodes | A written "not in scope" list (routing, invoicing, job booking, drivers' hours calculation) and change control in the contract |
| Paul has no capacity until January | Decisions stall, build waits | One named decision-maker for scope sign-off, one onsite discovery day, then build without Paul's time |
| Two parties, one product: Trans Haul trial and Clearpath resale | Unclear who owns the platform and who earns on resale | Two agreements: a pilot agreement with THEL, a partner agreement with Clearpath. Your AI Ltd keeps the platform IP; each haulier owns its data |
| Running costs of £100–150 a month for software subscriptions | Cash out before income | Pass through at cost, open-book (Samantha's suggestion). 50% of the build fee up front |
| Driver and staff personal data (licences, tachograph, locations) | UK GDPR obligations | A data processing agreement in the contract; UK hosting; role-based access |
| "Looks like Tableau" | Seen as a reporting tool, priced like one | Next demo leads with a live automated feed and the ops and transport manager views |
| The construction build lands at the same time (end of December or early January) | Delivery capacity | Agree a delivery date after both scopes are known; stage the Trans Haul build |

# Next steps

The fastest route to a signed trial is to prove one automated feed while Paul and Samantha settle the scope, then price within a week of receiving it.

- [ ] **Sam** — send the follow-up email (below), with the scope workbook, by Monday 9 November
- [ ] **Paul** — follow up the NDA, by Friday 13 November
- [ ] **Paul** — forward two or three recent Tachomaster scheduled report emails (daily odometer, drivers' hours) so Sam can build the automated feed, by Friday 13 November
- [ ] **Paul / Dagmar** — introduce Sam to Vigo to request API documentation and a read-only key, by Friday 13 November
- [ ] **Samantha and Paul** — scope session: core vs add-ons, data sources, price point; send the plan to Sam by Friday 20 November
- [ ] **Sam** — working proof: Tachomaster email report read automatically into plan vs actual costs, shown on a short call, by Friday 20 November
- [ ] **Sam** — onsite discovery day with the operations and transport team, line by line through the views, by Friday 27 November
- [ ] **Sam** — proposal and pilot agreement with figures, five working days after the scope, by Friday 4 December
- [ ] **All** — agree commercials, sign, 50% invoice, build starts, by Friday 11 December
- [ ] **All** — first version review in January, by Friday 15 January 2027

If the scope arrives later, every date after it moves by the same amount. The proof does not depend on the scope and can go ahead now.

# Follow-up email (draft)

Send Monday. It corrects the data-input answer in writing and asks for the three things that let us move without taking Paul's time.

**To:** Paul Dyer; Samantha Hardy  
**Subject:** Trans Haul operator platform — follow-up and next steps

Hi Paul, Sami,

Thank you both for Friday, and congratulations again on the £1.5m deal, Paul.

One thing I want to answer properly, because I didn't do it justice on the call: the platform does not need anyone to retype data. It reads what your systems already hold — Vigo through its API, Tachomaster through an API or the scheduled email reports you already receive, and your accounts — and does the joining-up itself. Manual entry is only for things no system holds today, such as walkaround checks and follow-up actions. Your SharePoint hub would be replaced, not fed.

We're also aligned on what this is: an operator platform that sits on top of Vigo and brings the manual workarounds into one place. It is not a TMS, so routing, invoicing, job booking and drivers' hours stay where they are.

To keep things moving while you're both at full stretch, three small asks:

1. **Tachomaster reports** — could you forward two or three of the scheduled emails (daily odometer and drivers' hours)? I'll build the automated feed into plan vs actual costs and show it working on a 20-minute call.
2. **Vigo** — an introduction to the right contact (via Dagmar) so I can request API documentation and a read-only key.
3. **NDA** — whenever you're ready, Paul.

For your scope session, I've attached a short workbook: which modules are core and which are add-ons, and where each piece of data comes from. Fill in as much or as little as helps; I'll turn it into a proposal and contract within five working days of receiving it.

Once scope is agreed, I'd suggest one onsite day with the operations and transport team to go through the views line by line, then I'll build without needing your time and we review the first version in January.

Have a good weekend.

Sam

Sam Sahota  
Co-founder, Your AI Ltd

# Scope workbook for Paul and Samantha

Fill in the "Your call" column with Core, Add-on or Not needed, and the data table with whatever you know. Gaps are fine; they become questions for the onsite day.

**Modules**

| Module | Our suggestion | Your call | What must it show or do? |
|---|---|---|---|
| Director dashboard (five questions) | Core | | |
| Operations manager view | Core | | |
| Transport manager view | Core | | |
| Plan vs actual costs and contribution | Core | | |
| PODs and unbilled work | Core | | |
| Fleet and driver compliance | Core | | |
| Actions and follow-ups | Core | | |
| Policies and procedures (H&S, HR, SOPs) | Core | | |
| Driver app | Add-on | | |
| Customer tracking portal | Add-on | | |
| Cash and invoice finance | Add-on | | |
| Driver cover planning | Add-on | | |

**Data sources**

| Data | System today | How it could be read | Contact | Notes |
|---|---|---|---|---|
| Jobs, customers, allocations, POD status | Vigo | API (verbal yes via Dagmar) or scheduled export | Dagmar | |
| Driver hours, infringements, daily odometer | Tachomaster | Scheduled email reports now; API if requested specifically | Paul | |
| Invoices, debtors, payments | Accounts (Xero?) | Read-only connection or export | | |
| Invoice finance position | Bibby? | Statement export | | |
| Fuel | Fuel card supplier? | Supplier report or export | | |
| Vehicle location, mileage, waiting time | Telematics supplier? | Supplier API or report | | |
| Policies, procedures, H&S and HR documents | SharePoint | Read-only link to the existing library | | |
| Walkaround checks | Paper | Driver app (if chosen) | | |

**Questions to settle**

1. Who signs off scope on Trans Haul's side while Paul is stretched?
2. Which three things would the operations manager and the transport manager check first every morning?
3. Which manual spreadsheets or SharePoint pages should this replace on day one?
4. Price point you think other hauliers would pay per month, and for which modules?
5. How should resale through Clearpath work: who sells, who supports, how revenue is shared?
