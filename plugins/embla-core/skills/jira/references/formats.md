# Jira Item Formats

Templates for every item type. Apply exactly — these are the Embla conventions.

**Every description body below ends with this footer as its last line:**
```
🤖 Crafted by Claude AI
```

---

## Epic

**Jira fields:**
- `issueTypeName`: resolved from `tracker.jira.issueTypes.epic.jiraName` (default: `"Epic"`)
- `summary`: short capability name (noun phrase, e.g. "User Authentication")
- `description`: markdown body below
- `contentFormat`: `"markdown"`
- `{jiraCustomFields.sprint}` (sprint): **omit entirely** — epics span multiple sprints
- `additional_fields.assignee`: `null` — explicitly unset to override project default
- `additional_fields.reporter`: `{ "id": "<caller_account_id>" }` — always set (see SKILL.md)

**Description body:**

```markdown
## Goal
[One sentence — what this epic achieves and for whom.]

## In Scope
- [Capability or boundary]
- [Capability or boundary]

## Out of Scope
- [Item explicitly excluded]
- [Item explicitly excluded]
```

Infer scope boundaries from spec context. Never leave these sections empty.

---

## Story

Stories have **two separate content areas** — both are required.

**Jira fields:**
- `issueTypeName`: resolved from `tracker.jira.issueTypes.userStory.jiraName` (default: `"Story"`)
- `summary`: if `tracker.jira.issueTypes.userStory.summaryFormat` is set, pre-fill with that format template for the user to complete; otherwise use the "As a… I want… so that…" pattern
- `description`: markdown body below
- `contentFormat`: `"markdown"`
- `parent`: parent epic key
- `{jiraCustomFields.sprint}` (sprint): **never set** — stories go to backlog
- `{jiraCustomFields.acceptanceCriteria}`: acceptance criteria in ADF (see below)
- `additional_fields.labels`: `["Simple"]` / `["Medium"]` / `["Complex"]`
- `additional_fields.assignee`: `null` — explicitly unset to override project default
- `additional_fields.reporter`: `{ "id": "<caller_account_id>" }` — always set (see SKILL.md)

**Description body:**

```markdown
## Description
[1–2 sentences — context and motivation behind this story.]

## User Flow
Step 1: [Actor] [action] → [result or next step]
Step 2: …
Step N: If [condition] → [outcome A]. If not → [outcome B].
```
Always include at least one decision point (if/else branch) in the flow.

**Test Scenarios** — include in description after User Flow:

```markdown
## Test Scenarios

**Functional:**
- [ ] [Happy path — the primary success case]

**Edge Cases:**
- [ ] [Boundary or unusual-but-valid input]

**Negative / Failure:**
- [ ] [Missing data, error state, or rejection scenario]
```

Minimum 1 per category (3 total). Scale up for complex stories — max ~8 total.

**Complexity assessment:**

| Label | When to apply |
|---|---|
| `Simple` | 1 actor, 1 linear path, no integrations |
| `Medium` | Multiple paths or conditions, 2+ actors, or moderate state |
| `Complex` | External integrations, error recovery, async flows, security boundaries |

When in doubt, lean `Medium`.

**Acceptance Criteria — `{jiraCustomFields.acceptanceCriteria}` (ADF required)**

Plain text or markdown will be rejected. Use this exact structure:

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Given [context]\nWhen [action]\nThen [outcome]" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Given [edge case context]\nWhen [action]\nThen [outcome]" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Given [failure context]\nWhen [action]\nThen [outcome]" }]
    }
  ]
}
```

Each Given/When/Then block in its own `paragraph` node.
Minimum: 1 happy path + 1 edge case + 1 failure. Scale with story complexity.

**Adaptive scale by complexity:**

| Complexity | AC scenarios | Test scenarios | Flow steps |
|---|---|---|---|
| Simple | 2–3 | 3 | 3–5 |
| Medium | 4–5 | 4–6 | 5–8 |
| Complex | 6–8 | 6–8 | 8–12 |

---

## Task

Tasks are **developer action items** — one concrete engineering action per task.
They are inferred from the spec and reviewed alongside the parent story before creation.

**Jira fields:**
- `issueTypeName`: resolved from `tracker.jira.issueTypes.task.jiraName` (default: `"Task"`)
- `summary`: action-verb phrase — `[Verb] [specific thing] in [location/component]`
- `description`: markdown body below
- `contentFormat`: `"markdown"`
- `parent`: parent story key
- `{jiraCustomFields.sprint}` (sprint): **never set** — tasks go to backlog
- `additional_fields.assignee`: `null` — explicitly unset to override project default
- `additional_fields.reporter`: `{ "id": "<caller_account_id>" }` — always set (see SKILL.md)

**Summary rules — must be a developer-ready action:**
- Start with an action verb: `Add`, `Create`, `Write`, `Implement`, `Update`, `Remove`, `Migrate`, `Wire up`
- Name the specific thing being acted on
- Include the location or component where it lives

Good examples:
- `Add POST /api/search endpoint in SearchController`
- `Write unit tests for AuthService.validateToken()`
- `Create UserProfile migration in database layer`
- `Wire up FeatureFlagService to AppModule providers`

Bad examples (too vague):
- `Backend work` — no verb, no specifics
- `Update code` — meaningless
- `Handle errors` — where? for what?

**Description body:**

```markdown
## Goal
[1–2 sentences — what this task achieves in the context of the parent story.]

## Definition of Done
- [ ] [Concrete, independently verifiable item]
- [ ] [Concrete, independently verifiable item]
```

DoD items must be specific and checkable. Avoid vague items like "code is clean" or "it works".

---

## Bug

**Jira fields:**
- `issueTypeName`: resolved from `tracker.jira.issueTypes.bug.jiraName` (default: `"Bug"`)
- `summary`: `[Bug]: [short description]`
- `description`: markdown body below
- `contentFormat`: `"markdown"`
- `{jiraCustomFields.sprint}` (sprint): **never set** — bugs go to backlog unless user specifies
- `additional_fields.assignee`: `null` — explicitly unset to override project default
- `additional_fields.reporter`: `{ "id": "<caller_account_id>" }` — always set (see SKILL.md)

**Description body:**

```markdown
## Steps to Reproduce
1. [Step]
2. [Step]

## Expected Behaviour
[What should happen.]

## Actual Behaviour
[What happens instead.]

## Severity
[Critical / High / Medium / Low]

## Environment
[Browser, version, environment — ask user if unknown]
```

Severity guide: Critical = system down / data loss. High = major feature broken. Medium = degraded experience. Low = cosmetic / minor.
