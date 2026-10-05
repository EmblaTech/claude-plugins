# Pipeline Variable Checklist

Printed by `setup` after writing both files.

---

Print this table, filling the "Suggested value" column with whatever was auto-resolved for that field in Phase 1 (`embla.json` only). Leave it as `—` when nothing was resolved. **Never fill in a suggested value for `BITBUCKET_API_TOKEN` or `ATLASSIAN_API_TOKEN`** — those two rows always show `set manually`, even if a token happened to be found locally, because the pipeline needs its own credential set directly in Bitbucket, not whatever is configured for the local session:

```
Next: Set these variables in Bitbucket repo settings → Pipelines → Variables:
┌─────────────────────────────────┬──────────┬──────────────────┬────────────────────────────────────┐
│ Variable                        │ Required │ Suggested value  │ Notes                              │
├─────────────────────────────────┼──────────┼──────────────────┼────────────────────────────────────┤
│ ANTHROPIC_API_KEY               │ ✅       │ —                │ From console.anthropic.com         │
│ BITBUCKET_USERNAME              │ ✅       │ <resolved/—>     │ Account username (NOT email) — e.g. peter1. Used only for git authentication; @ in email breaks it │
│ BITBUCKET_EMAIL                 │ ✅       │ <resolved/—>     │ Account email — e.g. peterG@embla.asia. Used by the bitbucket MCP server as ATLASSIAN_USER_EMAIL, and by the step's Jira pre-fetch │
│ BITBUCKET_API_TOKEN             │ ✅       │ set manually     │ Bitbucket App Password with scopes: pullrequest:read, repository:read, pullrequest:write. NOT an Atlassian API token — different credential │
│ BITBUCKET_WORKSPACE             │ ✅       │ <resolved/—>     │ Workspace slug (e.g. emblaftdev)   │
│ ATLASSIAN_API_TOKEN             │ ✅       │ set manually     │ Atlassian API token from id.atlassian.com, separate from BITBUCKET_API_TOKEN. Used by the AI PR Review step's Jira pre-fetch, and also by the atlassian MCP server when the ai-develop pipeline is installed │
│ ATLASSIAN_SITE_NAME             │ ✅       │ <resolved/—>     │ Jira domain prefix only — e.g. emblaftdev (not the full URL). From your Jira URL: {this}.atlassian.net. Used by the AI PR Review step's Jira pre-fetch, and also by the atlassian MCP server when the ai-develop pipeline is installed │
│ REVIEW_MODE                     │ ✅       │ pipeline         │ Set to: pipeline                   │
│ REVIEW_SIZE_GATE                │ optional │ —                │ warn / fail / skip (default: warn) │
│ REVIEW_COVERAGE_GATE            │ optional │ —                │ warn / fail / skip (default: fail) │
│ REVIEW_SIZE_THRESHOLD           │ optional │ —                │ integer — PR line count threshold (default: 300) │
│ REVIEW_COVERAGE_THRESHOLD       │ optional │ —                │ integer — coverage % floor (default: 80) │
│ REVIEW_PUBLISH_THRESHOLD        │ optional │ —                │ 0–100 (default: 60)                │
│ REVIEW_PIPELINE_MAX_COMMENTS    │ optional │ —                │ integer (default: 10)              │
└─────────────────────────────────┴──────────┴──────────────────┴────────────────────────────────────┘

Mark all variables as "Secured" in Bitbucket so they are masked in build logs — including the ones with a suggested value shown above, since Bitbucket variables are separate from anything on this machine.

The optional gate variables are read at pipeline runtime from Bitbucket's variable store — do not add them to .mcp.json or embla.json.
```
