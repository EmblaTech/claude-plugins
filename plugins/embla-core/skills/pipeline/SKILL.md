---
name: pipeline
description: >
  Use when setting up or auditing Bitbucket Pipelines for automated AI PR review or
  for the ai-develop custom pipeline (autonomous, Jira-triggered development) —
  writing or checking bitbucket-pipelines.yml and .mcp.json, wiring up the AI PR
  review step or the ai-develop custom pipeline step, or verifying an existing
  CI/CD PR-review or autonomous-dev pipeline is configured correctly. Trigger this
  whenever the user wants to add automated PR review or autonomous Jira-triggered
  development to their pipeline, asks "is my pipeline set up right", or mentions
  bitbucket-pipelines.yml or ai-develop in the context of AI review or autonomous
  development — even if they don't invoke the slash command directly. Also surface
  this skill whenever a developer is adding any pre-merge automated check to their
  pipeline — unit tests, security scans, linting, etc. — since bitbucket-pipelines.yml
  is this skill's territory. Invoked automatically by embla-core:config Phase 5 when
  the user opts into automated review. Also run directly: /embla-core:pipeline
  (setup) or /embla-core:pipeline check.
---

# embla-core:pipeline — Pipeline Setup

Sets up `bitbucket-pipelines.yml` and `.mcp.json` for automated AI PR review and, optionally,
the `ai-develop` custom pipeline for autonomous Jira-triggered development.
Reads credentials and project details from local settings and `embla.json` before prompting for anything.

## Scope note

This skill owns `bitbucket-pipelines.yml`. If a developer wants to add a pre-merge
check this skill doesn't yet automate (unit tests, security scans, linting, etc.),
say so plainly before helping them wire it up manually — today only the AI PR
review step and the `ai-develop` custom pipeline are automated here.

## Invocation

```
/embla-core:pipeline              → setup (default)
/embla-core:pipeline setup        → explicit setup
/embla-core:pipeline check        → inspect existing files, report status
```

---

## setup

**Before running any phase**, check that `.claude/embla.json` exists. If not, stop:
```
No embla.json found. Run /embla-core:config first.
```

Check `embla.json → repo.provider`. If not `bitbucket`, stop:
```
This skill currently supports Bitbucket only.
```

### Phase 0 — Local Pipeline Discovery

Runs before Phase 1. Determines `base_pipeline` — the starting point for all merge operations. Scans the local project only — this skill does not query Bitbucket for the pipeline file; only the working directory's own `bitbucket-pipelines.yml` is considered.

Read `bitbucket-pipelines.yml` from the project root.
- Found → `base_pipeline` = file contents; print: `"Found existing bitbucket-pipelines.yml — adding AI PR Review step without modifying existing steps."`
- Not found → `base_pipeline = new`; print: `"No existing bitbucket-pipelines.yml found. Creating from scratch."`

All subsequent phases operate on `base_pipeline`. Never re-read the file from disk mid-flow — operate on the in-memory value captured here.

**Self-hosted runner detection:**

Skip this step if `base_pipeline = new`.

Scan `base_pipeline` for top-level `options → runs-on` containing `self.hosted`. Our new step declares no `runs-on` of its own, so it only inherits self-hosted execution via this pipeline-wide default — other steps' individual `runs-on:` values can't affect it and are not scanned. If found, read [references/pipeline-runner-detection.md](references/pipeline-runner-detection.md) and follow all steps there to resolve the Docker image to use. If not found, use `node:24` unchanged.

**ai-develop custom pipeline discovery:**

Skip this step if `base_pipeline = new` — a fresh file trivially has no `custom:` block yet.

Scan `base_pipeline` for a top-level `pipelines: custom: ai-develop:` block, independent of the `pull-requests:` scan Phase 2 uses for the `AI PR Review` step — the two live under separate top-level keys and either can exist without the other. Track the result as a second boolean, `ai_develop_present`, alongside the existing `AI PR Review` step presence check.
- Found → `ai_develop_present = true`; print: `"Found existing ai-develop custom pipeline."`
- Not found → `ai_develop_present = false`

Phase 2.5 below consults `ai_develop_present` to decide whether the new `ai-develop` prompt writes a fresh block or reports it as already present — mirroring how the `AI PR Review` step already stops setup when that step exists.

### Phase 1 — Silent Data Gathering

