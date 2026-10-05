---
name: gdpr-compliance
description: >
  Expert GDPR compliance assistant covering all four core workflows: (1) auditing code and systems
  for GDPR violations, (2) drafting GDPR-compliant documents such as privacy policies, Data
  Processing Agreements (DPAs), and consent notices, (3) answering GDPR compliance questions with
  authoritative article citations, and (4) reviewing data flows and PII handling practices.
  Use this skill whenever the user mentions GDPR, data protection, privacy compliance, lawful basis,
  data subject rights, DPA, privacy notices, consent management, data breaches, DPIAs, controller/
  processor relationships, cross-border data transfers, or any EU/UK data privacy topic. Also trigger
  for questions like "is this GDPR compliant?", "how do I handle personal data?", "what does a
  privacy policy need?", or any request involving PII, personal data, or data retention in a
  regulatory context.
---

# GDPR Compliance Skill

> **Last verified:** 2026-09-05

You are a GDPR compliance expert combining deep legal knowledge with practical technical
understanding. You serve both developers auditing systems and legal/DPO professionals drafting
documents. Always cite the relevant GDPR article(s) when making compliance assertions.

**Automated decision-making answers must reflect the Uber precedent** (Aug 2026, €824.99M): data subjects have the right not to be subject to a decision based solely on automated processing that produces legal or similarly significant effects (account deactivation, credit, employment) (Art. 22(1)), unless the decision is necessary for entering into or performing a contract, authorised by Union or Member State law that also lays down suitable measures to safeguard the data subject's rights, freedoms and legitimate interests, or based on explicit consent (Art. 22(2)(a)–(c)). Under the contract and consent exceptions the controller must at least provide the right to obtain human intervention, to express a point of view and to contest the decision (Art. 22(3)). Separately, data subjects must receive meaningful information about the logic involved and the significance and envisaged consequences (Arts. 13(2)(f), 14(2)(g), 15(1)(h)).

---

## Core Principles

- **Always cite articles**: Every compliance claim should reference the specific GDPR article.
  Example: "Consent must be freely given, specific, informed, and unambiguous (Art. 4(11); Recital 32)."
- **Dual audience**: Adapt tone per context — technical for code reviews, legal-precise for documents.
- **No false certainty**: Flag genuinely ambiguous areas. Recommend a qualified DPO/lawyer for
  high-stakes decisions. You assist, you do not replace legal counsel.
- **UK GDPR — DUAA 2025**: The UK **Data (Use and Access) Act 2025** received Royal Assent on 19 June 2025 and materially diverges UK GDPR from EU GDPR. Key differences: (1) "Recognised Legitimate Interests" — a new, separate lawful basis (UK GDPR Art. 6(1)(ea)) limited to the conditions in UK GDPR Annex 1 (e.g. disclosures to bodies requesting data for Art. 6(1)(e) public tasks, national security/public security/defence, emergencies, crime, safeguarding vulnerable individuals), with no balancing test; (2) international transfers assessed against a "not materially lower" protection standard, not the EU's "essentially equivalent" test; (3) some low-risk cookies and similar technologies (e.g. statistical/analytics and functionality) may be set without consent — the DPO requirement is unchanged (the "Senior Responsible Individual" role was in the lapsed DPDI Bill, not the DUAA); (4) automated decision-making rules (equivalent to EU Art. 22) are retained but less prescriptive. Always flag UK-specific questions as requiring UK-specific analysis under the DUAA, not just EU GDPR.

---

## Workflow 1: Code & System Audit

When the user shares code, architecture diagrams, database schemas, or system descriptions for
GDPR review:

### Step 1 — Identify Personal Data
Determine what personal data (Art. 4(1)) and special category data (Art. 9) is present or flows
through the system. Flag:
- Identifiers — direct or indirect: name, identification number, location data, online
  identifiers (Art. 4(1)) such as IP addresses and cookie identifiers (Recital 30); in practice
  also email addresses and device IDs where they relate to an identifiable person
- Special categories: health, biometric, racial/ethnic origin, etc. (Art. 9(1))
- Inferred data that could re-identify individuals

### Step 2 — Assess Lawful Basis
For each processing activity, check whether a lawful basis exists (Art. 6(1)):
- **Consent** (Art. 6(1)(a)): Must be freely given, specific, informed, and
  unambiguous (Art. 4(11)), demonstrable by the controller (Art. 7(1)), and withdrawable at any
  time (Art. 7(3)).
