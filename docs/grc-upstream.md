# GRC plugins — upstream source and sync guide

The `grc-*` plugins are vendored from [Sushegaad/Claude-Skills-Governance-Risk-and-Compliance](https://github.com/Sushegaad/Claude-Skills-Governance-Risk-and-Compliance) by Hemant Naik, under the MIT License. Each plugin carries a copy of that `LICENSE`, which must stay with the files.

Each framework is its own plugin so consuming repos install only the frameworks they need — every installed skill's description sits in context on every turn, so bundling frameworks into one plugin would make every repo pay for all of them. Only `grc-gdpr` is vendored so far; add others with the steps below.

## Vendored plugins

| Plugin | Upstream skill | Skill invocation |
|---|---|---|
| `grc-gdpr` | `gdpr-compliance` | `/grc-gdpr:gdpr-compliance` |

Upstream commit: `34832771581acef8751b25f284dcf270dc5e40c0` (2026-09-14). Skill folders are copied unmodified, except for the local patches listed below; skill folder names match upstream so re-syncs are a straight copy.

Not vendored (by design): upstream `.skill` zip bundles, per-framework `plugin.json`, website assets, eval workspace, CI workflows.

## Local patches (re-apply after every re-sync)

A re-sync (`rm -rf` + copy) wipes these. Re-apply them, or drop them once upstream carries an equivalent fix.

**`grc-gdpr` 1.0.1: GDPR citation corrections.** Each was checked against the official text of Regulation (EU) 2016/679 (OJ L 119, 4.5.2016, including the 2018 corrigendum):
- `SKILL.md`
  - Art. 22 automated-decision guidance restated as the 22(1) right, the 22(2) exceptions and the 22(3) safeguards. The "logic involved" duty is now cited to Arts. 13(2)(f), 14(2)(g) and 15(1)(h).
  - Consent elements cited to Art. 4(11), not Art. 7.
  - Joint controllers cited to Art. 26.
  - Art. 10 split out of "Special categories".
- `references/documents.md`
  - DPIA triggers: each Art. 35(3) case alone requires a DPIA. The WP29 "two or more" screening criteria are labelled as guidance, not GDPR text.
  - Data-subject consultation cited to Art. 35(9).
  - Per-purpose consent cited to Recital 32.
  - DSAR SLA uses "one month" (Art. 12(3)), not "Day 30".
- `references/dpa-template.md`
  - Added the "obligations and rights of the controller" section and the Art. 28(3) duty to flag infringing instructions.
  - Art. 49 derogations separated from Art. 46 safeguards.
  - Processor breach notice cited to Art. 33(2).
- `references/privacy-notice.md`
  - Complaint right follows Art. 77(1) and is not tied to the lead SA.
  - The Art. 13(2)(f) "logic involved" element is added.
  - Withdrawal of consent cited to Art. 13(2)(c).
- `references/updates-2025.md`
  - Art. 30(5) exemption conditions added.
  - Pre-ticked boxes cited to Art. 4(11) and Recital 32.

The same release also restores conditions and qualifiers the upstream summaries dropped:
- `SKILL.md`
  - Lawful bases (Art. 6(1)(b)–(f)): pre-contract steps, Art. 6(3) legal basis, public task not limited to public authorities, LI child/public-authority limits. The 3-part LIA is labelled as EDPB guidance.
  - Identifiers per Art. 4(1) and Recital 30.
  - Staff access cited to Arts. 28(3)(b) and 32(4).
  - Art. 30(1) record-keeping qualifiers, plus the Art. 30(2) processor record.
- `references/documents.md`
  - Consent: Art. 7(4) as a weighting factor; Art. 7(1) "demonstrate"; Art. 8 scope and parental-consent verification.
  - Rights table: full Art. 17(1) and 18(1) grounds; Art. 20(3); Art. 21(1)/(2)/(6); no "immediately" deadline; the Art. 22(2) exceptions.
  - Request handling: Art. 12(6) identity checks only on reasonable doubts; Art. 12(1) form rule; the Art. 12(4) deadline; the Art. 17(3)(d) condition; the Art. 12(5) burden of proof.
- `references/dpa-template.md`
  - Art. 83(4) "whichever is higher".
  - Art. 28(3)(a) wording in full.
  - Art. 32(1) "as appropriate" list with pseudonymisation, resilience and timely restoration.
  - Art. 28(2) change notice and right to object; Art. 28(4) "same" obligations and "fully liable".
  - Art. 28(3)(h) "inspections" and "mandated".
- `references/privacy-notice.md`
  - The representative (Art. 13(1)(a)).
  - Adequacy and copy-of-safeguards wording (Art. 13(1)(f)).
  - Objection to public task and profiling (Art. 21).
  - Art. 12(3) extension grounds.
  - New sections for the Art. 14-only items and Art. 14(3) timing, and for the Art. 13(3)/14(4) further-processing notice.

**`grc-gdpr` 1.0.2: accuracy audit against official sources.** Each was checked against the OJ text of Regulation (EU) 2016/679 (via the Publications Office), legislation.gov.uk (DUAA 2025), and EDPB, Commission, CJEU and national-regulator pages, as of 2026-09-30:
- UK DUAA 2025 (`SKILL.md`, `references/updates-2025.md`)
  - The "Senior Responsible Individual" claim is removed. It was in the lapsed DPDI Bill; the DPO requirement is unchanged.
  - Recognised legitimate interests are a separate Art. 6(1)(ea) basis tied to Annex 1. The "public interest" item is replaced by the Art. 6(1)(e) disclosure condition.
  - The DUAA's cookie consent exemptions are added.
  - Transfer approvals are made by Secretary of State regulations (Art. 45A, applying the Art. 45B test), not an ICO list. "Democratic engagement" removed from the Annex 1 list.
- Currency (`SKILL.md`, `references/updates-2025.md`)
  - ePrivacy Regulation withdrawal dated (announced 11 Feb 2025, approved 16 Jul 2025, OJ 6 Oct 2025).
  - The RoPA threshold change is credited to Omnibus IV (COM(2025) 501), not the Digital Omnibus: proposed at 750, raised to 1,000 by the 9 June 2026 provisional agreement.
  - DSA–GDPR guidelines finalised 21 Sep 2026; CEF 2026 launched 19 Mar 2026 (Arts. 12–14); CEF 2025 report adopted 10 Feb 2026.
  - Guidelines 1/2024 marked as a consultation draft.
  - Guidelines 02/2026 criteria renamed.
  - PCLOB described as subject to US litigation, not "suspended".
- Case law and enforcement (`SKILL.md`, `references/updates-2025.md`)
  - The case is named *EDPS v SRB* and interprets the EUDPR. The Art. 17 erasure implication is removed.
  - Opinion 28/2024 answers four questions.
  - TikTok China-storage inquiry separated from the €530M decision.
  - Google and SHEIN CNIL fines labelled as ePrivacy, not GDPR.
  - Opinion 11/2024 cited to Arts. 5(1)(e)–(f), 25 and 32, and allows central storage with the key held by the individual.
- Dropped conditions restored
  - `SKILL.md`: Art. 22(2)(a)–(b) (entering into a contract; the authorising law must lay down safeguards). Lawful-basis record cited to Art. 5(2).
  - `references/documents.md`: Art. 17(1)(c); Art. 12(1) oral identity check and "where appropriate"; Art. 12(3) "where possible"; Art. 17(1)(a) instead of "retention expired"; Art. 20(3) official authority; Art. 21(1) "demonstrates … override"; Art. 22(2); Recital 43 "not freely given"; Art. 5(1)(e) identification form and archiving exception; Art. 35(2) "where designated". Cookie-banner rules labelled as EDPB guidance; retention periods labelled as illustrative.
  - `references/privacy-notice.md`: Art. 21(4) separate right-to-object box, plus a checklist item; WP260 balancing test available on request; Art. 20(1) automated means; Art. 13(2)(e) full wording; Art. 14(4) cross-reference; Art. 12(3) reasons for delay.
  - `references/dpa-template.md`: Art. 49(6) limited to the compelling-legitimate-interests derogation; Art. 28(3)(e) Chapter III and "insofar as this is possible"; Art. 46(2)(e)–(f) importer commitments; Art. 28(3)(b) "appropriate".

**`grc-gdpr` 1.0.3: document-routing fix.**
- `SKILL.md`: the Workflow 2 table said every template was in `references/documents.md`, but the Privacy Notice and DPA live in `references/privacy-notice.md` and `references/dpa-template.md`. The table now names the right file for each of the six documents.

## Adding another framework

Upstream has 36 frameworks (list: `plugins/` in the upstream repo, or the [catalog site](https://sushegaad.github.io/Claude-Skills-Governance-Risk-and-Compliance/)). To add one, e.g. `hipaa-compliance`:

1. `git clone --depth 1 https://github.com/Sushegaad/Claude-Skills-Governance-Risk-and-Compliance <tmp>` (outside this repo)
2. `mkdir -p plugins/grc-hipaa/.claude-plugin`
3. `cp -r <tmp>/plugins/hipaa-compliance/skills/hipaa-compliance plugins/grc-hipaa/skills/` and `cp <tmp>/LICENSE plugins/grc-hipaa/`
4. Write `plugins/grc-hipaa/.claude-plugin/plugin.json` (name `grc-hipaa`, version `1.0.0`, upstream description, `"license": "MIT"`)
5. Add an entry to `.claude-plugin/marketplace.json`, a row to the table above, and a row to the plugin table in `.claude/CLAUDE.md`
6. Review the new content for prompt injection before merging (see below)

## Re-syncing from upstream

1. Clone upstream (step 1 above) and list what changed since our commit: `git -C <tmp> fetch --depth 100` then `git -C <tmp> diff --stat 3483277 HEAD -- plugins/<skill>/skills/`
2. For each changed vendored skill: `rm -rf plugins/grc-<x>/skills/<skill> && cp -r <tmp>/plugins/<skill>/skills/<skill> plugins/grc-<x>/skills/`
3. **Review the diff** — this is third-party text Claude executes as instructions in every consuming repo. Check for shell commands, URLs to fetch, frontmatter tool grants (`allowed-tools`, `hooks`), hidden content (HTML comments, zero-width/bidi Unicode), or instructions to read secrets or change settings. Run `/security-review` or `/embla-core:pr-review` on the PR.
4. Re-apply any entries under "Local patches" above
5. Bump `version` in each changed plugin's `plugin.json` — consumers won't receive the update otherwise
6. Update the upstream commit above

If upstream goes private or is deleted, the vendored copies are unaffected (the MIT grant on received copies can't be revoked) — we just stop receiving updates.