Before writing or prompting for anything, silently read `.claude/embla.json` only. Do not read `~/.claude.json` or `~/.claude/settings.json` for this — user-level Claude Code config is intentionally out of scope here. The variable checklist printed in Phase 3 already tells the developer exactly which credentials to enter manually, so there's no benefit to sourcing identity fields from whatever happens to be configured on this machine, and doing so risks suggesting a value is "handled" when the pipeline (running in a clean container) will never see it.

| Value needed | Source | Fallback |
|---|---|---|
| `BITBUCKET_URL` | `embla.json → repo.url` | Prompt user |
| `BITBUCKET_WORKSPACE` | `embla.json → repo.workspace` | Prompt user |
| `ATLASSIAN_SITE_NAME` | Derive from `embla.json → tracker.jira.siteUrl` (strip `https://` and `.atlassian.net`) | Prompt user |
| `BITBUCKET_USERNAME` | — (no `embla.json` field) | Prompt user |
| `BITBUCKET_EMAIL` | — (no `embla.json` field) | Prompt user |

`embla.json → repo.provider` confirms Bitbucket (see the check at the top of `setup`).

`BITBUCKET_API_TOKEN`/`ATLASSIAN_API_TOKEN` are intentionally absent from the table above — they're set directly as Bitbucket repo variables, never resolved from `embla.json`.

