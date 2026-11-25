---
status: superseded by ADR-0005
---

> Superseded 2026-11-11 by [ADR 0005](0005-cloud-and-local-surfaces.md): the page no longer answers comments; Cloud and Local are separate inputs.

# The assistant in the page answers live, and the routine does the local follow-up

Comments and instructions used to wait up to 30 minutes for `update`. The page can now run Claude itself (artifact `sample` with page tools that call the viewer's connectors; a multi-turn chat with GitHub tools worked in the 2026-11-09 Launch Lab test, see [findings.md](../findings.md)). So the assistant in the page answers a comment or an instruction at once and acts through the connectors the viewer granted it. `update` stays. It reads every comment since its last run, whoever answered it, and does the part the page cannot do: meeting notes for meeting cards, Bitbucket, and anything else that needs local tools. It answers only comments that still have no signed reply. *(Decided 2026-11-10.)*

## Considered options

- **The routine alone answers, in batches (v2 as first designed).** Rejected: up to 30 minutes from comment to answer, and no dialogue while the page is open.
- **The page only prepares a prompt and opens Claude Code through a deep link.** Rejected as the main path: deep links only prefill, the user still presses Enter, and a general chat that only writes prompts adds nothing. It stays as the fallback for long tasks.
- **A Claude Code session per card.** Rejected: a page cannot start one hands-free (no auto-submit; the routine fire API needs a token kept off the page), and it is heavy for "add a task".

## Consequences

- Tracker actions (create a task, comment, close, snooze, labels) go through the tracker contract of [ADR 0003](0003-two-storage-modes-one-tracker-contract.md), so the assistant works in mode A too. Reading a repo and other connectors (mail, chat, other repos) are extras that setup offers when the session has them; nothing depends on them.
- The assistant runs only while the page is open. A comment written elsewhere (the GitHub mobile app) is answered when the page next opens, or by `update` if that comes first. Both re-read the thread before posting and skip it when a signed reply exists.
- The assistant cannot write the repo, reach local MCP servers (`host:` is `unavailable` in the desktop app), or run longer than a few calls. Those jobs stay with `update`, or with Claude Code opened through a prefilled deep link.