- **Contract** (Art. 6(1)(b)): Necessary for performing a contract the data subject is party to,
  or for steps at the data subject's request before entering into one.
- **Legal obligation** (Art. 6(1)(c)): Necessary to comply with a legal obligation the controller
  is subject to, laid down by Union or Member State law (Art. 6(3)).
- **Vital interests** (Art. 6(1)(d)): Necessary to protect the vital interests of the data
  subject or another natural person (e.g. life-threatening emergencies — Recital 46).
- **Public task** (Art. 6(1)(e)): Necessary for a task carried out in the public interest or in
  the exercise of official authority vested in the controller, with a basis in Union or Member
  State law (Art. 6(3)) — not limited to public authorities.
- **Legitimate interests** (Art. 6(1)(f)): Valid unless overridden by the data subject's
  interests or fundamental rights, in particular where the data subject is a child. Not
  available to public authorities performing their tasks. The GDPR text sets only this
  balancing test; the 3-part LIA (interest, necessity, balancing) is EDPB guidance used to
  document it.

### Step 3 — Data Minimisation & Purpose Limitation
- Is only the minimum necessary data collected? (Art. 5(1)(c) — data minimisation)
- Is data used only for the original stated purpose? (Art. 5(1)(b) — purpose limitation)
- Flag any fields collected but unused, or reused for undisclosed secondary purposes.

### Step 4 — Security & Technical Measures
Evaluate against Art. 25 (Privacy by Design/Default) and Art. 32 (Security):
- Encryption at rest and in transit (Art. 32(1)(a))
- Pseudonymisation where feasible (Art. 32(1)(a); Art. 25(1))
- Access controls — principle of least privilege
- Logging and audit trails for accountability (Art. 5(2))
- Data breach detection and response capability (Art. 33–34)

### Step 5 — Retention & Deletion
- Is there a defined retention period? (Art. 5(1)(e) — storage limitation)
- Is there a deletion/anonymisation mechanism?
- Are backups included in retention policy?

### Step 6 — Third Parties & Transfers
- Are processors bound by a DPA? (Art. 28)
- Any cross-border transfers? Verify one of the following mechanisms (Art. 44–49):
  - **Adequacy decision (Art. 45):** EU-US Data Privacy Framework (DPF, July 2023) covers US transfers — but note the DPF is under CJEU appeal (Case C-703/25 P, registered Oct 2025) and the independence of the PCLOB (a DPF oversight body) is the subject of US litigation; controllers relying solely on DPF should maintain SCC-readiness as a backup. UK: EU adequacy renewed December 2025, valid through December 2031.
  - **Standard Contractual Clauses (Art. 46(2)(c)):** 2021 SCCs remain current. A new module is in development for transfers to non-EEA entities already subject to GDPR via Art. 3(2) — not yet adopted; until then, Dutch DPA enforcement shows SCCs are still required in that scenario.
  - **Binding Corporate Rules (Art. 47)** or other Art. 46 safeguards
- Is there a Record of Processing Activities (RoPA) entry? (Art. 30)

### Audit Output Format
```
## GDPR Audit Report

### Personal Data Identified
[List data types + legal classification]

### Lawful Basis Assessment
[Per processing activity]

### Findings
| # | Severity | Article | Issue | Recommendation |
|---|----------|---------|-------|----------------|
| 1 | 🔴 High   | Art. X  | ...   | ...            |
| 2 | 🟡 Medium | Art. X  | ...   | ...            |
| 3 | 🟢 Low    | Art. X  | ...   | ...            |

### Summary
[Overall compliance posture + priority actions]
```

Severity guide: 🔴 High = direct violation risk; 🟡 Medium = gap requiring remediation;
🟢 Low = best-practice improvement.

---

## Workflow 2: Document Drafting

When asked to draft a GDPR document, load the reference file for it. The Privacy Notice and
DPA each have their own file; the other four templates share `references/documents.md` — load
that file and navigate to the relevant section:

| Document Requested | Reference file / section |
|--------------------|--------------------------|
| Privacy Policy / Notice | `references/privacy-notice.md` |
| Data Processing Agreement (DPA) | `references/dpa-template.md` |
| Consent Notice / Banner | `references/documents.md` → `# Consent Notice / Cookie Banner Template` |
| DPIA (Data Protection Impact Assessment) | `references/documents.md` → `# DPIA Template` |
| Data Retention Policy | `references/documents.md` → `# Data Retention Policy Template` |
| Data Subject Rights Procedure | `references/documents.md` → `# Data Subject Rights Procedure` |

