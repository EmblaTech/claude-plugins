# ai-develop trigger guidance

Read by `setup` step 6 after the ai-develop pipeline is written. Output is printed instructions only: the user builds the trigger by hand, and no file or API call creates it.

**Contract** — every trigger does what the Jira reference does: on a new ticket comment containing `@claudedev` (case-insensitive), from anyone but the run's own account, start the ai-develop pipeline on the default branch with `ISSUE_KEY` (the ticket key) and `COMMENTER_ID` (the commenter's account id). The Bitbucket + Jira profile names these `JIRA_ISSUE_KEY` and `COMMENTER_ACCOUNT_ID`. Anyone who can comment can trigger a run.

## 1. Known tracker

`trackers/<tracker.provider>/ai-develop-trigger.md` exists (`jira` today) → fill its `<…>` values from `embla.json` and the host. When the host is not Bitbucket, replace the URL, body and `Authorization` value with the host facts from step 2's last two rows. Go to step 4.

## 2. Research

Look up each fact in the tracker's and host's official docs (context7 or the vendor's documentation site) and record the source URL beside it:

| Fact | Jira reference |
|---|---|
| Native automation or webhook that fires on a new comment | Automation → *Work item commented* |
| Matching `@claudedev` in the comment body | smart-value condition, `contains` |
| Reading the ticket key and commenter id | `{{issue.key}}`, `{{comment.author.accountId}}` |
| Excluding the run's own account's comments | condition on comment author |
| Sending an authenticated HTTP request with the secret hidden | *Send web request*, Hidden header |
| Host endpoint and body that start the ai-develop pipeline with inputs | Bitbucket `POST /2.0/repositories/{workspace}/{slug}/pipelines/`, `selector.pattern: ai-develop` |
| Host token that can start it, minimum scope | repository access token, `pipeline:write` |

Same platform for tracker and host (e.g. GitHub Issues + GitHub Actions): the trigger is an event in the pipeline file itself (`on: issue_comment`), already written by the generator. Print that, the condition it carries, and step 4's test only.

Tracker with no native outbound HTTP: use a webhook the host can receive directly, if the docs show one, and label it a fallback.

Done when every row has a value and a source, or is listed as unconfirmed.

## 3. Unconfirmed facts

Any row without a source → print `Could not confirm from official docs: <facts>` and the closest documented alternative, labelled. Unconfirmed steps never appear as instructions.

## 4. Print

In this order, each step citing its source:
1. Numbered UI steps in the Jira reference's order: trigger, tag condition, own-account exclusion, request.
2. The request body, copy-pasteable, with the tracker's placeholders for key and commenter.
3. The token to create, its minimum scope, and where it is stored (the tracker's hidden field — never `embla.json`).
4. Public tracker or repo per the docs → `Warning: anyone who can comment can start a run, including people outside your team. Each run spends API budget and pushes a branch.`
5. Test: comment `@claudedev` on a test ticket, confirm the request's success status in the tracker's log and the run on the host.