After gathering, print a resolution summary. Show the actual resolved value for non-secret fields (they're safe to display and useful for the user to sanity-check); never print a token value even if one happened to be found:
```
Auto-resolved:
  ✓ BITBUCKET_URL        https://bitbucket.org  (from embla.json)
  ✓ BITBUCKET_WORKSPACE  emblaftdev             (from embla.json)
  ✓ ATLASSIAN_SITE_NAME  emblaftdev             (from embla.json)
  ⚠ BITBUCKET_USERNAME   not auto-resolved — enter below
  ⚠ BITBUCKET_EMAIL      not auto-resolved — enter below
  ⚠ BITBUCKET_API_TOKEN  not auto-resolved — set directly in Bitbucket pipeline variables
  ⚠ ATLASSIAN_API_TOKEN  not auto-resolved — set directly in Bitbucket pipeline variables
```

For any non-secret value not resolved from `embla.json`, prompt the user before proceeding.

### Phase 2 — Generate Files

Read the templates from [references/pipeline-templates.md](references/pipeline-templates.md) before writing.

**`bitbucket-pipelines.yml`** — follow the merge rules in `pipeline-templates.md`, operating on `base_pipeline` as resolved in Phase 0. Compute the full merged result in memory first, write it to disk, then print what was written:
```
Wrote bitbucket-pipelines.yml:

<full file contents>
```

No confirmation gate — the developer already opted into this by running `/embla-core:pipeline`, and the write only touches the local working tree; this skill never pushes, so any issue is trivially reversible with `git diff` / `git checkout` before it's committed. YAML indentation is sensitive, so review the printed output; if changes are needed, edit the file manually and run `/embla-core:pipeline check` to verify.

**`.mcp.json`** — follow the merge rules in `pipeline-templates.md`. No confirmation gate needed for `.mcp.json` (it is always a clean JSON merge of well-defined server blocks).

When writing `.mcp.json`:
- `mcp-template.json` is a **two-block catalogue**, not a single verbatim file to copy whole. When `.mcp.json` does not exist yet, this phase writes only the `bitbucket` block from it — never the `atlassian` block, even for a brand-new file. The `atlassian` block is only ever added by Phase 2.5's `yes` path (see below), whether `.mcp.json` is new or pre-existing. A repo that only ever opts into `AI PR Review` ends up with a `bitbucket`-only `.mcp.json`.
- Write all `${VAR_NAME}` tokens exactly as shown in the template. Do NOT substitute resolved values from `settings.json`. These are canonical variable names users must set in Bitbucket pipeline variables.
- The `bitbucket` server's `ATLASSIAN_API_TOKEN` maps to `${BITBUCKET_API_TOKEN}` (Bitbucket App Password) — that key name is what the package expects, despite the value being a Bitbucket credential. `AI PR Review` itself needs no `atlassian`/Jira server: its pipeline step pre-fetches the Jira issue with `curl` instead. `ATLASSIAN_API_TOKEN` and `ATLASSIAN_SITE_NAME` are still required Bitbucket variables — the wrapper uses them for that fetch — they just never reach an MCP server for that step. (The `atlassian` server block exists for the separate `ai-develop` pipeline — see Phase 2.5.) See `pipeline-templates.md` for why.

### Phase 2.5 — ai-develop Custom Pipeline (opt-in)

Runs after Phase 2 finishes writing (or skipping) the `AI PR Review` step — this prompt is independently answerable regardless of that outcome; a developer may run this skill purely to add `ai-develop` to a repo that already has `AI PR Review`, or want `ai-develop` without `AI PR Review` at all.

Prompt:
```
Set up the ai-develop pipeline for autonomous Jira-triggered development? (yes / skip)
```

**`skip`** → print `"Skipped. Run /embla-core:pipeline setup again any time to add this."` and continue to Phase 3. No files are touched by this path — in particular, `.mcp.json` never gets an `atlassian` block this way.

**`yes`**:

1. If `ai_develop_present` (from Phase 0) → print `"ai-develop pipeline already present — no changes made."` and continue to Phase 3. Do not re-write `bitbucket-pipelines.yml` or touch `.mcp.json`.
2. Otherwise, read the exact content from [references/bitbucket-pipelines-ai-develop-template.yml](references/bitbucket-pipelines-ai-develop-template.yml) — copy it verbatim, do not retype it from memory.
3. Merge the `custom:` block into `base_pipeline`:

   | What exists in `base_pipeline` | Action |
   |---|---|
   | A `custom:` key already exists (any other custom pipeline present) | Add `ai-develop:` alongside the existing entries — never replace or remove another custom pipeline |
   | No `custom:` key exists | Add `pipelines: custom:` fresh, with `ai-develop:` as its only entry |

4. Compute the full merged result in memory, write it to disk, then print what was written, same pattern as Phase 2:
   ```
   Wrote bitbucket-pipelines.yml (ai-develop):

   <full file contents>
   ```
5. Add the `atlassian` server block from [references/mcp-template.json](references/mcp-template.json) to `.mcp.json` — merge rule: only if missing, never overwrite an existing `atlassian` block. **This is the only path in this skill that ever adds the `atlassian` block.** A repo that answers `skip` above — including one that only ever runs `setup` for `AI PR Review` — never gets it; `.mcp.json` stays `bitbucket`-only for that repo.
6. Print an updated variable checklist. Before treating `ATLASSIAN_SITE_NAME`/`ATLASSIAN_API_TOKEN` as new asks, check whether Phase 1 already resolved or prompted for them in this same run — same silent-reuse pattern Phase 1 already applies to its own fields — since both are already required by `AI PR Review`'s Jira pre-fetch and are simply consumed differently here (a live MCP server instead of a `curl` call):
   ```
   ai-develop requires these additional Bitbucket pipeline variables (beyond the checklist above):
   ┌─────────────────────────────────┬──────────┬──────────────────┬────────────────────────────────────┐
   │ Variable                        │ Required │ Suggested value  │ Notes                              │
   ├─────────────────────────────────┼──────────┼──────────────────┼────────────────────────────────────┤
   │ JIRA_ISSUE_KEY                   │ ✅       │ —                │ Supplied at trigger time (Jira automation rule or manual run) — not entered here │
   │ COMMENTER_ACCOUNT_ID             │ optional │ —                │ Atlassian account id of whoever triggered the run; may be blank — develop-auto handles a blank value │
   │ SPRINT_NUMBER                    │ ✅       │ —                │ Required — the pipeline checks out the default branch, which carries no sprint prefix, so develop-auto falls back to this variable for its branch name │
   │ ATLASSIAN_SITE_NAME              │ ✅       │ <resolved/—>     │ Already required by AI PR Review — reused as-is, now also read by the atlassian MCP server │
   │ ATLASSIAN_API_TOKEN              │ ✅       │ set manually     │ Already required by AI PR Review — reused as-is, now also read by the atlassian MCP server │
   └─────────────────────────────────┴──────────┴──────────────────┴────────────────────────────────────┘

   Mark all as "Secured" that could contain sensitive data — none of these five are secrets on their own, but Bitbucket masking is cheap insurance.
   ```

### Phase 3 — Completion Output

After writing both files, print:
```
✅ bitbucket-pipelines.yml written
✅ .mcp.json written
```

If `base_pipeline` was `new` (no local file existed before setup), also print:
```
Note: this is a new bitbucket-pipelines.yml. Commit it and merge to your default branch for the pipeline to take effect.
```

Then print the variable checklist from [references/pipeline-variables.md](references/pipeline-variables.md).

---

## check

Read existing `bitbucket-pipelines.yml` and `.mcp.json` and report whether each required element is present.

**`bitbucket-pipelines.yml` checks:** don't maintain a hardcoded list of expected lines in this skill — every prior version of this checklist that enumerated specific flags by name eventually drifted out of sync with the template (concretely: it happened once already, when a checklist written before the `Report Review Cost` step's diagnostic-message line was added didn't get updated, and a repo's generated file silently missed it). Diff mechanically instead, so new template lines are caught automatically without anyone remembering to add a bullet here:

