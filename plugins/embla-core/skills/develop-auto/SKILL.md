---
name: develop-auto
description: >
  Non-interactive counterpart to embla-core:develop, invoked headless by the ai-develop
  Bitbucket pipeline when a Jira comment tags @Claudedev. Fetches the story, implements it,
  and opens a PR with no human interaction — every gate that develop asks a question at is
  replaced by a fixed default or an abort-with-Jira-comment. Never invoke interactively;
  this skill assumes it is running unattended in CI.
---

# embla-core:develop-auto — Headless Developer Workflow

Same start-of-development work as `embla-core:develop`, unattended. **Governing rule:** every
gate `develop` asks a question at is replaced here by a fixed default or an abort. Steps 1–8
run end to end, nothing deferred, no human to ask mid-run.

## Invocation
`/embla-core:develop-auto EM-1234 [commenter_account_id] [sprint_number]`

- **Jira key** (required). Missing/malformed → no Jira comment (no confirmed ticket to comment
  on), but still use the Write tool to create `docs/reviews/develop-auto-result.json`:
  `{"outcome": "aborted", "reason": "missing or malformed Jira key", "exit_code": 1}` — same
  reasoning as the Abort Pattern above; without this file the CI wrapper has no way to tell this
  case apart from a successful run.
- **Commenter account ID** (optional) — used in Step 2; absent → skip assignment.
- **Sprint number** (optional) — last-resort override for Step 4; the ticket's own sprint field
  wins whenever it's present.

Resolve the target repository, Jira site URL, and the branch-name format once at the start from
this project's config, falling back to git/tooling defaults where the config is silent.
Repository unresolved → abort (reason: can't resolve the repo to work in; resolution: set it in
config). A missing Jira site URL is not fatal — the PR's Jira line just falls back to the bare
ticket ID.

Carry each step's output forward by name (ticket data, complexity, branch_name,
dev_plan_path, pr_url) instead of re-deriving it later.

## Abort Pattern (canonical — every "abort" below means this, once, defined here)
Post a comment on the Jira ticket: "Autonomous dev run aborted: `<reason>`. `<detail, if any>`
A human needs to `<resolution>` before requesting another automated run. 🤖 Crafted by Claude AI."
Never spell out the automation trigger tag inside a posted comment — the Jira automation that
starts this pipeline fires on any comment containing it, so echoing it back here would
re-trigger a run and loop. Then use the Write tool to create `docs/reviews/develop-auto-result.json`:
```json
{"outcome": "aborted", "reason": "<reason>", "exit_code": 1}
```
This file is what tells the CI wrapper the run actually failed — the `claude` process's own exit
code only reflects harness completion, not this conclusion, so it can't carry this signal alone.

"Log and skip" / "log and continue" is not an abort — note it for the audit trail and keep
going. Only a step that names "abort" stops the run.

## Step 1 — Fetch and Analyze
Subagent (default model): fetch the ticket's full details from the tracker, in plain-text form
rather than the rich/ADF document format. Report back the summary, description, issue type,
status, labels, acceptance criteria if the project tracks it as its own field (else the spec
gets derived from the description alone, later), a complexity rating (Simple/Medium/Complex —
from a label if the project uses them, else inferred), the ticket's own sprint number if it
carries one, and its subtasks (if any).

Fetch failure → log it, no comment — there's no confirmed ticket to comment on yet — but still
write `docs/reviews/develop-auto-result.json` (`{"outcome": "aborted", "reason": "ticket fetch
failed", "exit_code": 1}`), same as above.

## Step 2–3 — Assignment & Transition
Assign the ticket, and any subtasks it has, to the commenter account if one was given;
otherwise fall back to a bot account named "Claude"; if neither resolves, log and proceed
unassigned — `develop`'s "all/pick/skip" prompt collapses to "all" here, no one to ask.

Transition the ticket to an in-progress-equivalent status; no matching status → log the
available options and proceed untransitioned.

## Step 4 — Branch Creation
Map the issue type to a branch flavor (feature-shaped vs. bug-shaped); anything else → abort
(reason: unrecognized issue type; resolution: resolve manually). Name it per this project's
branch conventions (config, CLAUDE.md).

Pick the sprint number from the first source that has one: the current branch's prefix, then
the ticket's own sprint, then the invocation argument. None present → abort (reason: no sprint
number determinable; resolution: assign a sprint or pass one explicitly).

Generate the branch name deterministically — no proposal or confirmation step. This pipeline
runs from a fresh clone, so check the *remote* for a name collision (a prior run's local branch
wouldn't be visible otherwise); a collision, remote or local → abort (reason: branch already
exists — likely a repeat run or a naming clash; resolution: resolve manually). Only then create
the branch.

## Step 5a — Planning Decision & Dispatch
Complex tickets → dispatch a subagent on a stronger model for the implementation approach, the
files to touch and why, and the edge cases/risks — state assumptions rather than asking, since
there's no one to ask. Medium/Simple/Bug tickets → skip the subagent and write those same three
sections directly from what Step 1 already gathered.

## Step 5b — Write & Commit Dev Plan
Always runs — it's the audit-trail stand-in for the human brainstorm either way. Write a dev
plan file capturing approach, files to change and why, and edge cases/risks, then commit it
with a conventional commit scoped to the ticket.

## Step 5c — TDD Detection & Implementation
Always runs, no gate — only the test-framework choice is open, and there's no "ask" fallback
for it. Infer the framework from the project's existing tests or tooling config; nothing
detectable → abort (reason: no test framework detectable and TDD is required; resolution:
specify one or add initial scaffolding).

Dispatch a subagent to run the full red/green/refactor cycle against the acceptance criteria
(or the description, if that's all there is) plus the dev plan's approach and file list. Report
back the changed files.

## Step 6 — Commit
Subagent (default model): review the working changes, draft a conventional commit scoped to
the ticket per this project's commit conventions (config, CLAUDE.md), and commit directly — no
confirmation.

## Step 7 — Completion Check & PR Creation
No conversational finishing step — there's no one to converse with. Instead: run the project's
test suite and read the result.

Failing → abort (reason: tests failed after implementation; detail: the failure output;
resolution: investigate) — no PR opened. Passing but with leftover uncommitted changes → commit
the remainder (Step 6's process), then proceed. Passing and clean → push the branch and open a
pull request: title referencing the ticket and summary, description covering the change, a
Jira link (or the bare ticket ID if the site URL never resolved), and a note that automated
tests passed. Push or PR-creation failure → abort (reason: tests passed but the push/PR
creation failed; detail: the error output; resolution: investigate) — the PR URL stays unset
and Step 8 never runs.

## Step 8 — Final Jira Transition & Success Comment
Look up the ticket's available transitions and move it to an in-review-equivalent status,
falling back to a "Done"-equivalent if none is configured for this project. No match either
way → log and proceed untransitioned — a successful PR isn't worth aborting over.

Regardless of the transition outcome, comment on the ticket with a success message and the PR
link. A failure here also just logs and continues — the PR already exists.

Then use the Write tool to create `docs/reviews/develop-auto-result.json`:
```json
{"outcome": "success", "pr_url": "<url>", "exit_code": 0}
```
Same reasoning as the Abort Pattern: this file, not the `claude` process's own exit code, is what
tells the CI wrapper the run actually succeeded.
