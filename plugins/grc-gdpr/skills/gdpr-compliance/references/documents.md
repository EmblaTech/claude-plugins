# Consent Notice / Cookie Banner Template

## Legal Basis
Art. 7 (conditions for consent), Art. 4(11) (definition of consent), Recitals 32, 42–43.
ePrivacy Directive Art. 5(3) additionally applies to cookies/device storage.

---

## Consent Requirements Checklist (Art. 7)
- [ ] **Freely given**: Genuine choice; able to refuse or withdraw without detriment (Recital 42). Making a service conditional on consent to processing not necessary for it weighs heavily against validity (Art. 7(4) — "utmost account shall be taken"; consent is presumed not to be freely given in that case per Recital 43)
- [ ] **Specific**: Consent covering each purpose (Recital 32); separate consent for different processing operations where appropriate (Recital 43)
- [ ] **Informed**: Clear plain-language explanation before consent given
- [ ] **Unambiguous**: Affirmative act required — no pre-ticked boxes (Recital 32)
- [ ] **Withdrawable**: "As easy to withdraw as to give" (Art. 7(3)); withdrawal does not affect prior processing
- [ ] **Demonstrable**: Controller must be able to demonstrate consent was given (Art. 7(1)) — keeping a record of when, how, and what was consented to is the practical way to do this
- [ ] **Children (information society services)**: Where consent is the basis for an information society service offered directly to a child under 16 (Member States may lower this to no less than 13), consent must be given or authorised by the holder of parental responsibility; make reasonable efforts to verify this, taking available technology into account (Art. 8(1)–(2))

---

## Cookie Banner — Required Elements

### Layer 1 (Initial Banner)
```
We use cookies to [improve your experience / personalise content / analyse traffic].
[ACCEPT ALL]   [REJECT ALL]   [MANAGE PREFERENCES]

[Link to Cookie Policy]
```

**Critical**: Pre-selected toggles are not valid consent (Art. 4(11); Recital 32). EDPB guidance
(Guidelines 03/2022 on deceptive design patterns; cookie banner taskforce report) expects "Accept"
and "Reject" to be equally prominent and treats hiding reject as a breach of Art. 4(11)/7 and
Art. 5(1)(a) fairness — this is regulator guidance, not GDPR text.

### Layer 2 (Preference Centre)
Group cookies by purpose; each requires a separate opt-in toggle defaulting to OFF:
| Category | Description | Default |
|----------|-------------|---------|
| Strictly Necessary | Required for site function — no consent needed | Always ON |
| Analytics | [Provider, purpose] | OFF |
| Marketing | [Provider, purpose] | OFF |
| Personalisation | [Provider, purpose] | OFF |

### Consent Record to Store
```json
{
  "userId": "...",
  "consentTimestamp": "ISO-8601",
  "consentVersion": "v1.2",
  "purposes": {
    "analytics": true,
    "marketing": false
  },
  "method": "explicit-click",
  "ipAddress": "[pseudonymised or omit]"
}
```

---
---

# DPIA Template (Data Protection Impact Assessment)

## Legal Basis
Art. 35 GDPR — mandatory when processing is "likely to result in a high risk" to individuals.
Art. 35(3) lists mandatory triggers; supervisory authorities publish lists (Art. 35(4)).

## When Required

**Mandatory cases — any ONE of these alone requires a DPIA (Art. 35(3)):**
- (a) Systematic and extensive evaluation of personal aspects based on automated processing,
  including profiling, on which decisions producing legal or similarly significant effects are based
- (b) Large-scale processing of special category data (Art. 9(1)) or of criminal convictions and
  offences data (Art. 10)
- (c) Systematic monitoring of a publicly accessible area on a large scale

Also required whenever processing is otherwise "likely to result in a high risk", in particular
using new technologies (Art. 35(1)), and for any operation on the supervisory authority's list
(Art. 35(4)).

