---
title: "Data Processing Agreement"
subtitle: "Your AI Ltd and THEL (Midlands) Ltd · draft for discussion · 18 November 2026"
---

This agreement forms part of the Clearpath Customer Terms between the same parties. It sets out how Your AI handles personal data for Trans Haul, as required by Article 28 of the UK GDPR. It is a working draft, not legal advice: have it reviewed before signing.

# 1. Roles

1.1 **THEL (Midlands) Ltd** (**Trans Haul**) is the controller of the personal data in the Service. It decides why and how its data is used.

1.2 **Your AI Ltd** (**Your AI**) is the processor. It processes the data only to provide the Service, on Trans Haul's documented instructions.

1.3 The Customer Terms, this agreement and Trans Haul's use of the Service's settings (such as user access levels) are Trans Haul's instructions. If Your AI believes an instruction breaks data protection law, it will say so.

# 2. The processing

| | |
| --- | --- |
| **Purpose** | Providing the Clearpath operations platform: combining data from Trans Haul's systems into figures, pages, alerts, actions and report emails for Trans Haul's management |
| **Duration** | The term of the Customer Terms, plus up to 30 days for Trans Haul to download its data, then deletion (backups on their normal cycle, up to 35 days) |
| **People the data is about** | Trans Haul's employees, agency workers and drivers; its platform users; and contacts at its customers and suppliers |
| **Types of data** | Names, employee numbers, job titles, work areas and contracted hours. Holiday, absence and overtime, and working time records. Drivers' hours infringements. Accident and near-miss reports. Training, licence and compliance dates. Payroll totals (company and division level, not individual pay slips). Disciplinary and grievance case records. Job, vehicle and customer records. Users' names, work emails and sign-in records |
| **Sensitive data** | Absence and accident details can be **health data** (special category). Drivers' hours infringements may relate to **possible offences**. Trans Haul confirms it has a lawful basis and condition for these, such as its obligations as an employer and operator. The Service restricts them to the roles Trans Haul allows: by default only the Director and the consultant see disciplinary and grievance detail and payroll |
| **Where data is held** | Supabase, in its London (UK) region |

# 3. Your AI's obligations

Your AI will:

a. process the data only on Trans Haul's documented instructions, unless the law requires otherwise (in which case it will tell Trans Haul first, if the law allows);

b. make sure everyone who can access the data is bound to keep it confidential;

c. keep the security measures in Schedule 1 in place, and improve them as risks change;

d. use sub-processors only as set out in clause 4;

e. help Trans Haul answer requests from people exercising their data rights (for example, a request for a copy of their data), as far as the Service allows;

f. help Trans Haul with data protection impact assessments, security and breach notifications, considering the information available to Your AI;

g. at the end of the Service, let Trans Haul download its data, then delete it as set out in clause 2;

h. give Trans Haul the information it reasonably needs to show compliance, and allow one audit a year on 30 days' notice, during working hours, at Trans Haul's cost, under confidentiality; and

i. tell Trans Haul **without undue delay, and in any case within 24 hours**, after becoming aware of a personal data breach. Your AI will give the details Trans Haul needs to notify the Information Commissioner's Office within 72 hours where required.

# 4. Sub-processors

4.1 Trans Haul gives general authorisation for the sub-processors in Schedule 2.

4.2 Your AI will give 30 days' notice of any new or replacement sub-processor. Trans Haul may object on reasonable data protection grounds. If the objection can't be resolved, Trans Haul may end the Customer Terms without penalty.

4.3 Your AI binds each sub-processor to data protection terms at least as protective as these, and stays responsible for its sub-processors.

4.4 **Clearpath.** Under the Customer Terms, Trans Haul allows Clearpath Insights Ltd to have its own login to support Trans Haul, at the access level Trans Haul chooses. Trans Haul can change or remove that access at any time.

# 5. Transfers outside the UK

Data is stored in the UK. Some sub-processors are US companies whose support staff or systems may access it. Where that happens, the transfer is covered by one of the following:

- the UK Extension to the EU-US Data Privacy Framework, where the provider is certified; or
- the UK International Data Transfer Addendum to the EU standard contractual clauses, in the provider's terms.

# 6. AI and training

Your AI does not use Trans Haul's data to train any AI model, and does not allow its sub-processors to do so.

# 7. Liability

Liability under this agreement is subject to the limits in the Customer Terms, except where the law does not allow it to be limited.

# Schedule 1: Security measures

These describe the Service as built.

| Area | Measure |
| --- | --- |
| Sign-in | Two-factor sign-in (password plus authenticator code) for every user, enforced by the database itself. Invitation only, with no public sign-up. Minimum 12-character passwords; known breached passwords blocked |
| Access | Access by role (Director, Operations, Transport, Warehouse, consultant), enforced in the database. Each company's data is separated, and one customer can never see another's |
| Changes | Every change goes through checked functions and is recorded in an activity log |
| Sessions | Automatic sign-out after 30 minutes without activity; sessions end when the browser closes |
| Connections | Read-only access to Trans Haul's systems. Supplier keys are held in a secure vault, never in code, settings or email |
| Encryption | All traffic is encrypted in transit (HTTPS). Data is encrypted at rest by the hosting provider |
| Web security | Strict browser security headers: only Clearpath's own code runs, no framing, HTTPS only |
| Copies and checks | An untouched copy of every file received is kept with its fingerprint. Data is checked before it is used, and anything failing a check is not shown as trusted |
| Backups | Daily backups by the database provider |
| Testing | Automated tests prove the access rules, run before each change goes live |
| People | Access to the live systems is limited to named Your AI staff, using two-factor sign-in on every account |

# Schedule 2: Sub-processors

| Sub-processor | What for | Where |
| --- | --- | --- |
| Supabase, Inc. | Database, sign-in, file storage and server functions | Data held in London (UK) |
| [Vercel Inc. or Cloudflare, Inc.: to confirm] | Hosting the web pages (no customer data stored) | Global network |
| Resend, Inc. | Sending the daily and Monday report emails | United States (clause 5) |
| Microsoft, Xero and Trans Haul's other system suppliers | Not sub-processors: they are Trans Haul's own suppliers, read under Trans Haul's authority | As per Trans Haul's own contracts |

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# Signatures

**Signed for THEL (Midlands) Ltd (controller)**

Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_

Name: [ ] · Position: Director

**Signed for Your AI Ltd (processor)**

Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_

Name: Sam Sahota · Position: Director
