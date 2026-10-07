# Pipeline Mode

Activates when `--mode=pipeline` is passed or `REVIEW_MODE=pipeline` environment variable is set.

## Contents
- Behaviour Comparison
- Agent Relevance Judgment Applies Identically
- Host access
- File list from git
- Ticket context
- Pipeline Posting Sequence
- Outbox
- Environment Variables
- CI Wiring
- Exit Code Logic
- Cost Reporting (CI-level, not part of this skill)

## Behaviour Comparison

| Behaviour | dev | lead | pipeline |
|---|---|---|---|
| Interactive prompts | AskUserQuestion | AskUserQuestion | Never |
| Gate breach handling | Ask user | Ask user | Env var (warn/fail/skip) |
| Host access | Live Bitbucket MCP | Live Bitbucket MCP | `.claude/pr-review-tools.json` mapping, with file fallback |
| PR comment posting | None | Ask user | Automatic (all postable) |
| PR summary report comment | No | On approval ("Post all"/"Post HIGH only") | Yes |
| Local review file | Always written | Always written | Always written |
| Exit code | Always 0 | Always 0 | 0 = pass / 1 = gate failed |
| Lead Actions section | Omitted | Included | Omitted |

## Agent Relevance Judgment Applies Identically

Phase 2.7's agent relevance judgment (`pr-review/SKILL.md`) runs the same way in `dev`, `lead`, and `pipeline` mode — there is no pipeline-specific carve-out. `dependency_diff`, `jira_context`, and `file_list` are resolved identically across all three modes (pipeline mode's only difference is *how* they are resolved — via the host mapping and the pre-fetched files below, not a live Bitbucket or Jira call — not whether they're empty).

Because pipeline mode is unattended, the one-line exclusion reasoning Phase 2.7 records for every agent it leaves out (see SKILL.md → Phase 2.7 → "Record why") is the only audit trail anyone gets for why an agent didn't run on that build — there's no lead reviewing the run in real time to catch a bad call. Never skip recording that reasoning just because pipeline mode has no prompt to show it to; it still surfaces in the "Agents Field Format" section of the posted report.

## Host access

Pipeline mode reaches the code host only through the operations mapped in `.claude/pr-review-tools.json`, which `embla-core:pipeline` writes for the project's host. dev and lead mode never read this file.

**Load the mapping** once, at the first operation the run needs:

```json
{
  "host": "github",
  "operations": {
    "get_pr":              { "method": "mcp", "tool": "mcp__github__<tool>", "args": { "…": "{PR_ID}" }, "fields": { "state": "<path>", "…": "…" } },
    "list_commits":        { "method": "mcp", "list": "<path>", "…": "…" },
    "list_comments":       { "method": "mcp", "…": "…" },
    "post_inline_comment": { "method": "mcp", "…": "…" },
    "post_comment":        { "method": "outbox" }
  },
  "tracker": { "provider": "jira", "method": "prefetch" }
}
```

If the file is missing or not valid JSON, run every read as `files` and every write as `outbox`, and record `host: pr-review-tools.json missing — reads via files, writes via outbox` (or `invalid`) in the notes. The mapping is loaded when every operation below has a method.

| Operation | Phase | Normalized result | Fallback |
|---|---|---|---|
| `get_pr` | 1 | `{id, state: "OPEN"\|"CLOSED"\|"MERGED", draft, title, description, source_branch, target_branch, last_commit}` | `docs/reviews/pr-context.json` → `pr` |
| `list_commits` | 1 | `[{hash, date}]` (ISO-8601) | `pr-context.json` → `commits` |
| `list_comments` | 1, 2.2 | `[{id, raw, path, line, date, resolved}]` — a missing `resolved` means open | `pr-context.json` → `comments` |
| `post_inline_comment` | 6 Step A | in `{path, line, body}` → out `{id, url}` | outbox `inline` |
| `post_comment` | 6 Step A, B | in `{body}` → out `{id, url}` | outbox `general`, `report` |
| `get_ticket` | 2.4 | `{key, summary, description, issuetype, status, labels, parent, custom}` | `docs/reviews/ticket.json` |

**Run an operation** by its `method`:

- `mcp` — call `tool` with `args`, after these rules:
  1. **Placeholders.** Substitute `{PR_ID}`, `{workspace}` (alias `{owner}`), `{repo}` from Runtime Resolution; `{path}`, `{line}`, `{body}` from the composed comment; `{key}` (the ticket key) for `get_ticket`. Placeholders always sit inside JSON strings: a string that is exactly `"{line}"` or `"{PR_ID}"` becomes the number; every other placeholder, including one inside a longer string such as a path, is substituted as text, with `{body}` JSON-escaped. Every other part of `args` passes to the tool as-is — a Bitbucket `jq` key included, since that filter already shapes the result.
  2. **Fields.** `fields` maps each normalized field to a path in the (filtered) result. For list operations the paths are relative to each list element; the result is the list itself unless a `"list": "<path>"` key names where the array lives. A normalized field with no mapping is `null`.
  3. **State.** Normalize `get_pr.state` the same way for MCP results and `pr-context.json`: case-insensitive `open` → `OPEN`, `merged` → `MERGED`, anything else (`DECLINED`, `SUPERSEDED`, `closed`) → `CLOSED`.
  4. **Write results.** For `post_inline_comment` and `post_comment`, `fields` maps `id` and `url`.
