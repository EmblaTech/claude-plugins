---
name: develop
description: >
  Use when a developer is starting work on a Jira story — ticket provided via command argument
  or session start. Handles story fetch, assignment, subtask assignment, status transition,
  branch creation, brainstorm, dev plan, TDD setup, commit guidance, PR, and Done transition.
  Always invoke before touching any code on a new story.
---

# embla-core:develop — Developer Workflow

Guides a developer through the complete start-of-development workflow for a Jira story:
fetch → assign → transition → **branch** → brainstorm → dev plan → TDD → commit → PR → done.

## Invocation

```
/embla-core:develop EM-1234     → start workflow for story EM-1234
/embla-core:develop             → ask which story to work on
```

**If JIRA_ID is missing**, ask before doing anything else:
```
Which Jira story are you working on? (e.g. EM-1234)
```
Do not proceed until a valid ticket ID is provided.

**Do NOT** start exploring the codebase, asking about the feature, or taking any action
before the ticket ID is confirmed and the story is fetched. The story IS the source of truth.

---

## Runtime Values

Resolve once at session start. Never hardcode.

| Value | How to resolve |
|---|---|
| **Cloud ID** | `getAccessibleAtlassianResources` → first resource `id` |
| **Project key** | Parse JIRA_ID: `EM-1234` → `EM` |
| **Jira site URL** | `.claude/embla.json → tracker.jira.siteUrl` — fallback: `.claude/settings.json → jiraSiteUrl` — stop and ask if both missing |
| **Caller account ID** | `atlassianUserInfo` → `account_id` |
| **Feature branch format** | `.claude/embla.json → featureBranchFormat` — fallback: read `.claude/branch-conventions.md` |
| **Bug branch format** | `.claude/embla.json → bugBranchFormat` — fallback: read `.claude/branch-conventions.md` |
| **Hotfix branch format** | `.claude/embla.json → hotfixBranchFormat` — fallback: read `.claude/branch-conventions.md` |
| **Release branch format** | `.claude/embla.json → releaseBranchFormat` — fallback: read `.claude/branch-conventions.md` |
| **Commit message format** | `.claude/embla.json → commitMessageFormat` — fallback: read `.claude/commit-conventions.md` |

---

## Subagent Delegation

**Always** spawn a subagent via the Agent tool for Step 1 (fetching and
analyzing the Jira story) and for Step 5c onward (implementation, TDD,
commit-message and PR-description drafting) — dispatch it, let it do the
work, and use its report. This is not optional, even for a story that looks
small. Brainstorming (Step 5a) and every confirm/edit/cancel gate always
stay in the main session — they need live back-and-forth with you that a
subagent can't provide. Never dispatch multiple implementation subagents in
parallel against the same story — overlapping edits conflict.

---

## Step 1 — Fetch and Display Story

Spawn a subagent (Agent tool) to call `getJiraIssue` and analyze the story;
have it report back the fields below plus a complexity read. Present:

```
── Story: EM-1234 ──────────────────────────────────────
  Summary:    [story summary]
  Status:     [current status]
  Type:       [Bug / Story / Task / ...]
  Assignee:   [name or Unassigned]
  Reporter:   [name]
  Sprint:     [sprint name or Backlog]
  Complexity: [Simple / Medium / Complex — from labels]

  Description:
  [description body]

  Acceptance Criteria:
  [AC content]

  Subtasks:
    ○ EM-1235  [subtask title]  ([assignee or Unassigned])
    ○ EM-1236  [subtask title]  ([assignee or Unassigned])
────────────────────────────────────────────────────────
```

Only show the Subtasks section if the story has subtasks.

**Status guards:**
- Already **In Progress**: warn — `⚠ This story is already In Progress. Continue anyway? (yes / no)`
- **Done / Closed**: warn — `⚠ This story is marked Done. Are you sure you want to work on it? (yes / no)`
- Any other active status: proceed silently

---

## Step 2 — Assignment

Ask once per session:
```
Shall I assign this story to you? (yes / no)
```
- `yes` → `editJiraIssue`: `assignee: { "accountId": "<caller_account_id>" }` → print `✅ Assigned to you`
- `no` → skip, continue

**Subtask assignment** — if the story has subtasks, ask after the main story assignment:
```
Assign subtasks? (all / pick / skip)
```
- `all` → assign all subtasks to caller via `editJiraIssue` → print `✅ All subtasks assigned to you`
- `pick` → for each subtask in turn: `Assign EM-1235 "[title]" to you? (yes / no)`
- `skip` → leave subtasks as-is

