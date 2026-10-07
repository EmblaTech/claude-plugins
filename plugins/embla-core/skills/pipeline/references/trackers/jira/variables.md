# Jira tracker variables

Rows setup appends to the host's variable checklist when `tracker.provider` is `jira`. Fill "Suggested value" from `embla.json` only; token rows always show `set manually`.

| Variable | Required | Suggested value | Notes |
|---|---|---|---|
| `ATLASSIAN_API_TOKEN` | ✅ | set manually | Atlassian API token from id.atlassian.com, read-only use (C4: the account needs only Browse Projects on the Jira project). Read only by the ticket pre-fetch; never reaches the review process. On Bitbucket, separate from `BITBUCKET_API_TOKEN` — different credential types. |
| `ATLASSIAN_SITE_NAME` | ✅ | derived from `tracker.jira.siteUrl` (strip `https://` and `.atlassian.net`) | Jira domain prefix only, e.g. `emblaftdev` for `emblaftdev.atlassian.net`. |
| `ATLASSIAN_USER_EMAIL` | ✅ (optional on Bitbucket) | — | Atlassian account email that owns `ATLASSIAN_API_TOKEN`. On Bitbucket, leave unset to reuse `BITBUCKET_EMAIL`. |
