# Domain 1 — Repo & Tracker Configuration

Collect repository details and task management provider config. This domain covers:
`repo`, `tracker.provider`, and all `tracker.jira.*` fields.

---

## Step 1 — Repository

Ask for repo details. Show the current git remote as a hint if available:

```bash
git remote get-url origin
```

Questions (one at a time, with examples):

**Provider:**
```
Which version control provider does this project use?
  1. bitbucket   (e.g. bitbucket.org/workspace/repo)
  2. github      (e.g. github.com/org/repo)
  3. azure-devops

→ Default: bitbucket
```

**Workspace / Organisation:**
```
What is your Bitbucket workspace (or GitHub org / Azure DevOps org)?
  Example: embla-asia
→ [current value or blank]
```

**Repository slug:**
```
What is the repository slug (name)?
  Example: ftweb
→ [current value or blank]
```

**URL:** Construct automatically from provider + workspace + slug. Do not ask. Show the constructed value in the Phase 3 preview.

| Provider | URL pattern |
|---|---|
| bitbucket | `https://bitbucket.org/{workspace}/{slug}` |
| github | `https://github.com/{workspace}/{slug}` |
| azure-devops | `https://dev.azure.com/{workspace}/{slug}` |

---

## Step 2 — Task Management Provider

```
Which task management tool does this project use?
  1. jira          (Jira Cloud)
  2. github-issues (GitHub Issues)
  3. linear        (Linear)
  4. azure-devops  (Azure DevOps Boards)

→ Default: jira
```

If provider is not `jira`, write `tracker.provider` and skip Steps 3–7. Note:
```
ℹ Non-Jira tracker support is not yet fully configured by init.
  Set tracker.<provider> fields manually as needed.
```

---

## Step 3 — Jira Site & Project (auto-detected)

Values resolved in Phase 0. Show them as pre-confirmed:

```
Jira site:    https://emblaftdev.atlassian.net  ✓ auto-detected
Cloud ID:     (resolved)                         ✓ auto-detected
Project key:  FT                                 ✓ inferred from branch
```

If `projectKey` was not detected, ask:
```
What is your Jira project key?
  Example: FT, EM, PROJ
→ [blank]
```

If `siteUrl` was not detected, ask:
```
What is your Jira site URL?
  Example: https://yourcompany.atlassian.net
→ [blank]
```

Do not ask for `cloudId` — always resolve via `getAccessibleAtlassianResources`.

---

## Step 4 — Custom Fields

Call `getJiraProjectIssueTypesMetadata` with the resolved `projectKey`. Scan returned fields for names containing "Sprint" and "Acceptance Criteria" (case-insensitive).

If found automatically:
```
Found custom fields:
  Sprint:               customfield_10020  ✓ auto-detected
  Acceptance Criteria:  customfield_10016  ✓ auto-detected

Keep these? (yes / change)
```

If not found, show a numbered list of all returned custom fields and ask:
```
Which field is "Sprint"? (enter number or type the field ID)
Which field is "Acceptance Criteria"? (enter number, type the field ID, or skip)
```

---

## Step 5 — Jira Statuses

Call `getTransitionsForJiraIssue` on a recent open ticket in the project to retrieve available statuses. Present them grouped for assignment:

```
Available Jira statuses for project FT:
  Backlog, To Do, In Progress, In Review, PR Raised, Done, Deployed, Released

Assign each status to a stage:

  toDo     — work not started yet
  inDev    — actively being developed
  inReview — in code review / PR open
  done     — completed but not deployed
  deployed — live in production

Example:
  toDo:     ["To Do", "Backlog"]
  inDev:    ["In Progress"]
  inReview: ["In Review", "PR Raised"]
  done:     ["Done"]
  deployed: ["Deployed", "Released"]

Which statuses map to each stage? (use the numbers or names from the list above)
```

If the API call fails, show the example above and ask the user to type their statuses manually.

---

## Step 6 — Issue Types & Summary Formats

Call `getJiraProjectIssueTypesMetadata` to get issue type names for the project.

Show the project's actual issue type names alongside the standard defaults:

```
Issue type mappings for project FT:

  Epic       → Jira name "Epic"       Summary format: {product-area}: {goal}
  User Story → Jira name "Story"      Summary format: As a {role}, I want {goal} so that {benefit}
  Task       → Jira name "Task"       Summary format: {verb} {subject}
  Bug        → Jira name "Bug"        Summary format: [BUG] {component}: {symptom}
  Sub-task   → Jira name "Sub-task"   Summary format: {verb} {subject}

Keep these defaults? (yes / customise)
```

On `customise`: ask for each type's Jira name and summary format one at a time.

Tokens available in summary formats: `{role}`, `{goal}`, `{benefit}`, `{product-area}`, `{component}`, `{symptom}`, `{verb}`, `{subject}`
