---
name: compact-agent-docs
description: Makes CLAUDE.md / AGENTS.md files short and removes code comments that only repeat the code. Works on a whole repo, a path, or a branch/PR diff. Gives each instruction line and each comment a verdict, cuts what the code already shows, moves rare gotchas to a linked doc, and reports each cut. Use as a step of a code review on a branch or PR diff, or when asked to compact, slim or prune CLAUDE.md, agent docs or comments.
---

# Compact CLAUDE.md and comments

Keep in CLAUDE.md only what the agent cannot find in the code. Keep in a comment only what the nearby lines do not say.

**Scope.** Work on what the user names: the whole repo, a path, or a diff. The default is the whole repo. When a code review calls this skill, the scope is the branch diff. In a diff, check the changed comments. Also check the CLAUDE.md lines that name changed files or symbols.

**Subagents.** For a repo or a path, give steps 1 and 2 to subagents. Use one subagent for each CLAUDE.md file. Use one subagent for each code folder for comments. Give each subagent Bash for `git log -S` and `git blame`. Each subagent applies its edits and returns only its verdict table. Merge the tables into the step 3 report. For a small diff, do the work yourself.

## 1. Give each instruction line a verdict

For each CLAUDE.md / AGENTS.md line, read the code that the line is about. Then give the line one verdict:

- **cache**: the line repeats code, config, scripts or folder layout. The agent finds this in one lookup. Cut the line. A pattern that all nearby files of the same type show is also cache, because the agent copies nearby files.
- **default**: the model does this anyway, or it is standard practice for the stack. Cut the line. Or join several such lines into one short line with a known term, for example "Playwright idioms apply: a logged-out context has no `storageState`".
- **convention**: a team rule that the code shows but does not enforce. A change that breaks it still compiles and passes tests. Keep it as one line.
- **gotcha**: a trap that no code or config shows, or the reason for a choice. Keep it. If only some tasks need it, move it to a linked doc next to that CLAUDE.md. Create the doc. In CLAUDE.md, add one pointer line. Start the pointer with the trigger and name each topic, for example "Before you write or fix a spec, read `docs/gotchas.md`: navigation and slow loads, dialogs, streaming timing, MCP tools".
- **stale**: the line is not true now, or it names a thing that changes (test numbers, line numbers). Change it to a stable name, or cut it.
- **duplicate**: a code comment has the same meaning. Keep one copy. If it is about one file, keep the comment. If it is about many files, keep the CLAUDE.md line.

Write each kept rule as the action to do, for example "selectors live in the page object; specs only call its methods". A rule that says only "do not do X" makes the agent think of X. Use a prohibition only as a hard limit, and put the action to do next to it. In the ftweb pilot, "…not in specs" passed 1 of 3 runs. The same rule as an action passed 3 of 3.

This step is done when each line in scope has a verdict. Each cache, stale and duplicate verdict must name the file or command that proves it.

## 2. Give each comment a verdict

People also read comments, so delete only a small set. Change only comment text. Keep code, whitespace and line endings exactly as they are. Commented-out code is code: do not change it unless the user asks.

- **Delete** a comment that repeats the name, the signature or the next line.
- **Keep** a comment that tells the reader something the nearby lines do not. Examples: the reason, the contract (order, units, assumptions), an edge case, or surprising behaviour of other code. If one line is enough, make it one line.
- **History** ("added for X; before that…"): keep the useful fact and replace the story with `why: <ticket>`. To find the ticket, run `git log -S '<phrase>'`. The commit message or the merge branch name has the key.

This step is done when each comment in scope has a verdict.

## 3. Apply and report

Before you edit, run `git status`. If there are uncommitted changes, commit them as `checkpoint before compact-agent-docs`. Then edit the files. Do not commit your edits, so `git diff` shows only the changes of this skill. The user reviews that diff. If the user asked only for a proposal, report and do not edit.

At the end, give a short report. List each cut, moved or shortened line and comment with `file:line`, verdict and proof. The diff shows what changed, but the report shows why.

If a verdict is a guess and the user wants evidence, do the remove-and-test check in [references/remove-and-test.md](references/remove-and-test.md). In diff scope, do it only when the user asks.