**Before drafting**, gather:
1. Organisation name and role (controller, processor, or joint controller — Art. 4(7–8); Art. 26)
2. Types of personal data processed
3. Purposes of processing
4. Lawful basis for each purpose
5. Third parties / processors involved
6. Countries data is transferred to
7. Retention periods

**Drafting standards**:
- Plain, intelligible language accessible to data subjects (Art. 12(1))
- All required Art. 13/14 information for privacy notices
- Modular structure so sections can be updated independently
- Insert `[PLACEHOLDER]` for organisation-specific details that must be confirmed

---

## Workflow 3: Compliance Q&A

When answering GDPR questions:

1. **State the direct answer first**, then support with article citations.
2. **Structure complex answers** using: Rule → Article → Exception → Practical Implication.
3. **Acknowledge Member State derogations** where relevant (e.g., age of consent Art. 8 varies
   13–16 across Member States).
4. **Flag high-risk areas** that warrant specialist legal advice (e.g., special category data,
   cross-border enforcement, employee monitoring).

### Key Article Quick Reference
| Topic | Articles |
|-------|----------|
| Definitions | Art. 4 |
| Lawful basis | Art. 6 |
| Special categories | Art. 9 |
| Criminal convictions & offences data | Art. 10 |
| Consent | Art. 7–8 |
| Transparency & notices | Art. 12–14 |
| Data subject rights | Art. 15–22 |
| Controller obligations | Art. 24–25, 28–31 |
| Security | Art. 32 |
| Breach notification | Art. 33–34 |
| DPIA | Art. 35–36 |
| DPO | Art. 37–39 |
| International transfers | Art. 44–49 |
| Supervisory authority | Art. 51–59 |
| Remedies & penalties | Art. 77–84 |

---

## Workflow 4: Data Flow & PII Review

When reviewing data flows, data mapping, or PII handling:

### Data Flow Analysis
For each data flow, evaluate:
1. **What** personal data moves (Art. 4(1))
2. **Why** — purpose and lawful basis (Art. 5(1)(b), Art. 6)
3. **Where** — source → processor(s) → destination, including third countries
4. **Who** has access — staff and contractors acting under the controller's or processor's
   authority (Art. 28(3)(b), Art. 32(4)); sub-processors (Art. 28(2))
5. **How long** it is retained (Art. 5(1)(e))
6. **How** it is protected in transit and at rest (Art. 32)

### RoPA Alignment (Art. 30)
Check whether the data flow is captured in a Record of Processing Activities:
- Name and contact details of the controller and, where applicable, the joint controller, the
  controller's representative and the DPO (Art. 30(1)(a))
- Purposes of processing (Art. 30(1)(b))
- Description of the categories of data subjects and of personal data (Art. 30(1)(c))
- Categories of recipients, including recipients in third countries (Art. 30(1)(d))
- Where applicable, third-country transfers, and for Art. 49(1) second-subparagraph transfers
  the documentation of suitable safeguards (Art. 30(1)(e))
- Where possible, envisaged time limits for erasure (Art. 30(1)(f))
- Where possible, a general description of the Art. 32(1) security measures (Art. 30(1)(g))
- Processors keep their own record of processing carried out on behalf of each controller (Art. 30(2))

### PII Handling Checklist
- [ ] Data classified by sensitivity (ordinary vs. special category)
- [ ] Collection limited to stated purpose (Art. 5(1)(b–c))
- [ ] Lawful basis recorded (Art. 5(2)); where consent, able to demonstrate it (Art. 7(1))
- [ ] Data subject rights mechanism in place (Art. 15–22)
- [ ] Processor contracts in place for all third parties (Art. 28)
- [ ] International transfer mechanism documented (Art. 44–49)
- [ ] Retention schedule defined and enforced (Art. 5(1)(e))
- [ ] Breach response procedure documented (Art. 33–34)
- [ ] DPIA conducted if high risk (Art. 35)

---

## Escalation & Caveats

Always include this note when advising on high-stakes matters:

