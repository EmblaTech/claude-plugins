# Signals

Nineteen signals a session-review pass checks — two of them, 1 and 18, each split into a pair of independently-verdicted sub-checks (`1a`/`1b`, `18a`/`18b`) — grouped by what they diagnose: context, delegation, verification, memory, isolation, workflow. Each fires against fields in the per-session JSON record the extraction script emits — never against a raw transcript; every record carries its own `session_id` for pairing a citation back to the session it came from. Numeric defaults below are this skill's own defaults; a project overrides them in `.claude/session-review.json`, and `references/config.json` ships the machine-readable copies. Absent any override, use the defaults stated here — this file is complete on its own.

Most signals evaluate one session record. Four (5, 11, 12, 13) read across the whole batch of records loaded for the run — each says so.

## Citation contract

Every signal resolves to exactly one verdict, backed by a literal citation — never free-form prose:

- **present** — the pattern happened. Cite the record field and value that prove it (`git.pr_merged: 1`), or the exact substring for a text field (`prompts[4].text: "no, that's wrong — use the other endpoint"`).
- **absent** — checked for and confirmed not present. Cite the field/value that proves the negative (`git.pr_merged: 0`, `subagents: []`). An absent verdict is itself worth reporting — a clean `git.pr_merged: 0` across a whole batch belongs in a review's "what's working" half, not just its silence.
- **not-applicable** — the signal's own precondition never held — for this session, or, for a batch signal, this run's whole batch — so it could not fire either way. Cite the field that shows the precondition is unmet (`skills.invoked: []` when the signal only evaluates a dispatch naming a specific workflow command; an empty `workflow_commands` override when the project gave no such convention at all).

Keep not-applicable and absent distinct even though they read alike as prose: not-applicable says there was nothing here to judge, absent says the good pattern held and it just didn't fire. Quote the literal field for either, never a paraphrase — paraphrase is exactly the run-to-run drift this contract exists to close.

Two signals bundle more than one detection sub-pattern under one number — 1 (ceiling vs. kitchen-sink) and 18 (skill vs. MCP). Each sub-pattern is written as its own line below (`1a`/`1b`, `18a`/`18b`) with its own recipe and its own verdict, so the one-verdict rule above still holds — there is no shared or averaged verdict across a split pair.

## Context

The session's context window and its boundaries — the two things a review most needs evidence for.

| # | Signal | False positive |
|---|---|---|
| 1a | **Context ceiling breached.** `context.peak` above 150,000 tokens (config `context_ceiling`) is a target-exceeded flag; at or above 200,000 (config `context_hard`) is a hard flag regardless of task size. | A single large, genuinely-scoped refactor legitimately consumes more context than a small fix — the hard flag still stands (recall degrades regardless of why context is high), but say in the writeup whether the size was earned by real scope or by drift. |
| 1b | **Kitchen-sink session.** `prompts[]` names two or more distinct tickets/topics with no `context.compactions` entry and no session boundary between them — one file is one session, so a mid-file topic change with nothing in `context.compactions` is the tell. | Two topics addressed together on purpose (a bug fix that surfaces a doc it should also update) isn't kitchen-sink — check whether the topics are genuinely independent work items, not two parts of one task. |
| 2 | **Repeated correction without a reset.** `prompts[].text` carrying a corrective marker (`no,`/`not`/`don't`/`wrong`/`incorrect`/`should(n't) (be\|have)`/`instead`/`again`/`i (told\|said\|asked)`/`always`/`never`/`stop`/`why (did\|do) you`/`revert`/`undo`/`mistake`/`actually`) recurring 3+ times on the same underlying issue with no `context.compactions` entry in between. A project whose sessions run in another language adds its own markers via config's `corrective_markers` override (a flat list appended to the English set above); the shipped default carries none beyond English, so a non-English session is `not-applicable` for this signal until a project supplies its own list. | The marker set fires on ordinary negation too ("I don't see it" is not a correction) — use it as a recall filter, then judge by hand whether the flagged prompts are the same issue recurring, not a raw count. |
| 3 | **Course-corrected without accumulating prose (rewind / Esc).** Interrupts and `/rewind` aren't a tracked field, so treat this as the well-behaved counterpart of signal 2: one corrective prompt on a topic that never recurs, `context.peak` staying well under the ceiling, no compaction — consistent with the wrong path being discarded rather than compacted away or argued out of. | The weakest-evidenced signal in this set — a session can look identical simply because the first attempt was already right. Default to not-applicable unless the pattern is unambiguous. |
| 4 | **`@path` used instead of a broad search.** `prompts[].text` contains an `@`-prefixed path-like token (`@src/foo.ts`, `@docs/plan.md`). | None of note — presence is unambiguous. Absence doesn't mean anything went wrong; only worth naming when it corresponds to a delegated-search alternative that was skipped instead. |
| 5 | **No handoff at a context boundary.** *(Batch — reads two sessions.)* A session whose `context.peak` sits at or above `context_hard` ends with no further `context.compactions` entry; the next session in the batch (by `started`, same `cwd`) opens with `prompts[0].text` or `title` continuing the same topic cold, with no reference to prior work. | Topic continuity across sessions is normal for multi-day work — only flag when the predecessor genuinely ended at the ceiling uncompacted and the successor shows no sign anything was handed off. Keep this conservative. |

