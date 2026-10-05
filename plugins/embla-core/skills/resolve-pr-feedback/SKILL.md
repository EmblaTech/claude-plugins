---
name: resolve-pr-feedback
description: Use when a developer needs to work through open PR review comments after a rejection — loads comments from Bitbucket or a local review file, explains each issue at the flagged line, applies fixes with confirmation, commits, marks Bitbucket comments resolved, and reassigns Jira to the lead reviewer on completion.
---

## Invocation

```
/embla-core:resolve-pr-feedback <PR_ID>
```

If no PR_ID given: stop with error `"Error: PR ID required. Usage: /embla-core:resolve-pr-feedback <PR_ID>"`

---

## Runtime Resolution

Resolve all values at skill start. Never hardcode. Produce this table before proceeding:

| Value | How to resolve |
|---|---|
| Workspace | `git remote get-url origin` → parse org segment |
| Repository | `git remote get-url origin` → parse repo segment, strip `.git` |
| Jira issue key | Parse current branch `([A-Z]{2,})-\d+`; fallback: apply same regex to the PR source branch fetched in Phase 0; fallback: ask developer |
| Jira cloud ID | `.claude/embla.json → tracker.jira.cloudId` → `.claude/settings.json → jiraCloudId` — required, stop if both missing |
| Jira site URL | `.claude/embla.json → tracker.jira.siteUrl` → `.claude/settings.json → jiraSiteUrl` — required, stop if both missing |
| Lead account ID | `.claude/embla.json → reviewerAccountId` → `.claude/settings.json → reviewerAccountId` — if missing: ask developer for name → `lookupJiraAccountId` |
| Lead display name | `.claude/embla.json → reviewerDisplayName` → `.claude/settings.json → reviewerDisplayName` |
| In-review status | `.claude/embla.json → tracker.jira.statuses.inReview` → `.claude/settings.json → inReviewStatus` → `"In Review"` |

Do NOT ask the developer for any of these values unless the fallback chain is exhausted.

---

## Phase Structure

```
Phase 0  Verify branch — confirm working tree matches the PR's source branch
Phase 1  Ask source → load and sort open comments
Phase 2  Ask chunk size
Phase 3  Resolution loop — explain → fix? → diff → commit? → mark resolved
Phase 4  Completion — Jira transition + reassign to lead
```

---

## Phase 0 — Verify Branch

Fetch the PR to get its source branch:
```
mcp__bitbucket__bb_get
  path: /repositories/{workspace}/{repo}/pullrequests/{PR_ID}
```
Extract `source.branch.name` → `sourceBranch`.

Get the current branch: `git branch --show-current` → `currentBranch`.

If `currentBranch == sourceBranch`: proceed silently to Phase 1.

**If they differ**, fixes must not be applied on the wrong branch — a commit made anywhere else
won't attach to this PR. Ask:
```
⚠ You're on `{currentBranch}`, but PR #{PR_ID}'s source branch is `{sourceBranch}`.
Check out `{sourceBranch}` now? (yes / no)
```
- `no` → stop: `"Run 'git checkout {sourceBranch}' and re-run this skill."` Do not proceed to Phase 1.
- `yes` → run `git status --short` first:
  - **Clean:** `git checkout {sourceBranch}`, then proceed to Phase 1.
  - **Dirty:** ask a second time before touching anything:
    ```
    ⚠ You have uncommitted changes on `{currentBranch}`. Stash them before switching? (yes / cancel)
    ```
    - `cancel` → stop. Do not switch branches, do not stash.
    - `yes` → `git stash push -u -m "resolve-pr-feedback: auto-stash before checkout"`, then
      `git checkout {sourceBranch}`. Tell the developer the stash was created and how to restore
      it (`git stash pop`) once they're done.

Never check out a different branch without an explicit `yes` at each prompt above.

---

## Phase 1 — Load Comments

