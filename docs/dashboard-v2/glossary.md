# Dashboard

Vocabulary of the user's meeting-prep dashboard (v2): the page, its tracker, and the routines that fill it.

## Language

**Dashboard**:
The one page the user opens before their day: the cards that matter now, grouped into sections.
_Avoid_: Agenda, artifact (the artifact is only where it is shown)

**Tracker**:
The single store of record for cards, tasks and their comments; the dashboard only shows a selection of it.
_Avoid_: Database, backend, To Do

**Storage mode**:
Where the tracker keeps its records: GitHub, the artifact's own db, or a custom store the project describes itself. Every storage mode goes through one tracker contract; only GitHub and the artifact db are guaranteed to behave the same, a custom one is not. One dashboard uses one storage mode. *(Added 2026-11-16, #221; custom added 2026-11-16, #223.)*
_Avoid_: Backend, provider, adapter

**Record**:
One entry in the tracker: a card, a task or the status. Runs and the page reach records only through the tracker contract (`references/tracker.md`). *(Added 2026-11-18, #257.)*
_Avoid_: Issue, document, row (each is one storage mode's form of a record)

**Storage reference**:
The file that says how one storage mode carries out each operation of the tracker contract: `references/storage/<name>.md` in the skill, or the project's `custom-storage.md`. *(Added 2026-11-18, #257.)*
_Avoid_: Adapter, driver

**Card**:
One matter shown on the dashboard: a meeting, a pull request, or a task.
_Avoid_: Item, ticket

**Kind**:
Which of the three a card is (meeting, pull request or task), carried only by its `oz:meeting`, `oz:pr` or `oz:task` label. Not a task's type (Epic, Story, Task). *(Added 2026-11-18, #257.)*
_Avoid_: Type, card type

**Meeting card**:
A card for one occurrence of a meeting, holding its brief and the user's prep comments; closes once the meeting has happened.
_Avoid_: Event

**Meeting series**:
The recurring meeting a card or task belongs to, independent of any date (e.g. Acme sync).
_Avoid_: Recurring event

**Topic**:
A subject of meeting notes, kept as one folder with one notes file per year; it can gather several meeting series and ad-hoc calls. Intake files transcripts and mail by topic. *(Added 2026-11-15, #193.)*
_Avoid_: Meeting series (a series is one recurring meeting), folder

**Task**:
Something the user has to do, tracked on its own; it may point to the meeting it came from or the meeting series it prepares for.
_Avoid_: Action point, action item, to-do, reminder

**Subtask**:
A task that has a parent task; it keeps its own life (done, snoozed, dismissed on its own) and is shown under its parent rather than on its own. A task that prepares for a meeting series is not a subtask of that meeting. *(Added 2026-11-14, #169.)*
_Avoid_: Sub-issue, child, action item

**Task row**:
The compact line a subtask or a series task has under its parent card or meeting card; it expands in place into the same detail as a card, with its own Cloud and Local. *(Added 2026-11-14, #169.)*
_Avoid_: Mini-card, child card

**Blocked**:
A task that cannot go on until another task is done; it still shows where it would, marked as blocked. *(Added 2026-11-14, #169.)*
_Avoid_: Waiting, depends on

**Origin item**:
The thing a card stands for in another system: a pull request, a ticket, a mail or chat thread, a calendar event. The card's gist opens with a link to it. What a source returns on a pass is a list of origin items, each a pointer with a short extract, never the full text. *(Updated 2026-11-15, #193.)*
_Avoid_: Source (a source is where a collector reads, not one item in it), delta item, change

**Source**:
A place the Sync reads origin items from (mail, Teams, calendar, Jira, a pull request host, a folder of files), declared once and read once per pass, whatever number of sections and topics want its items. A source only one section wants is declared the same way. *(Added 2026-11-15, #193.)*
_Avoid_: Feed, connector (the connector is only how a source is reached), custom source

**Pull request**:
A proposed change to a repo, waiting for review on its repo host; it ends merged or closed (closed without merging). Its people are the author, reviewers and participants; review gives an approval, a change request or a review comment. *(Added 2026-11-18, #228.)*
_Avoid_: Merge request, declined

**Repo host**:
Where repos and their pull requests live; read as a source, never a storage mode. *(Added 2026-11-18, #228.)*
_Avoid_: Git host, GitHub (in shared skill files)

**Track**:
A tracker label naming one area of the user's work; a section or a digest topic says which tracks it wants, and the cards and tasks it makes carry them. *(Added 2026-11-15, #193.)*
_Avoid_: Area, category, stream

**Brief**:
The text of a card that prepares the user for it: what is expected, what was decided, terms explained; what the user owes is tasks shown under the card, not brief text. It has no state of its own.
_Avoid_: Summary, description

**Section**:
A named group of cards on the dashboard, filled by its own collector agent from its own instructions.
_Avoid_: Block, group

**Comment**:
A message on a card, from the user (a prompt for Claude) or from Claude (its answer, carrying the reply signature).
_Avoid_: Note

**Assistant**:
The Claude inside the dashboard page: it holds Cloud conversations while the page is open and acts on the user's behalf. It does not answer comments. *(Updated 2026-11-11.)*
_Avoid_: Chat, bot, embedded Claude

**Cloud**:
A conversation with the assistant, on a card or on the Assistant tab, kept in the page's own store rather than the tracker; the last one per card and one for the tab, until **New conversation** clears it. It reads the repo on one branch and the connectors setup chose, and changes something only when asked. *(Added 2026-11-11, updated 2026-11-12.)*

**AI marker**:
The text the project's rules put on a message Claude drafts or sends (`ai-marker`); the page refuses a connector write that does not carry it. *(Added 2026-11-12.)*
_Avoid_: Card dialogue, page chat

**Local**:
A comment in the tracker, answered only by a routine with local tools: the card's comment thread, or on the Assistant tab a new agent task. *(Added 2026-11-11.)*
_Avoid_: Card dialogue, offline

**Agent task**:
A task an agent carries out by itself: labelled `ready-for-agent` and assigned to the configured agent assignee. *(Added 2026-11-11.)*
_Avoid_: Factory job, ticket

**Claim**:
The signed comment that marks an agent task as taken; a claimed task is never taken again. *(Added 2026-11-11.)*
_Avoid_: Lock, lease

**Routine**:
A scheduled run outside the page that collects cards into the tracker, answers Local comments and carries out agent tasks. *(Updated 2026-11-11.)*
_Avoid_: Job, cron, scheduled task

**Sync**:
The one hourly run, made of these stages: quota gate, Intake, sources, sections, cleanup. It reads only what each source gained since its Cursor, writes the cards that changed and closes those whose origin is resolved. A Sync run with nothing new reports `no changes`. *(Added 2026-11-12, #168; redefined 2026-11-15, #188, ADR 0009.)*
_Avoid_: Full run, rebuild, refresh, update, pass (say Sync run; added 2026-11-15, #194)

**Intake**:
The Sync's first stage, formerly the daily digest. It turns new transcripts and mail into meeting notes, cross-references, the daily brief and tasks. *(Added 2026-11-15, #186.)*
_Avoid_: Digest (for the stage), ingest

**Daily brief**:
One yearly log of what Intake took in, one entry per day that a Sync run added something to; a day with nothing new has no entry. The user reads it, and sections get it as a repo file like any other. *(Added 2026-11-15, #194.)*
_Avoid_: Digest, brief (a brief is a card's text), log

**Cursor**:
The time up to which one source has been read. A Sync run reads only what is newer than it; a source whose read failed keeps its old cursor, and so does a source Intake took from the delta (mail) when Intake failed, and a source with no cursor is read in full. Each source has its own, kept with the tracker's status; Intake keeps its own watermark in the transcripts log. The status's `updated` time only says when the last Sync run happened. *(Added 2026-11-15, #186; updated 2026-11-15, #193.)*
_Avoid_: Watermark (except for Intake's log), checkpoint

**Instruction input**:
The Assistant tab's free-form boxes for what belongs to no card: one Cloud, one Local. There is no mode switch. *(Updated 2026-11-11.)*
_Avoid_: Global chat, prompt box

**Rules turn**:
The leading user turn of every assistant call: the judgement rules setup bakes into the page from the skill's references. `sample` has no system prompt, so this turn stands in for one. *(Added 2026-11-10.)*
_Avoid_: System prompt, conventions prompt

**Approval**:
The Allow / Deny click the assistant waits for before a write the write rule does not let through on its own: deleting a task, or any write outside the tracker, shown as a preview of what will be done. Deny, Stop or the call ending leaves nothing done. *(Added 2026-11-10.)*
_Avoid_: Confirmation, consent

**Theme**:
The look of the dashboard: its colours, fonts and shapes, in light and dark. It never changes what the page shows or how it is laid out. *(Added 2026-11-12.)*
_Avoid_: Style, skin, design system

**Style source**:
The DESIGN.md a theme was made from: a Refero style, another published design file, or one the user pasted. *(Added 2026-11-12.)*
_Avoid_: Template, reference

**Skill**:
How the dashboard works for any project: what a Sync reads and when, how sections collect, what a card and a brief hold, what the page shows. A change in behaviour starts here. *(Added 2026-11-16.)*
_Avoid_: Config, template, the dashboard

**Config**:
What is true of this one project: its sources, tracks, what each section wants, its theme. Setup writes it from the skill, so a rule that also sits in the config is a copy of the skill's rule, and belongs to the skill. *(Added 2026-11-16.)*
_Avoid_: Settings, setup (setup is the step that writes it), skill

**Done**:
A card or task the user finished.
_Avoid_: Completed, checked

**Dismissed**:
A card the user declared not relevant; nothing follows from it. It stays in the history.
_Avoid_: Hidden, removed

**Deleted**:
A task the user removed with ✕, or through the assistant after an approval; it leaves no history.
_Avoid_: Dismissed, removed

**Snoozed**:
A card or task hidden until a given date, after which it returns by itself.
_Avoid_: Paused, postponed, deferred
