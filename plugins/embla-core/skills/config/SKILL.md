---
name: config
description: >
  Use when setting up embla-core for a new project for the first time, reconfiguring an
  existing project, or when any embla-core skill (develop, jira, plan, review) stops because
  a required config field is missing from .claude/embla.json.
---

# embla-core:config — Project Configuration

Sets up `.claude/embla.json` once for the project. Auto-detects what it can from Jira and
the current branch, then walks through only the gaps. Designed to be fast and beginner-friendly.

## Invocation

```
/embla-core:config                            → full setup wizard
/embla-core:config show                    → display current config as a readable table
/embla-core:config update <domain>            → update an entire domain
/embla-core:config update <domain.field>      → update a single field within a domain
```

Valid domains for `update`: `jira`, `branch`, `commit`, `team`, `notifications`, `pipeline`

Field-level examples:
```
/embla-core:config update branch.featureBranchFormat
/embla-core:config update team.dev
/embla-core:config update jira.statuses
/embla-core:config update notifications.teamsWebhookUrl
```

---

## Phase 0 — Silent Auto-Detection

Before asking anything, silently perform all of the following:

1. Read `.claude/embla.json` if it exists — load all current values as defaults
2. Parse current branch name → infer sprint prefix and project key (e.g. `s224/feature/FT-123` → key `FT`)
3. Call `getAccessibleAtlassianResources` → capture `url` (siteUrl) and `id` (cloudId) from first result
4. Call `getVisibleJiraProjects` → validate the inferred project key exists in the Jira site

Do not output anything during Phase 0. If any API call fails, mark the affected fields as undetected — do not stop.

---

## Phase 1 — Summary Table

Print a single summary before asking any questions:

```
Auto-detected:
  ✓ tracker.jira.siteUrl       https://emblaftdev.atlassian.net
  ✓ tracker.jira.cloudId       (resolved)
  ✓ tracker.jira.projectKey    FT

Need your input (7 remaining):
  ? repo                       not configured
  ? tracker.provider           not configured
  ? featureBranchFormat        not configured
  ? commitMessageFormat        not configured
  ? team                       not configured
  ? teamsWebhookUrl            not configured
  ? sprint.boardId             not configured
```

If all fields are already configured (re-run), say:
```
All fields are already configured. Running in update mode — press Enter to keep each value.
```

---

## Phase 2 — Domain Q&A

Work through each domain in this order. Read the reference file before asking questions for that domain.

| Order | Domain | Reference |
|---|---|---|
| 1 | Repo & tracker | [references/jira-config.md](references/jira-config.md) |
| 2 | Branch formats | [references/branch-config.md](references/branch-config.md) |
| 3 | Commit format | [references/commit-config.md](references/commit-config.md) |
| 4 | Team | [references/team-config.md](references/team-config.md) |
| 5 | Notifications & thresholds | [references/notification-config.md](references/notification-config.md) |

**Rules for every domain:**
- Only prompt for fields that are missing or flagged `?` in Phase 1
- Fields already set appear as pre-filled defaults — user presses Enter to keep them
- Show examples and possible values for every question
- One question at a time; never ask multiple fields in the same message

---

## Phase 3 — Preview & Confirm

After all domains are complete, show the full proposed `embla.json`:

```
I'll write the following to .claude/embla.json:

{
  "repo": { ... },
  "tracker": { ... },
  ...
}

Write these changes? (yes / edit / cancel)
```

- `yes` → proceed to Phase 4
- `edit` → ask which field to change, make the change, re-show, re-ask
- `cancel` → stop without writing anything

**Never write any file without an explicit `yes`.**

---

## Phase 4 — Write

Execute all writes in this order:

1. Write `.claude/embla.json`
2. Generate `.claude/branch-conventions.md` from branch format fields — see [references/branch-config.md](references/branch-config.md) for the template
3. Generate `.claude/commit-conventions.md` from the commit format field — see [references/commit-config.md](references/commit-config.md) for the template
4. If `.claude/config.json` exists: offer to migrate `sprint.team[]` into `embla.json → team` and `sprint.*` fields. Do not delete `config.json` — advise the user to remove it manually after confirming migration.