Ask:
```
Load review comments from:
  1 — Bitbucket PR #<PR_ID> (open inline comments)
  2 — Local file docs/reviews/pr-review-<PR_ID>.md
```

### If Bitbucket

```
mcp__bitbucket__bb_get
  path: /repositories/{workspace}/{repo}/pullrequests/{PR_ID}/comments
  queryParams: {"pagelen": "100"}
  jq: .values[] | select(.resolved == false) | {id: .id, file: (.inline.path // ""), line: (.inline.to // 0), body: .content.raw}
```

This fetches ALL unresolved comments (inline and general). Then:

**Primary parse** — for each comment whose body matches `[SEVERITY] file:line\n  description` (posted by the review skill):
- Extract `severity` from `[HIGH|MED|LOW]`
- Extract `file` and `line` from the pattern
- Extract `description` as the text after the newline, trimmed

**Fallback parse** — for comments that do NOT match the pattern (human reviewer comments or other tools):
- Use `file` and `line` from the Bitbucket inline metadata (already in the fetched object)
- Set `severity` to `"REVIEW"` (not HIGH/MED/LOW — shown to developer as-is)
- Use the raw `body` as `description`

Build list of `{comment_id, file, line, severity, description}` from both passes combined.

If the combined list is empty after filtering `resolved == false`: `"No open review comments found for PR #{PR_ID}."` — stop.

### If local file

Read `docs/reviews/pr-review-{PR_ID}.md`. Parse the `## Issues` section.

Each issue block has this structure (written by the `pr-review` skill):
```
### {agent-name}
- **{SEVERITY}** `{file}:{line}` — {description}
```

Optionally followed by:
```
status: fixed
commit: {hash}
```

Skip any block already tagged `status: fixed`.

Parse each remaining bullet into `{file, line, severity, description}`.

### Both cases

Sort: HIGH → MED → LOW → REVIEW.

Display:
```
Found {N} open review issues: {X} HIGH, {Y} MED, {Z} LOW, {W} REVIEW
```

Omit any severity bucket with count = 0.

If N = 0: `"No open review issues found for PR #{PR_ID}."` — stop.

---

## Phase 2 — Ask Chunk Size

```
How many issues do you want to work through at a time?
  1   — one at a time
  3   — in threes
  5   — in fives
  all — work through all issues individually without stopping between chunks
  or enter any number
```

Note: `all` still processes each issue individually (explain → fix? → commit?) — it does NOT bulk-commit everything. It only removes the chunk boundary pause.

Validate: positive integer or `all`. On invalid input, re-ask once then default to `1`.

Store as `chunk_size`.

---

## Phase 3 — Resolution Loop

Work through the sorted issue list in chunks of `chunk_size`. Any issues not yet reached when the developer types `done` are counted as **skipped** in the Phase 4 summary.

For each chunk:

### Step 1 — Explain

For each issue in the chunk, read the file at the flagged line (±10 lines for context).

Present as:
```
[{SEVERITY}] {file}:{line}
Cause: {plain-language explanation of why this is a problem — 1-2 sentences}
Fix:   {concrete description of what to change — 1-2 sentences}
```

When the description cites a CLAUDE.md rule, name the rule explicitly.

For `REVIEW`-severity issues (human reviewer comments without structured format): present the raw comment body as-is under `Comment:` instead of `Cause:/Fix:`.

### Step 2 — Fix?

```
Fix this? (yes / skip / defer)
```

- `yes` → apply the minimal edit that resolves the issue, show unified diff
- `skip` → move to next issue; issue stays open on Bitbucket / in local file; not revisited this session
- `defer` → add to deferred list shown at end; move to next issue
- `done` → all remaining unprocessed issues count as skipped; proceed to Phase 4

### Step 3 — Commit?

After showing diff:
```
Commit this fix? (yes / edit / discard)
```

- `yes` → commit with message:
  ```
  fix({JIRA-KEY}): resolve [{SEVERITY}] {file}:{line} — {short description}
  ```
