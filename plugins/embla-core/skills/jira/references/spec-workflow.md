# Spec Workflow

Reads a brainstorming spec and creates Epics → Stories → Tasks through a guided review.
The spec is a high-level business or technical document produced from a brainstorming session —
it describes what is going to be built, not how. Infer the Jira structure from that intent.

Read `formats.md` (in this same directory) before generating any drafts.

---

## Before Starting — Reporter Confirmation

If the reporter question has not been asked this session, ask it now (see SKILL.md).
Remember the answer. Do not ask again.

---

## Step 1 — Parse the Spec

Read the file at the given path. Silently extract epics, stories, and tasks.
Present nothing yet — results surface in Step 2.

### Epic inference

Look for: H2/H3 headings that represent capability areas, numbered feature sections,
tables with feature groups, explicit "Epic" labels, major functional domains described
in the goal or scope sections.

Aim for 3–8 epics. Do not create one epic per minor detail — group related
capabilities together. If a heading is clearly an implementation step rather than a
user-facing capability, it is a task, not an epic.

### Story inference

Look for: "As a…" statements, named user flows, scenario descriptions, listed feature
items under a capability area, acceptance criteria that represent distinct user interactions.

Aim for 2–6 stories per epic. Each story must represent a complete user-facing interaction,
not a technical step.

### Task inference

Look for: Definition of Done items, implementation checklists, technical sub-steps,
"How to implement" sections, file-level change lists, specific engineering actions.

Tasks belong under stories. Map each task to its nearest story. If a task cannot be
mapped to a specific story, attach it to the most relevant story and note the association.

### Ambiguity handling

If the spec lacks enough structure to infer a level confidently:
- Note it briefly in Step 2 with a single question
- Never create placeholder items (`[TBD]`, `[TODO]`, `[…]`)
- If the spec is mostly implementation-level with no clear user flows, infer epics only
  and surface this to the user before proceeding

---

## Step 2 — Epic List Review

Present a numbered list of inferred epic titles. Titles only — no descriptions yet.

```
From: <path>

Proposed epics:
1. [Epic title]
2. [Epic title]
3. [Epic title]
…

[Only if ambiguous: "Note: I couldn't clearly identify stories for epic N — I'll ask when we get there."]

Add, remove, or rename any? (or "ok" to proceed)
```

**Accepted edits:**
- `remove 3` — drop that epic
- `rename 2 to Payment Flow` — update the title
- `add Notification System` — append a new epic
- `ok` / `looks good` / `proceed` — move to Step 3

After each edit, re-present the updated numbered list.
Continue until the user confirms.

---

## Step 3 — Epic Detail + Creation (one by one)

Work through each confirmed epic in list order.

For each epic:

**1. Generate and present the full draft** using the `epic` format from `formats.md`:

```
Epic [N of total]: [Epic title]
────────────────────────────────
Summary: [title]

## Goal
[one sentence]

## In Scope
- …

## Out of Scope
- …
────────────────────────────────
Create this epic in Jira? (yes / edit / skip)
```

**2. Handle the response:**
- `yes` → create via `createJiraIssue` (`issueTypeName: "Epic"`).
  Print: `✅ Epic created: KEY-NNN — [title]`
  Store the key. Immediately move to Step 4 for stories under this epic.
- `edit` → accept the correction inline, re-present the updated draft, re-ask
- `skip` → print `⏭ Skipped: [title]`, move to the next epic

**3. If creation fails:** stop, report which epics were already created, ask to retry or cancel.
Items already in Jira remain — note this clearly.

After all epics are processed → show the Completion Summary.

---

## Step 4 — Story List Review (per epic, immediately after each epic is created)

Present the story titles for this epic only. Titles only — no detail yet.

```
Stories for [Epic title] (KEY-NNN):
1. As a [role], I want [goal]…
2. As a [role], I want [goal]…
…

Add, remove, or rename any? (or "ok" to proceed)
```

Same edit commands as Step 2. Re-present after each change.
Continue until confirmed, then run Step 5 for this epic's stories.

---

## Step 5 — Story + Task Review and Creation (one by one, per epic)

Work through each confirmed story for the current epic in list order.

For each story:

**1. Assess complexity first** (Simple / Medium / Complex) using the scale in `formats.md`.
   Base the assessment on: number of actors, number of paths, integrations, error scenarios.

**2. Generate and present the full story draft** using the `story` format from `formats.md`,
   followed immediately by the inferred tasks for this story:

```
Story [N of total for this epic]: [story summary]
────────────────────────────────────────────────────
Summary: As a [role], I want [goal], so that [benefit]
Complexity: [Simple / Medium / Complex]

## Description
…

## User Flow
Step 1: …
Step 2: …
…

## Test Scenarios
**Functional:**
- [ ] …
**Edge Cases:**
- [ ] …
**Negative / Failure:**
- [ ] …

Acceptance Criteria:
  Given … When … Then …
  Given … When … Then …
  Given … When … Then …

────────────── Tasks ──────────────
1. [Verb] [specific thing] in [location/component]
2. [Verb] [specific thing] in [location/component]
…
───────────────────────────────────
Create this story and its tasks? (yes / edit story / edit tasks / skip)
```

Show AC in readable plain text in the preview — the ADF conversion happens internally on creation.
If no tasks were inferred for this story, omit the Tasks section entirely.

**3. Handle the response:**
- `yes` →
  1. Create story via `createJiraIssue`:
     - `issueTypeName`: `"Story"`
     - `parent`: current epic key
     - `labels`: `["Simple"]` / `["Medium"]` / `["Complex"]`
     - `{jiraCustomFields.acceptanceCriteria}`: AC as ADF object (see `formats.md`)
     - `{jiraCustomFields.sprint}`: **omit** (backlog)
     - Print: `✅ Story created: KEY-NNN — [summary] (under KEY-MMM)`
  2. Create each task immediately after, in order:
     - `issueTypeName`: `"Task"`
     - `parent`: the story key just created
     - `{jiraCustomFields.sprint}`: **omit** (backlog)
     - Print each: `  └─ Task: KEY-NNN — [summary]`
- `edit story` → accept story field corrections, re-present the full block (story + tasks), re-ask
- `edit tasks` → accept task list edits (add / remove / rename), re-present the full block, re-ask
- `skip` → print `⏭ Skipped: [summary] (and its tasks)`, move to next story

**4. If story creation fails:** stop, report created items, ask to retry or cancel.
   If a task creation fails after the story is created: print a warning, continue with remaining tasks.

After all stories for this epic are processed → return to Step 3 (next epic).

---

## Completion Summary

After all epics and stories are processed:

```
── Done ──────────────────────────────────────────────
  Spec:     <path>
  Epics:    [N] created — KEY-NNN, KEY-NNN, …
  Stories:  [N] created — KEY-NNN, KEY-NNN, …
  Tasks:    [N] created — KEY-NNN, KEY-NNN, …
  Skipped:  [N] epics, [N] stories  (omit if none)
  Project:  [KEY]
──────────────────────────────────────────────────────
```

Omit any row where count is 0.
