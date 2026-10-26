---
name: pipeline
description: >
  Sets up and audits automated AI PR review in a project's CI pipeline on any code
  host — Bitbucket Pipelines and GitHub Actions from tested profiles, other hosts
  (GitLab CI, Azure Pipelines, …) generated against a security rules checklist —
  writing the pipeline file and .mcp.json. Also sets up ai-develop, the
  @claudedev-triggered autonomous development pipeline, on any host and tracker,
  with researched guidance for the tracker trigger. Use when the user wants AI PR review in CI, asks "is my pipeline set
  up right", mentions bitbucket-pipelines.yml, a GitHub Actions workflow, or ai-develop
  in the context of AI review, or is adding any pre-merge check (tests, security
  scans, linting) to a pipeline this skill owns. Invoked by embla-core:config Phase 5.
  Run as /embla-core:pipeline (setup) or /embla-core:pipeline check.
---

# embla-core:pipeline

Wires `pr-review --mode=pipeline` into the project's CI so the review runs on every PR and its comments land on the PR. A pipeline file alone is not the goal: the run must post.

Every pipeline, on every host, satisfies [references/pipeline-rules.md](references/pipeline-rules.md) — the rules checklist, cited by ID (`S2`, `I5`, …) throughout this skill. Read it before writing or checking any pipeline file.

```
/embla-core:pipeline              → setup (default)
/embla-core:pipeline setup        → setup
/embla-core:pipeline check        → audit existing files against the rules
```

**Scope:** this skill automates the AI PR Review step and the `ai-develop` pipeline only. When a developer wants another pre-merge check (unit tests, security scans, linting), say plainly that it isn't automated here, then help wire it up by hand under P1.

## Profiles

A **profile** is the set of canonical files for one host or tracker. Resolve the host profile from `embla.json → repo.provider`:

- **Known host** — `references/hosts/<provider>/` exists (`bitbucket`, `github`). Read `<provider>-setup-guide.md` (paths, discovery, merge and check specifics), `template.yml`, `mcp.json`, `variables.md`. On Bitbucket, when discovery finds a self-hosted runner, also follow [references/hosts/bitbucket/runner-detection.md](references/hosts/bitbucket/runner-detection.md).
- **Generated host** — any other provider. Follow [references/generate-for-host.md](references/generate-for-host.md), which drafts a port of the Bitbucket template, checks it rule by rule, and writes only on the developer's explicit yes.

Tracker profiles live in `references/trackers/<provider>/`; today only `jira` ([prefetch.sh.md](references/trackers/jira/prefetch.sh.md), [variables.md](references/trackers/jira/variables.md)).

---

## setup

Copy this checklist into your reply and tick it off:

```
Pipeline setup:
- [ ] 1. Preconditions
- [ ] 2. Host profile and discovery
- [ ] 3. Gather values
- [ ] 4. Tracker
- [ ] 5. Write files
- [ ] 6. ai-develop
- [ ] 7. Completion output
```

### 1. Preconditions

- `.claude/embla.json` missing → stop: `No embla.json found. Run /embla-core:config first.`
- Read `repo.provider` and `tracker.provider`. `repo.provider` missing → ask: `Which code host runs your CI? (e.g. bitbucket, github, gitlab, azure-devops)`. Any string is valid.

Done when `repo.provider` has a value.

### 2. Host profile and discovery

Resolve the profile (see **Profiles**).
- **Generated host** → follow `generate-for-host.md` to its end; it covers discovery, tracker wiring, writing, and the checklist. Then continue at step 6.
- **Known host** → run "Phase 0 discovery" from the host's `<provider>-setup-guide.md`. It yields `base_pipeline` (the existing file's contents, or `new`) and any host-specific state (Bitbucket: runner image, `ai_develop_present`). Every later step operates on the in-memory `base_pipeline`.

Done when `base_pipeline` is set.

### 3. Gather values