- `edit` → developer edits the file manually; when ready type `ready` to re-show updated diff and re-prompt, or `cancel` to discard and treat as skipped
- `discard` → revert the change; treat as skipped

### Step 4 — Mark Resolved

**Bitbucket source:**

Resolve the thread:
```
mcp__bitbucket__bb_put
  path: /repositories/{workspace}/{repo}/pullrequests/{PR_ID}/comments/{comment_id}/resolve
```
- On 2xx: done.
- On non-2xx: surface the error to the developer — do not skip silently.

**Local file source:**

Update the issue block in `docs/reviews/pr-review-{PR_ID}.md`. Add these two lines immediately after the bullet line:
```
status: fixed
commit: {commit_hash}
```

### Progress Display

After each chunk:
```
Progress: {fixed} fixed, {skipped} skipped, {deferred} deferred, {remaining} remaining
```

---

## Phase 4 — Completion

Display summary:
```
Resolution complete
  Fixed:    {N}
  Skipped:  {N}
  Deferred: {N}

Deferred issues:
  [{SEVERITY}] {file}:{line} — {description}
```

Omit the deferred section if deferred = 0.

### Zero-fix guard

If fixed = 0 (nothing was committed):
```
No issues were fixed this session. Reassign to lead anyway? (yes / no)
```
- `no` → stop. Do not touch Jira.
- `yes` → proceed to HIGH issues guard.

### HIGH Issues Guard

If any HIGH issues remain (skipped or deferred):
```
{N} HIGH issue(s) are still open. Reassign to lead anyway? (yes / no)
```

- `no` → stop. Do not transition Jira. Tell developer to resolve remaining HIGH issues first.
- `yes` → proceed.

If no HIGH issues remain: proceed without prompting.

### Jira Actions

1. `getTransitionsForJiraIssue` → find transition matching `inReviewStatus` (case-insensitive).
   If not found: list available transitions and ask developer to pick.
2. `transitionJiraIssue`
3. `editJiraIssue` → `{ "fields": { "assignee": { "accountId": "{lead_account_id}" } } }`
4. Post general Bitbucket comment:
   ```
   mcp__bitbucket__bb_post
     path: /repositories/{workspace}/{repo}/pullrequests/{PR_ID}/comments
     body:
       content:
         raw: |
           🤖 resolve-pr-feedback: {N} issues fixed, Jira {ISSUE_KEY} → {inReviewStatus}, assigned to {lead_display_name}

           🤖 Crafted by Claude AI
   ```

**Output:**
```
✓ Jira {ISSUE_KEY}: → {inReviewStatus}
  Assigned to: {lead_display_name}
```

---

## Common Mistakes

| Mistake | Correct behaviour |
|---|---|
| Using `gh pr view` or GitHub API | Use `mcp__bitbucket__bb_get` — this is a Bitbucket project |
| Asking developer for workspace/repo/Jira key upfront | Resolve from `git remote` and config files first |
| Filtering only `🤖 review` comments | Fetch all unresolved comments; parse structured ones first, use raw body as fallback |
| Posting a reply instead of resolving | Use `bb_put .../resolve` to mark the thread resolved — do not post a reply comment |
| Skipping the HIGH issues guard | Always check before Jira transition — even if developer says "just finish" |
| Transitioning Jira when nothing was fixed | Apply zero-fix guard before the HIGH issues guard |
| Committing all fixes in one commit | One commit per issue — message ties fix to `[SEVERITY] file:line` |
| Treating `all` as a bulk commit | `all` removes chunk pauses; every issue still goes through its own explain → fix? → commit? |
| Leaving the `edit` loop open with no exit | Always accept `cancel` alongside `ready` in the edit loop |
| Asking all clarifying questions before the loop | Only explain + ask at fix time, not upfront |
| Applying fixes without checking the branch first | Run Phase 0 — commits on the wrong branch never attach to the PR |
| Checking out or stashing without asking | Both require an explicit `yes` — never switch branches or stash silently |
