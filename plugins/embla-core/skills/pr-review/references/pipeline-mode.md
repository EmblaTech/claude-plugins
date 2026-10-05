# Pipeline Mode

Activates when `--mode=pipeline` is passed or `REVIEW_MODE=pipeline` environment variable is set.

## Behaviour Comparison

| Behaviour | dev | lead | pipeline |
|---|---|---|---|
| Interactive prompts | AskUserQuestion | AskUserQuestion | Never |
| Gate breach handling | Ask user | Ask user | Env var (warn/fail/skip) |
| Bitbucket comment posting | None | Ask user | Automatic (all postable) |
| PR summary report comment | No | On approval ("Post all"/"Post HIGH only") | Yes |
| Local review file | Always written | Always written | Always written |
| Exit code | Always 0 | Always 0 | 0 = pass / 1 = gate failed |
| Lead Actions section | Omitted | Included | Omitted |

## Agent Relevance Judgment Applies Identically

Phase 2.7's agent relevance judgment (`pr-review/SKILL.md`) runs the same way in `dev`, `lead`, and `pipeline` mode — there is no pipeline-specific carve-out. `dependency_diff`, `jira_context`, and `file_list` are resolved identically across all three modes (pipeline mode's only difference is *how* `jira_context` is resolved — via the pre-fetched file below, not a live MCP call — not whether it's empty).

Because pipeline mode is unattended, the one-line exclusion reasoning Phase 2.7 records for every agent it leaves out (see SKILL.md → Phase 2.7 → "Record why") is the only audit trail anyone gets for why an agent didn't run on that build — there's no lead reviewing the run in real time to catch a bad call. Never skip recording that reasoning just because pipeline mode has no prompt to show it to; it still surfaces in the "Agents Field Format" section of the posted report.

## Pipeline Posting Sequence

After Phase 4 (scoring), pipeline mode executes in order:

**Step A — Post inline comments**

Post postable issues as Bitbucket inline comments — this already excludes any issue Phase 4 flagged `is_duplicate_of_open` (the "Still Open" bucket), regardless of severity — **capped at `REVIEW_PIPELINE_MAX_COMMENTS`** (default: 10). Rank HIGH first, then MED, then LOW — drop from the bottom when over the cap.

The orchestrator composes every comment body (line validation, inline-vs-general, footer, voice) and the named `embla-core:poster` subagent (tools scoped to `mcp__bitbucket__bb_post` only) transmits them verbatim, returning `href` per item. `comment_map` is built from those hrefs and passed to Step B. Full mechanics and the exact subagent payload: @references/output-format.md → "Step A execution".

**Step B — Post full report as PR summary comment**

Post a single Bitbucket comment containing the full review report. Use `comment_map` from Step A to generate clickable links for posted issues. See @references/output-format.md → "Full Review Report Comment (Step B)" section.

Note: lead mode runs this same Step A/B sequence when the user approves posting ("Post all" or "Post HIGH only") — see SKILL.md Phase 6. Pipeline mode is not the only place this posts.

## Environment Variables

| Variable | Values | Default | Purpose |
|---|---|---|---|
| `REVIEW_MODE` | `dev` \| `lead` \| `pipeline` | `dev` | Mode override |
| `REVIEW_SIZE_GATE` | `warn` \| `fail` \| `skip` | `warn` | pr-size-gate action when threshold exceeded |
| `REVIEW_COVERAGE_GATE` | `warn` \| `fail` \| `skip` | `fail` | Test coverage gate action when below threshold |
| `REVIEW_PUBLISH_THRESHOLD` | integer 0–100 | `60` | Minimum score for an issue to be published as a comment |
| `REVIEW_PIPELINE_MAX_COMMENTS` | integer | `10` | Maximum inline comments posted in pipeline mode (HIGH ranked first) |
| `REVIEW_SIZE_THRESHOLD` | integer | `300` | Override pr-size-gate line threshold |
| `REVIEW_COVERAGE_THRESHOLD` | integer 0–100 | `80` | Override test coverage threshold % |
| `ANTHROPIC_API_KEY` | string | — | Required for Claude invocation |
| `BITBUCKET_PR_ID` | integer | — | Auto-set by Bitbucket Pipelines |

## Pre-fetched Jira context

Pipeline mode carries **no Jira MCP server**. The CI wrapper resolves the issue key from the PR title or source branch, fetches the issue with `curl` while curl is still installed, and writes a normalized JSON object to `docs/reviews/jira-issue.json`. Phase 2.4 reads that file instead of calling a Jira tool.

Why: `--allowedTools` is a permission filter, not a loading filter — an MCP server's whole tool schema is sent into context whether or not any of its tools may be called. The Jira server contributed five tool schemas to every turn for the sake of one read. Pre-fetching removes all five, plus one `npx` cold start per run, and takes `ATLASSIAN_API_TOKEN`, `ATLASSIAN_USER_EMAIL`, and `ATLASSIAN_SITE_NAME` out of the review process's environment entirely.

