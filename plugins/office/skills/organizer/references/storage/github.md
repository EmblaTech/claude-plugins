# Storage mode: github

How the [tracker contract](../tracker.md) runs on GitHub issues, for `storage = "github"` in `organizer.toml`. A record is one issue in `repo`. Read and write issues, their fields and comments with the claude.ai GitHub connector tools (`list_issues`, `issue_read`, `issue_write`, `add_issue_comment`), the same ones the page uses. Write the org's issue fields with `gh api graphql`: a connector `issue_write` carrying `issue_fields` opens a confirmation form that the Code tab never shows, so the call hangs. Use `gh` also for creating labels, relations and deleting.

## Operations

| Contract operation | How |
|---|---|
| `list(labels, state, updatedSince, assignee)` | `list_issues` `labels: [...]`, `state: "OPEN"` / `"CLOSED"` / both, `since` for `updatedSince`, `fields` incl. `body`, `labels`, `field_values`, `assignees`; keep the issues whose `assignees` include the assignee; page with `after`, at most 100 a page (the page reads only the first and says "first 100" when it is full). |
| `getByKey(key)` | `list_issues` on the record's kind label (`oz:meeting`, `oz:pr`, `oz:task`, `oz:status`), open and closed, and match `key` in the body's marker line ([Encoding](#encoding)) |
| `create(record)` | `issue_write` `method: "create"` with title, body (marker line included), labels, `assignees`, and `type` as the issue type (Epic / Story / Task; read back in `issue_read` `get` as `issue_type`); then set its fields (the page sends `issue_fields` in the same call) and its relations |
| `update(title, body, meta)` | `issue_write` `method: "update"`; `meta` is rewritten inside the body's marker line |
| `addLabel(label)` / `removeLabel(label)` | `issue_write` `method: "update"`: `labels` replaces the whole set, so read the labels fresh (`issue_read` `get_labels`) and send the full list |
| `setField(name, value)` / `clearField(name)` | `gh api graphql` mutation `setIssueFieldValue(input: {issueId, issueFields: [{fieldId, dateValue \| singleSelectOptionId \| delete: true}]})`, all of one record's fields in one call; IDs below |
| `setState(done)` / `setState(dismissed)` | `issue_write` `state: "closed"`, `state_reason: "completed"` / `"not_planned"` |
| `setState(open)` | `issue_write` `state: "open"` |
| `delete()` | `gh issue delete <n> --yes`. The page's connector cannot delete: its ✕ on a task closes it as not planned and adds `oz:delete`, and every Sync run, before anything else, deletes each issue labelled `oz:delete` this way |
| `children()` / `parent()` / `setParent(record)` | native sub-issues: read `issue_read` `get_sub_issues` / `get_parent`; set with `gh issue create --parent <n>`, or `gh issue edit <parent> --add-sub-issue <child>` |
| `addBlockedBy(record)` | native dependency: `gh api --method POST repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by -F issue_id=<blocker-db-id>` (the blocker's database id, `gh api repos/<owner>/<repo>/issues/<b> --jq .id`) |
| `comments()` / `addComment(text)` | `issue_read` `method: "get_comments"`; `add_issue_comment` |
| `authorship()` | one `gh api graphql` query, below; the owner is the `gh` login ([Quota](#quota) shows how to read it) |
| `quota()` | [Quota](#quota) |

`authorship()` reads, for issue `<n>` (page comments with `after` past 100):

```graphql
{ repository(owner: "<owner>", name: "<repo>") { issue(number: <n>) {
  author { login } editor { login }
  renamed: timelineItems(last: 1, itemTypes: [RENAMED_TITLE_EVENT]) { nodes { ... on RenamedTitleEvent { actor { login } } } }
  labeled: timelineItems(last: 100, itemTypes: [LABELED_EVENT]) { nodes { ... on LabeledEvent { actor { login } label { name } } } }
  comments(first: 100) { nodes { databaseId author { login } editor { login } } } } } }
```

The body's last editor is `editor`, the title's the latest rename's `actor`, each falling back to `author` when empty; the same per comment. Who last added a label is the `actor` of its latest `labeled` node. `databaseId` is the comment `id` that `get_comments` returns.

The field mutation takes node IDs. Read the field and option IDs once per run, and an issue's ID from `repository { issue(number: <n>) { id } }`:

```graphql
{ organization(login: "<owner>") { issueFields(first: 20) { nodes {
  ... on IssueFieldDate { id name }
  ... on IssueFieldSingleSelect { id name options { id name } } } } } }
```

Field values: `Start date` and `Target date` as `dateValue: "YYYY-MM-DD"`; `Priority` as the option id of Urgent, High, Medium or Low; clear with `delete: true`.

**The page's GitHub connector has no dependencies tool**: the page shows no live Blocked mark and `create_task` refuses `blockedBy` until that changes ([findings](https://github.com/EmblaTech/claude-plugins/blob/main/docs/organizer/findings.md)). Sync runs with `gh` and sets it.

## Encoding

- **Key and meta**: the body's last line, `<!-- oz {"key":…, <meta fields>} -->`, with the meta fields [card.md](../card.md#metadata) lists. The status record's line holds its own fields ([Status record](#status-record)).
- **Labels**: GitHub labels, as the contract names them, plus `oz:delete` (see `delete()` above).
- **Fields**: the org's issue fields `Priority`, `Target date`, `Start date` (not Projects v2), read from `field_values`.
- **Relations**: native sub-issues, blocked-by dependencies and issue types.
- **Record links**: a record is `#<n>`, which renders as a link to `https://github.com/<owner>/<repo>/issues/<n>`; a card gist that points to an issue or PR writes `[#42](…)`.
- **Assignee**: a GitHub login.
- **Markers** ([tracker.md](../tracker.md#markers)): plain comment text; GitHub hides the `<!-- -->` line when rendering.

## Status record

One open issue labelled `oz:status`, pinned (`gh issue pin`). Its body is the banner text, then the marker line holding `key` and the status `meta`: `<!-- oz {"key":"status","updated":…,"answered":…,"cursors":{…}} -->`; when all is well, the marker line alone.

## Setup

- Check the org's issue fields `Priority`, `Start date` and `Target date` with `list_issue_fields`; ask before creating a missing one.
- Create every missing label from [tracker.md](../tracker.md#labels), and one per track, with `gh label create "<name>"`; create a missing label the same way before a run uses it.
- Create the `oz:status` issue with `issue_write` when there is none, and pin it. Its author must be the `gh` login: runs post comments and markers through the connector and check them against the `gh` login, so the two must be one account. When they differ, stop and ask the user to connect the same account to both.
- `organizer.toml`: `repo` (`<owner>/<repo>`: the repo the user named under Storage mode in [setup.md](../setup.md)), `server` (the claude.ai GitHub connector's display name), `agent-assignee` (a GitHub login; recommend the current `gh` user, `gh api user -q .login`).
- The page's `mcp` capability declares the connector named in `server` with these tools: `["list_issues", "issue_read", "issue_write", "sub_issue_write", "add_issue_comment", "get_file_contents", "search_code", "list_branches", "list_commits"]`. The last four are the Assistant's repo reads. This connector is never on the Assistant's tool list: the page reaches it only through its own tools, so no repo write is ever exposed. The first time the page opens, claude.ai asks once to allow it.

## Quota

`quota()` is `gh api rate_limit` (free). It gives both buckets a run spends: `resources.core` (REST) and `resources.graphql` (`gh issue create/edit` and `gh api graphql` writes), each with `remaining`, `limit` and `reset` (epoch seconds). The login comes from `gh api graphql -f query='{viewer{login}}' --jq .data.viewer.login`, which spends GraphQL quota only, so it works at zero.

**Threshold:** below 1000 remaining on either bucket, the run skips. Its skip line names the low bucket (the one that resets later when both are low), time in local `HH:MM`: `Sync skipped: GitHub REST quota for <login> at 120/5000, resets 13:55.`

The page counts its own calls against 5000 an hour and slows its polling 4× past half of it or on a rate-limit error.

## Errors

| Contract error | GitHub |
|---|---|
| `auth` | connector `needs_reauth`, `server_not_connected`, `server_not_found`, `selection_required`; `gh` not logged in or HTTP 401 |
| `consent` | connector `consent_required`, `approval_required`, `not_in_manifest` (tool not declared: republish the page) |
| `rate-limited` | HTTP 403/429 with a rate-limit message, or `remaining` at 0 |
| `not-found` | HTTP 404, or an issue number that does not exist |
| `other` | anything else, quoted as it came |
