# Bitbucket host notes

Host-specific facts for `setup` and `check` when `repo.provider` is `bitbucket`. Rationale for every line of `template.yml` lives in `pipeline-rules.md` under the cited rule ID.

## Contents
- Files
- Phase 0 discovery
- Merge rules
- Check specifics
- Bitbucket-specific gotchas
- Updating the pinned plugin commit

## Files

| Canonical | Written to | How |
|---|---|---|
| `template.yml` | `bitbucket-pipelines.yml` (repo root) | Merged per "Merge rules" below |
| `mcp.json` | `.mcp.json` (repo root) | Server block added only if the `bitbucket` key is missing |
| `tools.json` | `.claude/pr-review-tools.json` | Written with `tracker` set for this project; an existing file is left unchanged and reported |
| `variables.md` | printed | Checklist with tracker rows appended |

Built-in variables the template relies on: `BITBUCKET_PR_ID`, `BITBUCKET_REPO_SLUG`. Secret store: Repository settings → Pipelines → Repository variables, "Secured".

## Phase 0 discovery

Read `bitbucket-pipelines.yml` from the project root (the working directory only; never fetch it from Bitbucket).
- Found → `base_pipeline` = its contents; print `Found existing bitbucket-pipelines.yml — adding AI PR Review step without modifying existing steps.`
- Not found → `base_pipeline = new`; print `No existing bitbucket-pipelines.yml found. Creating from scratch.`

When `base_pipeline` is not `new`:
- **Self-hosted runner:** if top-level `options → runs-on` contains `self.hosted`, follow `pipeline-runner-detection.md` to resolve the step image. Only the pipeline-wide default matters: our step declares no `runs-on` of its own.
- **ai-develop:** set `ai_develop_present` = whether a top-level `pipelines: custom: ai-develop:` block exists. Print `Found existing ai-develop custom pipeline.` when it does.

Every later step operates on the in-memory `base_pipeline` captured here.

## Merge rules

`base_pipeline = new` → write the template as is (after tracker substitution and image resolution).

Otherwise (P1, P2):
1. A step named `AI PR Review` exists → stop: `AI PR Review step already present — no changes made.` A repo on the old two-step template (with a `Report Review Cost` step) also stops here; `check` detects it and explains the migration.
2. List every other step name under `pull-requests:` and ask, without guessing from names or scripts:
   ```
   Existing pull-request pipeline steps: {step names, or "none"}.
   Does any of these already run a code/PR review? Proceed with adding AI PR Review anyway? (yes / cancel)
   ```
   `cancel` → stop: `Cancelled. No files were changed.`
3. Insert:

   | What exists in `base_pipeline` | Action |
   |---|---|
   | `pull-requests:` with `'**':` | Append our step as the last step under `'**':` |
   | `pull-requests:` with only named patterns | Add a `'**':` block with our step after them |
   | `pull-requests:` empty | Add a `'**':` block with our step |
   | No `pull-requests:` | Append the full `pull-requests:` block at the end of `pipelines:` |

## Check specifics

- Compare the user's step named `AI PR Review` under `pull-requests: '**':` with the canonical step, after applying the project's tracker substitution to the canonical.
- `image`, `clone`: flag when the parsed values differ. `clone: false` instead of `clone: { depth: full }` fails Bitbucket's own schema ("This section should be a map").
- A step named `AI PR Review` alongside one named `Report Review Cost` is the old two-step template. Report: `Found the old two-step template (AI PR Review + Report Review Cost) — replaced by a single AI PR Review step. setup stops when an AI PR Review step exists, so apply the new template manually.`
- A clone from `bitbucket.org/emblaftdev/embla-claude-plugins.git` or a credential helper on the clone is S2 drift: report the canonical GitHub clone line as the fix, and note `BITBUCKET_USERNAME` can then be removed unless ai-develop uses it.

## Bitbucket-specific gotchas

- REST Basic auth uses `$BITBUCKET_EMAIL`, not a username: an account handle fails with `"API token must be used with an atlassian registered email"`.
- The `bitbucket` MCP server expects the token under the key `ATLASSIAN_API_TOKEN`; it is mapped to `${BITBUCKET_API_TOKEN}`, a Bitbucket credential despite the key name.
- A step's `script:` list runs as one shell session, which R1 relies on.
- No `artifacts:` key: there is one step, so `report_and_exit` reads `docs/reviews/*` off the same filesystem `pr-review` wrote them to.
- Bitbucket's markdown auto-links long digit runs as commit hashes, which R6's code spans prevent.

## Updating the pinned plugin commit

`git -C /tmp/plugins checkout <commit>` pins every host's template, because the plugin repo has no version tags. When a change to `plugins/embla-core/skills/pr-review/**`, `agents/**`, or anything else `--plugin-dir` loads should reach pipelines:

1. Get the new commit: `git ls-remote https://github.com/EmblaTech/claude-plugins.git main`.
2. Update the pin in `hosts/bitbucket/template.yml` and every other `hosts/*/template.yml` in the same PR. This only affects future `setup` runs; `check` compares generated hosts' S2 pin against the Bitbucket template.
3. Existing consumers keep their pin (`setup` stops when the step exists). `/embla-core:pipeline check` reports the stale pin as **modified**; each repo updates its pipeline file by hand.

The ai-develop template carries an independent pin and still clones from Bitbucket; bump it only for `develop-auto` changes (see `ai-develop-notes.md`).
