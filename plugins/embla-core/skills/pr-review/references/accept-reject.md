# accept / reject Sub-Commands

Both use the values from SKILL.md → Runtime Resolution (workspace, repo, Jira key, cloud ID). All phases are skipped — these are standalone Jira + Bitbucket actions.

## accept

```
/embla-core:pr-review <PR_ID> accept
```

1. Fetch PR: `GET /repositories/{workspace}/{repo}/pullrequests/{PR_ID}` → `author.account_id`, `author.display_name`
2. Resolve deployment engineer (see below)
3. `getTransitionsForJiraIssue` → find "Ready for Deployment" (case-insensitive). If not found: list available transitions and ask user to pick.
4. `transitionJiraIssue`
5. `editJiraIssue` → `{ "fields": { "assignee": { "accountId": "{deploymentEngineerAccountId}" } } }`
6. Post marker comment to PR:
   ```
   mcp__bitbucket__bb_post /repositories/{workspace}/{repo}/pullrequests/{PR_ID}/comments
   body: { "content": { "raw": "🤖 review: accepted — Jira {ISSUE_KEY} → Ready for Deployment, assigned to {deploymentEngineerDisplayName}" } }
   ```

**Output:**
```
✓ PR #{PR_ID} accepted
  Jira {ISSUE_KEY}: → Ready for Deployment
  Assigned to: {deploymentEngineerDisplayName}
```

### Deployment Engineer Resolution

Priority order:

1. `.claude/embla.json → deploymentEngineerAccountId` + `deploymentEngineerDisplayName`. Fallback: `.claude/settings.json → deploymentEngineerAccountId` + `deploymentEngineerDisplayName`. If both fields are found at the first source that has them, confirm: `"I'll assign to {name} as deployment engineer — OK? (yes / change)"`. On yes: skip to assignment. On change: ask for name → `lookupJiraAccountId`.

2. Run 3 JQL searches in parallel (`pagelen: 5`):

   | Search | JQL |
   |---|---|
   | Deployed tickets | `status in ({deployedStatuses}) ORDER BY updated DESC` |
   | Deployment issue types | `issuetype in ({deploymentIssueTypes}) ORDER BY updated DESC` |
   | Deployment labels | `labels in ({deploymentLabels}) ORDER BY updated DESC` |

   Config read with fallback chain:
   - `deployedStatuses`: `.claude/embla.json → tracker.jira.statuses.deployed` → `.claude/settings.json → deployedStatuses` → `["Deployed", "Released"]`
   - `deploymentIssueTypes`: `.claude/settings.json → deploymentIssueTypes` → `["Deployment", "Release"]`
   - `deploymentLabels`: `.claude/settings.json → deploymentLabels` → `["deploy"]`

3. Collect `assignee.accountId` + `assignee.displayName` from all results. Tally by `accountId`. Pick highest frequency.

4. If winner found: `"I found {displayName} as the most frequent deployment engineer — assign to them? (yes / change)"`. On change: ask for name → `lookupJiraAccountId`.

5. If no results across all 3 searches: `"Could not detect deployment engineer. Who should I assign this to?"` → `lookupJiraAccountId`.

6. Save to `.claude/embla.json`: `deploymentEngineerAccountId` + `deploymentEngineerDisplayName` at the top level (alongside `reviewerMode`, `publishThreshold` etc.).

---

## reject

```
/embla-core:pr-review <PR_ID> reject
```

1. Fetch PR: `GET /repositories/{workspace}/{repo}/pullrequests/{PR_ID}` → `author.account_id`, `author.display_name`
2. Resolve Jira issue key: parse current branch `([A-Z]{2,})-\d+`; fallback: fetch PR source branch from Bitbucket, apply same regex; fallback: ask user
3. `getTransitionsForJiraIssue` → find "In Progress" (case-insensitive). If not found: list available transitions and ask user to pick.
4. `transitionJiraIssue`
5. `editJiraIssue` → `{ "fields": { "assignee": { "accountId": "{author.account_id}" } } }`
6. Post marker comment to PR:
   ```
   mcp__bitbucket__bb_post /repositories/{workspace}/{repo}/pullrequests/{PR_ID}/comments
   body: { "content": { "raw": "🤖 review: rejected — Jira {ISSUE_KEY} → In Progress, assigned back to {author.display_name}" } }
   ```

**Output:**
```
✓ PR #{PR_ID} rejected
  Jira {ISSUE_KEY}: → In Progress
  Assigned back to: {author.display_name}
```