**Screening indicators (WP29/EDPB guidance, not GDPR text — processing meeting two or more
usually warrants a DPIA):** evaluation/scoring, automated decisions with significant effects,
systematic monitoring, sensitive data, large scale, data matching / combining datasets,
vulnerable data subjects (e.g. children), innovative technology, processing that prevents
data subjects from exercising a right or using a service.

---

## DPIA Structure

### 1. Description of Processing (Art. 35(7)(a))
- **System / project name**: [NAME]
- **Controller**: [NAME + DPO if applicable]
- **Nature of processing**: [What operations are performed on the data]
- **Scope**: [Volume, frequency, geographic reach]
- **Context**: [Who are the data subjects; their vulnerability level]
- **Purpose**: [What is the legitimate aim]
- **Lawful basis**: Art. 6(1)[X]; Art. 9(2)[X] if special category

### 2. Necessity and Proportionality Assessment (Art. 35(7)(b))
Assess whether processing is:
- **Necessary** for the purpose — could the purpose be achieved with less/no personal data?
- **Proportionate** — do the benefits outweigh the risks to individuals?
- **Compliant** with data minimisation (Art. 5(1)(c)), purpose limitation (Art. 5(1)(b))

### 3. Risk Assessment (Art. 35(7)(c))
For each identified risk:
| Risk | Likelihood (1–3) | Severity (1–3) | Risk Score | Mitigation |
|------|-----------------|---------------|-----------|------------|
| Unauthorised access | 2 | 3 | High | Encryption, access controls |
| Function creep | 1 | 2 | Medium | Purpose limitation controls |
| Re-identification | 2 | 3 | High | Pseudonymisation |

### 4. Measures to Address Risks (Art. 35(7)(d))
For each High/Medium risk:
- Technical measure: [DESCRIBE]
- Organisational measure: [DESCRIBE]
- Residual risk after mitigation: [Low/Medium/High]

### 5. DPO / Stakeholder Sign-off (Art. 35(2), 35(9))
- DPO consulted, where designated (Art. 35(2)): Yes / No / N/A — DPO opinion: [ATTACH]
- Data subjects or their representatives consulted, where appropriate (Art. 35(9)): Yes / No
- Outcome: ✅ Proceed | ⚠️ Proceed with conditions | 🔴 Prior consultation with SA required (Art. 36)

---
---

# Data Retention Policy Template

## Legal Basis
Art. 5(1)(e) — storage limitation: data kept in a form which permits identification for no longer than
necessary for the purpose (longer storage allowed solely for archiving in the public interest, research or
statistics, subject to Art. 89(1) safeguards; anonymised data falls outside the principle).
Art. 17(1)(a) — right to erasure applies once data is no longer necessary for its purpose; the retention
period is the controller's own statement of when that point is reached.

---

## Retention Schedule

| Data Category | Business Purpose | Retention Period | Lawful Basis | Deletion Method |
|--------------|-----------------|-----------------|--------------|----------------|
| Customer account data | Service provision | Duration of contract + 2 years | Contract (Art. 6(1)(b)) | Secure deletion |
| Marketing preferences | Direct marketing | Until withdrawal of consent | Consent (Art. 6(1)(a)) | Anonymisation |
| Transaction records | Financial/legal obligations | 7 years | Legal obligation (Art. 6(1)(c)) | Secure archival then deletion |
| Employee records | Employment law | Duration + 6 years | Legal obligation | Secure deletion |
| CCTV footage | Security | 30 days | Legitimate interests (Art. 6(1)(f)) | Automatic overwrite |
| Server/access logs | Security monitoring | 90 days | Legitimate interests | Automated purge |
| Consent records | Compliance evidence | 3 years after withdrawal | Legal obligation | Retain in audit log |

*The GDPR sets no retention periods. The periods above are illustrative — set each one from the applicable national law (tax, employment, limitation periods) and the purpose.*

---

## Operational Requirements
- Automated deletion jobs should run [FREQUENCY] against retention schedule
- Backups must be included in retention policy — purge from backups within [X] days of primary deletion
- Exceptions process: legal hold procedure for litigation/investigation (suspend deletion)
- Retention schedule reviewed: annually or upon material change to processing

