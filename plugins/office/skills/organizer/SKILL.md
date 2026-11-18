---
name: organizer
description: Keeps one person's Organizer dashboard, a claude.ai artifact prep page of meeting briefs, open pull requests and tasks on a tracker (GitHub issues or the artifact database). Use when the user wants to sync or refresh the page's meeting, PR or task cards, follow up on their comments on cards, add a task by instruction, or set up the Organizer, its sections, sources or theme.
---

# Organizer

The page is a claude.ai artifact that reads the **tracker** live and keeps no data of its own: it shows open records labelled `dsh:on`, writes the user's ✓ / ✕ / ⏸ clicks and comments straight back, and is never republished for data. So a run's job is the tracker: the right cards, current briefs, comments answered.

The skill holds only the mechanics. Everything about this project and this user comes from two places: the project's `CLAUDE.md` files (where notes live, how work splits into tracks, which language to use, how to send messages) and `.claude/dashboard/` (`dashboard.toml`, one prompt per section and one file per source, written by setup). Read `dashboard.toml` first, then the storage reference its `storage` names ([references/tracker.md](references/tracker.md) says where). The tracker contract is in tracker.md, the card format in [references/card.md](references/card.md); the run rules in tracker.md (upsert by key, one writer, deletes first, failures reported) bind every command.

## Commands

The first word after `/office:organizer` picks the command; text is a command only when that word is `sync` or `setup` ([ADR 0009](https://github.com/EmblaTech/claude-plugins/blob/main/docs/dashboard-v2/adr/0009-one-change-driven-sync-with-intake.md)).

| Command | Does |
|---|---|
| `/office:organizer` | Prints this table and the section ids from `dashboard.toml`; runs nothing. |
| `/office:organizer sync [section] [params]` | A **Sync**: run hourly, below. |
| `/office:organizer setup [text]` | [references/setup.md](references/setup.md); with text, a [targeted setup](references/setup.md#targeted-setup). |
| `/office:organizer <any other text>` | An instruction, below. |

## `/office:organizer sync [section] [params]`

Every Sync run is change-driven: each source is read once, since its own cursor, and every section works from what the sources returned. With a section id, only that section is collected; the params are free text for its collector, e.g. `sync meetings high priority only`.

1. **Quota gate**: [below](#quota-gate).
2. **Comments and agent tasks**: follow up on new comments ([references/comments.md](references/comments.md)) and carry out agent tasks ([references/comments.md](references/comments.md#agent-tasks)).
3. **Read the sources.** One read per `[[source]]` in `dashboard.toml`, in this thread, with the tools its entry lists, as its `sources/<id>.md` says, since the source's **cursor** in the status record's `meta` (no cursor: in full). Note when each read began: that is its new cursor. Two waves: every source not read from git, all in parallel; then **Intake** ([references/intake.md](references/intake.md)), which takes mail and calendar from that delta and reads transcripts itself, and whose one commit changes the notes, brief and dossier; then the sources read from git, so they see that commit. A source marked local only is skipped, cursor kept, when the run is not on the user's machine. A source returns **origin items**, each a pointer with a short extract, never the full text: `{source, id, url, kind, time, title, people, extract}`. The **delta** is all items of the Sync run. A failed source ([tracker.md](references/tracker.md#rules-every-run-keeps)) or a failed Intake goes into the status record, is never read as "nothing new", and the sync goes on. Done when every source returned or failed and Intake finished, failed or found nothing.
4. **Dispatch** one collector subagent per `[[section]]`, in parallel, only when the delta holds something new to its cards: an item that is new or differs from the open cards (id, last-modified time), or a card whose origin moved. Each collector gets the whole delta, so the section keeps what its prompt asks for by meaning and track; there is no router. It also gets its section's `prompt` file, [card.md](references/card.md), the `[meetings]` window, and the open cards of its section (key, record id, title, body, fields, and their comments), and returns cards. It reads the full item behind a pointer when it needs it, and the project's `CLAUDE.md` files for where things live. A collector fans out the same way: one subagent per item that needs its own reading (a meeting's brief, a PR's review), all in parallel, and it merges what they return. Done when every collector returned or failed; a failed section keeps its cards untouched and goes into the status record.
5. **Write** the returned cards one at a time: upsert by key, set labels, `Priority` and `Target date`, and `dsh:on`. `Start date` is the user's snooze: write it only when the collector set one. A card that comes back without `dsh:on` (e.g. displaced by its section's cap) leaves the page.
6. **Clean up**: two checks, and cleanup only ever removes `dsh:on`; it never touches a snoozed card (`Start date` in the future).
   - **Every Sync run, origin check.** For each open `dsh:on` card, look at its origin item with one cheap read: PR merged or closed, ticket closed, meeting over. A card whose origin is plainly resolved gets `close: true`. Done when every resolved card is closed.
   - **First Sync run of a local day, sweep.** When the status record's `updated` is from an earlier local day, also judge the `dsh:on` cards no section returned this run: a card that no longer matters by meaning (superseded, overtaken, nothing left to do) loses `dsh:on` and stays open, so it comes back by its key when a later Sync run returns it. A card still in doubt stays. Done when every such card is judged.
   A card is never closed or taken off merely because no source held it this run: a Sync run sees only what is new.
7. **Record the cursors** in the status record ([tracker.md](references/tracker.md#status-record)): each source read this run gets its noted time, except a failed source, which keeps its old cursor, and a source Intake took from the delta (mail), which keeps it when Intake failed, so the next Sync run re-reads what was missed.
8. **Report** only what changed: cards added, closed, updated, comments answered, agent tasks run, whether Intake filed anything, and failures. Nothing new, no fan-out subagents: report `no changes`. A card that newly needs the user's reply, review or decision and is not snoozed gets one PushNotification naming it. A failure (a section or source that could not be read, a write that did not land) also gets one PushNotification naming it: the scheduled run is otherwise silent.

## Quota gate

The first step of a sync, before any tracker call. When the storage reference defines `quota()`, check it: below the reference's threshold the run skips, with no tracker work, no scheduled task and no PushNotification, and its whole report is the reference's one skip line. The next Sync run catches up, since it reads everything since the cursors. A storage mode with no `quota()` has no gate.

## `/office:organizer <any other text>`

An instruction, e.g. `add a task to call the supplier`: the same request as the Assistant tab's Local input, but the user is here, so carry it out now in this session with local tools, by the rules of an [agent task](references/comments.md#agent-tasks) minus the card: no `ready-for-agent` card, no claim. Report what you did, with links to any card you created or changed.

## Page

The page is six files in this folder: `page.html` (markup and config), `base.css` (layout), `theme.css` (the default **Theme**: token values, light and dark), `logic.js` (pure logic), `tracker.js` (the tracker contract, one implementation per storage mode) and `app.js` (DOM and wiring); setup fills and publishes them as one artifact, the Theme taken from `.claude/dashboard/theme.css`. It has two tabs, **Cards** and **Assistant**; every card and the Assistant tab end with **Cloud** (a chat on the artifact `sample` capability, kept in the artifact `db`, whose rules turn setup bakes in from [references/assistant.md](references/assistant.md)) and **Local** (the card's comments). The page's tools fix the mechanics, write through the same tracker contract as the cards, read the repo but never write it, and put any other connector write behind a click. The page never answers card comments: only a sync does. `node --test "plugins/office/skills/organizer/*.test.mjs"` from the repo root covers `logic.js`, both storage modes of `tracker.js` and the Theme contract (no colour outside a Theme, every Theme complete in light, colours only in dark). Run it after any change to the page files or a Theme.
