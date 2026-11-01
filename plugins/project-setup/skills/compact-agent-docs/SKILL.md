---
name: compact-agent-docs
description: Compacts CLAUDE.md / AGENTS.md files and prunes redundant code comments, for a whole repo, a path, or a branch/PR diff. Gives every instruction line and comment a verdict, cuts what the code already shows, moves rare gotchas into a linked doc, and reports each cut. Use as a step of a code review on a branch or PR diff, or when asked to compact, slim or prune CLAUDE.md, agent docs or comments.
---

# Compact CLAUDE.md and comments

Always-loaded instructions hold only what the agent cannot find by looking; comments hold only what the nearby lines do not say.

**Scope** is what the user names: the whole repo (default), a path, or a diff (branch, PR, "my changes"). Called from a code review, the scope is the branch diff. In a diff, review the changed comments and the CLAUDE.md lines that name changed files or symbols.

**Delegate** steps 1 and 2 for a repo or path: one subagent per CLAUDE.md file and one per code folder for comments, each with Bash for `git log -S` and `git blame`, applying its edits and returning only its verdict table. The main session merges the tables into the step 3 report. A small diff runs inline.

## 1. Verdict for every instruction line

Read the code each CLAUDE.md / AGENTS.md line talks about, then give it one verdict:

- **cache**: restates code, config, scripts or layout one lookup away. Cut. A pattern every neighbouring file of the same kind already shows is cache too: the agent copies neighbours.
- **no-op**: the model does it by default, or it is standard practice for the stack. Cut, or collapse several into one leading-word line ("Playwright idioms apply: a logged-out context carries no `storageState`").
- **convention**: the code shows it but does not enforce it; a change that breaks it would still compile and pass tests. Keep, as one positive line.
- **gotcha**: a trap no code or config confesses, or the reason behind a choice. Keep. When only some tasks need it, create a linked doc next to that CLAUDE.md and move it there, behind one pointer line that front-loads the trigger and names each branch ("Before writing or fixing a spec, read `docs/gotchas.md`: navigation and slow loads, dialogs, streaming timing, MCP tools").
- **stale**: no longer true, or names something that drifts (test numbers, line numbers). Fix to a stable name, or cut.
- **duplicate**: the same meaning also lives in a code comment. Keep one copy: next to the code when it concerns one file, in CLAUDE.md when it crosses files.

Write every kept or rewritten rule as its target behaviour: "selectors live in the page object; specs only call its methods". A bare "not X" puts X in front of the agent, so keep a prohibition only as a hard guardrail, paired with its positive target. In the ftweb pilot the same rule passed 1/3 as "…not in specs" and 3/3 as the positive line.

Done when every line in scope has a verdict, and every cache, stale and duplicate verdict names the file or command that proves it.

## 2. Verdict for every comment

People read comments too, so the bar for deleting is narrow. Change comment text only: code, whitespace and line endings stay byte for byte. Commented-out code is code; leave it unless the user asks.

- **Delete** a comment that restates the name, the signature or the next line.
- **Keep** nuance that saves the reader from reading past the nearby lines: the reason, the contract (order, units, assumptions), an edge case, surprising behaviour of other code. Shorten it to one line where it reads as well.
- **History** ("added for X; before that…"): keep the nuance, replace the story with `why: <ticket>`. Find the ticket with `git log -S '<phrase>'`; the commit or its merge branch name carries the key.

Done when every comment in scope has a verdict.

## 3. Apply and report

Before editing, commit any uncommitted changes `git status` shows as `checkpoint before compact-agent-docs`. Then edit the files directly and leave the edits uncommitted: `git diff` shows only the skill's changes and is the review. When the user asked for a proposal only, report without editing.

End with a short report of every cut, moved or shortened line and comment (`file:line`, verdict, proof), since the diff shows what changed but not why.

When a cut-or-keep verdict is a guess and the user wants evidence, run the probe in [references/probe.md](references/probe.md). In diff scope, run it only on request.
