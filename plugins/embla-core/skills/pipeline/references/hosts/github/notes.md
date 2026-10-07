# GitHub host notes

Host-specific facts for `setup` and `check` when `repo.provider` is `github`. Rationale for every line of `template.yml` lives in `pipeline-rules.md` under the cited rule ID; this file covers only what differs from Bitbucket.

## Contents
- Files
- Host rules
- Phase 0 discovery
- Merge rules
- Tracker substitution
- Check specifics
- Why reads are partly files and writes are outbox
- Verified facts

## Files

| Canonical | Written to | How |
|---|---|---|
| `template.yml` | `.github/workflows/ai-pr-review.yml` | A whole workflow file of our own (see "Merge rules") |
| `mcp.json` | `.mcp.json` (repo root) | Server block added only if the `github` key is missing |
| `tools.json` | `.claude/pr-review-tools.json` | Written with `tracker` set for this project; an existing file is left unchanged and reported |
| `variables.md` | printed | Checklist with tracker rows appended |

Built-in values the template relies on: `github.event.pull_request.number`, `github.event.pull_request.head.sha` (the PR head, not `GITHUB_SHA`, which is the merge commit), `github.repository`, `secrets.GITHUB_TOKEN`. Secret store: Settings → Secrets and variables → Actions.

## Host rules

**GH1** The workflow triggers on `pull_request` only, never `pull_request_target`.
- Verify: `on:` has `pull_request` and no `pull_request_target`.
- Why: `pull_request_target` runs with a write token and secrets on fork code. On `pull_request` a fork PR gets a read-only token and no secrets, so a fork run fails cleanly (R3) and leaks nothing.

**GH2** The workflow uses the built-in `GITHUB_TOKEN` with `permissions: { contents: read, pull-requests: write }` and no other permission.
- Verify: a top-level `permissions:` block with exactly those two keys; no job-level `permissions:` widening it. Any permission not listed becomes `none`.
- Why: `pull-requests: write` covers both review comments and PR (issue) comments; nothing broader is needed (C4).

**GH3** Everything from the trap (R1) to `report_and_exit` runs in one `run:` step with `shell: bash`.
- Verify: a single step holds the whole script.
- Why: every Actions step starts a fresh shell, so a trap or function from an earlier step never covers a later one; the default container shell is `sh`, which lacks `PIPESTATUS` and `${VAR@Q}`.

## Phase 0 discovery

Read `.github/workflows/ai-pr-review.yml`.
- Found → `base_pipeline` = its contents; print `Found existing .github/workflows/ai-pr-review.yml.`
- Not found → `base_pipeline = new`; print `No AI PR Review workflow found. Creating .github/workflows/ai-pr-review.yml.`

Also list other files in `.github/workflows/` whose jobs are named `AI PR Review` or invoke `embla-core:pr-review`; a match counts as our job already existing (P2).

## Merge rules

Our job lives in its own workflow file, so no existing workflow is ever edited (P1).
1. Our job already exists (Phase 0) → stop: `AI PR Review workflow already present — no changes made.` (P2)
2. List the other workflows that trigger on `pull_request` and ask, without guessing from names:
   ```
   Existing pull-request workflows: {file names, or "none"}.
   Does any of these already run a code/PR review? Proceed with adding AI PR Review anyway? (yes / cancel)
   ```
   `cancel` → stop: `Cancelled. No files were changed.`
3. Write `template.yml` to `.github/workflows/ai-pr-review.yml`.

## Tracker substitution

The template has two marker pairs:
- `# >>> tracker pre-fetch` … `# <<< tracker pre-fetch` inside `run:` — replace the line between them with the tracker block's **body** (the lines under its `- |`), at the `run:` script indentation.
- `# >>> tracker env` … `# <<< tracker env` inside the step's `env:` — add the tracker's variables. For Jira:
  ```yaml
  ATLASSIAN_API_TOKEN: ${{ secrets.ATLASSIAN_API_TOKEN }}
  ATLASSIAN_SITE_NAME: ${{ vars.ATLASSIAN_SITE_NAME }}
  ATLASSIAN_USER_EMAIL: ${{ vars.ATLASSIAN_USER_EMAIL }}
  ```

## Check specifics

- Compare the job `ai-pr-review` in the user's workflow with the canonical, after tracker substitution.
- Wrapper keys to compare: `on`, `permissions`, `runs-on`, `container`, the checkout step (`fetch-depth: 0`), and the step's `shell` and `env`.
- Script units: the `run:` block is one string; split it into units at blank lines and at top-level commands, then apply the same missing/modified/extra matching as Bitbucket.
- Cite `GH1`–`GH3` for trigger, permissions, and single-step drift.

## Why reads are partly files and writes are outbox

The official server (`github/github-mcp-server` v2.0.0) shapes the profile:
- **`list_comments` → `files`.** Its comment reads split review threads (`get_review_comments`, with no numeric comment id) from general comments (`get_comments`), and an operation maps to one tool. Eligibility needs both, including the previous Review Report, so the D1 pre-fetch merges both REST lists into `pr-context.json`.
- **`post_inline_comment` and `post_comment` → `outbox`.** Inline comments are only possible through a pending review (`pull_request_review_write` → `add_comment_to_pending_review` → submit), which returns neither id nor URL, so `{{comment:N}}` links can't be filled. A report posted live while its inline comments wait in the outbox couldn't be linked either, so both writes go to the outbox and the pipeline posts them by REST (D2). The server runs `--read-only`, which also keeps M3 trivially true.
- **`get_pr`, `list_commits` → `mcp`** via `pull_request_read` (`method: get` / `get_commits`).

When a later server release returns ids and URLs for inline comments, move the writes to `mcp` and add the post tools to `agents/poster.md`'s `tools:`.

## Verified facts

Checked 2026-10-07 against the release and its source; re-verify when bumping the server.

| Fact | Value | Source |
|---|---|---|
| Server release | `v2.0.0` | https://github.com/github/github-mcp-server/releases |
| Linux x86_64 binary sha256 | `85eefe765c78a065bbd528dd6b680784d69f7f4bb84d89f258801968c83d7ff8` | `github-mcp-server_2.0.0_checksums.txt` in the release |
| Token env | `GITHUB_PERSONAL_ACCESS_TOKEN` (skips OAuth; M8) | README |
| Read-only / toolsets | `--read-only`, `--toolsets pull_requests` | README |
| Fork PRs | read-only `GITHUB_TOKEN`, no secrets | docs.github.com → Events that trigger workflows |

Not yet verified end-to-end (spec test 1): the server accepting the Actions `GITHUB_TOKEN` (`ghs_` installation token) for `pull_request_read`. If it fails, `pr-review` falls back to `pr-context.json` per read and notes it; to stop paying the server's start-up cost, set `get_pr` and `list_commits` to `files` and drop the `github` block.

To bump the server: update the version and checksum in `template.yml`, re-check the tool names and `fields` paths in `tools.json`, and update this table.
