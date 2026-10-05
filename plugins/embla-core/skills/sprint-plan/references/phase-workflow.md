# Phase Workflow

Detailed step-by-step execution for each of the four sprint planning phases.
Always read this before starting any phase.

---

## Phase 1 — Goal

**Purpose:** Derive a clear sprint goal from epics and optional free-text context.

1. **Collect inputs.** If epics were not provided in the command args, ask:
   `"Which epics are we planning toward? Provide Jira keys (e.g. EM-100, EM-101)."`
   Accept any free-text context the lead has already provided alongside the keys.

2. **Fetch epic details.** Call `getJiraIssue` for each epic in parallel. Extract: summary,
   description, any acceptance criteria.

3. **Synthesise goal.** Using epic content + lead's free-text, write a 1–2 sentence sprint
   goal that captures what "done" looks like for this sprint. Be specific — not
   "work on authentication" but "deliver working login flow with JWT auth and session handling".

4. **Confirm with lead.**
   ```
   Proposed sprint goal:
   "[synthesised goal]"

   Does this capture the intent? (yes / refine)
   ```
   - `yes` → save to draft and advance to Phase 2
   - `refine` → accept free-text correction, re-synthesise, re-ask. Repeat until confirmed.

5. **Save draft.**
   ```json
   { "phase": 1, "goal": "...", "epics": ["EM-100", "EM-101"] }
   ```

---

## Phase 2 — Stories

**Purpose:** Fetch backlog stories for the confirmed epics, prioritise them by goal alignment,
and surface dependency ordering.

1. **Fetch stories.** JQL:
   ```
   project = {projectKey}
   AND "Epic Link" in ({epics})
   AND statusCategory = "To Do"
   AND sprint is EMPTY
   ORDER BY priority ASC
   ```
   Collect per story: key, summary, description, labels (complexity), components, priority,
   existing Jira issue links.

2. **Prioritise.** Score each story on alignment to the sprint goal. Higher-scoring stories
   are included first. If the list is large, recommend a cut-off and explain why lower-ranked
   stories were left for next sprint.

3. **Infer dependencies.** Analyse story summaries and descriptions (not just Jira links) to
   identify ordering. Use AI judgment — a story titled "Wire dashboard data to UI" depends on
   "Dashboard data API endpoint". Present dependency chains explicitly.

4. **Check complexity labels.** Every story must have exactly one label: `Simple`, `Medium`,
   or `Complex`. If any are missing, flag them:
   `"EM-107 has no complexity label — add one before assigning: (Simple / Medium / Complex)"`
   Do not advance until all shortlisted stories have complexity labels.

5. **Present ordered list.**
   ```
   Shortlisted stories for this sprint (ordered by priority + dependencies):

   1. EM-102 | Set up auth service skeleton    | Complex  | (no deps)
   2. EM-103 | Implement JWT token issuance    | Complex  | depends on EM-102
   3. EM-104 | Login page UI                   | Medium   | (no deps)
   4. EM-105 | Auth API integration            | Medium   | depends on EM-103
   5. EM-110 | Dashboard route scaffold        | Simple   | (no deps)
   ...

   Stories deferred (lower priority / unrelated to goal): EM-119, EM-120
   ```
   Ask: `"Does this story selection and ordering look right? (yes / adjust)"`
   - `yes` → save to draft and advance to Phase 3
   - `adjust` → accept removals, additions, re-ordering; re-present; re-ask

6. **Save draft.**
   ```json
   { "phase": 2, "goal": "...", "epics": [...], "stories": [ { "key": "EM-102", "summary": "...", "complexity": "Complex", "dependsOn": [] }, ... ] }
   ```

---

## Phase 3 — Assignments

**Purpose:** Match stories to team members by expertise, complexity capacity, and recent Jira
activity. Present recommendations and iterate until lead confirms.

1. **Load team config.** Read team from `.claude/embla.json → team` (all roles flattened into one list). Fallback: `.claude/config.json → sprint.team`. For each member, `jiraAccountId` should already be set; if missing, resolve via `lookupJiraAccountId`. For `complexityCapacity`: use value from `config.json` if present, otherwise default to `{ simple: 4, medium: 2, complex: 1 }`.

2. **Fetch recent history.** For each team member, run:
   ```
   JQL: assignee = {accountId} AND sprint in openSprints()
        OR (sprint in closedSprints() AND updatedDate >= -4w)
   ```
   Collect: story keys, summaries, labels, components. This reveals domain proximity and
   current in-flight load.

3. **Check for unlisted members.** If Jira history reveals team members not in config, prompt:
   `"Found [Name] working on recent stories — add them to team config? (yes / skip)"`
   If yes, collect their role and expertise and append to config.

