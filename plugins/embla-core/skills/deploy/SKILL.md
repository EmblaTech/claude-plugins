---
name: deploy
description: >
  Use when invoked as /embla-core:deploy <PR_ID> by a deployment engineer to deploy an
  approved PR branch to preprod. Fetches PR from Bitbucket, triggers the configured CI/CD
  provider, polls until complete, then transitions Jira to "Ready for QA" and assigns the
  QA engineer. Provider-agnostic — Jenkins is the default; other providers are added via
  providers/ reference files.
---

## Invocation

```
/embla-core:deploy <PR_ID>
```

- If no `PR_ID` given: stop with error `"Error: PR ID required. Usage: /embla-core:deploy <PR_ID>"`

---

## Runtime Resolution

Resolve all values at skill start. Never hardcode. Produce this table before proceeding:

| Value | How to resolve |
|---|---|
| Workspace | `.claude/embla.json → repo.workspace` — fallback: `git remote get-url origin` → parse org segment |
| Repository | `.claude/embla.json → repo.slug` — fallback: `git remote get-url origin` → parse repo segment, strip `.git` |
| Jira Cloud ID | `.claude/embla.json → tracker.jira.cloudId` — fallback: `getAccessibleAtlassianResources` → first resource `id` — required |
| Jira site URL | `.claude/embla.json → tracker.jira.siteUrl` — fallback: `.claude/settings.json → jiraSiteUrl` — required |
| Jira project key | Parse branch `([A-Z]{2,})-\d+`; fallback `.claude/embla.json → tracker.jira.projectKey`; fallback `.claude/settings.json → jiraProjectKey` |
| QA assignee ID | `.claude/embla.json → team.qa[0].jiraAccountId` — required |
| QA display name | `.claude/embla.json → team.qa[0].name` |
| Caller account ID | `mcp__claude_ai_Atlassian__atlassianUserInfo` → `account_id` |
| Deploy provider | `.claude/embla.json → deploy.provider` — required |
| QA status name | `.claude/embla.json → deploy.qaStatusName` — default: `"Ready for QA"` |
| Poll timeout | `.claude/embla.json → deploy.pollTimeoutMins` — default: `30` |
| Jenkins URL | `.claude/embla.json → deploy.jenkins.url` — required if provider = `jenkins` |
| Jenkins job | `.claude/embla.json → deploy.jenkins.job` — required if provider = `jenkins` |
| Jenkins user | `.claude/embla.json → deploy.jenkins.user` — required if provider = `jenkins` |
| Jenkins token | `JENKINS_TOKEN` env var → fallback `.claude/settings.json → deployJenkinsToken` (warn if from settings — token should not be committed) |

If any required value is missing: stop and tell the user exactly which key to add to `.claude/embla.json`.
If a `deploy.*` key is missing, also suggest: `Run /embla-core:config update deploy to configure deployment settings.`

---

## Phase Structure

```
Phase 1   Resolve runtime values
Phase 2   Fetch PR from Bitbucket
Phase 3   Parse Jira ticket from branch
Phase 4   Fetch and display Jira issue
Phase 5   Confirm deployment
Phase 6   Trigger CI/CD provider
Phase 7   Poll build until complete
Phase 8   Success — transition Jira + assign QA
Phase 8F  Failure — report and stop
```

---

## Phase 1 — Resolve Runtime Values

Resolve all values from the Runtime Resolution table above. Print the resolved table. Stop on any missing required value before proceeding.

---

## Phase 2 — Fetch PR

Call `mcp__bitbucket__bb_get` on `/repositories/{workspace}/{repo}/pullrequests/{prId}`.

Extract:
- `source.branch.name` → `branchName`
- `title` → `prTitle`
- `author.display_name` → `prAuthor`

If the PR returns 404: stop — `"Error: PR #{prId} not found. Check the PR ID and try again."`
If the API call fails for any other reason: stop — report the error and ask to retry or cancel.

---

## Phase 3 — Parse Jira Ticket

Apply regex `([A-Z]{2,})-\d+` to `branchName` to extract the Jira ticket ID.

Example: `s224/feature/EM-1234/short-desc` → `EM-1234`

If no match found:
```
⚠ Could not find a Jira ticket ID in branch: {branchName}
Enter ticket ID manually, or skip Jira updates? (enter ID / skip)
```
- If skipped: proceed without any Jira steps (Phases 4, 8 Jira steps are no-ops)

---

## Phase 4 — Fetch and Display Jira Issue