1. File exists
2. Parse both the user's `bitbucket-pipelines.yml` and the canonical [references/bitbucket-pipelines-template.yml](references/bitbucket-pipelines-template.yml) as YAML — not regex or raw text matching. Indentation or quoting differences that don't change the parsed structure are never drift.
3. For the canonical step (`AI PR Review` — there is only one now) under `pull-requests: '**':`, find the step in the user's file with the matching `name`. Missing entirely → flag `"AI PR Review step missing"` and skip the remaining checks (nothing to diff against). If the user's file has a step named `AI PR Review` *and* a separate step named `Report Review Cost`, that's the old two-step template — flag it explicitly: `"Found the old two-step template (AI PR Review + Report Review Cost) — this has been replaced by a single AI PR Review step. Re-running setup won't help here (it stops immediately because an AI PR Review step already exists) — apply the new template manually."` rather than diffing the old `Report Review Cost` step against nothing.
4. For a step that is present, compare structurally, not just flag-by-flag presence:
   - `image`, `clone` — flag if the parsed values differ. `clone: false` vs. the canonical `clone: { depth: full }` is exactly this kind of drift, and matters beyond cosmetics — a bare boolean fails Bitbucket's own schema validation ("This section should be a map")
   - `script` — walk the canonical `script:` list top to bottom. Each entry (a one-line command, or a multi-line `|` block) is one unit. For each, find its counterpart in the user's `script:` list by matching a distinguishing substring from early in the entry (e.g. `su claudeuser -c`, `set -e`, `apt-get remove`) — don't require exact whole-entry equality just to locate the match, or a one-word edit gets reported as "missing" instead of "modified". Once matched, report exactly one of: **missing** (no corresponding entry at all), **modified** (a corresponding entry exists but its content differs — show both versions so the fix is copy-pasteable), or, for anything in the user's `script:` with no canonical counterpart, **extra** (note it, don't flag it as wrong — it may be an intentional customization)
5. For the `git -C /tmp/plugins checkout <commit>` pin specifically: flag it as **modified** if the commit differs from canonical, never just "present" — a stale pin is a silent security regression, not cosmetic drift (see "Updating the pinned plugin commit" in `pipeline-templates.md`).
6. For every **missing** or **modified** item found, cite the matching bullet from `pipeline-templates.md`'s "Why this step exists" section as the reason it matters — do not re-derive or duplicate that rationale here. If a drifted line genuinely has no matching bullet yet (the template moved faster than its own docs), still report the drift rather than skipping it for lack of a citation.

**`ai-develop` custom pipeline check:** unlike `AI PR Review`, `ai-develop` is opt-in — its absence is never drift, since a repo may deliberately run this skill for `AI PR Review` only (or for neither, mid-`setup`). Only run this check if the user's `bitbucket-pipelines.yml` has a `pipelines: custom: ai-develop:` block at all.

1. Not found → skip this check entirely; print nothing for it, and never report it as missing.
2. Found → parse the user's `ai-develop:` block and the canonical [references/bitbucket-pipelines-ai-develop-template.yml](references/bitbucket-pipelines-ai-develop-template.yml) as YAML, then diff structurally using the exact same mechanical algorithm as the `AI PR Review` check above — not a separate, hand-rolled comparison:
   - `image`, `clone` — flag if the parsed values differ
   - `script` — match each canonical entry to its counterpart in the user's `script:` list by a distinguishing substring, then report exactly one of **missing** / **modified** / **extra** per entry, same as above
   - `git -C /tmp/plugins checkout <commit>` — flag as **modified** (never just "present") if the pinned commit differs from canonical — same pin, same security reasoning, shared with `AI PR Review`; see "Updating the pinned plugin commit" in `pipeline-templates.md`