4. **Calculate capacity.** Per member, subtract current in-flight complexity from their
   `complexityCapacity`. Example: if Alice's capacity is `{simple:4, medium:2, complex:1}` and
   she has 1 in-flight Medium story, her remaining capacity is `{simple:4, medium:1, complex:1}`.

5. **Assign stories.** For each story (in dependency order):
   - Match by expertise overlap (story components/labels vs member expertise)
   - Respect remaining capacity (skip members who are at capacity for that complexity tier)
   - Prefer members with recent proximity to the story's domain
   - Distribute work across teams — avoid overloading one team

   When a member's recent history directly matches a story, surface the hint:
   `"Recommend Alice for EM-103 — she completed similar auth work in the last sprint."`

6. **Present assignment table.**
   ```
   Proposed assignments:

   EM-102 | Auth service skeleton    | Complex | Alice  (capacity remaining: Medium×1, Simple×4)
   EM-103 | JWT token issuance       | Complex | Alice  ⚠ at complex capacity after this
   EM-104 | Login page UI            | Medium  | Bob
   EM-105 | Auth API integration     | Medium  | Carol  (worked on API layer last sprint)
   EM-110 | Dashboard scaffold       | Simple  | Bob
   ...

   Team load summary:
   Alice: Complex×1, Complex×1 → at complex capacity (Simple/Medium still available)
   Bob:   Medium×1, Simple×1
   Carol: Medium×1
   ```

   Ask:
   ```
   Does this assignment plan look right?
   (yes / swap [story] to [person] / [free-text constraint e.g. "Alice is on leave"])
   ```

7. **Handle rejection.** If the lead provides swaps or constraints (free-text or specific):
   - Parse all constraints
   - Lock any manually specified assignments
   - Recalculate remaining unconfirmed assignments with constraints applied
   - Re-present full assignment table
   - Repeat until lead confirms with `yes`

8. **Save draft.**
   ```json
   { "phase": 3, ..., "assignments": [ { "storyKey": "EM-102", "accountId": "abc123", "name": "Alice" }, ... ] }
   ```

---

## Phase 4 — Sprint Creation

**Purpose:** Propose sprint name and dates, confirm with lead, then execute all Jira writes.

1. **Propose sprint details.** Derive from config:
   - Name: apply `namingPattern` from `.claude/embla.json → sprint.namingPattern` (fallback: `config.json → sprint.namingPattern`, default: `"S{number} - {year}"`)
   - Start date: today
   - End date: today + `durationWeeks` from `.claude/embla.json → sprint.durationWeeks` (fallback: `config.json → sprint.durationWeeks`, default: `2`)
   - Goal: confirmed sprint goal from Phase 1

   Present:
   ```
   Ready to create the sprint in Jira:

   Name:  S225 - 2026
   Goal:  [sprint goal]
   Start: 2026-04-29
   End:   2026-05-13
   Board: [boardId from config]

   Confirm, or adjust name/dates? (yes / adjust)
   ```
   - `yes` → proceed
   - `adjust` → accept overrides, re-present, re-ask

2. **Create sprint.** Call:
   ```
   POST /rest/agile/1.0/sprint
   {
     "name": "S225 - 2026",
     "originBoardId": {boardId},
     "goal": "{sprint goal}",
     "startDate": "2026-04-29T00:00:00.000Z",
     "endDate": "2026-05-13T00:00:00.000Z"
   }
   ```
   via `mcp__plugin_atlassian_atlassian__fetch`. Capture the returned sprint `id`.

3. **Assign stories to sprint.** For each story in Phase 2 shortlist, call `editJiraIssue`
   using the field ID from `.claude/embla.json → tracker.jira.customFields.sprint` (fallback: `config.json → sprint.customFields.sprint`):
   ```json
   { "{customFields.sprint}": { "id": {sprintId} } }
   ```

4. **Set assignees.** For each story, call `editJiraIssue`:
   ```json
   { "assignee": { "accountId": "{accountId}" } }
   ```
   Execute story-by-story in dependency order. Report progress as you go.

5. **Confirm completion.**
   ```
   ✅ Sprint created: S225 - 2026
   Goal: [sprint goal]
   {N} stories assigned | {N} assignees set

   Stories:
   EM-102 → Alice
   EM-103 → Alice
   EM-104 → Bob
   ...
   ```

6. **Clean up.** Delete `.claude/sprint-draft.json`.

---

## Recoverability

If any Jira call fails during Phase 4:
1. Stop immediately
2. Report: which stories are committed, which are not
3. Ask: `"Retry from [next story], or cancel?"`
4. On retry: skip already-committed stories (check `config.sprint.customFields.sprint` field first)
