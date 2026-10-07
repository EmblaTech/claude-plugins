# Output Format, Voice, and Errors

## Contents
- Terminal Display (Phase 5)
- PR Comment Formats (Phase 6)
- Full Review Report Comment (Step B)
- Posting Order (lead mode on approval, and pipeline mode)
- Voice & Tone
- Error Handling
- Implementation Notes

## Terminal Display (Phase 5)

Produce terminal output in exactly this format:

```
### review — PR #{PR_ID}: {PR_TITLE}
Jira: [{JIRA_KEY}-NNN]({jira_url}) — {jira_summary}

Found {N} postable issues + {M} filtered + {K} still open.
Severity breakdown: {X} HIGH, {Y} MED, {Z} LOW

[HIGH] path/to/file.ts:42
  Direct one-sentence description. Second sentence only if needed for why.

[HIGH] path/to/other.ts:108
  ...

[MED] path/to/file.ts:63
  ...

[LOW] path/to/file.ts:12
  ...

Still open (from previous review — not re-posted):
  [MED] path/to/file.ts:42 — matches comment from 2026-07-10

Filtered (low confidence — not posted unless asked):
  [LOW] path/to/file.ts:88 — brief reason
  [LOW] path/to/other.ts:22 — brief reason
```

If the postable list is empty AND there are no Still Open issues:

```
### review — PR #{PR_ID}: {PR_TITLE}

No issues above confidence threshold. Checked: {agents that ran, formatted per "Agents Field Format" below}
```

If the postable list is empty but Still Open issues exist (the common re-run case: prior issues remain unfixed, no new issues introduced):

```
### review — PR #{PR_ID}: {PR_TITLE}

No new issues above confidence threshold. {K} still open from a previous review:

Still open (from previous review — not re-posted):
  [MED] path/to/file.ts:42 — matches comment from 2026-07-10
```

### Agents Field Format

Wherever a report shows which agents ran (`Checked: ...` in Phase 5's empty-result case above, `**Agents:**` in the Full Review Report Comment, `**Agents:**` in Phase 7's local file), list every agent that actually ran, then append one annotation per agent Phase 2.7 excluded, comma-separated with the rest:

- `{agent}: skipped ({reason})` — using the one-line reason Phase 2.7 recorded for that exclusion (see SKILL.md → Phase 2.7 → "Record why"). Group agents that share the identical reason into one entry, e.g. `performance/risk/coverage: skipped (doc-only PR, no behavioral code touched)`.
- `requirement: synthesized (no Jira link)` — when Phase 2.7 excluded `requirement` while `jira_context` was empty and synthesized the fallback issue in its place (see Phase 2.7's "Zero-cost equivalents"). This is not a "skipped" annotation — `requirement`'s finding is still present in the report, just produced without a subagent call.

The annotation only applies when the agent actually did not run (or, for `requirement`, did not run as a full agent call) — an agent judgment includes runs plainly with no annotation.

Example (doc-only PR, no Jira link): `code-quality, security, requirement: synthesized (no Jira link), dependency: skipped (no package manifest touched), performance/risk/coverage: skipped (doc-only PR, no behavioral code touched)`

Omit annotations entirely when Phase 2.7 excluded nothing — a PR where judgment includes all 7 shows the plain 7-name list, unchanged from today.

---

## PR Comment Formats (Phase 6)

Every posted comment must end with the footer `🤖 review`.

**Format authority stays here, in the orchestrator.** You compose every comment body yourself, then hand the finished bodies to a poster subagent that transmits them verbatim. The subagent never composes, never formats, and never sees the diff or the findings — so it cannot get any of this wrong. See "Step A execution" below.

### Inline comment

For each postable issue where `file != ""` and `line != 0`:

**Line validation (before composing):** Check whether the issue's line number appears in the diff for that file — i.e., it is a `+`, `-`, or context line within a diff hunk in `{file_diffs}`. Use this rule:

- **Line is in the diff** → compose as an inline comment: `path` and `to` set.
- **Line is NOT in the diff** (unchanged line outside a hunk, or agent returned an approximate location) → compose as a general comment with the file and line embedded in the text: `[{file}:{line}] {description}` followed by the footer, and `path`/`to` set to `null`.

`{file_diffs}` here is the orchestrator's own unmodified copy of the diff — lockfile bodies included — **not** `agent_file_diffs`, the lockfile-stripped variant Phase 3 sends the agents (SKILL.md § 2.1a). Validate against `file_diffs` only, so a finding on any line of any file, lockfile included, still resolves to an inline comment.

Composed inline body:

```
raw: |
  [{SEVERITY}] {description}

  🤖 review
path: "{file}"
to: {line}
```

The `to` field refers to the **new version** line number in the diff — not the old version.

### General comment

For issues where `file == ""` (no specific file/line):

```
raw: |
  {description}

  🤖 review
path: null
to: null
```

### Step A execution

Rank postable issues HIGH → MED → LOW and apply the cap (pipeline mode: `REVIEW_PIPELINE_MAX_COMMENTS`, default 10; lead mode: uncapped within the chosen option). Compose every body as above, then resolve each into a poster item `{i, operation, tool, args, fields}` — `post_inline_comment` when `path`/`to` are set, `post_comment` when they are `null`, with `{body}` = `raw`, `{path}` = `path`, `{line}` = `to`:

- **lead mode** — Bitbucket, exactly as today: `tool` is `mcp__bitbucket__bb_post`, `args` is `{"path": "/repositories/{workspace}/{repo}/pullrequests/{PR_ID}/comments", "body": {"content": {"raw": "{body}"}, "inline": {"path": "{path}", "to": "{line}"}}}` (no `inline` key for `post_comment`; `"{line}"` becomes the number), and `fields` is `{"id": "id", "url": "links.html.href"}`. `on_error` is `continue`.
- **pipeline mode** — `tool`, `args` and `fields` come from the operation's entry in `.claude/pr-review-tools.json`, resolved per [pipeline-mode.md](pipeline-mode.md) → "Host access"; only `mcp` items are dispatched. `on_error` is `stop`.

Then dispatch **one** call to the named `embla-core:poster` subagent — never `general-purpose` — with a data-only prompt and nothing else:

```
Agent(subagent_type: "embla-core:poster", prompt: "on_error: continue
items: [{\"i\": 0, \"operation\": \"post_inline_comment\", \"tool\": \"mcp__bitbucket__bb_post\",
         \"args\": {\"path\": \"/repositories/emb/web/pullrequests/42/comments\", \"body\": {\"content\": {\"raw\": \"[HIGH] ...\\n\\n🤖 review\"}, \"inline\": {\"path\": \"src/auth.ts\", \"to\": 42}}},
         \"fields\": {\"id\": \"id\", \"url\": \"links.html.href\"}},
        {\"i\": 1, \"operation\": \"post_comment\", \"tool\": \"mcp__bitbucket__bb_post\",
         \"args\": {\"path\": \"/repositories/emb/web/pullrequests/42/comments\", \"body\": {\"content\": {\"raw\": \"[MED] [src/x.ts:9] ...\\n\\n🤖 review\"}}},
         \"fields\": {\"id\": \"id\", \"url\": \"links.html.href\"}}]")
```

The subagent's own system prompt (baked into [`agents/poster.md`](../../../agents/poster.md)) already covers the item schema, the byte-for-byte posting rule, and the untrusted-content notice — do not repeat any of that here, only supply `on_error` and `items`.

Why a named agent, not `general-purpose`: `poster.md` scopes `tools:` to the host post tools only — the same pattern the other seven agents use — so the subagent handling data derived from a reviewed PR's diff cannot reach any tool beyond the ones it needs, regardless of what its prompt says or what a body contains. Its system prompt also carries an explicit untrusted-content notice, matching the guard `SKILL.md` Phase 2 applies to the orchestrator itself.

Why delegate at all: the orchestrator's context at Phase 6 is the fattest in the run — SKILL.md, every reference file, the full diff, all comments, CLAUDE.md, all seven agents' findings — and it was re-sent on every one of up to 10 sequential post turns. Posting requires no review judgement, so it runs in a ~1.5k-token context on the cheapest model instead.

**On the subagent's return:** map each `i` back to its issue by index — this is the only linkage, so never reorder the payload after dispatch. Build `comment_map`: `"{file}:{line}" → "{url}"` for every entry that returned a `url`. Entries that returned an `error`: in lead mode, log the failure, omit from `comment_map`, and let Step B render those issues unlinked (same treatment as "Post HIGH only" leaves MED/LOW); in pipeline mode, the write fallback in [pipeline-mode.md](pipeline-mode.md) → "Host access" sends them to the outbox. A failed post never aborts the review.

**Step B is posted by the orchestrator itself, not the subagent** — one call, keeping the `report-comment-id.txt` contract below in the same place it has always lived.

After Step A, always follow with Step B (below) as a single summary comment — in both lead mode (on approval) and pipeline mode. There is no separate "leading summary" or "zero-issue summary" comment: Step B's report covers the zero-issue case too (all counts show 0, severity sections omitted).

---

## Full Review Report Comment (Step B)

Posted as a single PR comment after Step A's inline/general comments — in **lead mode**, when the user approves posting ("Post all" or "Post HIGH only"), with the Bitbucket call below; in **pipeline mode**, always, automatically, through the `post_comment` operation or the outbox (see [pipeline-mode.md](pipeline-mode.md) → "Pipeline Posting Sequence"). Use a general comment (no `inline` field). The `raw` body below is the same in both modes.

This is also the marker Phase 1's re-review skip check looks for (`### 🤖 Review Report`) — skipping this comment means the PR is never recognized as reviewed.

**Do not use `<details>` or any HTML tags** — Bitbucket renders them as raw text in PR comments. Use plain markdown only.

`comment_map` is built from the poster subagent's returned `url` values — see "Step A execution" above: `"{file}:{line}" → "{url}"`, or `{{comment:N}}` for a pipeline item sent to the outbox. Pass to Step B.

```
mcp__bitbucket__bb_post
  path: /repositories/{workspace}/{repo}/pullrequests/{PR_ID}/comments
  body:
    content:
      raw: |
        ### 🤖 Review Report — PR #{PR_ID}: {title}
        **Branch:** {source_branch} → {target_branch}
        **Reviewed:** {date} | **Agents:** {agents that ran, formatted per "Agents Field Format" above}
        **Notes:** {fallback notes — pipeline-mode.md → "Host access"}

        #### Summary
        | Severity | Count |
        |---|---|
        | HIGH | {X} |
        | MED | {Y} |
        | LOW | {Z} |

        #### Gates
        | Gate | Result |
        |---|---|
        | pr-size-gate | {gate_result} |
        | test-coverage-gate | {gate_result} |

        #### HIGH
        - [{file}:{line}]({comment_url}) — {description}

        #### MED
        - [{file}:{line}]({comment_url}) — {description}

        #### LOW
        - [{file}:{line}]({comment_url}) — {description}

        #### Still Open (from previous review)
        - `{file}:{line}` — {description} (matches comment from {date})

        #### Filtered (below confidence threshold)
        - `{file}:{line}` — {description}

        🤖 Generated with Claude Code
```

**After this post succeeds**, write the response's `id` field (pipeline mode: the path `fields.id` names) to `docs/reviews/report-comment-id.txt` — the bare numeric id only, no label, quotes, or surrounding text (distinct from the `url` values the poster subagent returns for `comment_map`, which aren't usable as an API path parameter). The CI wrapper validates this file is purely numeric before trusting it, so any extra text makes it treated as absent.