---
---

# Data Subject Rights Procedure

## Legal Basis
Arts. 15–22 (individual rights), Art. 12 (modalities — response within 1 month, extendable by 2 months).

---

## Rights Summary

| Right | Article | When Applicable | Response Time |
|-------|---------|----------------|--------------|
| Access (SAR) | Art. 15 | Always (with exceptions) | 1 month (Art. 12(3)) |
| Rectification | Art. 16 | Inaccurate/incomplete data | 1 month |
| Erasure | Art. 17 | No longer necessary; consent withdrawn and no other legal ground; objection under Art. 21(1) with no overriding legitimate grounds, or under Art. 21(2); unlawful processing; legal obligation to erase; child's data collected for information society services (Art. 17(1)(a)–(f)) | 1 month |
| Restriction | Art. 18 | Accuracy contested (while verified); unlawful but subject opposes erasure; controller no longer needs data but subject needs it for legal claims; objection pending verification (Art. 18(1)(a)–(d)) | 1 month |
| Portability | Art. 20 | Data the subject provided; consent or contract basis; automated processing; not for processing necessary for a public-interest task or the exercise of official authority (Art. 20(3)) | 1 month |
| Object | Art. 21 | Public task or legitimate interests basis, on grounds relating to the subject's particular situation — controller may continue only if it demonstrates compelling legitimate grounds that override the subject's interests, rights and freedoms, or for legal claims (Art. 21(1)); direct marketing — unconditional, processing for that purpose must stop (Art. 21(2)–(3)); research/statistics unless a public-interest task (Art. 21(6)) | 1 month (Art. 12(3)) |
| Automated decisions | Art. 22 | Solely automated decisions with legal or similarly significant effects, unless necessary for entering into or performing a contract, authorised by Union/Member State law that also lays down suitable safeguards, or based on explicit consent (Art. 22(2)) | 1 month |

---

## Request Handling Process

1. **Receive**: Accept requests via [EMAIL / WEB FORM / POST]. Where the controller has reasonable doubts about the requester's identity, it may request additional information necessary to confirm it — no more than necessary (Art. 12(6)).
2. **Verify identity (if reasonable doubts)**: [METHOD — e.g., match against account details; 2FA confirmation]
3. **Log**: Record date received, type of request, handler assigned.
4. **Assess**: Determine if exemptions apply (e.g., Art. 17(3) — overriding legal obligation prevents erasure).
5. **Respond**: Without undue delay and in any event within **one month** of receipt (Art. 12(3)). If extending, notify requester within that month with reasons (Art. 12(3)).
6. **Response must be**: Free of charge (Art. 12(5)); concise, transparent, intelligible, in clear and plain language (Art. 12(1)); in writing or by other means, including, where appropriate, electronic — orally if the data subject requests it, provided their identity is proven by other means (Art. 12(1)); where the request was made electronically, by electronic means where possible, unless otherwise requested (Art. 12(3)).
7. **Refusal / no action**: If not acting on the request, inform the subject without delay and at the latest within one month of receipt of the reasons, and of the right to complain to a supervisory authority and seek a judicial remedy (Art. 12(4)).

## Exemptions to Document
- Legal claims (Art. 17(3)(e))
- Freedom of expression (Art. 17(3)(a))
- Archiving in the public interest, scientific or historical research, or statistics — only in so far as erasure is likely to render impossible or seriously impair those purposes (Art. 17(3)(d))
- Manifestly unfounded or excessive requests — can charge a reasonable fee or refuse; the controller bears the burden of demonstrating this (Art. 12(5))

---

## SLA & Escalation
- Day 0: Request received and logged
- Day 3: Identity verified; request categorised
- Day 20: Draft response reviewed by DPO/legal
- Day 25: Response sent (buffer before the one-month deadline)
- Statutory deadline: **one month from receipt** (Art. 12(3)) — track the actual date; the GDPR sets one month, not a fixed 30 days
- Extension (up to two further months) must be notified within one month of receipt, with reasons, where necessary given the complexity and number of requests (Art. 12(3))