---

## Step 3 — Transition to In Progress

If current status is **Todo** or **To Do**:
1. `getTransitionsForJiraIssue` → find transition ID for "In Progress"
2. `transitionJiraIssue` with that ID
3. Print: `✅ EM-1234 → In Progress`

If already In Progress: skip silently.
If no "In Progress" transition found: show available transitions and ask which one to use.

---

## Step 4 — Branch Creation

**Branch is created before brainstorming** so that all dev plan documents are committed to
the feature branch, not to the default branch.

Resolve the branch format from Runtime Values above before proposing any branch name. If
`embla.json` has the format fields set, use them directly. Otherwise fall back to reading
`.claude/branch-conventions.md`.

**Auto-detect branch type from Jira issue type:**

| Issue type | Branch type |
|---|---|
| Story / Task | `feature` |
| Bug | `bug` |
| Hotfix | `hotfix` |
| Release | `release` |
| Other / unclear | ask developer |

When type is detected, skip the menu and propose directly:
```
Proposed branch: s224/feature/EM-1234/short-description

Branch type detected as feature (Story). Create this branch? (yes / edit / cancel)
```

When type cannot be determined, ask:
```
Branch type?
  1. feature  — new functionality
  2. bug      — bug fix
  3. hotfix   — urgent production fix
  4. release  — version release
```

Infer the sprint number from the current branch (e.g. `s224/feature/...` → `s224`). Ask if unclear.

- `yes` → `git checkout -b <branch-name>` → print `✅ Branch created: <name>`
- `edit` → accept revised name, re-propose, re-ask
- `cancel` → stop

**Never create a branch without explicit user approval.**

Common rationalizations to reject:
- "I'll create a sensible name" — always propose, always confirm first
- "The developer said proceed" — "proceed" on a previous step is not branch approval; ask specifically
- "It matches the convention" — correctness doesn't replace consent

---

## Step 5 — Brainstorm, Dev Plan & TDD

Step 5 has three sequential sub-steps. Always ask — never skip or auto-decide.

### 5a — Brainstorm

Complexity drives the *type of question*, not automatic action.

**If `Complexity = Complex`:**
```
This is a complex story. Want to brainstorm the implementation approach? (yes / no)
```
- `yes` → invoke `superpowers:brainstorming` with this instruction:
  > "This is a **development** brainstorm. Requirements are already defined in the Jira story. Focus on: implementation approaches, technical decisions, files to change, risks. Do NOT re-analyse requirements."
- `no` → skip to 5b

**If `Complexity = Medium / Simple / Bug`:**
```
How much planning do you want?
  1. lightweight  — quick bullet points
  2. full brainstorm  — detailed implementation brainstorm
  3. skip
```
- `1` → write inline lightweight bullets (approach, files, risks) — do NOT invoke `superpowers:brainstorming`
- `2` → invoke `superpowers:brainstorming` with the dev-context instruction above
- `3` → skip to 5b

**If `No label`:**

Analyse the story using the fields already fetched in Step 1 — issue type, description length, number of acceptance criteria, presence of subtasks, and any architectural keywords (e.g. "refactor", "migrate", "integrate", "redesign"). Infer a complexity and present it for confirmation:

```
No complexity label found. Based on the story details I estimate this is: [Simple / Medium / Complex]

Reasoning: [one sentence — e.g. "Single-endpoint change with clear AC and no subtasks"]

Confirm complexity? (simple / medium / complex)
```

Developer confirms or overrides, then apply the matching path:
- `simple`  → treat as `Complexity = Simple` → go to the "Medium / Simple / Bug" prompt above
- `medium`  → treat as `Complexity = Medium` → go to the "Medium / Simple / Bug" prompt above
- `complex` → treat as `Complexity = Complex` → go to the Complex path above

---

### 5b — Dev Plan

Always ask after 5a:
```
Shall I create a dev plan? (yes / no)
```
- `yes` → write plan to `docs/dev-plans/EM-1234-<short-kebab-title>.md` using the lightweight format below, then commit: `docs(EM-1234): add dev plan for <short-title>`
- `no` → skip to 5c