Print on completion:

```
✅ .claude/embla.json written
✅ .claude/branch-conventions.md generated
✅ .claude/commit-conventions.md generated
```

---

## Phase 5 — Pipeline Setup

Ask: "Set up automated PR review in your CI pipeline? (yes / skip)"

**If skip:**
Print: `"Skipped. Run /embla-core:pipeline any time to set this up."` and proceed to Sub-Commands.

**If yes:**
Invoke `embla-core:pipeline setup`.

---

## Sub-Commands

### `config show`

Read `.claude/embla.json` and display all values in a structured table grouped by domain (repo, tracker, branches, team, notifications). No writes.

If `.claude/embla.json` does not exist, say:
```
No config found. Run /embla-core:config to set up this project.
```

### `config update <domain>`

Skip Phases 0–1. Jump directly to the named domain in Phase 2, then run Phase 3–4 for that domain only.

### `config update <domain.field>`

Skip Phases 0–1. Prompt for only the specified field. Run Phase 3–4 scoped to that field only — write only the changed value back to `.claude/embla.json`, leaving all other fields untouched.

Field path resolution rules:
- `branch.featureBranchFormat` → ask only the feature branch format question
- `jira.statuses` → re-run only the Jira statuses step from [references/jira-config.md](references/jira-config.md)
- `team.dev` → re-run only the `dev` role collection from [references/team-config.md](references/team-config.md)
- `notifications.teamsWebhookUrl` → ask only for the Teams webhook URL

If the field path is not recognised, list valid domain names and stop.

### `config update pipeline`

Invoke `embla-core:pipeline setup` directly.

Before invoking, check that `.claude/embla.json` exists. If not:
```
No config found. Run /embla-core:config first.
```

---

## Error Handling

| Error | Action |
|---|---|
| `getAccessibleAtlassianResources` fails | Skip Jira auto-detection; mark all `tracker.jira.*` fields as `?` in summary |
| Project key not found in Jira | Show warning; let user confirm or correct manually |
| `lookupJiraAccountId` returns no match | Tell user; ask for alternative spelling or skip that person |
| `embla.json` write fails | Report the error; do not print the ✅ success message |
| `.claude/` directory does not exist | Create it before writing |

Never claim config was written without a confirmed successful file write.

---

## Full embla.json Schema

```jsonc
{
  "repo": {
    "provider": "bitbucket",        // any code host name, e.g. "bitbucket", "github", "azure-devops", "gitlab"
    "workspace": "",
    "slug": "",
    "url": ""
  },
  "tracker": {
    "provider": "jira",             // any tracker name, e.g. "jira", "azure-devops", "linear", "github-issues"
    "jira": {
      "siteUrl": "",
      "cloudId": "",                // auto-resolved — never ask
      "projectKey": "",
      "boardId": 0,
      "customFields": {
        "sprint": "",
        "acceptanceCriteria": ""
      },
      "statuses": {
        "toDo":     [],
        "inDev":    [],
        "inReview": [],
        "done":     [],
        "deployed": []
      },
      "issueTypes": {
        "epic":      { "jiraName": "", "summaryFormat": "" },
        "userStory": { "jiraName": "", "summaryFormat": "" },
        "task":      { "jiraName": "", "summaryFormat": "" },
        "bug":       { "jiraName": "", "summaryFormat": "" },
        "subTask":   { "jiraName": "", "summaryFormat": "" }
      }
    }
  },
  "sprint": {
    "namingPattern": "",
    "durationWeeks": 2,
    "goalFormat": ""
  },
  "masterBranch": "main",
  "featureBranchFormat": "",
  "bugBranchFormat": "",
  "hotfixBranchFormat": "",
  "releaseBranchFormat": "",
  "commitMessageFormat": "",
  "team": {
    "lead":   [],
    "qa":     [],
    "ui":     [],
    "devops": [],
    "dev":    []
  },
  "teamsWebhookUrl": "",
  "reviewSlaHours": 24,
  "publicHolidays": [],
  "reviewerMode": "dev",
  "prSizeGateThreshold": 300,
  "testCoverageThreshold": 80,
  "publishThreshold": 60
}
```
