---
title: "Review notes: NDA, Partner Agreement and invoices"
subtitle: "For Sam only, not for sending · 18 November 2026"
---

These notes review the documents as a commercial solicitor working with hauliers and logistics businesses would. They are a careful first pass, not formal legal advice. Have a solicitor confirm the final versions before signing, which should be a short and inexpensive job now that the drafts are in good shape.

# 1. Before anyone signs

1. **Check Clearpath Insights Ltd exists.** I couldn't find it on Companies House. If it isn't incorporated, it can't sign, and whoever signs for it becomes personally liable (Companies Act 2006, section 51). The email asks Paul for its company number and registered office.
2. **Add Your AI Ltd's company number and registered office** to the NDA, the agreement and the invoices. I couldn't confirm them: the only close match online (YourAI Ltd, 16874666, Leicester) belongs to someone else.
3. **Pritesh signs as Co-founder.** That's fine for these documents, as long as Your AI authorises him to sign for it. If he is not a registered director, record that authority in a short board minute or email from you.
4. **Confirm THEL's details** (THEL (Midlands) Ltd, company 12359081, 68 Nottingham Road, Eastwood, Nottingham NG16 3NQ, from its Companies House filing history), and who receives its invoices.

# 2. The NDA

**Kept mutual, with these changes:** ownership both ways (1.6, 5.2 to 5.5 and new 5.8), Service Providers and AI tools on no-training terms (1.7, 2.1(f), 2.2, 2.3), systems and access (new 2.4), the £25,000 indemnity cap (9.2), Samantha's Clearpath address, and Pritesh as a signatory.

**Clause 6.1 is left as Clearpath drafted it, at your instruction.** The risk to be aware of:

- **What it bars:** for 24 months after discussions end, Your AI can't build or sell anything for UK haulage that is "substantially similar" to the Clearpath Concept, which is defined as an operating platform for hauliers.
- **Clearpath isn't bound the same way:** under 6.3 it stays free to build with someone else.
- **Enforceability:** a court may treat a restriction this wide as an unenforceable restraint of trade. But relying on that means a dispute, so don't plan around it.
- **How the agreement handles it:** clause 4.4 of the Partner Agreement says the agreement is the "signed definitive agreement" that 6.1 allows. It also releases Your AI if exclusivity ends because Clearpath misses its minimum. That keeps the NDA as Clearpath drafted it, while protecting Your AI once the partnership is signed. Delete 4.4 if you'd rather not raise it.

**2.4 (systems and access):** now says Clearpath "procures, or for an Affiliate it does not control, uses all reasonable endeavours to procure". Clearpath can't legally compel a company it doesn't control, so this wording is realistic and therefore more likely to be accepted.

# 3. The Partner Agreement: what I added and why

| Clause | Addition | Why it matters |
| --- | --- | --- |
| Parties | Each Party confirms it is a registered company | Avoids personal liability for signing for a company that doesn't exist |
| 3.5 | Each Party confirms it owns or is licensed to use what it brings; Clearpath confirms its HR and H&S document licence allows sharing with customers | Paul bought those documents from a third party. If the licence doesn't allow sharing, the policy library could infringe |
| 3.6 | Each Party protects the other against infringement claims about what it brought | The standard protection in a reseller arrangement |
| 4.4 | The agreement counts as the signed agreement under NDA 6.1, and releases Your AI if exclusivity ends | Stops the NDA's non-compete trapping Your AI if the partnership doesn't work out |
| 5.6 | Prices exclude VAT, added if and when the invoicing Party registers | You're not charging VAT now. You must register once taxable turnover goes over £90,000 in 12 months, and prices then need VAT added |
| 5.7 | Late payment interest under the Late Payment of Commercial Debts (Interest) Act 1998 | Statutory, and worth stating |
| 5.8 | Either Party can check the figures behind the statements once a year | Reassures Clearpath, which will be paid from Your AI's statements if option A is chosen |
| 6.5 | The Service doesn't replace an operator's legal duties (drivers' hours, tachographs, O-licence undertakings, maintenance and walkaround checks, health and safety, employment law) | The most important clause for a haulage product. If a figure is wrong or an alert is missed, the operator, not Clearpath or Your AI, remains responsible to the DVSA and the Traffic Commissioner. The customer terms must say this too |
| 7.2 to 7.4 | Clearpath's access to customer data is recorded in the customer terms; sensitive data (health, infringements) is limited to those who need it; 24-hour breach notice between the Parties | UK GDPR: absence and accident details are health data, and the customer must be told of a breach in time to notify the ICO within 72 hours |
| 8.1 to 8.3 | Liability cap: the greater of £10,000 or 12 months' receipts; £25,000 for confidentiality, data protection and infringement, matching the NDA; Clearpath's share isn't excluded as "loss of profit" | Without a minimum, the cap would be close to nil in the first year. Without the last point, Clearpath couldn't recover its share if Your AI breached |
| 10.2 | Clearpath is an independent reseller, not a commercial agent | The Commercial Agents Regulations 1993 give agents compensation when the relationship ends. They cover goods, and an online subscription is generally a service, but the law on software isn't fully settled. This clause lowers the risk |

# 4. Still needed before go-live

1. **Customer terms and a data processing agreement with Trans Haul.** These are short, and must include:
   - the 12-month term and payment terms;
   - the operator's own legal duties (clause 6.5);
   - read-only access, with Trans Haul paying for its own system access;
   - the UK GDPR Article 28 processor terms;
   - the list of service providers (Supabase, the web host, Resend);
   - Clearpath's support access.

   I can draft these next.
2. **ICO registration** for Your AI (£52 a year), and professional indemnity and cyber insurance in place before go-live. Keep the PI limit above the £25,000 caps.
3. **Privacy notice for Trans Haul's staff**, so drivers and staff know what the platform holds about them. Trans Haul issues it; we can provide the text.
4. **Supplier terms:** check that Vigo, Road Tech and Xero allow a third party (Your AI) to access Trans Haul's data. Trans Haul's written authorisation to each supplier, already in the email, covers this.

# 5. The email and invoices

- **Email:** asks for the information and access first, with no preview or demo. It raises who invoices Trans Haul, attaches the NDA, the summary of changes and the agreement, and asks for Clearpath's company details. Fill in the attachments when you send.
- **Invoices:** VAT removed. They're addressed to THEL with its company number and registered office, pending confirmation. Don't issue YAI-0001 until Clearpath has answered the invoicing question and the NDA is signed.
