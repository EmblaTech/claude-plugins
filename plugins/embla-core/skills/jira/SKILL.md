---
name: jira
description: >
  Create Jira work items following Embla conventions. Primary use: /jira spec <path> reads a
  brainstorming spec and creates Epics → Stories → Tasks through a guided per-item review flow.
  Also supports single item creation: /jira epic, /jira story, /jira task, /jira bug.
  Always use for any Jira content generation. Triggers on: "create jira items", "break this
  spec into epics", "turn this into tickets", "make stories for this feature", "create work items
  from this spec", "decompose this into jira", "create a story", "log a bug", "add a task".
---

# jira — Work Item Creator

Creates Jira work items from a brainstorming spec or free-text context, following Embla conventions.

A **spec** is a high-level business or technical document produced from a brainstorming session —
it describes the goal, scope, and what is going to be built. This skill reads that and turns it
into epics, stories, and tasks ready for development.

**Defaults that apply to every item created:**
- All items go to the **backlog** — sprint is never set
- Reporter is always set to the authenticated caller (no confirmation needed)
- Assignee is **never set** — the skill will tell the user this explicitly

## Commands

```
/jira spec <path>     → guided spec-to-Jira workflow: epics → stories + sub-tasks
/jira epic [context]  → single epic
/jira story [context] → single user story with sub-tasks
/jira task [context]  → single developer task
/jira bug [context]   → single bug report
```

For `/jira spec`: read `references/spec-workflow.md` before generating anything.
For all item drafts: read `references/formats.md` for the exact output templates.

---

## Runtime Resolution

Resolve these values before every Jira call. Never hardcode.

| Value | How to resolve |
|---|---|
| **Cloud ID** | `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources` → first resource `id`. Required — stop and ask if missing. |
| **Project key** | Parse current branch `([A-Z]{2,})-\d+`. Fallback: `.claude/embla.json → tracker.jira.projectKey`. Fallback: `.claude/settings.json → jiraProjectKey`. Still missing → ask. |
| **Jira site URL** | `.claude/embla.json → tracker.jira.siteUrl`. Fallback: `.claude/settings.json → jiraSiteUrl`. Required — stop and ask if both missing. |
| **Caller account ID** | `mcp__plugin_atlassian_atlassian__atlassianUserInfo` → `account_id`. Set as reporter on every item. |
| **Sprint field ID** | `.claude/embla.json → tracker.jira.customFields.sprint`. Fallback: `.claude/settings.json → jiraCustomFields.sprint`. If missing: call `getJiraProjectIssueTypesMetadata`, find field named "Sprint", ask user to add it to `.claude/embla.json`. |
| **AC field ID** | `.claude/embla.json → tracker.jira.customFields.acceptanceCriteria`. Fallback: `.claude/settings.json → jiraCustomFields.acceptanceCriteria`. If missing: call `getJiraProjectIssueTypesMetadata`, find field named "Acceptance Criteria", ask user to add it to `.claude/embla.json`. |
| **Issue type names** | `.claude/embla.json → tracker.jira.issueTypes`. If present: use configured `jiraName` per type. If absent: use defaults (Epic, Story, Task, Bug, Sub-task). |

---

## Reporter

Reporter is the person who raised the issue. Always set it to the authenticated caller — no confirmation needed.

On every item: `additional_fields.reporter: { "id": "<caller_account_id>" }`

Jira does not automatically default reporter to the API caller when the field is omitted; behaviour depends on the project's screen configuration. Always set it explicitly.

---

## Posting Rules

| Field | Rule |
|---|---|
| **Reporter** | Always set to authenticated caller: `{ "id": "<caller_account_id>" }` |
| **Assignee** | Explicitly unset on every item: `additional_fields.assignee: null` — overrides the project default |
| **Sprint** (`jiraCustomFields.sprint`) | Never set — all items go to backlog |
| **Story AC** (`jiraCustomFields.acceptanceCriteria`) | ADF object — see `references/formats.md`. Required for stories. |
| **Story labels** | `additional_fields.labels: ["Simple" / "Medium" / "Complex"]` — required for stories |
| **Parent** | Epic key for stories. Story key for sub-tasks. Ask if not provided. |

---

## Issue Type Name Resolution

When calling `createJiraIssue`, use the `issueTypeName` value from `.claude/embla.json → tracker.jira.issueTypes.<type>.jiraName` if configured.

| Logical type | Default `issueTypeName` | Configured by |
|---|---|---|
| epic | `"Epic"` | `tracker.jira.issueTypes.epic.jiraName` |
| userStory | `"Story"` | `tracker.jira.issueTypes.userStory.jiraName` |
| task | `"Task"` | `tracker.jira.issueTypes.task.jiraName` |
| bug | `"Bug"` | `tracker.jira.issueTypes.bug.jiraName` |
| subTask | `"Sub-task"` | `tracker.jira.issueTypes.subTask.jiraName` |

When a `summaryFormat` is configured (e.g. `"As a {role}, I want {goal} so that {benefit}"`), pre-fill the summary field with the format as a prompt and ask the user to complete it.

---

## Custom Field IDs (`.claude/embla.json`)

Custom field IDs are Jira instance-specific — the same field name maps to a different ID on every instance. Store them in `.claude/embla.json` so this skill works on any Jira Cloud:

```json
{
  "tracker": {
    "jira": {
      "customFields": {
        "sprint": "customfield_10020",
        "acceptanceCriteria": "customfield_10035"
      }
    }
  }
}
```

Both fields are required before any story or spec creation. If either is missing:
1. Call `mcp__plugin_atlassian_atlassian__getJiraProjectIssueTypesMetadata` for the project
2. Find the field by name ("Sprint" / "Acceptance Criteria") and read its ID
3. Tell the user: `"Add this to .claude/embla.json → tracker.jira.customFields"`

---
## Single Item Creation

For `/jira epic`, `/jira story`, `/jira task`, `/jira bug`:

1. Read `references/formats.md` for the correct template
2. Draft the item — for `/jira story`, infer and show sub-tasks underneath the draft
3. If any required section cannot be inferred, ask for the specific missing piece
4. Present the draft, then ask: `Post this to Jira? (yes / edit first / cancel)`
   - `yes` → call `mcp__plugin_atlassian_atlassian__createJiraIssue`, then create any sub-tasks
   - `edit first` → accept corrections, re-present, re-ask
   - `cancel` → stop
5. On success: `✅ [TYPE] created: KEY-NNN — [summary]`
   with link: `[KEY-NNN](jiraSiteUrl/browse/KEY-NNN)`

---

## Missing Information Rule

Never leave placeholders (`[TBD]`, `[TODO]`, `[…]`). State exactly what is missing and ask once:
`"I need [specific thing] to complete this — [what to provide]."`

---

## Error Handling

If a Jira call fails mid-sequence:
1. Stop immediately
2. Report which items were already created (they remain in Jira)
3. Ask: `Retry from [next item], or cancel?`

Never silently skip a failed creation.