**Lightweight plan format:**
```markdown
## Dev Plan: EM-1234 — <short title>

### Approach
- [implementation step 1]
- [implementation step 2]
- [implementation step 3]

### Files to change
- `path/to/file.ts` — [what changes and why]

### Edge cases / risks
- [any notable edge cases or risks]
```

---

### 5c — TDD

Always ask after 5b:
```
Use TDD? (recommended) (yes / no)
```

**If `no`:** proceed to implementation directly.

**If `yes`:**

**Phase 1 — Detect framework:**
1. Scan for existing test files (`*.spec.*`, `*.test.*`, `__tests__/`, `test/`) and config files (`jest.config.*`, `vitest.config.*`, `pyproject.toml`, `pytest.ini`, `build.gradle`, `pom.xml`)
2. **Tests found** → print `Found [framework] tests. I'll follow the same patterns.` → proceed
3. **No tests, framework detected from config** → ask: `Detected [framework] — use this? (yes / no)`
4. **Nothing found** → detect stack from project files, ask with recommendation:
   ```
   No tests found. What test framework are you using for [detected stack]?
   (recommended: [framework based on stack])
   ```

**Stack → recommended framework:**

| Project file | Stack | Recommended |
|---|---|---|
| `pom.xml` / `build.gradle` | Java | JUnit 5 |
| `package.json` + React | React | Jest + React Testing Library |
| `package.json` + Vue/Vite | Vue | Vitest |
| `package.json` (generic) | Node.js | Jest |
| `pyproject.toml` / `requirements.txt` | Python | pytest |

**Phase 2 — Red/Green cycle (once framework is confirmed):**

Spawn a subagent (Agent tool) to invoke `superpowers:test-driven-development` and
implement the full Red/Green/Refactor cycle, using the story's acceptance criteria
as the test specification. Have it report back which files changed and what it
committed.

---

## Step 6 — Commit Guidance

When the developer is ready to commit, first show what has changed.

Spawn a subagent (Agent tool) to run `git diff HEAD` and draft a Conventional Commit
message from it, reading the commit format from Runtime Values above
(`embla.json → commitMessageFormat` if set, otherwise `.claude/commit-conventions.md`).
Have it report back a file-level summary and the proposed message.

Display the summary:
```
── Changed files ────────────────────────────────────────
  M  src/auth/auth.service.ts      (+42 / -8)
  A  src/auth/auth.guard.ts        (+65)
  M  src/auth/auth.module.ts       (+3 / -1)
────────────────────────────────────────────────────────
```

Always confirm before committing:
```
Proposed commit:

  feat(EM-1234): add user authentication endpoint

  - Implement POST /api/auth/login
  - Add JWT token generation in AuthService

Commit with this message? (yes / edit / cancel)
```

- `yes` → commit
- `edit` → accept new message, re-show, re-ask
- `cancel` → do not commit

---

## Step 7 — PR Creation

When development is ready, invoke `superpowers:finishing-a-development-branch` first to verify
all work is complete and requirements are met. Only proceed to the PR prompt after that skill
completes.

Then ask:
```
Ready to create a PR? (yes / no)
```

If `yes`, present preview:
```
── PR Preview ───────────────────────────────────────────
  Title:  [EM-1234] <story summary>
  Branch: s224/feature/EM-1234/short-description → main

  ## Summary
  - [key change 1]
  - [key change 2]

  ## Jira
  [EM-1234](<jiraSiteUrl>/browse/EM-1234)

  ## Test Plan
  - [ ] [test instruction]

  🤖 Crafted by Claude AI
────────────────────────────────────────────────────────
Create this PR? (yes / edit / cancel)
```

- `yes` → create PR via VCS tool → print PR URL
- `edit` → accept changes, re-show, re-ask
- `cancel` → stop

---

## Step 8 — Transition to Done

After PR is successfully created, ask:
```
Move EM-1234 to Done? (yes / no)
```
- `yes` → `getTransitionsForJiraIssue` → find "Done" transition → `transitionJiraIssue` → print `✅ EM-1234 → Done`
- `no` → skip, end workflow
- Transition not found → show available transitions and ask which to use

---

## Error Handling

| Error | Action |
|---|---|
| Jira fetch fails | Stop — report error, ask to retry or cancel |
| Transition not found | Show available transitions, ask which to use |
| Branch already exists | Warn, ask: checkout existing / rename / cancel |
| Commit fails | Report failure, do not retry silently |

Never proceed past a failed step without user acknowledgement.