This is needed because total review cost isn't known until the whole session ends, well after this comment has already posted — the CI wrapper (see [pipeline-mode.md](pipeline-mode.md) → "Cost Reporting") uses this file afterward to find this same comment and patch the cost line into it, rather than posting a separate one. Applies whenever this step actually posts live — lead mode on approval, or pipeline mode automatically — not only in pipeline mode; the file is simply unused outside CI. When the report goes to the outbox instead, the file stays unwritten: the CI script appends the cost line before posting.

**Link rules:**
- Issues posted as inline comments (present in `comment_map`): use `[{file}:{line}]({comment_url})` — clicking navigates to the exact comment in the diff. An outbox item uses its `{{comment:N}}` placeholder as `{comment_url}`.
- Omit the `**Notes:**` line when the run recorded no fallback notes (always, outside pipeline mode).
- Postable issues NOT in `comment_map` (e.g. "Post HIGH only" was chosen, so MED/LOW were never individually posted): use `` `{file}:{line}` — {description} `` (plain, no link) — same treatment as filtered issues.
- General issues (`file == ""`): use `— {description}` (no file/line to link).
- Filtered issues (not posted): use `` `{file}:{line}` `` (plain, no link).
- Still Open issues (duplicate of an existing open comment, not re-posted this run): use `` `{file}:{line}` — {description} (matches comment from {date}) `` (plain, no link — no new comment was posted for it this run).
- Gate rows render the `passed`/`bypassed` result from [pr-size-gate.md](pr-size-gate.md) and [test-coverage-gate.md](test-coverage-gate.md) as `✅ {detail} (threshold: {threshold})` when passed, `⛔ {detail} (threshold: {threshold}, {bypassReason})` when bypassed, or `❌ {detail} (threshold: {threshold})` when failed but not bypassed (the `fail` action's normal outcome on a real gate failure — `bypassReason` is empty in this case, so it's omitted rather than rendered blank) — identical to the Gates table Phase 7 writes to the local file.
- Omit any severity section (`#### HIGH`, `#### MED`, etc.) where count is 0.
- Omit `#### Still Open` block if empty.
- Omit `#### Filtered` block if no issues were filtered.

