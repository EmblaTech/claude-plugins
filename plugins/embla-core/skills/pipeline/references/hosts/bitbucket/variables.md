# Bitbucket variable checklist

Printed by `setup` after writing the files. Fill "Suggested value" from `embla.json` only, `—` when nothing resolved. Token rows always show `set manually`, even when a token exists locally: the pipeline needs its own credential in Bitbucket. Append the tracker's rows (e.g. `trackers/jira/variables.md`) before the optional `REVIEW_*` rows.

```
Next: Set these variables in Bitbucket repo settings → Pipelines → Variables:
┌─────────────────────────────────┬──────────┬──────────────────┬────────────────────────────────────┐
│ Variable                        │ Required │ Suggested value  │ Notes                              │
├─────────────────────────────────┼──────────┼──────────────────┼────────────────────────────────────┤
│ ANTHROPIC_API_KEY               │ ✅       │ —                │ From console.anthropic.com         │
│ BITBUCKET_EMAIL                 │ ✅       │ <resolved/—>     │ Atlassian account email, e.g. peterG@embla.asia. Used for REST Basic auth (pre-fetch, outbox, report) and by the bitbucket MCP server as ATLASSIAN_USER_EMAIL │
│ BITBUCKET_API_TOKEN             │ ✅       │ set manually     │ Bitbucket App Password with scopes: pullrequest:read, repository:read, pullrequest:write — nothing broader (C4). NOT an Atlassian API token — different credential │
│ BITBUCKET_WORKSPACE             │ ✅       │ <resolved/—>     │ Workspace slug (e.g. emblaftdev)   │
│ <tracker rows>                  │          │                  │                                    │
│ REVIEW_MODE                     │ ✅       │ pipeline         │ Set to: pipeline                   │
│ REVIEW_SIZE_GATE                │ optional │ —                │ warn / fail / skip (default: warn) │
│ REVIEW_COVERAGE_GATE            │ optional │ —                │ warn / fail / skip (default: fail) │
│ REVIEW_SIZE_THRESHOLD           │ optional │ —                │ integer — PR line count threshold (default: 300) │
│ REVIEW_COVERAGE_THRESHOLD       │ optional │ —                │ integer — coverage % floor (default: 80) │
│ REVIEW_PUBLISH_THRESHOLD        │ optional │ —                │ 0–100 (default: 60)                │
│ REVIEW_PIPELINE_MAX_COMMENTS    │ optional │ —                │ integer (default: 10)              │
└─────────────────────────────────┴──────────┴──────────────────┴────────────────────────────────────┘

Mark every variable "Secured" so Bitbucket masks it in build logs (C3).

BITBUCKET_USERNAME is no longer needed: the plugin repo is cloned from public GitHub without credentials (S2). Keep it only if the ai-develop pipeline is installed — that pipeline still uses it.

The optional gate variables are read at pipeline runtime from Bitbucket's variable store — keep them out of .mcp.json and embla.json.
```
