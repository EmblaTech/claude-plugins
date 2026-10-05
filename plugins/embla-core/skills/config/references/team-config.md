# Domain 4 — Team Configuration

Collect role-based team members with Jira account IDs. Covers: `team.lead`, `team.qa`,
`team.ui`, `team.devops`, `team.dev`.

Each person is stored as `{ "name": "Alice", "jiraAccountId": "abc123" }`.

---

## Roles

| Role | Description |
|---|---|
| `lead` | Tech lead / team lead — approves PRs, owns architecture |
| `qa` | QA engineers — responsible for testing and quality gates |
| `ui` | UI/UX engineers — front-end and design implementation |
| `devops` | DevOps / infra engineers — CI/CD, deployments, infrastructure |
| `dev` | General developers — feature and bug work |

---

## Collection Flow

For each role, ask in this order: lead → qa → ui → devops → dev.

**Step 1 — Count:**
```
How many people are in the [role] role? (0 to skip)
→
```

**Step 2 — Names (one per message):**
For each person:
```
Name of [role] #1?
  Example: Alice Smith
→
```

**Step 3 — Jira lookup:**
After each name is entered, call `lookupJiraAccountId` with the display name.

If exactly one match is found:
```
  ✓ Found: Alice Smith (alice.smith@embla.asia)
    Jira account ID: abc123
    Correct? (yes / search again / skip)
```

If multiple matches:
```
  Found multiple matches for "Alice":
    1. Alice Smith   alice.smith@embla.asia
    2. Alice Jones   alice.jones@embla.asia
  Which one? (1 / 2 / skip)
```

If no match:
```
  ✗ No Jira account found for "Alice Smith"
  Try a different name or email, or skip? (retry / skip)
```

A person with no resolved Jira account ID can still be saved with `"jiraAccountId": ""` — warn the user that some skill features (Jira assignment, PR tagging) won't work for them.

---

## Example Output

```json
"team": {
  "lead":   [{ "name": "Alice Smith",  "jiraAccountId": "abc123" }],
  "qa":     [{ "name": "Bob Jones",    "jiraAccountId": "def456" }],
  "ui":     [{ "name": "Carol Lee",    "jiraAccountId": "ghi789" }],
  "devops": [{ "name": "Dave Kumar",   "jiraAccountId": "jkl012" }],
  "dev":    [
    { "name": "Eve Tan",    "jiraAccountId": "mno345" },
    { "name": "Frank Lim",  "jiraAccountId": "pqr678" }
  ]
}
```

---

## Skipping a Role

If the user enters `0` for a role, write an empty array `[]` for that role. Do not ask further questions about it.

---

## Adding Members Later

Remind the user at the end of this domain:
```
ℹ To add or update team members later, run:
    /embla-core:config update team
```