The file shape is `{key, summary, description, issuetype, status, labels, parent, custom}`, where `custom` holds every populated `customfield_*` — acceptance criteria included. `description` comes from Jira REST **v2**, so it is a plain string in Jira wiki markup — not the nested Atlassian Document Format (ADF) object dev/lead mode's live `getJiraIssue` call may return instead. The `requirement` agent (see `agents/requirement.md`) is written to read either shape the same way, so this difference is intentional and handled, not a gap to close here.

If the key can't be resolved or the fetch fails, the wrapper logs the reason and writes nothing. Phase 2.4 then treats Jira as unavailable and the requirement agent reports the missing link, exactly as it does for a PR with no ticket.

## CI Wiring

The `bitbucket-pipelines.yml` step itself is owned entirely by the `embla-core:pipeline` skill — not documented here, since a copy here is exactly how this doc went stale before. For the canonical step definition and the full list of required Bitbucket repository variables, see:
- [`pipeline` skill → references/bitbucket-pipelines-template.yml](../../pipeline/references/bitbucket-pipelines-template.yml)
- [`pipeline` skill → references/pipeline-variables.md](../../pipeline/references/pipeline-variables.md)

Run `/embla-core:pipeline check` to verify an existing pipeline still matches the canonical template.

The table above (Environment Variables) covers only this skill's own review-behavior knobs — mode, gates, thresholds — which the pipeline reads from Bitbucket's variable store at runtime. It intentionally does not repeat infra credentials owned by the `pipeline` skill.

## Exit Code Logic

`claude`'s own exit code reflects harness completion, not this gate verdict — the harness has no concept of what the agent concluded. Hand the verdict off on disk instead, for the CI wrapper to read once the process exits.

After Phase 7 completes (pipeline mode only), use the Write tool to create `docs/reviews/gate-result.json`:

```json
{"exit_code": 1, "gates": [<pr-size-gate Gate Result>, <test-coverage-gate Gate Result>]}
```

- `exit_code`: `1` if any gate had action `fail` AND `passed=false`, otherwise `0`
- `gates`: each gate's own Gate Result object (`pr-size-gate.md` / `test-coverage-gate.md` → "Gate Result") — omit a `skip`ped gate

**Note:** `--force-size` and `--force-coverage` flags are ignored in pipeline mode. Use `REVIEW_SIZE_GATE=skip` or `REVIEW_COVERAGE_GATE=skip` instead.

## Cost Reporting (CI-level, not part of this skill)

The canonical CI template (`embla-core:pipeline`, see [bitbucket-pipelines-template.yml](../../pipeline/references/bitbucket-pipelines-template.yml)) invokes `claude -p` with `--output-format json`, and after the process exits, parses the resulting `total_cost_usd`/`usage` fields and patches them into the same summary comment Step B already posted

**What the two figures mean — they do not reconcile, by design.** `total_cost_usd` is the authoritative whole-session total: it includes every subagent dispatch. The `usage.*` token counts do **not** — they cover the main session only. Reading `usage.input_tokens` alone understates input by a further large margin, since it excludes cached tokens; the wrapper therefore sums `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` and reports cache reads separately, so a run's cache hit rate is visible. Multiplying the reported tokens by list prices will still land well under `total_cost_usd` — the gap is subagent usage, and the posted comment says so rather than implying the numbers add up. (found via `docs/reviews/report-comment-id.txt` — see Step B's instructions in [output-format.md](output-format.md)). None of this is part of `pr-review`'s own phases — Claude cannot accurately report its own session cost from inside a report it's still generating, since that report's own tokens aren't counted yet. Cost is entirely computed by the CI wrapper after the `claude` process exits, from its own CLI output; `pr-review` only supplies the comment id to patch it into.

One consequence worth knowing if you're debugging a red build: the wrapper trusts whether `docs/reviews/report-comment-id.txt` and `docs/reviews/pr-review-cost.json` are both present and valid over the raw exit code alone — a crash and a real gate failure can both exit non-zero, and only those artifacts prove the review actually finished. If they're valid and the exit code is `1`, the wrapper patches the cost line in and prints the existing gate diagnostic. If the comment id is missing but the cost JSON is valid and the exit code is `0`, that's a legitimate skip (draft PR, closed PR, or a re-run with no new commits since the last review — Phase 1 never reaches Step B in any of these cases) — the wrapper logs why and exits `0` cleanly, posting nothing. Any other combination (missing/invalid cost JSON, or a non-zero exit with no comment id) means the run never finished — the wrapper treats it as incomplete and posts a separate fallback comment instead, since there's no summary comment to patch cost into. See `pipeline-templates.md`'s step-rationale walkthrough for the full mechanism.
