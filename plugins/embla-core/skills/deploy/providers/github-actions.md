# GitHub Actions Provider Adapter

> **Not yet implemented.** This file is a stub for future extension.

To implement this provider, define the three operations below following the same contract
as `jenkins.md`:

1. **Trigger** — dispatch a `workflow_dispatch` event via the GitHub REST API with the branch as an input parameter
2. **Resolve Build URL** — poll the workflow runs API until the triggered run appears
3. **Poll Build Status** — check `run.status` and `run.conclusion` until the run completes

Config keys to add under `.claude/embla.json → deploy.githubActions`:
- `owner` — GitHub org or user
- `repo` — repository name
- `workflow` — workflow file name (e.g. `deploy-preprod.yml`)

Token: `GITHUB_TOKEN` env var.

See https://docs.github.com/en/rest/actions/workflows for API reference.