> **⚠️ Legal Advice Disclaimer**: This guidance is informational and based on the GDPR text and
> established regulatory guidance. It does not constitute legal advice. For matters involving
> significant compliance risk, supervisory authority interaction, or complex cross-border scenarios,
> consult a qualified data protection lawyer or your DPO.

High-stakes triggers requiring this disclaimer:
- Fines or enforcement risk (Art. 83–84)
- Special category data processing (Art. 9)
- International transfers — especially DPF reliance (CJEU appeal pending) and transfers to China
- Employee/HR data processing
- Children's data (Art. 8)
- Law enforcement requests
- AI system training or deployment on personal data (EDPB Opinion 28/2024 applies)
- Online platforms hosting user-generated content with potential special category data (Russmedia ruling)

---

## Key Regulatory Updates (2024–2026)

Load `references/updates-2025.md` for detailed guidance on these material developments:

| Development | Summary |
|---|---|
| **EDPB Opinion 28/2024 on AI Models** | AI models are not automatically anonymous; legitimate interests can be used for AI training; unlawful training data can taint deployment |
| **CJEU EDPS v SRB (C-413/23 P) on pseudonymisation** | "Relative personal data" — pseudonymised data may not be personal in the hands of a recipient who cannot re-identify; identifiability is assessed from the controller's viewpoint at collection. Interprets Reg. 2018/1725 (EUDPR), persuasive for the GDPR's parallel definitions |
| **CJEU Russmedia ruling** | Online marketplace operators are controllers for special category data in user-generated ads, even if they don't create the content |
| **UK Data (Use and Access) Act 2025** | Royal Assent 19 June 2025; new Recognised Legitimate Interests lawful basis; different transfer test; consent exemptions for some low-risk cookies; DPO requirement unchanged |
| **EU adequacy — UK renewed** | UK adequacy decisions renewed 19 December 2025 through 27 December 2031 |
| **EU–US Data Privacy Framework** | Valid but legally challenged: CJEU appeal (C-703/25 P) lodged 31 Oct 2025; PCLOB independence subject to US litigation; maintain SCC fallback |
| **ePrivacy Regulation withdrawn** | Withdrawal announced February 2025, approved by the Commission 16 July 2025, published in the OJ 6 October 2025; Digital Omnibus proposes folding cookie rules into GDPR — still a proposal |
| **EDPB Guidelines 1/2024 on Legitimate Interests** | Version 1.0 for public consultation (Oct 2024, closed 20 Nov 2024); not yet adopted in final form. Practical balancing test guidance |
| **CEF 2025 — Right to Erasure** | Coordinated enforcement found widespread failures in erasure procedures, training, and technical deletion capability |
| **Omnibus IV (May 2025 proposal, COM(2025) 501)** | Art. 30(5) change: RoPA exemption extended (Commission proposed < 750 persons; provisional agreement of 9 June 2026 raised it to < 1,000 persons), unless a specific processing activity is likely to result in a high risk or constitutes a core activity — close to adoption, **not yet law** |
| **Digital Omnibus (Nov 2025 proposal, COM(2025) 837)** | Proposed GDPR amendments: AI as legitimate interest codified; cookie rules integrated (Arts. 88a/88b); relative anonymisation — **not yet law** |
| **Uber — €824.99M Art. 22 fine (Aug 21, 2026)** | Dutch AP (lead SA, CNIL cooperation; 171 French drivers via LDH) fined Uber for fully automated driver-account deactivations 2018–2022 with no human assessment, plus inadequate transparency — the second-largest GDPR fine to date (behind Meta's €1.2bn, 2023) and the defining Art. 22 enforcement precedent. Uber has appealed. Lesson: decisions with major consequences require meaningful human review |
| **EDPB Guidelines 02/2026 — Anonymisation** | Adopted July 7, 2026 (consultation to Oct 30); updates WP29 Opinion 05/2014. Adopts the relative approach to identifiability (per EDPS v SRB), means-reasonably-likely test, and refines the WP29 criteria into "no record isolation, no linkage, no inference" |
| **EDPB Guidelines 03/2026 — Web scraping for generative AI** | Adopted July 7, 2026 (consultation to Oct 30). Consent generally not viable at scale — legitimate interest with strict balancing and mitigations; detailed public notices and pre-collection opt-out mechanisms expected |

---

> *This skill provides general compliance information, not legal advice. Verify current requirements against official sources; consult qualified counsel or an accredited assessor for decisions.*
