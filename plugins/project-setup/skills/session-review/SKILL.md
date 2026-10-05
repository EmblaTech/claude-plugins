---
name: session-review
description: Reviews a project's Claude Code session history against a fixed checklist of signals — context management, subagent delegation, verification of completion claims, memory (CLAUDE.md/skill) upkeep, worktree and fork isolation, and workflow discipline — and reports findings backed by quoted citations from extracted session records, never from a raw transcript. Use this whenever the user asks to review, self-audit, or get feedback on their own or someone else's Claude Code usage — including narrower asks like whether context, delegation, verification, or CLAUDE.md upkeep is going well — or wants a trend-metrics row appended for the team — even if they don't say "session review" by name.
disable-model-invocation: true
---

# Session Review

Turns a project's Claude Code session history into findings backed by citations, instead of a manual transcript read.

Run `scripts/sessions.mjs --help` first — it documents how to point the script at a project, how many sessions to pull, and its output shape. The script is the only thing that ever opens a `.jsonl` transcript: it emits one compact JSON record per session, and every judgement below is made against those records, never against raw transcript text.

Evaluate every signal in `references/signals.md` against the loaded records, using `references/config.json`'s defaults unless the project ships its own `.claude/session-review.json` override — say which one was used. The report's required output field, for every signal, is a verdict of present, absent, or not-applicable, each backed by a literal citation quoted from the record(s) — a field/value pair, or an exact substring — never a paraphrase, and never silently skipped. Everything past that verdict is model judgement, not a rule to apply mechanically: whether a pattern was actually a problem, whether a correction ever got encoded, whether a fork was worth what it cost.

Three modes, chosen by what was asked for:

- **self** (default) — a one-screen in-chat summary: the three findings that matter most, each with a session id (`session_id`) and a quoted citation, plus what to change.
- **review** — a Markdown report saved where asked (default: the current directory), with a scope line, findings to fix ordered by severity, what's already working, and the commands run.
- **metrics** — appends one trend row (median peak context, subagents per session, verified-completion share, memory-edit rate, PR-merge violations) to the metrics file named by `metrics_file` in the active config (default: `session-review-metrics.md` in the current directory), creating it with a header row if absent.