## Delegation

Whether work that needed a subagent got one, and whether the subagent did its share of the reading once dispatched.

| # | Signal | False positive |
|---|---|---|
| 6 | **Missed delegation on a big task.** `tools.Edit + tools.Write >= 10` (proxy for "touched ≥10 files") or `prompts[]` naming ≥3 distinct work items, combined with `subagents.length === 0`. | A single well-scoped mechanical change (a rename across 12 files) can legitimately stay inline — check whether the edits are genuinely independent work, not one coordinated change. |
| 7 | **Infinite exploration — main thread out-reads its own subagents.** `tools.Read` (main-thread) at or above `Σ subagents[].tools.Read` (summed across every dispatched subagent) in a session that did real exploration (`tool_results.count` non-trivial). | A short, single-file session has no reason to delegate reading at all — only meaningful once the session's own volume (`tool_results.count`, `tools.Read`) suggests real exploration happened. |

## Verification

Whether a completion claim is backed by something that can fail.

| # | Signal | False positive |
|---|---|---|
| 8 | **Trust-then-verify gap.** `git.commits > 0` or `git.pr_created > 0` in a session with real code changes (`tools.Edit + tools.Write > 0`), paired with an empty `verification[]` array, or whose last `verification[]` entry has `passed: false`. | A docs-only or config-only change may have nothing to verify — gate on the project having a configured `test_command` override, or on the edits plausibly being testable code rather than prose. |
| 9 | **Reviewer isolated from the implementer, scoped to a diff.** A `subagents[]` entry whose `description`/`prompt` (first ~300 chars) carries review/diff language ("review", "diff", "do not trust the report"), a tools histogram dominated by Read/Grep with no Edit/Write, following a session with `git.commits > 0`. | A review dispatch that also fixes what it finds (Edit present) isn't wrong, it's a different valid pattern (implement→review→fix in one dispatch) — only flag the total absence of any isolated review step. |
| 10 | **Playwright loop not closed.** `subagents[].agent_type` matching `playwright-test-planner`/`-generator`/`-healer`, or an `mcp` key containing "playwright", cross-referenced against `verification[]` entries whose `cmd` contains "playwright test" and their `passed` value. | The loop not completing is the modal outcome for teams new to it — report as a gap to close, not a personal failing. Don't penalize ordinary `mcp` playwright browser calls used for exploration unrelated to test generation. |

## Memory

Whether project knowledge (CLAUDE.md, skills) gets maintained — not never, and not every session.