Call `mcp__claude_ai_Atlassian__getJiraIssue` with resolved `cloudId` and ticket ID.

Display:
```
── Jira: EM-1234 ──────────────────────────────────────
  Summary:  [story summary]
  Status:   [current status]
  Assignee: [name or Unassigned]
────────────────────────────────────────────────────────
```

**Guards:**
- If current status matches `deploy.qaStatusName` or any value in `tracker.jira.statuses.done[]`:
  ```
  ⚠ Ticket is already {status}. Continue anyway? (yes / cancel)
  ```
- Any other status: proceed silently.

---

## Phase 5 — Confirm Deployment

Present a preview and require explicit `yes` before triggering anything:

```
── Deploy Preview ──────────────────────────────────────
  PR:       #{prId} — {prTitle}
  Branch:   {branchName}
  Target:   preprod
  Provider: {deployProvider}
  Jira:     {ticketId} → {qaStatusName} (assign to {qaDisplayName})
────────────────────────────────────────────────────────
Deploy? (yes / cancel)
```

`cancel` → stop immediately with no side effects. Do not trigger the build.

---

## Phase 6 — Trigger CI/CD Provider

Read `providers/{deployProvider}.md`. Execute the **Trigger** operation defined there, passing `branchName`.

On success: print `🚀 Build triggered — {queueItemUrl}`
On non-success HTTP response: stop — print HTTP status and response body.

If `providers/{deployProvider}.md` does not exist:
```
Error: No provider adapter found for "{deployProvider}".
Expected file: plugins/embla-core/skills/deploy/providers/{deployProvider}.md
```

---

## Phase 7 — Poll Build Status

Read `providers/{deployProvider}.md`. Execute the **Resolve Build URL** operation to convert `queueItemUrl` to `buildUrl` and `buildNumber`.

Then loop using the **Poll Build Status** operation:
- Poll every **30 seconds**
- Print each tick: `⏳ Build #{buildNumber} — running ({elapsed} elapsed)...`
- Timeout after `deploy.pollTimeoutMins` minutes → treat as `TIMEOUT` → go to Phase 8F
- On `SUCCESS` → Phase 8
- On `FAILURE` or `ABORTED` → Phase 8F

---

## Phase 8 — Success Path

### 8.1 — Transition Jira

Call `mcp__claude_ai_Atlassian__getTransitionsForJiraIssue` → find transition whose name matches `deploy.qaStatusName`.

- If found: call `mcp__claude_ai_Atlassian__transitionJiraIssue` → print `✅ {ticketId} → {qaStatusName}`
- If not found: show available transitions and ask which to use

### 8.2 — Assign QA Engineer

Call `mcp__claude_ai_Atlassian__editJiraIssue`:
```json
{ "assignee": { "accountId": "{team.qa[0].jiraAccountId}" } }
```
Print: `✅ Assigned to {qaDisplayName}`

### 8.3 — Post Jira Comment

Call `mcp__claude_ai_Atlassian__addCommentToJiraIssue`:
```
🚀 Deployed to preprod by {callerName}
   Branch: {branchName}
   Build:  {buildUrl}
   PR:     #{prId}

🤖 Crafted by Claude AI
```

Comment failure is **non-fatal** — print a warning and continue.

### 8.4 — Final Summary

```
✅ Deployment complete
   Build:  {buildUrl}
   Jira:   {ticketId} → {qaStatusName}
   QA:     {qaDisplayName}
```

---

## Phase 8F — Failure Path

```
❌ Deployment failed
   Build:   {buildUrl}
   Console: {consoleUrl}
   Result:  {FAILURE|ABORTED|TIMEOUT}
```

Jira is left untouched. No further action. The deployment engineer decides next steps.

---

## Error Handling

| Error | Action |
|---|---|
| Missing `deploy.*` config | Stop — suggest `/embla-core:config update deploy` |
| Missing Jira / repo config | Stop — print exact `embla.json` key path to add |
| PR not found (404) | Stop — report error, suggest checking PR ID |
| Bitbucket API failure | Stop — report error, ask to retry or cancel |
| No Jira ticket in branch | Warn — offer manual entry or skip Jira |
| Provider file not found | Stop — print expected file path |
| CI/CD trigger fails (non-success) | Stop — print HTTP status + response body |
| Build poll timeout | Report as failure — Phase 8F |
| Jira transition not found | Show available transitions — ask which to use |
| Jira comment failure | Non-fatal — warn and continue |

Never proceed past a failed step without user acknowledgement.