Read `.claude/embla.json` only — user-level Claude Code config stays out of scope, because the CI container never sees it and a value found there would look "handled" when it isn't. Fill the non-secret rows of the host's `variables.md` (e.g. Bitbucket `BITBUCKET_WORKSPACE` ← `repo.workspace`; Jira `ATLASSIAN_SITE_NAME` ← `tracker.jira.siteUrl` minus `https://` and `.atlassian.net`). Print a resolution summary with each resolved value and `⚠ not auto-resolved` for the rest; token rows always read `set manually in <host secret store>`. Prompt for any unresolved non-secret value the templates need.

Done when every non-secret row has a value or an explicit `—`.

### 4. Tracker

Decide how the review gets the ticket. Nothing about it is stored in the project: `pr-review` reads `docs/reviews/ticket.json` when the pre-fetch wrote it, otherwise uses an allowed tracker MCP tool.

| `tracker.provider` | Pre-fetch block | Tracker MCP tool in `--allowedTools` |
|---|---|---|
| `jira` | `trackers/jira/prefetch.sh.md` | none |
| any other | generated (below), when the tracker has a REST API | the approved server's ticket-read tool, if one passed |
| not configured | none | none |

**Other trackers:**
1. Choose an MCP server under M1–M8, starting from any tracker server already in the project's `.mcp.json`. Show the M6 evidence and get an explicit yes. On a pass, its ticket-read tool joins `--allowedTools` (I5).
2. If the tracker has a REST API, generate a pre-fetch block shaped like the Jira one (reads `pr-context.json`, extracts the key with `grep -oE`, fetches under C1/C2, writes `ticket.json` only after `jq -e '.key'`). It is the fallback for an MCP failure, or the only path when no server passed. Show it to the developer with the M6 evidence.
3. Neither → no ticket source; the review reports "no ticket linked". Say why.

Done when the pre-fetch block and the tracker tool are each decided, or explicitly none.

### 5. Write files

For a known host, using the paths in `<provider>-setup-guide.md` → "Files":
1. **Pipeline file** — take `template.yml`, replace the entry between the `# >>> tracker pre-fetch` and `# <<< tracker pre-fetch` markers with the step 4 block (re-indented to the script list; keep the marker entry as is when there is no block), apply any resolved image, add any approved tracker tool to `--allowedTools`, then merge into `base_pipeline` per `<provider>-setup-guide.md` → "Merge rules" (P1/P2). Compute the full result in memory, write it, and print `Wrote <file>:` followed by the full contents. No confirmation gate: the write touches only the local working tree and is reversible with `git checkout`.
2. **`.mcp.json`** — existing file that isn't valid JSON → stop: `Cannot parse existing .mcp.json — fix manually before retrying.` Otherwise add each server block from `mcp.json` (plus an approved tracker server) only when its key is missing, copying `${VAR}` placeholders verbatim (C3); print which servers were skipped.

Done when each file is written or reported as skipped.

### 6. ai-develop

Ask, whatever happened to the AI PR Review step:

```
Set up the ai-develop pipeline for autonomous development triggered by @claudedev ticket comments? (yes / skip)
```

