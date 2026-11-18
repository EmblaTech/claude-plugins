---
status: accepted
---

# Meeting tasks attach through the series; subtasks and blocking use native relations

A task that prepares for a meeting stays attached to it only through the series label `dsh:mtg/<series>`, not as a sub-issue of a meeting card. A GitHub issue has one parent, so a task cannot sit under several occurrences, and an unresolved task has to carry over to the next meeting. The series label already does both: the page shows the series' open tasks under every occurrence on the page, collapsed behind a count and loaded on click. Hierarchy between tasks (an epic and its stories, a task and its parts) and blocking between tasks use GitHub's own relations instead: native sub-issues and blocked-by. The tracker contract gains `parent`, `blockedBy` and the issue type, so mode A stores the same thing as fields ([ADR 0003](0003-two-storage-modes-one-tracker-contract.md)). *(Decided 2026-11-14, Ilya, #169.)*

## Considered options

- **Task as a sub-issue of the current meeting card, moved to the next occurrence while open (`replace_parent`).** Rejected: churn on every meeting, and the task loses where it came from.
- **Meeting card "blocked by" its tasks.** Rejected: it bends blocked-by to mean "belongs to", and the Blocked mark would mean two things.
- **A checklist of child links in the parent's body (as #131's `## Tickets`).** Rejected: it drifted from the real sub-issues at once (12 lines against 18 children). Native sub-issues are the only list of children; `## Prepare` no longer lists tasks either.
- **The issue type in place of `dsh:task` / `dsh:meeting` / `dsh:pr`.** Rejected: mode A has no issue types, and Task / Bug / Feature fit no meeting or PR. Labels stay the card type; the type is set only on tasks, as extra meaning.

## Consequences

- The page loads children only when their level is opened ("Подзадачи: N" on a card, the caret on a row), so a cycle in `parent` (possible in mode A, whatever GitHub enforces) never makes it loop. The one walk the page does on its own is upwards, from a subtask that needs Ilya to its root, so the root card is lifted and the path opened; that walk keeps a visited set, stops at 8 levels (GitHub's own depth limit), and shows a cycle mark when it meets a node twice.
- A parent shows all its open subtasks, with or without `dsh:on`, and a done count ("9/18").
- ✓ on a parent is disabled while it has open subtasks.
- A task with a series label is not repeated in the task section while any occurrence of that series is on the page.
