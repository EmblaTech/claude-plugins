# Tasks

What matters to the user in the coming days that no meeting or PR card covers.

**Wants**, by meaning and track:
- open `dsh:task` records in the tracker, with their `Target date` and `Priority`
- <what setup chose, one bullet each: deadlines in the project's docs, mail threads, chat threads, another task list>

**What earns a place:** a deadline within about two weeks, something waiting on the user's reply or decision, a commitment going stale, a risk they would want to hear about now. **At most 7** on the page.

**Waiting on the user:** a question or decision addressed to them that is not answered point by point. A reply that answers one point of several leaves the thread waiting on the rest, whoever wrote last.

**Each card** is one matter (one task, one thread, one deadline), because the user's comments and ✓ / ✕ / ⏸ act on the whole card.
- An existing `dsh:task` record keeps its key; return it with `dsh:on` when picked, without when not.
- A card labelled `ready-for-agent` is an agent task, and the sync finishes it: return it open, without `close: true`.
- A new matter: key `task_<slug>`, label `dsh:task` plus its track label, `target` when there is a deadline, the series' `dsh:mtg/<series>` label when it prepares for a meeting.
- `parent`, `blockedBy` and `type` (Epic / Story / Task) when the source says so ([tracker.md](../references/tracker.md#relations)).
- `meta.lead`: the due date as `DD.MM`, or `—`.
- The gist says why it matters now; the brief names its source; a prompt where Claude can prepare the next step.

Leave out what the day's other cards already cover; you get their titles.

**Cap:** the 7 holds on every Sync run. A new matter that outranks a card on the page takes its place, and the displaced card comes back without `dsh:on`.

Done when every delta item you want is in a card or judged not to earn a place, and every card names its source.