| # | Signal | False positive |
|---|---|---|
| 11 | **Project memory maintained too rarely or too often.** *(Batch — needs ≥8 sessions from the project.)* Fraction of sessions with `memory.edits.length > 0` or a maintenance skill (name containing "revise-claude-md" or "claude-md-improver") in `skills.invoked`. Healthy: 10–40% (config `memory_edit_rate`, default `[0.10, 0.40]`); median gap 2–6 sessions between hits; no run longer than ~15 with none. | A project's first ~10 sessions legitimately show 0% — apply the band only once the batch has enough history. A single session can emit 3–6 `Edit` calls on memory files in one pass — count it as one maintaining session, not several. |
| 12 | **Knowledge written where it never loads.** *(Batch — needs ≥30 sessions.)* A path appears in `memory.edits` with `scope: "nested"` across ≥2 sessions in the batch, and never once appears in any session's `memory.nested_loaded`. | Root and ancestor CLAUDE.md never appear in `nested_loaded` at all — they load into the unlogged system prompt. Apply this signal only to nested-scope edits. A file covering rarely-visited territory may simply not have been needed yet; require the batch minimum before calling it waste. |
| 13 | **Correction never encoded.** *(Batch — reads up to 3 following sessions.)* A session containing a corrective prompt (signal 2's marker set) with no `memory.edits` in that session or in the next 3 sessions of the same project, ordered by `started`. | Not every correction generalizes — a correction about project *state* ("the endpoint moved") is normal drift, not a missing rule. Weight this only when the same underlying issue would plausibly recur. |

## Isolation

Whether forking and worktrees were used where they pay for themselves, and stayed where they should.

| # | Signal | False positive |
|---|---|---|
| 14 | **Fork used where a plain subagent would do.** A `subagents[]` entry with `is_fork: true` whose `prompt` (capped ~300 chars) is fully self-contained — explicit paths, dates, scope, output format — with no reference to material the parent session already holds ("you already have", "use the rubric above"). | A fork dispatched in a session whose overall `context.peak` stayed low wastes little even if self-contained — `context.peak` is a whole-session maximum, not a reading at the moment of dispatch, so treat this as an approximation: either way there's little accumulated context for the fork to actually need. This signal matters most once the parent's peak shows real accumulated context to share. |
| 15 | **Worktree expected but skipped, or escaped.** Project config `worktree_expected` (default `false`; set directly in `.claude/session-review.json`, or inherited from that same file's `profile` field — `code-repo` → `true`, `docs-repo` → `false`) is `true`, and `worktree.enter.length === 0` while `git.commits > 0`; separately, `worktree.cwd_mismatches > 0` whenever `worktree.enter.length > 0`. | Check the project's own profile/override before applying `worktree_expected` — a docs-only repo, or one with a recorded no-worktree preference, correctly shows zero enters, and that's not a finding. |

## Workflow

Org-specific process and skill discipline: a hard rule with no override (16), one check that reads a project's own config (19), and generic heuristics for the rest (17, 18a, 18b).

| # | Signal | False positive |
|---|---|---|
| 16 | **Claude merged or approved a PR.** `git.pr_merged > 0`. | None — a hard rule with zero tolerance, regardless of outcome or how it happened. |
| 17 | **Speculative fix with no diagnosis.** `tools.Edit > 0` with `tools.Read === 0` and `tools.Grep === 0`, immediately preceding a `verification[]` entry with `passed: false`, and no debugging-shaped skill (name containing "debug") in `skills.invoked`. | Gate on task substantiality — a one-line, obviously-correct fix needs no Read/Grep pass first. The actual evidence a diagnosis was skipped is that the fix didn't work on the first try. |
| 18a | **Installed skill never used.** `skills.offered` contains an entry with no matching item in `skills.invoked` (or, for a subagent's own choices, in that dispatch's `subagents[].skills`), in a session with real work (`git.commits > 0` or `tools.Edit + tools.Write > 0`). | An offered skill's description can overlap a task only superficially — name it, don't automatically penalize it. |
| 18b | **Connected MCP server never called.** An entry in a project's `session-review.json` naming an expected MCP server that never appears as a key in that session's `mcp` object, in a session with real work (same gate as 18a). | `mcp` only records servers actually invoked, so "never called" can't be told apart from "never connected, or never offered" from this field alone — not-applicable whenever the project's config names no expected server list, rather than defaulting to absent. |
| 19 | **Workflow command run with no delegation or review.** `skills.invoked` contains an entry from the project's config `workflow_commands` (default empty — this signal is not-applicable with no override) alongside `subagents.length === 0` and `git.pr_created > 0`. | A workflow command that itself delegates (`subagents.length > 0`) is doing its job — only flag the zero-delegation case, and check the command's own version before blaming a session for a defect it has since fixed. |

## What not to report

Each of these produced noise, not findings, in the corpus this rubric was calibrated against — leave them out of every mode's output.

- **`AskUserQuestion` ratios (menu picks vs. typed turns).** Conflates careful menu-reading with rubber-stamping; the only piece that was ever real signal is picking the option *not* labelled "(Recommended)" — the raw ratio isn't.
- **Raw message and tool counts.** Unnormalized to task size — a large, legitimate piece of work produces more of everything than a one-line fix, so a count alone says nothing about quality.
- **Session duration.** A multi-day resumed session or one left open overnight inflates wall-clock time with no change in what actually happened — use context and tool signals, never the clock.
- **Fork counts (raw).** One well-justified fork and ten wasteful ones are indistinguishable on count alone — see signal 14 for what actually distinguishes them.
- **`spawnDepth` alone.** Depth 2–3 is normal (a subagent dispatching its own subagent) and capped by the harness at 3 — it tracks nesting, not whether the nesting was warranted.
- **The `⑂` glyph in a session title.** Confirmed to be the auto-titler's topic separator for a session covering two unrelated requests, not a fork marker — never use it as delegation evidence.
- **Branch naming conventions.** Mechanical, and in practice essentially always followed — reporting on it produces noise, not findings.
- **Test-file style nits (selector choice, file naming by ticket vs. feature).** Cosmetic — the loop closing at all (signal 10) is the finding; how the resulting file is styled is not.
