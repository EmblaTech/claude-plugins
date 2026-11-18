---
status: accepted
---

# Cloud and Local: the input Ilya types in decides who runs it

Under [ADR 0004](0004-assistant-answers-live-routine-follows-up.md) the page and `update` both answered comments. That gave two signed replies for one comment, two writers on one thread, and a page guessing which part of a comment needs local tools. Ilya knows better than the page when a request needs his machine, so he chooses by where he types. **Cloud** is a dialogue with the assistant in the page; it is kept in the page's own `db` and writes to the tracker only when the prompt asks. **Local** is a comment in the tracker; only `update` answers it, with local tools. The page no longer answers comments. *(Decided 2026-11-11, #140.)*

## Considered options

- **The page answers first, `update` does the local part (ADR 0004).** Rejected: double answers, the same signature on both, and the catch-up queue to prevent overlaps.
- **A cloud / local switch on one input.** Rejected: two sections, each with its own store, say the same thing with nothing to toggle.
- **The page decides when to hand a comment to `update`.** Rejected: Ilya knows when he needs local tools; the page would guess.

## Consequences

- Every card ends with two sections, Cloud chat (#129) and Local (its comment thread; #138). The Assistant tab has the same two, and its Новая задача / Спросить switch goes.
- A Cloud conversation is the last one per card plus one for the tab, kept in the artifact `db` until **Новый разговор** clears it. Its context is the card's brief, its whole thread (read only) and that conversation. The `db` is shared by every viewer of the page; per-viewer storage waits until someone else uses it.
- Local input on the Assistant tab creates a task card labelled `ready-for-agent` and assigned to `agent-assignee`: an agent task. `update` picks up such cards and carries them out, how is up to the agent (a direct commit, a PR, another repo); merging and approving stay Ilya's. Before work it posts a signed claim comment and never takes a claimed card again: no retries. `ready-for-agent` comes off only when the work is finished and reported. A claim that looks stuck is left to the agent's judgement, checked by a scenario test, not by a rule.
- Catch-up on open, the card queue and the page's `reply` (built in #128) are removed (#151). The 30-minute wait for a Local answer is accepted.
- This is a small step towards an agent factory; a full pipeline (intake, spec, review gates) is not built, and an existing one would be adopted rather than written.