- `skip` → print `Skipped. Run /embla-core:pipeline setup again any time to add this.` No files change.
- `yes`, **Bitbucket + Jira** → read [references/workflows/ai-develop/ai-develop-setup-guide.md](references/workflows/ai-develop/ai-develop-setup-guide.md), then:
  1. `ai_develop_present` → print `ai-develop pipeline already present — no changes made.` and go to 4.
  2. Copy the `custom:` block verbatim from [references/workflows/ai-develop/template.yml](references/workflows/ai-develop/template.yml). Add `ai-develop:` beside any existing `custom:` entries, or add `pipelines: custom:` fresh. Write and print as in step 5.
  3. Add the `atlassian` block from [references/workflows/ai-develop/mcp.json](references/workflows/ai-develop/mcp.json) to `.mcp.json` only if missing.
  4. Print the extra variables, reusing `ATLASSIAN_SITE_NAME`/`ATLASSIAN_API_TOKEN` values already resolved this run:
     ```
     ai-develop requires these additional Bitbucket pipeline variables:
     ┌──────────────────────┬──────────┬─────────────────┬──────────────────────────────────────────────┐
     │ Variable             │ Required │ Suggested value │ Notes                                        │
     ├──────────────────────┼──────────┼─────────────────┼──────────────────────────────────────────────┤
     │ JIRA_ISSUE_KEY       │ ✅       │ —               │ Supplied by the trigger (Jira automation or manual run) │
     │ COMMENTER_ACCOUNT_ID │ optional │ —               │ Supplied by the trigger; blank is handled    │
     │ BITBUCKET_USERNAME   │ ✅       │ <resolved/—>    │ Account username (not email) — ai-develop's git push uses it │
     │ ATLASSIAN_SITE_NAME  │ ✅       │ <resolved/—>    │ Shared with the Jira pre-fetch; also read by the atlassian MCP server │
     │ ATLASSIAN_API_TOKEN  │ ✅       │ set manually    │ Shared with the Jira pre-fetch; also read by the atlassian MCP server │
     └──────────────────────┴──────────┴─────────────────┴──────────────────────────────────────────────┘
     ```
- `yes`, **any other host or tracker** → follow [references/workflows/ai-develop/generate-for-host.md](references/workflows/ai-develop/generate-for-host.md) to its end. An existing ai-develop pipeline → `ai-develop pipeline already present — no changes made.` (P2).

Then, on either `yes` path, print the trigger setup from [references/workflows/ai-develop/trigger-guide.md](references/workflows/ai-develop/trigger-guide.md). For Jira it fills [references/trackers/jira/ai-develop-trigger.md](references/trackers/jira/ai-develop-trigger.md).

Done when the pipeline is written or reported present, and the trigger guidance is printed.

### 7. Completion output

Print `✅ <file>` for each file written and `⏭ <file> (unchanged)` for each skipped. When `base_pipeline` was `new`, add: `Note: this is a new <pipeline file>. Commit it and merge to your default branch for the pipeline to take effect.` Then print the variable checklist: the host's `variables.md` (or the generated one) with the tracker's rows inserted at `<tracker rows>`.

---

## check

Audits the project's pipeline file and `.mcp.json` against the rules. Read-only: report, never fix.

**1. Identify the host.** Pipeline file from `<provider>-setup-guide.md` → "Files" for a known host. Otherwise find the file whose first line is `# Generated by embla-core:pipeline for <provider> — rules-version <N>`; that is a generated host. No pipeline file → report `AI PR Review pipeline not found` and run only the `.mcp.json` checks.

