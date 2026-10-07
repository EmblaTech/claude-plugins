# GitHub variable checklist

Printed by `setup` after writing the files. Token rows always show `set manually`. Insert the tracker's rows (e.g. `trackers/jira/variables.md`) at `<tracker rows>`; on GitHub, tokens go under **Secrets** and non-secret values under **Variables**.

```
Next: Set these in GitHub → Settings → Secrets and variables → Actions:
┌─────────────────────────────────┬──────────┬──────────┬──────────────────┬────────────────────────────────────┐
│ Name                            │ Kind     │ Required │ Suggested value  │ Notes                              │
├─────────────────────────────────┼──────────┼──────────┼──────────────────┼────────────────────────────────────┤
│ ANTHROPIC_API_KEY               │ Secret   │ ✅       │ set manually     │ From console.anthropic.com         │
│ GITHUB_TOKEN                    │ built in │ —        │ —                │ Nothing to set. Scoped by the workflow's permissions: contents: read, pull-requests: write (GH2) │
│ <tracker rows>                  │          │          │                  │                                    │
│ REVIEW_SIZE_GATE                │ Variable │ optional │ —                │ warn / fail / skip (default: warn) │
│ REVIEW_COVERAGE_GATE            │ Variable │ optional │ —                │ warn / fail / skip (default: fail) │
│ REVIEW_SIZE_THRESHOLD           │ Variable │ optional │ —                │ integer — PR line count threshold (default: 300) │
│ REVIEW_COVERAGE_THRESHOLD       │ Variable │ optional │ —                │ integer — coverage % floor (default: 80) │
│ REVIEW_PUBLISH_THRESHOLD        │ Variable │ optional │ —                │ 0–100 (default: 60)                │
│ REVIEW_PIPELINE_MAX_COMMENTS    │ Variable │ optional │ —                │ integer (default: 10)              │
└─────────────────────────────────┴──────────┴──────────┴──────────────────┴────────────────────────────────────┘

Tokens belong under Secrets, which GitHub masks in logs (C3). REVIEW_MODE is set to pipeline in the workflow itself.

To make the review a merge gate, add the "AI PR Review" check as required in the branch protection rule. Fork PRs get no secrets, so the job fails for them (R3) — leave it non-required if you accept fork PRs.
```
