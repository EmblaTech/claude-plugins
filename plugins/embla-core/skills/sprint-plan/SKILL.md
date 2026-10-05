---
name: sprint-plan
description: >
  Use when a lead wants to plan a sprint or iteration — selecting backlog stories, assigning
  team members, and creating the sprint in Jira. Triggers on: "plan sprint", "plan our next
  sprint", "plan the iteration", "assign stories to sprint", "sprint planning", "who should
  work on what this sprint", "allocate stories to the team".
---

# sprint-plan — Sprint Planner

Guides a lead through four confirmed phases to plan a sprint: goal synthesis, story selection,
resource assignment, and sprint creation. State is saved after each confirmation so the session
is resumable if interrupted.

**Never skip phases or write to Jira before each phase is confirmed by the lead.**

## Commands

```
/embla-core sprint-plan          → start or resume sprint planning session
/embla-core sprint-plan restart  → discard current draft and start fresh
```

On invocation, check for `.claude/sprint-draft.json`. If it exists, ask:
`"Found an in-progress sprint plan (Phase N complete). Resume from Phase N+1, or restart?"`

---

## Phase Overview

```
Phase 1 → Goal       Epics + free-text → synthesised goal → lead confirms
Phase 2 → Stories    Fetch backlog → AI prioritise + infer dependencies → lead confirms
Phase 3 → Assign     Config + Jira history → AI match by expertise/capacity → lead confirms
Phase 4 → Create     Sprint defaults → lead confirms name/dates → create in Jira
```

Read `references/phase-workflow.md` before executing any phase.

---

## Runtime Resolution

Resolve once at session start before any Jira call. Never hardcode.

| Value | How to resolve |
|---|---|
| **Cloud ID** | `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources` → first resource `id` |
| **Project key** | `.claude/embla.json → tracker.jira.projectKey`. Fallback: `.claude/config.json → sprint.jiraProjectKey`. Fallback: parse branch `([A-Z]{2,})-\d+`. Still missing → ask. |
| **Board ID** | `.claude/embla.json → tracker.jira.boardId`. Fallback: `.claude/config.json → sprint.boardId`. Required for sprint creation — stop and ask if missing. |
| **Jira site URL** | `.claude/embla.json → tracker.jira.siteUrl`. Fallback: `.claude/config.json → sprint.jiraSiteUrl`. Required — stop and ask if both missing. |
| **Team** | `.claude/embla.json → team` (all roles combined). Fallback: `.claude/config.json → sprint.team`. Required — if empty or missing, stop: `"No team configured. Run /embla-core:config to set up your team."` |
| **Sprint field ID** | `.claude/embla.json → tracker.jira.customFields.sprint`. Fallback: `.claude/config.json → sprint.customFields.sprint`. Required — stop and ask if missing. |
| **Sprint naming pattern** | `.claude/embla.json → sprint.namingPattern`. Fallback: `.claude/config.json → sprint.namingPattern`. Default: `"S{number} - {year}"`. |
| **Sprint duration** | `.claude/embla.json → sprint.durationWeeks`. Fallback: `.claude/config.json → sprint.durationWeeks`. Default: `2`. |

---

## Config Structure

Primary config source: `.claude/embla.json`
Legacy fallback: `.claude/config.json` (still read if embla.json fields are absent)

**Team structure in `embla.json`:**

```json
{
  "team": {
    "lead":   [{ "name": "Alice", "jiraAccountId": "abc123" }],
    "qa":     [{ "name": "Bob",   "jiraAccountId": "def456" }],
    "dev":    [{ "name": "Eve",   "jiraAccountId": "mno345" },
               { "name": "Frank", "jiraAccountId": "pqr678" }]
  }
}
```

When reading team for Phase 3 assignment, flatten all roles into a single list. For `complexityCapacity`:
1. Try `.claude/config.json → sprint.team[name].complexityCapacity` — use if found
2. Otherwise default to `{ simple: 4, medium: 2, complex: 1 }`

**Self-Updating Config Rules**

- If a Jira user appears in recent story history but is **not in embla.json team** → ask:
  `"Found [Name] working on recent stories — add them to team config? (yes / skip)"`
  If yes: write to `.claude/embla.json → team.dev` (append to the dev array).
- If a member is assigned **outside their configured role 2+ times** → note it but do not auto-update (role assignment is set by `/embla-core:config update team`).
- Only write to embla.json after explicit lead confirmation.

---

## State File (`.claude/sprint-draft.json`)

Write after each confirmed phase. Never skip.

```json
{
  "phase": 2,
  "goal": "Ship login flow and basic dashboard by end of sprint",
  "epics": ["EM-100", "EM-101"],
  "stories": [
    { "key": "EM-102", "summary": "...", "complexity": "Medium", "dependsOn": [] },
    { "key": "EM-103", "summary": "...", "complexity": "Complex", "dependsOn": ["EM-102"] }
  ],
  "assignments": null
}
```

Delete `.claude/sprint-draft.json` after Phase 4 completes successfully.

---

## Baseline Failures to Avoid

These are the exact mistakes an agent makes without this skill — avoid them:

| Mistake | Correct behaviour |
|---|---|
| Skipping the draft file ("re-fetching is fast enough") | Always write `.claude/sprint-draft.json` after each confirmed phase |
| Deferring sprint creation to the lead | The skill creates the sprint in Jira via Agile API after Phase 4 confirmation |
| Using story points for capacity | Use `complexityCapacity` (Simple/Medium/Complex) from config — never ask for story points |
| Ignoring `.claude/config.json` for team expertise | Load team config first; Jira history only supplements it |
| Asking open clarifying questions before synthesising the goal | Fetch epics immediately, synthesise a goal, then confirm with lead |
| On rejection: just asking "which ones to change?" | Accept free-text constraints, then recalculate the full assignment plan autonomously |

---

## Jira API Operations

| Operation | Tool | Purpose |
|---|---|---|
| Fetch epic details | `mcp__plugin_atlassian_atlassian__getJiraIssue` | Epic title + description for goal synthesis |
| Fetch backlog stories | `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` | Stories in backlog under selected epics |
| Fetch member history | `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` | Last 3 sprints per team member |
| Resolve account IDs | `mcp__plugin_atlassian_atlassian__lookupJiraAccountId` | Match config names to Jira IDs |
| Create sprint | `mcp__plugin_atlassian_atlassian__fetch` | `POST /rest/agile/1.0/sprint` with boardId, name, startDate, endDate, goal |
| Assign story to sprint | `mcp__plugin_atlassian_atlassian__editJiraIssue` | Set `sprint.customFields.sprint` (from config) to sprint ID |
| Set assignee | `mcp__plugin_atlassian_atlassian__editJiraIssue` | Set `assignee.accountId` per story |

---

## Error Handling

If a Jira call fails mid-Phase 4:
1. Stop immediately
2. Report which stories were already assigned (they are committed in Jira)
3. Ask: `"Retry from [next story], or cancel?"`

Never silently skip a failed assignment.
