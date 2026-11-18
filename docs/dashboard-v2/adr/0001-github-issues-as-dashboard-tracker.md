---
status: accepted
---

# GitHub Issues in embla-docs are the dashboard's tracker, and To Do is deprecated

Cards, tasks and comments live as issues in `Debatt-AS/embla-docs`, which only Ilya uses and which had no issues. The organisation's issue fields hold the dates and priority: `Target date` is the due date, `Start date` means snoozed until, and `Priority` sets the order. The page and routines need no GitHub Project. We chose it for four things: history that outlives any artifact, a comment thread where Claude answers Ilya's prompts, labels to slice by track, and the mobile app. It is also the only candidate that holds both the cards and the tasks.

## Considered options

- **Artifact `db` only (v1).** Data is lost with the artifact, and there are no threads outside the page. It stays as mode A ([0003](0003-two-storage-modes-one-tracker-contract.md)).
- **Microsoft To Do.** It has due dates and lists, but no discussion thread.
- **Linear.** It has native snooze and triage, but the free tier caps open issues at 250 and it does not link Bitbucket PRs.
- **A dedicated private repo.** It would isolate the noise, but embla-docs is already private to Ilya, and keeping tasks next to the meeting notes keeps links simple.
- **Off-the-shelf (M365 Copilot, Reclaim, Sunsama and the like).** None covers Bitbucket PRs, MS365 and notes processed by Claude together. The researched comparison is summarised in the PRD.

## Consequences

- To Do is deprecated. Routines stop creating To Do tasks, and the root `CLAUDE.md` To Do rules must be rewritten.
- Claude comments as Ilya, so its replies are told apart by a configurable signature at the end of the comment.
- Everything the dashboard owns carries the `dsh:` label prefix, so it can be filtered out of anything else in the repo.