- `files` (reads) — read the operation's fallback from the table above.
- `outbox` (writes) — add the item to `docs/reviews/outbox.json` (see "Outbox").

An operation is done when the phase holds its normalized result, or the item sits in the outbox.

**Read fallback.** When an `mcp` read's tool is not loaded, returns an error, or yields no parseable result, read the same data from its fallback file and record `host: <operation> via files (mcp error: <short reason>)`. When the fallback file is also missing, `get_ticket` leaves `jira_context` empty; any other read shows its error and stops the run, exactly as a failed Bitbucket call does in dev mode — the CI wrapper then reports the run as incomplete.

**Write fallback.** Once any `mcp` write fails, that write and every later write in the run — Step B included — go to the outbox. Comments already posted keep their real URLs. Record `host: <operation> via outbox (mcp error: <short reason>)`.

**Notes line.** Every recorded note appears, `; `-separated, on the `**Notes:**` line of the Step B report and the Phase 7 local file. A run with no notes omits the line.

## File list from git

Phase 2.1's file list comes from `git diff --numstat origin/<dest_branch>...origin/<source_branch>`, run after the same `git fetch` that produces the full diff. Map each line `<added>\t<removed>\t<path>` to `{status, old, new, lines_added, lines_removed}`:

- `status` from that file's header in the full diff: `new file mode` → `added`, `deleted file mode` → `removed`, `rename from` → `renamed`, otherwise `modified`.
- A rename's path `src/{a => b}.ts` splits into `old: src/a.ts`, `new: src/b.ts`; an added file has `old: null`, a removed file `new: null`.
- Binary files show `-` for both counts; record `0`.

The file list is ready when every `diff --git` header in the full diff has one entry. If `git fetch` or `git diff` fails, show the error and stop — pipeline mode has no per-file host fallback.

## Ticket context

Phase 2.4 resolves `jira_context` by `tracker.method` in `.claude/pr-review-tools.json` (`prefetch` when the mapping is missing):

- `prefetch` — `Read` `docs/reviews/ticket.json`. The CI wrapper resolves the key from the PR title or source branch, fetches the issue with `curl` while curl is still installed, and writes the normalized object there. This is the Jira path.
- `mcp` — resolve the key from the PR title, then the source branch, and run `get_ticket` per "Host access", with `docs/reviews/ticket.json` as its read fallback.
- `none` — no ticket source; `jira_context` is empty.