After posting, report the comment count and the PR URL.

---

## Posting Order (lead mode on approval, and pipeline mode)

Execute in order:
1. Inline and general comments (Step A) — postable issues, HIGH first. Pipeline mode caps at `REVIEW_PIPELINE_MAX_COMMENTS`; lead mode posts all issues covered by the chosen option ("Post all" or "Post HIGH only") uncapped. Composed by the orchestrator, transmitted by the poster subagent (pipeline mode: or written to the outbox).
2. Full Review Report comment (Step B) — always follows Step A, never posted alone. Posted by the orchestrator directly (pipeline mode: or written to the outbox).

In pipeline mode this runs automatically with no `AskUserQuestion`. In lead mode it runs only after the user picks "Post all" or "Post HIGH only"; "Write to markdown only" and "Don't post" skip both steps (Phase 7 still writes the local file either way).

---

## Voice & Tone

Comments must match the project's review culture:

- **Direct.** "No `any`." not "You might want to avoid using `any` here."
- **Concise.** One sentence preferred. Two max per issue.
- **No emojis** except the footer `🤖 Generated with Claude Code`.
- **Reference the project's own conventions** when relevant — cite the actual rule from `claude_md_contents` (Phase 2.3) rather than generic advice.
- **Avoid false confidence** — if uncertain, state it briefly.
- **Never** "consider", "perhaps", "maybe" — state the issue.

---

## Error Handling

- If the Bitbucket API returns an error, show it and stop. Do not fabricate results. In pipeline mode, a failed host call first takes the read or write fallback in [pipeline-mode.md](pipeline-mode.md) → "Host access".
- If a subagent fails, continue with the agents that succeeded — do not abort the whole review.
- If no Jira issue can be extracted and Phase 2.7 judges `requirement` excludable, it synthesizes the "no Jira linked" low-severity issue without spawning the agent at all; this note about skipping the agent's deeper checks (still returning the low-severity issue) only applies when judgment includes the agent anyway despite the empty context, and it takes its own empty-`jira_context` branch.
- If `getJiraIssue` fails (issue deleted, permission denied), note it and skip alignment check.
- If the coverage agent fails or is excluded, skip the test-coverage-gate entirely.

---

## Implementation Notes

- Use TodoWrite to track phases as you execute them — makes progress visible.
- Phases 1, 1.5, 2, 2.7, 3, 3.5, 4, 4.5 each produce an intermediate result you keep in context.
- Agents must return **raw JSON** — no markdown fences, no prose. If an agent returns prose, extract the JSON block or rerun with a stricter instruction.
- Always use `jq` filters on `bb_get` calls to reduce token cost (per CLAUDE.md guidance).
- **Counts in Phase 5** use the post-dedup count: two agents flagging the same issue merged into one = 1 issue, not 2.
- **Memory staleness**: verify memory notes against the CURRENT code/commits before re-surfacing. Stale memory from an earlier commit is not a real open issue.
- **Context passing to subagents**: pass PR_ID, file paths, Jira key, and structured data via their prompt. For diffs, pass paths — subagents can read files directly.
- **Test files**: `*.spec.ts` files follow relaxed rules. `any` in jest mocks is allowed. Don't flag test-only patterns as HIGH.
- **Known-resolved items**: Phase 2.2 splits existing PR comments using Bitbucket's real `resolved` boolean field — not a text-based guess. `resolved_comments` (`resolved == true`) are excluded entirely from re-flagging; `open_comments` (`resolved == false` or missing) still get surfaced, but Phase 4 marks issues that duplicate them as `is_duplicate_of_open` so they're tracked under "Still Open (from previous review)" instead of re-posted as a new comment.
- **Pipeline mode**: never call `AskUserQuestion` in pipeline mode. All gate decisions come from env vars. See @references/pipeline-mode.md
- **coverage agent return shape**: unlike other agents, coverage returns `{issues: [...], coveragePct: N}` — extract `issues` for dedup and keep `coveragePct` separately for the test-coverage-gate.