**2. Pipeline file — known host.** Diff mechanically against the canonical `template.yml` (after the project's tracker substitution), never against a hand-kept list of expected lines — such lists drift from the template.
1. Parse both as YAML; formatting differences that leave the parsed structure unchanged are never drift.
2. Find our job/step by name (`<provider>-setup-guide.md` → "Check specifics"). Missing → `AI PR Review step missing`; skip to 4.
3. Compare the wrapper keys `<provider>-setup-guide.md` names (Bitbucket: `image`, `clone`), then walk the canonical script list top to bottom. Each entry (a one-line command or a `|` block) is one unit. Locate its counterpart by a distinguishing substring from early in the entry (`su claudeuser -c`, `set -e`, `apt-get remove`), then report exactly one of **missing**, **modified** (show both versions, so the fix is copy-pasteable), or, for user entries with no canonical counterpart, **extra** (noted, not flagged — it may be deliberate).
4. The `git -C /tmp/plugins checkout <commit>` pin is **modified** whenever it differs from canonical (S2) — a stale pin is a silent security regression, never "present".

**3. Pipeline file — generated host.** Run every rule's **verify** from `pipeline-rules.md` against the file. Compare the S1, S2, S3, and S4 values with those in `hosts/bitbucket/template.yml`; any difference is **modified**. A `rules-version` older than the current one → note `generated against rules-version <N>; current is <M> — re-check the rules changed since`.

**4. Cross-file checks (every host).**
- `.mcp.json` exists and parses.
- Every MCP tool in `--allowedTools` belongs to a server present in `.mcp.json`, and the list matches I5.
- `.claude/pr-review-tools.json` present → **obsolete**: `pr-review` now works from `--allowedTools` alone. Report: `Delete .claude/pr-review-tools.json once the pipeline's plugin pin is at or past the commit that stopped reading it — an older pin still reads it.`
- `.mcp.json` env values are `${VAR}` placeholders (C3); servers are pinned (S3).

**5. ai-develop.** Only when an ai-develop pipeline exists — absence is never drift. Bitbucket + Jira: diff the `pipelines: custom: ai-develop:` block against [references/workflows/ai-develop/template.yml](references/workflows/ai-develop/template.yml) with the same algorithm as 2, citing [references/workflows/ai-develop/ai-develop-setup-guide.md](references/workflows/ai-develop/ai-develop-setup-guide.md) for the reason. Generated (marked `# Generated by embla-core:pipeline for <host> ai-develop`): run the verify of every rule the AD section of `pipeline-rules.md` applies, comparing S1, S2 and AD4 values with the reference template. Then, on Bitbucket + Jira, the `atlassian` server:
- ai-develop present, `atlassian` missing → `atlassian (Jira) MCP server missing — required by the ai-develop pipeline step, which needs a live Jira MCP server for the whole session. Add the block from references/workflows/ai-develop/mcp.json, or run /embla-core:pipeline setup and answer yes to the ai-develop prompt.`
- ai-develop absent, `atlassian` present → `atlassian (Jira) MCP server present — AI PR Review pre-fetches Jira instead, and this repo has no ai-develop step, so the server adds five unused tool schemas to every review context. Remove it, or opt into ai-develop via setup.`

**Report.** Every **missing** or **modified** item cites its rule ID and the rule's one-line why. A drifted line with no matching rule is still reported. Example:

```
Pipeline configuration check (bitbucket):

bitbucket-pipelines.yml
  ✅ AI PR Review step present
  ✅ image, clone match canonical
  ❌ script: MODIFIED — pinned plugin commit differs from canonical (S2)
       Installed: git -C /tmp/plugins checkout 1a2b3c4
       Canonical: git -C /tmp/plugins checkout <canonical commit>
       Why: a stale pin lets a later push change what this pipeline runs.
  ❌ script: MODIFIED — --allowedTools adds mcp__bitbucket__bb_delete (I5)

.mcp.json
  ✅ bitbucket server present, pinned, placeholders only
  ✅ every allowed MCP tool's server is present
  ✅ no atlassian server (no ai-develop step — not needed)

2 issues found. Fix them manually, then run /embla-core:pipeline check again.
```

All checks pass → `Pipeline is correctly configured. No action needed.`

---

## Error handling

| Situation | Action |
|---|---|
| `embla.json` missing | Stop: `No embla.json found. Run /embla-core:config first.` |
| `repo.provider` missing | Ask for it (step 1) |
| Generated host: a host fact can't be confirmed | Stop per `generate-for-host.md` step 2; write nothing |
| Generated host: a rule fails 3 rounds | Stop per `generate-for-host.md` step 5, naming the rule ID; write nothing |
| Developer rejects a generated file or an MCP choice | Offer: revise, use `files`/`outbox` instead of MCP, or abort |
| No MCP candidate passes M1–M8 | Use `files`/`outbox` (M7); say which rule failed |
| Our step/job already present | Skip it: `AI PR Review step already present — no changes made.` (P2) |
| `.mcp.json` invalid JSON | Stop: `Cannot parse existing .mcp.json — fix manually before retrying.` |
| `.mcp.json` server already present | Skip it; print which were skipped |
| File write fails | Report the error; print no ✅ for that file |
| Self-hosted runner, blank image twice (Bitbucket) | Fall back to `node:24`: `Falling back to node:24.` |