An absent or unparseable result leaves `jira_context` empty and the review proceeds; the requirement agent (or Phase 2.7's synthesized issue) reports the missing link, exactly as it does for a PR with no ticket.

Why Jira is pre-fetched: `--allowedTools` is a permission filter, not a loading filter — an MCP server's whole tool schema is sent into context whether or not any of its tools may be called. The Jira server contributed five tool schemas to every turn for the sake of one read. Pre-fetching removes all five, plus one `npx` cold start per run, and takes `ATLASSIAN_API_TOKEN`, `ATLASSIAN_USER_EMAIL`, and `ATLASSIAN_SITE_NAME` out of the review process's environment entirely.

The ticket shape is `{key, summary, description, issuetype, status, labels, parent, custom}`, where `parent` is key + summary or `null`, and `custom` holds every populated `customfield_*` — acceptance criteria included. For Jira, `description` comes from REST **v2**, so it is a plain string in Jira wiki markup — not the nested Atlassian Document Format (ADF) object dev/lead mode's live `getJiraIssue` call may return instead. The `requirement` agent (see `agents/requirement.md`) is written to read either shape the same way, so this difference is intentional and handled, not a gap to close here.

## Pipeline Posting Sequence

After Phase 4 (scoring), pipeline mode executes in order:

**Step A — Post inline comments**

Take the postable issues — this already excludes any issue Phase 4 flagged `is_duplicate_of_open` (the "Still Open" bucket), regardless of severity — **capped at `REVIEW_PIPELINE_MAX_COMMENTS`** (default: 10). Rank HIGH first, then MED, then LOW — drop from the bottom when over the cap. The orchestrator composes every comment body (line validation, inline-vs-general, footer, voice); each item then goes by its operation's method:

- `mcp` items go in one dispatch to the named `embla-core:poster` subagent with `on_error: stop`, resolved per "Host access" (payload: [output-format.md](output-format.md) → "Step A execution"). An item returning an `error` triggers the write fallback: it and every item after it go to the outbox.
- `outbox` items go straight to the outbox; the poster is not dispatched when no item is `mcp`.

`comment_map` maps each posted item to its returned `url`, and each outbox item to `{{comment:N}}` (see "Outbox"). Step A is done when every capped issue is either in `comment_map` with a URL or placeholder, or logged as failed.

**Step B — Post full report as PR summary comment**

Compose the report with `comment_map` (see [output-format.md](output-format.md) → "Full Review Report Comment (Step B)"). If `post_comment` is `mcp` and no write has failed this run, post it yourself with the resolved tool and write its `id` to `docs/reviews/report-comment-id.txt`. Otherwise put it in the outbox as `report` and leave `report-comment-id.txt` unwritten — the CI script appends the cost line and posts it.

Note: lead mode runs this same Step A/B sequence when the user approves posting ("Post all" or "Post HIGH only") — see SKILL.md Phase 6 — always as live Bitbucket posts.

## Outbox

`docs/reviews/outbox.json` holds every write the run could not post live. Write it once, at the end of Phase 6, only when at least one item went to it:

```json
{
  "inline": [ { "n": 1, "path": "src/a.ts", "line": 42, "body": "[HIGH] …\n\n🤖 review" } ],
  "general": [ { "n": 2, "body": "[MED] [src/x.ts:9] …\n\n🤖 review" } ],
  "report": { "body": "### 🤖 Review Report … [src/a.ts:42]({{comment:1}}) … [src/x.ts:9]({{comment:2}}) …" }
}
```

- `n` runs 1, 2, 3… across `inline` and `general` together, in Step A's ranked order; `body` is the composed comment, byte-for-byte.
- The report links an outbox comment as `[{file}:{line}]({{comment:N}})` — the same link form as a live comment, with the placeholder in place of the URL.
- Write `[]` for an empty `inline` or `general`; omit `report` when Step B posted live.

The CI script (rule D2 in the `pipeline` skill) posts `inline`, then `general`; replaces each `({{comment:N}})` with `(<url>)`, or, where that post failed, the whole `[{file}:{line}]({{comment:N}})` with `` `{file}:{line}` ``; appends the cost line to `report.body`; then posts the report. The outbox is complete when every item not posted live appears in it exactly once.

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

The PR id arrives as the `<PR_ID>` argument, which the host's pipeline file fills from its own built-in variable.

## CI Wiring

The pipeline file itself is owned entirely by the `embla-core:pipeline` skill — not documented here, since a copy here is exactly how this doc went stale before. For the canonical step definition, the rules every host's file must satisfy, and the required variables, see:
- [`pipeline` skill → references/pipeline-rules.md](../../pipeline/references/pipeline-rules.md)
- [`pipeline` skill → references/hosts/](../../pipeline/references/hosts/) — `<provider>/template.yml` and `<provider>/variables.md` per ready-made host

Run `/embla-core:pipeline check` to verify an existing pipeline still matches its canonical template or rules.

The table above (Environment Variables) covers only this skill's own review-behavior knobs — mode, gates, thresholds — which the pipeline reads from the host's variable store at runtime. It intentionally does not repeat infra credentials owned by the `pipeline` skill.

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

The canonical CI templates (`embla-core:pipeline`, see `references/hosts/<provider>/template.yml` in that skill) invoke `claude -p` with `--output-format json`, and after the process exits, parse the resulting `total_cost_usd`/`usage` fields and add them to the Step B summary comment — patched into the live comment found via `docs/reviews/report-comment-id.txt`, or appended to `outbox.json`'s `report.body` before the script posts it.

**What the two figures mean — they do not reconcile, by design.** `total_cost_usd` is the authoritative whole-session total: it includes every subagent dispatch. The `usage.*` token counts do **not** — they cover the main session only. Reading `usage.input_tokens` alone understates input by a further large margin, since it excludes cached tokens; the wrapper therefore sums `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` and reports cache reads separately, so a run's cache hit rate is visible. Multiplying the reported tokens by list prices will still land well under `total_cost_usd` — the gap is subagent usage, and the posted comment says so rather than implying the numbers add up. None of this is part of `pr-review`'s own phases — Claude cannot accurately report its own session cost from inside a report it's still generating, since that report's own tokens aren't counted yet. Cost is entirely computed by the CI wrapper after the `claude` process exits, from its own CLI output; `pr-review` only supplies the comment id (or the outbox report) to put it in.

One consequence worth knowing if you're debugging a red build: the wrapper trusts the review's artifacts over the raw exit code alone — a crash and a real gate failure can both exit non-zero, and only those artifacts prove the review actually finished. The proof is a valid `docs/reviews/pr-review-cost.json` plus either a numeric `docs/reviews/report-comment-id.txt` or an `outbox.json` carrying `report`. With that proof and exit code `1`, the wrapper adds the cost line and prints the existing gate diagnostic. If neither report artifact exists but the cost JSON is valid and the exit code is `0`, that's a legitimate skip (draft PR, closed PR, or a re-run with no new commits since the last review — Phase 1 never reaches Step B in any of these cases) — the wrapper logs why and exits `0` cleanly, posting nothing. Any other combination means the run never finished — the wrapper treats it as incomplete and posts a separate fallback comment instead. See the `pipeline` skill's `pipeline-rules.md` (rules R1–R6, D1–D2) for the full mechanism.
