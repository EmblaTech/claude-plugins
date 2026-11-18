# Meetings

One card per meeting in the window, with its brief.

**Wants** <by meaning and track, filled in by setup: the calendar events, the notes of the series, calls filed nowhere yet>.

**Window.** Calendar events from now to the end of the last window day. Drop declined and cancelled events, all-day blocks, and events with no other attendees. Done when every event in the window is kept or dropped for one of those reasons.

**Every Sync run** brings the calendar window in the delta and compares each event with the open meeting cards by `meta.event.id` and `meta.event.modified`. A new event gets a card, a changed one a rebuilt card (moved: see the key rule in [card.md](../references/card.md)), and an open card whose event is gone or cancelled is closed (`close: true`). Every card records `meta.event` (`{id, modified}`, the event's last-modified time) and, for a full brief, `meta.built` (ISO time the brief was built).

**Every card:**
- `title`: the subject, cleaned up; `meta.lead`: the time, e.g. `09:30–10:00`
- `meta.group`: the day ("Today", "Tomorrow, Fri 6.11", "Mon 9.11"); `meta.groupRank`: days from today
- `target`: the meeting's date; labels `dsh:meeting`, `dsh:mtg/<series>` and the track label
- `close: true` for an open card whose meeting is over

**Full brief** for today and the next working day (`full-brief-working-days`). Rebuild one only when its inputs changed since the card's `meta.built`, else keep the card as it is:
- the event is new or changed;
- the series' notes file got a commit since `meta.built`, including a cross-reference section the intake wrote from another meeting (`git log --since=<built> -- <notes file>`);
- a `dsh:task` with the series' `dsh:mtg/<series>` label was added or changed since `meta.built`.

A commit to one series' notes rebuilds that series' next brief only. Steps of a rebuild:
1. **Find the notes** of this meeting's earlier occurrences and read the latest one or two. When there are none, build the brief from the invite alone and say so in the gist.
2. **The user's actions become series tasks.** Read the series' existing tasks first: `list(labels: [dsh:mtg/<series>], state: all)`, open and closed. Each action the user owes in anything you read for this brief, that none of them already covers, open or closed, is returned as its own task card, shaped as in [tasks.md](tasks.md) (key `task_<slug>`, `meta.section` the task section, `dsh:task`, this `dsh:mtg/<series>` label, `target` when a date is given). An existing task is left as it is, so the user's ✓ / ✕ / ⏸ on it stand. The page shows the series' open tasks under the card, so the brief does not repeat them.
3. **Brief.** The gist is the one thing that matters most in this meeting. Then, as lists: what was decided last time (with its date) and what the others owe. The user's own share lives in the series tasks of step 2. When the meeting is with a team the user rarely meets, add a sentence on who they are and what the work with them is.
4. **Prepare.** Prep text only: what to read, ask or bring.
5. **The user's comments** on this card or on the series' earlier open card are their own context: they can change the gist. A request in a comment (a task, an answer, research) is followed up as in [comments.md](../references/comments.md), not here.

**Collapsed card** for the rest of the window: `meta.collapsed: true`, the gist names the organizer and who else attends. No notes read. It is rebuilt only when its event changed.

Done when every kept event has a card (an unchanged day wrote nothing), every action the user owes in what you read is a series task (new or already there), and every action someone else owes is in a brief or was left out because it is closed.