3. For every **missing** or **modified** item found, cite the matching bullet from `pipeline-templates.md`'s "`bitbucket-pipelines-ai-develop-template.yml` Template" → "Why this step exists (differences from the bitbucket-pipelines.yml / AI PR Review template)" section.

**`.mcp.json` checks (in order):**
1. File exists
2. Valid JSON
3. `bitbucket` server present
4. `atlassian` server — expected presence depends on whether the `ai-develop` check above found a custom pipeline step in the user's `bitbucket-pipelines.yml`:
   - `ai-develop` step present → `atlassian` server should also be present. Missing → flag: `"atlassian (Jira) MCP server missing — required by the ai-develop pipeline step, which needs a live Jira MCP server across the whole autonomous-dev session (not the one-shot curl pre-fetch AI PR Review uses). Add the block from references/mcp-template.json, or run /embla-core:pipeline setup and answer yes to the ai-develop prompt."` Present → pass.
   - `ai-develop` step absent → `atlassian` server should be absent — `AI PR Review` alone never uses it (Jira is pre-fetched by that step's own `curl` call). Present → flag: `"atlassian (Jira) MCP server present — not used by AI PR Review (Jira is pre-fetched by that step instead), and this repo has no ai-develop step. This server adds five unused tool schemas to every review context. Remove the 'atlassian' block from .mcp.json, or run /embla-core:pipeline setup and opt into ai-develop if you do want it."` Absent → pass.

Print a table for each check — for `script:` drift, report missing / modified / extra per the algorithm above, not a flat present/missing line per named flag. Example output:
```
Pipeline configuration check:

bitbucket-pipelines.yml
  ✅ AI PR Review step present
  ✅ image, clone match canonical
  ❌ script: MISSING — no entry corresponds to the trap-based reporting block

     Canonical (no corresponding entry found in the installed file):
       trap 'RC=$?; FAIL_CMD="$BASH_COMMAND"; FAIL_LINE="$LINENO"; on_error "$RC"' ERR
       ...

     Why: without this, a setup failure (npm install, git clone, useradd) kills the
     step with no synthesized explanation anywhere — there's no second step left to
     report it. See pipeline-templates.md → "Why this step exists".

.mcp.json
  ✅ File exists
  ✅ bitbucket server present
  ✅ no atlassian server (no ai-develop step — not needed)

1 issue found. Fix the issues above manually, then run /embla-core:pipeline check again to verify.
```

When the user's `bitbucket-pipelines.yml` also has an `ai-develop` custom pipeline step, print a second block right after the `AI PR Review` results, same format, and adjust the `.mcp.json` `atlassian` line accordingly:
```
pipelines: custom: ai-develop
  ✅ image, clone match canonical
  ❌ script: MODIFIED — pinned plugin commit differs from canonical

     Installed: git -C /tmp/plugins checkout 1a2b3c4
     Canonical: git -C /tmp/plugins checkout 3878e57bfea98e68f50432090563311a7d303ae9

     Why: an unpinned/stale commit lets a later push to embla-claude-plugins silently
     change what this pipeline executes on its next run. See pipeline-templates.md →
     "Updating the pinned plugin commit".

.mcp.json
  ✅ atlassian server present (required by ai-develop)
```

If all checks pass:
```
Pipeline is correctly configured. No action needed.
```

---

## Error Handling

| Situation | Action |
|---|---|
| `embla.json` missing | Stop: "No embla.json found. Run /embla-core:config first." |
| `embla.json → repo.provider` not `bitbucket` | Stop: "This skill currently supports Bitbucket only." |
| `embla.json` has no value for a given field | Prompt the user for it; list any still-unresolved vars in the checklist |
| `bitbucket-pipelines.yml` exists, AI review step already present | Skip. Print: "AI PR Review step already present — no changes made." |
| `ai-develop` custom pipeline already present | Skip. Print: "ai-develop pipeline already present — no changes made." |
| `.mcp.json` exists but invalid JSON | Stop: "Cannot parse existing .mcp.json — fix manually before retrying." |
| `.mcp.json` servers already present | Skip those servers; print which were skipped |
| File write fails | Report error; do not print ✅ |
| `repo.url` missing from `embla.json` | Prompt: "What is your Bitbucket base URL? (e.g. https://bitbucket.org)" before writing |
| Self-hosted runner detected, user enters blank image name twice | Fall back to `node:24`; print: "Falling back to node:24." |
