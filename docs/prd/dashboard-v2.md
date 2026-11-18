# Dashboard v2 — PRD

Status: draft, 2026-11-04. Vocabulary: [glossary.md](../dashboard-v2/glossary.md). Decisions: [adr/](../dashboard-v2/adr/).

## Why

The user opens one page before their day to see their meetings, pull requests and tasks, and steers Claude by commenting on them. v1 (`.claude/skills/meeting-dashboard`, `.claude/skills/dashboard-notes`, built 2026-11-01..04) works, but:

- **Card data is baked into the HTML.** Every change means a republish, and a note's outcome can't touch its card.
- **Notes and marks live only in the artifact's database.** A new artifact means an empty database, and nothing persists outside the page.
- **There are three trackers for one person's work:** To Do tasks, `### Action points` in meeting notes, and dashboard marks.
- **Configuration is spread across the skill** (prompts, `pr-filters.json`, `artifact-url.txt`), so no one else can reuse it.

v2 splits **presentation** (the page) from **data** (the tracker), and **mechanics** (the skill) from **preferences** (a project config folder).

## Goals

- One tracker of record for cards, tasks and comments. The page only shows a selection of it.
- When a routine changes the tracker, the open page shows it without a republish.
- The user talks to Claude in two ways and picks by where they type ([ADR 0005](../dashboard-v2/adr/0005-cloud-and-local-surfaces.md)): **Cloud**, a dialogue with the assistant in the page, answered at once; **Local**, a comment on a card, a prompt that the next sync acts on with local tools and answers in the same thread, and the user can reply again.
- ✓ / ✕ / ⏸ act on a card or task with one click and remove it from view: done and dismissed for good, snoozed until its date. ✕ on a task deletes it; ✕ on a PR card dismisses it. *(Confirmed 2026-11-05.)*
- A skill anyone can install. Everything personal lives in `.claude/dashboard/`.

## Non-goals

- A bot account on GitHub for now. Claude writes as the user and signs its comments; `agent-assignee` may name a bot account later.
- Real-time push to the page (polling every ≥30 s is enough).
- Replacing meeting notes in the repo. They stay as the record of what was said; the tracker holds what has to be done.

## Anti-goals

- **Two codebases for two storage modes.** Mode A and mode B differ only behind one tracker contract.
- **Section-specific logic in the page or routines.** A section's behaviour comes from its config flags and its prompt file.
- **Silent failure.** A source that could not be read is reported, never treated as "nothing new". A missing or not-connected tool counts as one *(added 2026-11-16, #218; rule in `references/tracker.md`)*.

## Storage modes

Setup offers a choice of two modes. Both show the same page and have the same skill commands.

How each mode stores cards, tasks, comments and the status is in its storage reference: [github](../../plugins/office/skills/dashboard-v2/references/storage/github.md) (mode B, the user's: issues in a repo with the org's issue fields; suits technical users, history and the mobile app come free) and [artifact-db](../../plugins/office/skills/dashboard-v2/references/storage/artifact-db.md) (mode A, self-contained: the artifact's own `db`; suits anyone without GitHub).

Both modes are in v2 scope (confirmed 2026-11-04). Build order: B first, then A ([ADR 0003](../dashboard-v2/adr/0003-two-storage-modes-one-tracker-contract.md)).

## Tracker model (mode B)

**Labels** all carry the fixed prefix `oz:`. It is not configurable: routines, prompts and the page all use it, so a different prefix would quietly empty the page *(decided 2026-11-05)*.
- `oz:meeting`, `oz:pr`, `oz:task`: the card type
- `oz:on`: shown on the dashboard
- `oz:needs-you`: Claude is waiting on the user
- `oz:replied`: Claude answered in the thread and the user has not opened the card since
- `oz:status`: the single status issue (below)
- `oz:delete`: the user pressed ✕ on a task; the next run deletes the issue

Track labels (Acme, Ops, …) are task taxonomy, not dashboard-specific, so they carry no prefix. *(My call; flag if you want them prefixed.)*

The repo's agent-issue workflow (`docs/agents/issue-tracker.md`, triage labels) ignores every issue labelled `oz:*`, so dashboard cards never show as untriaged. One triage label is reused on cards: `ready-for-agent` on a `oz:task` assigned to `agent-assignee` makes it an agent task for the sync (see Agent tasks) *(decided 2026-11-11)*.

**Issue fields** already defined for the user's GitHub organisation. They are set on the issue itself, and no Project is needed:
- `Target date`: the due date.
- `Start date`: snoozed until. The card stays hidden before this date. The field is reused for this purpose; GitHub's own wording is "when work begins".
- `Priority` (Urgent / High / Medium / Low): the order of cards within a group.

**Meeting series** is a label: `oz:mtg/<series>` (e.g. `oz:mtg/ft-sync`).

**Relations** ([ADR 0008](../dashboard-v2/adr/0008-meeting-tasks-by-series-subtasks-native.md), #169, *decided 2026-11-14*). A subtask is a native sub-issue of its parent task; native sub-issues are the only list of children, and no body keeps a checklist of them. A blocked task has a native blocked-by dependency, never a "blocked by #n" line in prose. Tasks get the issue type Epic, Story or Task; meeting and PR cards get none, and the `oz:*` type labels stay. A task is never a sub-issue of a meeting card: it attaches to meetings only through the series label. Collectors and `create_task` accept an optional parent, blocked-by and type; relations the user sets by hand on GitHub are read the same way.

**Card metadata.** Each issue body ends with one hidden line:

`<!-- dsh {"key":…, "section":…, "group":…, "groupRank":…, "collapsed":…, "lead":…, "badges":…, "author":…, "repo":…, "updated":…} -->`

Routines write it, and the page reads it to place the card in its section and group and to drive the filter chips and counts. Within a group, cards are ordered by `oz:needs-you` first, then `Priority`, then `Target date`. *(My call.)*

**Identity.** The `key` in that line is:
- `mtg_<series>_<YYYYMMDD>` for a meeting card, using the meeting's local date;
- `pr_<repo>_<id>` for a PR card;
- `task_<slug>` for a task.

Runs find the existing issue by this key and update it in place; they never create a duplicate. The issue number is the ID that ✓ / ✕ / ⏸ act on.

**Card body** is GitHub-flavoured Markdown, and the page renders it as github.com does: links, lists, tables, task lists, code. *(Requirement added 2026-11-05.)* Fixed headings let the page find each part without a schema:
- `## Brief`: the text
- `## Prepare`: what to prepare, as text; it no longer lists the series' tasks, which the page shows from the label *(changed 2026-11-14, #169)*
- `## Terms`: `- **term** — explanation`, rendered as tooltips
- `## Prompts`: fenced blocks with a copy button
- `## Suggestions`: up to three short ready comments, shown as chips that pre-fill the comment box

**Lifecycle:**
- **Meeting card:** created when the meeting enters the window. It gets a full brief for today and the next working day, and a light brief for days 3–7. It closes as completed once the meeting is over, and its prep comments stay in its history.
- **PR card:** one per open PR. It closes when the PR is merged or declined.
- **Task:** created by any routine or by the user, on its own lifecycle. A task from a meeting links to that meeting card. A task that prepares for a later meeting carries that series' `oz:mtg/<series>` label and shows under every card of that series on the page, however far away the meeting is; while one is on the page, the task is not repeated in its own section *(changed 2026-11-14, #169)*. A subtask lives on its own lifecycle and shows under its parent.
- **A card the agent defers:** for example, a comment says "make a task with a deadline later". The routine creates the task with `Target date`, closes or unlabels the card, and sets the task's `Start date` to 2 days before `Target date`, or to what the card's text implies. The task returns by itself.

**Status issue** (`oz:status`, one, pinned): each run rewrites its body with the run time, sources that failed, and anything Claude could not do. The page shows it as a banner when it is non-empty. A run sends one PushNotification only when it changes the body: a new problem appears, or a source recovers. Repeated failures stay silent. When the status issue itself can not be written (the GitHub connector is down), the run sends the problems in a PushNotification and ends its report with them. **Heartbeat:** the page warns "The routine has not run since …" when the status issue's run time is older than `stale-hours` (default 26), so a run that died, never started or could not write anything still shows. *(Agreed 2026-11-05.)* In mode A the same role is one `db` doc. *(Confirmed 2026-11-04.)*

## Page

- Reads the tracker live and has no copy of the data:
  - **Mode B:** a claude.ai GitHub connector through the artifact `mcp` capability, polled every ≥30 s.
  - **Mode A:** `db` `onSnapshot`.

  The spike verified mode B on 2026-11-04 ([ADR 0002](../dashboard-v2/adr/0002-page-reads-tracker-live-by-label.md)).
- Shows open items labelled `oz:on`, grouped into sections. Within each group they are ordered as above.
- Hides an item while its `Start date` is after today, and shows it again on that date.
- Cards that are `oz:needs-you` go first.
- Each card shows:
  - a one-line gist, with the brief on expand. When the card stands for an origin item elsewhere (a PR, a ticket, a mail or chat thread, a calendar event), the gist opens with a link to that item, its key as text, so one click from the collapsed card reaches the item itself *(requirement added 2026-11-06)*;
  - a "Claude replied" badge while it has `oz:replied` *(requirement added 2026-11-05)*;
  - at its end two sections ([ADR 0005](../dashboard-v2/adr/0005-cloud-and-local-surfaces.md)): **Cloud chat** with the assistant, and **Local**, its comment thread with a comment box, loaded when the card is expanded *(decided 2026-11-11)*;
  - ✓ / ✕ / ⏸ (unless the section sets `card-actions = false`, as meetings do);
  - an open-in-new-tab icon (GitHub's link-external) in the title row, linking to the card's own issue *(requirement added 2026-11-06; replaced the "Open on GitHub" link inside the expanded card)*.
- Relations ([ADR 0008](../dashboard-v2/adr/0008-meeting-tasks-by-series-subtasks-native.md), #169, *decided 2026-11-14*):
  - a parent task shows a done count ("9/18") and "Subtasks: N" under its head, the way a meeting shows its tasks; a click lists all its open subtasks, with or without `oz:on` *(changed 2026-11-15, #169)*; each level loads only on click, so the tree can be opened as deep as the user likes and a cycle never makes the page loop;
  - a subtask is shown only under its parent. When one needs the user, the page walks up to its root (visited set, at most 8 levels, a cycle mark if a node repeats), places the root card as if it needed the user, and opens the path to the subtask;
  - a meeting card shows "Tasks: N" for the open tasks of its series, listed on click; each is a full task row with its own ✓ / ✕ / ⏸;
  - a blocked task carries a "Blocked" mark and stays where it would be *(the page's GitHub connector has no dependencies tool, so the page cannot read blockers yet: [findings](../dashboard-v2/findings.md), #169)*;
  - ✓ on a parent is disabled while it has open subtasks;
  - a **task row** (a subtask or a series task) *(decided 2026-11-14, #169)*:
    - clicking the row or its caret expands it inline into the same detail a top-level card has. The caret is a real button with `aria-expanded` on every row, and the title does the same as the caret. The GitHub link is an open-in-new-tab icon in the row, as on cards;
    - the detail is one shared function with the card's, in this order: description, subtasks, Prepare and prompts where present, **Cloud chat**, **Local**. A top-level card has the same order, its subtasks behind "Subtasks: N" (under the gist while collapsed) *(changed 2026-11-15, #169)*;
    - an expanded row reads its issue once (`issue_read get`) for the body, type, blockers and subtask count. Before that it shows only what the sub-issue list gave: number, title, labels, date;
    - the row is a grid with fixed columns (caret, `#id`, title, badges, actions): the title wraps inside its own cell and never pushes ✓ / ✕ / ⏸ onto a second line, and ⏸ opens its day choice as a popover. Indent is one fixed step per level (`--depth`), the same at every level including the first, with a thin guide line on nested rows. There is no depth cap on expanding.
- ✓ / ✕ / ⏸ and new comments write straight to the tracker, and the item disappears from view at once.
  - ⏸ offers the next working day or +7 days.
  - Done and dismissed items are not shown. Closed issues are their history.
  - ✕ on a task closes it as not planned and adds `oz:delete`; every skill run deletes such issues with `gh issue delete`. The page cannot delete: GitHub has no REST delete, and the connector has no tool for the GraphQL `deleteIssue` (admin only). Meetings and PRs are never deleted, because the next run would recreate them from their source.
- Reads at most 100 cards (one page of `list_issues`). If the page is full, a note at the bottom says the limit was reached and more cards may exist. *(Requirement added 2026-11-05.)*
- PR filter chips (author with avatar, repo, last activity: 24 h / week / all), at most one chip of each kind.
- Text is selectable. Both themes work. The page works at phone width.

## Skill: `dashboard-v2`

One skill replaces `meeting-dashboard` and `dashboard-notes`. It is named `dashboard-v2` while v1 runs alongside it *(decided 2026-11-05)*.

| Command | Does |
|---|---|
| `/dashboard-v2` | Help: the commands and the section ids from the config; runs nothing. |
| `/dashboard-v2 sync [section] [params]` | A **Sync**, the one hourly run and change-driven *(changed 2026-11-15, #188)*: follows up on new comments (below) and carries out agent tasks, then every source is read once since its own cursor (a map in the status issue's metadata) and each section's collector gets the whole delta and keeps what its prompt asks for (or one section's; params are free text for its agent, e.g. `sync meetings ABC-1396 high priority`), the tracker is updated, `oz:on` is recomputed and `Priority` set. Sources only a git commit changes (brief, dossier, repo docs) are read only when a commit touched them. A card leaves the page only when its origin is plainly resolved (issue closed, PR merged, meeting over) or it comes back without `oz:on`. A Sync run with nothing new reports `no changes` and starts no subagents. |
| `/dashboard-v2 setup` | Idempotent and prompt-driven: explores the project and what the session can reach, asks section by section (sources, gaps in what the project states), writes the config, labels and status issue (asks before creating a missing org issue field), publishes the page, installs the routines, offers a first `sync` *(added 2026-11-12, #168)*, and ends by telling the user how to live with the page (see Skill boundary). Page settings include the Theme, made from a Style source and kept with it in the config *(added 2026-11-12, #160)*. |
| `/dashboard-v2 setup <text>` | Targeted setup: only the steps the text touches (e.g. "make the theme lighter", "add a section"), republishing the page if it changed; text that matches no step gets a question. Replaces `setup theme` *(added 2026-11-12, #168)*. |
| `/dashboard-v2 <any other text>` | An instruction, like the Local input on the Assistant tab, carried out at once in that session with local tools. |

*(Commands changed 2026-11-12, #168, [ADR 0007](../dashboard-v2/adr/0007-sync-and-light-sync-commands.md): the bare call was the full run, `update` the 30-minute cycle.)*

**Change decided 2026-11-15** ([ADR 0009](../dashboard-v2/adr/0009-one-change-driven-sync-with-intake.md), #186; supersedes ADR 0007):
- `sync` becomes the only run, run hourly and change-driven (done, #188).
- The daily digest becomes its Intake stage.
- `sync light` is gone (done, #188).
- The spec is [sync-pipeline.md](../dashboard-v2/sync-pipeline.md).
- This section is rewritten as the slices land; until then the table above is what runs.

**Following up on comments** (inside sync). They are the only ones that answer comments: the page no longer does ([ADR 0005](../dashboard-v2/adr/0005-cloud-and-local-surfaces.md), *2026-11-11*; the split answer of ADR 0004 is gone). A user comment is unanswered when no later comment in its thread ends with the reply signature (config `reply-signature`, default `— 🤖 Claude`); the Sync run answers each one in full.
- Read the comment with its card and its whole thread in view:
  - **information** goes to the meeting's notes file, as in v1, without asking, when the card is a meeting card; for other cards the notes are usually left alone;
  - **an action** is carried out with the most local, reversible means available: a repo edit, a new task, or a mail or Teams draft, using local tools (a local MCP server such as Bitbucket, the repo) where needed;
  - **sending** happens only when the comment says so, marked as sent by AI;
  - **heavy work** goes to an Opus subagent.
- Re-read the thread before posting. Then reply in the thread with what was done, plus links, and add `oz:replied`. If the comment is ambiguous, reply with a question, add `oz:needs-you` and send one PushNotification. The label comes off when the user replies.
- A comment can change the card: rewrite the brief, close it, defer it, or create tasks.

**Agent tasks** (inside sync, #138; *decided 2026-11-11*). The Sync run also takes open `oz:task` cards labelled `ready-for-agent` and assigned to `agent-assignee`, and carries each one out. The card is the assignment. How is the agent's call: a direct commit, a branch and PR, work in another repo, a clone when the task asks; merging and approving stay the user's.
- Before work it posts a signed **claim** comment (hidden `<!-- dsh {"claim":…} -->` with the start time). A claimed card is never taken again: no retries, since a run cut off by a shut-down machine may resume and two runs on one repo would collide.
- `ready-for-agent` comes off only when the work is finished and reported: a signed reply with links plus `oz:replied`, or `oz:needs-you` and one PushNotification when it needs the user.
- A claim that looks stuck gets no special rule: the agent is trusted to notice it and draw the user's attention. A scenario test checks that before release; a general sentence is added to the skill only if the test fails.
- A full factory pipeline (intake, spec, review and test gates, as in the 2026-11-11 video research) is not built; if one is needed, an existing one is adopted.

**Who does what** *(my calls)*:
- A sync removes `oz:needs-you` once the user has commented after Claude's question. The page writes clicks and comments, and removes `oz:replied` when the user expands the card.
- A sync closes meeting cards whose meeting is over.
- Scheduling stays as in v1 (local scheduled runs where the MCP servers are configured). `setup` offers to install the two routines itself when the session has Claude Desktop's `scheduled-tasks` tools; without them it recommends rerunning setup from Desktop or prints the routines for the user to add by hand. The daily run joined the daily-digest routine *(changed 2026-11-05)*; since #194 the digest is the Sync's Intake stage and the daily-digest task is retired, so the one hourly routine is the only writer.

**Other routines:**
- **daily-digest** (now the Intake stage of the Sync, #194) creates tasks from meeting transcripts as `oz:task` issues with track labels, linked to the meeting card, and stops writing To Do tasks *(done 2026-11-05)*. It keeps writing `### Action points` while v1 runs, because v1 briefs read them; that stops at cutover.
- **PR push:** when a PR newly needs the user's review or reply, send one PushNotification. Skip it while the PR card is snoozed.
- **Failure push:** a run that hits a failure (unread section or source, a write that did not land) sends one PushNotification naming it. Successful runs stay silent: the Desktop "task complete" banner is off, since the hourly sync would fire it every cycle *(added 2026-11-06)*.

## Configuration: `.claude/dashboard/`

```
dashboard.toml
sections/meetings.md
sections/prs.md
sections/tasks.md
avatars/
```

`dashboard.toml` holds:
- `storage` (`github` | `artifact-db` | `custom`; replaced `mode`, 2026-11-18, #257);
- `title`, `artifact-url`;
- `repo`, `server` (the claude.ai GitHub connector's name);
- `reply-signature`;
- `[assistant]`: `branch` for the assistant's repo reads (`last-active` | a name | `ask`) and `tools`, the connector tools given to the assistant (`{server, tool}`, at most 7 after the page's own); `ai-marker`, the text a connector write must carry *(added 2026-11-12)*;
- `poll-seconds` (page refresh) and `stale-hours` (heartbeat threshold, 26);
- `task-section`: the section the assistant's new tasks go to *(added 2026-11-10)*;
- `agent-assignee`: the GitHub account agent tasks are assigned to and the sync takes them for; default the current `gh` user, later possibly a bot account *(added 2026-11-11)*;
- the meeting window (7 days, full brief for 2 working days);
- `tracks`, the list of track labels sections and Intake name from; setup creates the labels *(added 2026-11-15, #193)*;
- `[[source]]` entries (`id`, `tools`, `prompt` = `sources/<id>.md`), each source declared once and read once per Sync run; there is no `mode` field and no custom-source case *(added 2026-11-15, #193)*;
- an ordered list of `[[section]]` entries. Each has:
  - `id`, `title`, `prompt` (path to its `.md`);
  - flags: `card-actions`, `filters` (e.g. the PR authors and repos table, formerly `pr-filters.json`), (the `light-sync` flag went away in #188).

Page order = file order. Every section is filled by its own subagent. The skill ships project-neutral templates for meetings, PRs and tasks (`plugins/office/skills/dashboard-v2/sections/`); setup copies the chosen ones into the config folder with their sources filled in, and they are edited there.

A section's `.md` is plain prose for its agent:
- what it wants, by meaning and track, from the Sync run's delta (tool names, "where to look" and provider quirks live in `sources/<id>.md` and the provider's gotchas reference) *(changed 2026-11-15, #193)*;
- what matters and what doesn't;
- how to prioritise;
- how to write the brief or summary.

`tasks.md` carries v1's radar rules: pick from open tasks by `Due`, `Priority` and common sense, at most 7, one matter per card. Adding a section (e.g. Teams threads waiting on the user) = one `[[section]]` entry plus one `.md`.

## Assistant

The Claude inside the page. It runs on artifact `sample` with page tools that call the viewer's connectors, billed to the viewer's plan, and only while the page is open. It holds **Cloud** conversations and does not answer comments ([ADR 0005](../dashboard-v2/adr/0005-cloud-and-local-surfaces.md), superseding [ADR 0004](../dashboard-v2/adr/0004-assistant-answers-live-routine-follows-up.md)). *(Designed 2026-11-10, reshaped 2026-11-11.)*

**Two tabs** at the top: **Cards** (the dashboard) and **Assistant** (for anything not tied to a card).

**Cloud and Local, chosen by where the user types** *(decided 2026-11-11, #140)*. Every card ends with two sections, and the Assistant tab has the same two:
- **Cloud chat** (#129): a dialogue with the assistant. It writes to the tracker only when the prompt asks (create a task, post a comment). On a card its context is the card's brief, its whole comment thread (read only) and the card's last Cloud conversation. Connectors, the 16-tool cap and repo reads apply as below.
- **Local** (#138): on a card, its comment thread, answered by a sync (see Following up on comments). On the Assistant tab, the input creates a task card with `ready-for-agent` and `agent-assignee`, which the sync carries out (see Agent tasks).

**Cloud context in a hierarchy** *(decided 2026-11-14, #169)*: every task has its own Cloud conversation (`cloud/card-<n>`), also when it is shown as a task row under a parent. Its context adds to the brief and the thread:
- for a parent: its open children as number, title, type, labels and Blocked, plus the done count, so the session can read the right child itself. Closed children are only in the count;
- for a child: its direct parent's brief (number, title, type, body) and its siblings as number and title. Further ancestors are not included.
Comments and Cloud conversations of other tasks are never included. The one-document limit below is unchanged, since only briefs and lists are added.

**Cloud history:** the last conversation per card and one for the Assistant tab, kept in the artifact `db` until **New conversation** clears it; older ones are not archived. The `db` is shared by every viewer; per-viewer paths (`data/users/<id>/`) wait until someone else uses the page. A Cloud conversation does not count as an active conversation for card ranking (#150): only the Local thread does.

**Claude Duet:** the earlier hold on Ask until Duet ships is overridden; Cloud chat is built now and dropped if Duet covers it later *(2026-11-11)*.

**Built** *(2026-11-10, #125)*: both tabs and **New task**. The rules turn is [`references/assistant.md`](../../plugins/office/skills/dashboard-v2/references/assistant.md), baked in by setup; its tool `create_task` writes the card format, key (`task_<slug>_<YYYYMMDD-HHMM>`: a new matter, so no lookup), labels (`oz:task`, `oz:on`, plus only `oz:mtg/*` and track labels already on the page) and valid fields, and the reply always carries the task link. The chat history is trimmed to half of `maxPromptBytes`, oldest first, the rules turn always kept. The New task / Ask switch went with the two sections (#129): creating a task became something Cloud does when asked.

**Built** *(2026-11-12, #129)*: Cloud chat on every card and on the Assistant tab. One chat implementation serves both. The turns live in `db` at `cloud/tab` and `cloud/card-<n>` and are written once per exchange, trimmed oldest first to fit one document (`OZ.fitConversation`). A history that does not load within 10 s is not saved over. **New conversation** deletes the document. The card context is read fresh on every message: the brief and the whole thread, labelled User / Claude, oldest comments dropped first to fit (`OZ.cardView`). Tools: `create_task`, `delete_task`, `post_comment`, `close_card` / `snooze_card` (cards with buttons), `read_file`, `search_code`, `set_branch`, then the connector tools from `[assistant] tools`, cut to 16 (`OZ.pickTools`). `post_comment` signs the comment. It refuses while the thread has a user comment waiting for a sync, because a signed comment would mark that one answered. The assistant does not get an edit-the-brief tool: ask for it in the comments.

**Built** *(2026-11-12, #138)*: Local on the Assistant tab. Its text becomes an agent task through `OZ.newTask` with the `assignee` option: the first line is the title, the whole text the brief, labels `oz:task`, `oz:on`, `ready-for-agent`, assigned to `agentAssignee`. It is the user's click, so no Claude call and no approval. The input is disabled while the config has no `agent-assignee`. The sync claims, runs and reports these cards (`references/comments.md`, Agent tasks).

**Removed** *(built 2026-11-10 in #128, removed 2026-11-12 in #151)*: catch-up on open, the card queue, and the page's `reply` into threads. A card run read the thread, called `sample` with `reply`, `create_task`, `close_card` and `snooze_card`, and labelled the reply itself (`OZ.needsReply`, `OZ.signed`, `OZ.replyLabels`). `close_card` and `snooze_card` stay for Cloud on cards with ✓ / ✕ / ⏸.

**Long tasks** (Cloud, #130): the page continues `sample` calls in a loop, up to about 5, with progress and a Stop button. Beyond that it offers **Open in Claude Code**: a `claude://code/new` deep link prefilled with the task; the user presses Enter (deep links only prefill, see [findings.md](../dashboard-v2/findings.md)).

**Built** *(2026-11-13, #130)*: the long-task loop is in `run()` of the Cloud chat. Claude ends an unfinished answer with `[[continue]]` (rules, "Long tasks"); the page strips it and calls `sample` again with what was said so far (`OZ.continueInput`), up to `OZ.MAX_ROUNDS` = 5 calls, with a "Step n of 5" line and the existing Stop. Past the cap it shows **Open in Claude Code**: `OZ.deepLink(folder, task)` with the user's message, the card reference and the last 2000 characters of progress, plus a select of `project-folder` (config; setup asks) and the folders this viewer used (browser storage, five, newest first). Whether a call ended on the round cap is not exposed by `sample`, so the marker is Claude's own report.

**Conventions:** mechanical rules (reply signature, `oz:` labels, the full-set rewrite of `labels`, approvals) live in the page's tool code. Judgement rules (what goes where, when to ask) are baked into the first user turn when setup builds the page, from the skill's references. Nothing is read from the repo at chat start.

**Connectors:** setup lists the connectors its session has and asks which to give the assistant; the page declares only those and uses the ones the viewer granted. The minimum is the tracker (the GitHub connector in mode B, `db` in mode A); everything else is optional, so the skill assumes no particular connector.

**Write rule** *(decided 2026-11-10)*:
- Reads need no confirmation.
- Tracker writes (task, comment, labels, close, snooze) need none either, except delete, which needs a click.
- Any other write (a tool without `readOnlyHint`, outside the tracker: mail, chat, commits) needs a click on a preview of what will be sent. Text the assistant reads (mail, PRs) can carry injected instructions, so it never sends on its own.
- Messages sent or drafted carry the AI marker, per the project's rules.

**Built** *(2026-11-10, #127)*: one gate, `OZ.needsClick`, decides from the tool's annotations (MCP defaults, so a tool without them asks) and whether it is a tracker tool; every page tool goes through it. A click shows a preview with Allow / Deny in the chat (a tool without its own preview shows its input); Deny reaches Claude as a tool error. Stop, or the call ending any other way, denies every pending approval and removes its buttons. `delete_task` does what a task's ✕ does, only for task cards on the page, previewed with the page's own title. **AI marker** *(built 2026-11-12, #129)*: `ai-marker` in `dashboard.toml`. A connector write whose input carries the marker in none of its text fields is refused before any click (`OZ.hasMarker`); no marker configured refuses every connector write.

**Repo:** read-only for the assistant, even when a write tool is available. It reads the branch set in `dashboard.toml` (`[assistant] branch`: last active, a name, or ask in chat; setup asks, default last active); the user can switch it by saying so in the chat (`set_branch`, until the page reloads). Last active is worked out once per page open, over at most 20 branches (`OZ.lastActive`). Code search covers only the default branch (verified 2026-11-10, findings); reading files by path works on any branch and collects every content block (`OZ.fileText`). *Built 2026-11-12, #129:* the GitHub connector's raw tools never reach the model, only the page's own read and tracker tools. Project-specific sources (a wiki index, mail, chat) are `dashboard.toml` values, never skill text.

## Skill boundary

The skill's files (`SKILL.md`, `references/`, `sections/`, the page) hold only the mechanics and stay free of this project's and this user's facts: no names, clients, paths or language. Those come from the project's `CLAUDE.md` files and from `.claude/dashboard/`, which setup writes after exploring the project; where a section needs a fact the project does not state, setup recommends adding it to `CLAUDE.md` (when other work needs it too) or to the section's prompt. Setup ends by telling the user what runs, where problems show, and what to tune. The project-specific requirements below (e.g. the reminder for rarely met teams, the daily run joining daily-digest) are this repo's setup answers, not skill text. *(Agreed 2026-11-05.)*

## Design intent

How this skill is meant to be written. Check every change against it. *(Agreed 2026-11-05.)*

- **Mechanics in the skill, facts in the project.** Skill files carry no names, clients, paths or language; they ship to other projects. Project facts live in the project's `CLAUDE.md`, dashboard-only facts in `.claude/dashboard/` (see Skill boundary). *(The `### <name>'s notes` heading and client names had leaked into `comments.md` and `sections/`.)*
- **Setup explores before it asks.** It reads the project and what the session can reach, then asks only what is missing: one topic at a time, recommended answer first, checkboxes plus free text. A missing fact gets a recommended home, not a silent default. *(Source questions grouped by topic; setup suggests adding facts to `CLAUDE.md`.)*
- **Setup hands over.** It ends by telling the user what runs, where problems show, and what to tune. The user owns the dashboard after setup, not the skill.
- **Ready to start, free to change.** The skill ships templates the user edits in their project; nothing the user would want to change is buried in the skill. *(Ready section prompts.)*
- **Configure only what can vary.** A setting that would silently break things when changed is fixed, not configurable. *(The `oz:` prefix.)*
- **Simple over defensive.** One normal path, no fallbacks for cases not yet seen; trust the agent with the obvious. *(No `gh` fallback for a broken connector; 30 min with no hourly fallback.)*
- **Failures reach the user.** Every failure ends up where the user looks: the status banner, one push per new problem, and a heartbeat that turns silence into a warning.
- **Written for agents.** Compact, intent over steps, positive phrasing, one source of truth per fact, every step ends on a checkable "done" (`mattpocock-skills:writing-for-agents`; setup modelled on `setup-matt-pocock-skills`). Precise wording: "or" where only one path runs, no filler sentences.
- **Parallel, not replacing.** v2 runs beside v1 until cutover; nothing v1 needs is removed early.

## Off-the-shelf comparison

Researched on 2026-11-15 for #186. Vendor docs were read through one deep search pass, not page by page. [ADR 0001](../dashboard-v2/adr/0001-github-issues-as-dashboard-tracker.md) points here.

| Product | Covers | Missing for us |
|---|---|---|
| Microsoft 365 Copilot (meeting prep, Facilitator, recap, Planner agent, Plan My Day) | Outlook and Teams prep, recaps, tasks, a daily briefing | Jira, GitHub and Bitbucket only as read-only connectors; tasks go to Planner; no notes in a git repo; needs a Copilot licence (not checked for the organisation) |
| Granola, Fireflies, Otter, Read.ai | Meeting capture, action items to Jira | GitHub Issues only through Zapier; no Bitbucket; no routing across sources |
| Reclaim, Motion, Sunsama | Scheduling and day planning | Not a briefing agent; Sunsama's GitHub integration is read-only; no Bitbucket |
| Glean | Outlook, Teams, Bitbucket and Jira connectors; GitHub writes through MCP | Enterprise pricing and admin setup, too much for one person |
| Atlassian Rovo | Search over Jira, Bitbucket, GitHub and Outlook | No GitHub issue writes, no meeting notes |
| Community "chief of staff" repos and Anthropic's chief-of-staff cookbook | Agent architecture | Gmail and Google Calendar only; no M365, Jira or Bitbucket |

**What nothing covers:**
- Bitbucket and GitHub PRs in one place;
- Jira;
- notes written into a git repo;
- GitHub Issues as cards;
- replies to card comments;
- cross-references per topic.

So the build stays custom. What we adopt instead is a time-filter cursor per source ([findings](../dashboard-v2/findings.md#sync-change-detection-2026-11-15-186)).

## References

- Anthropic, official: [Get started with Claude Dashboards](https://support.claude.com/en/articles/17454700-get-started-with-claude-dashboards) (support article, beta) and [Build live dashboards and animate explainers with Claude](https://claude.com/blog/dashboards-and-motion) (launch post).
- Third-party, not Anthropic: Claude Dashboards guide, a Markdown conversion of the RoboNuggets PDF from their free Skool group (2026-11-06, from [the video](https://youtu.be/4XcaxeqTxMc)); the PDF is not kept.

## Open questions

- ~~**Page language.**~~ Resolved 2026-11-05: the template's own strings are English; setup translates them into the user's language when publishing.
- ~~**Mail and Teams: daily-digest or the dashboard?**~~ Resolved 2026-11-15 ([ADR 0009](../dashboard-v2/adr/0009-one-change-driven-sync-with-intake.md)): the digest becomes the Sync's Intake stage, and each source is read once per Sync run and routed to the topics and sections. The original question follows. Setup now offers each section the sources this session can reach (mail, Teams, Bitbucket, GitHub, calendar…) as a checklist, so the tasks section can read mail and Teams itself. daily-digest already reads mail too. Options: (a) drop mail from daily-digest entirely; (b) keep daily-digest filing mail into meeting notes as the record, but move finding action points and questions waiting on the user to the dashboard; (c) leave both. Leaning to (b): one owner per job, the digest keeps the record and the dashboard keeps what is still open. *(Raised by the user, 2026-11-05.)*

- **Assistant spike tails**: results in [findings](../dashboard-v2/findings.md#assistant-spike-tails-2026-11-10). Creating a task with fields, reading a file by branch, mail drafts and the prompt size work; search covers only the default branch; the last active branch is worked out once on open. Still open:
  - ~~`add_issue_comment` from inside a `sample` tool (the card dialogue's `reply`)~~: moot, `reply` is removed (#151); a comment Cloud posts on request still goes through the write rule;
  - two Cloud chats (a card and the Assistant tab) calling `sample` at the same time: not tested;
  - at most 16 tools per `sample` call: setup picks the assistant's tools across connectors, tracker tools first.

## Next step

- ~~`references/comments.md`: the "unanswered" rule and the follow-up of answered comments change per ADR 0004.~~ Done 2026-11-10 (#126).

## Migration from v1

- A new artifact (placeholder until the page lands). v1 keeps running until cutover.
- 2026-11-15: v2 covers v1. #195 disables the v1 routines; the v1 skills and artifact stay until a separate decision.
- At cutover:
  - open v1 notes (`new`, `later`, `needs-you`) become comments on the matching new issues;
  - v1 marks are dropped;
  - the v1 skills are removed.
- To Do becomes deprecated. Moving its open tasks to GitHub and rewriting the root `CLAUDE.md` To Do rules is tracked as the To Do task "Move tasks from To Do to GitHub" (list Tasks).

## Requirements carried from v1

Collected from sessions 2026-11-01..04.

**Layout:**
- Sections in order: Meetings, Don't forget (tasks), Pull requests.
- Sticky navigation with a count per section.
- Russian UI.
- Text selectable.

**Meetings:**
- Cards for 7 days ahead. Full brief for today and the next working day, light cards collapsed for days 3–7.
- What the user owes becomes tasks with the series label, shown under the card; the brief does not repeat them. A sync reads the series' tasks, open and closed, before adding one, so it never recreates a task the user already has or closed. The brief opens with what matters most, then what was decided and what others owe *(changed 2026-11-15, #169)*.
- No "you rarely attend" flags.
- Tooltips for unfamiliar terms and modules. Client cards carry reminder context.
- Focus on process, planning and AI, not app internals.
- A comment on a future meeting is prep for its brief, filed into meeting notes after the meeting.
- A meeting moved to another day gets a new card; comments stay on the old issue, which links to the new one.

**Pull requests:**
- PRs in the repos the config names.
- Each card has:
  - the kind of PR;
  - a recommendation (approve when trivial, otherwise what to look at), which may sit in the headline;
  - a flag on AI config changes (`CLAUDE.md`, settings, plugins);
  - a tooltip on the feature and where it shows in the app.
- Grouped by the user's next move: replies to them (new reply / unanswered), awaiting their review, approved by others (short list), stale (collapsed), all open (collapsed). Reviewers are not shown.
- Filter chips as above.

**Comments** (v1 notes):
- An explicit "add comment" button, not an always-open field.
- The user can delete their own comments.
- Claude reads every comment with its card and the card's other comments in view.

**Routines:**
- Everything runs locally, where the MCP servers are configured.
- Intake, the former daily-digest, is the first stage of the hourly sync *(changed 2026-11-15, #194)*.
- The sync runs hourly and sends nothing unless asked.
- Runs report only what changed.
- Collectors run as subagents.

**Lessons:**
- A run that edits the page must not collide with another run. Mode B removes page republishing from routines.
- A note processed without its card's context gives wrong actions.

## Dropped

- The "Returned" section: a snoozed item returns to its place.
- New dark-theme variants.
- The Approve chip on PR cards (approve stays the user's click in Bitbucket).
- The 7-day pruning of processed notes: the tracker keeps history.

## Future

- A hands-free "Run Claude" on a card. The 2026-11-01 attempt failed with 403; per [findings.md](../dashboard-v2/findings.md) (2026-11-09) deep links only prefill a prompt, so v2 uses them as the assistant's long-task fallback. Agent tasks (`ready-for-agent`, run by the sync) now cover hands-free work at up to an hour' delay *(2026-11-11)*; the routine fire API and GitHub Actions stay untested.
- A GitHub bot account for Claude's comments and as `agent-assignee`.

## Spike result (2026-11-04)

The throwaway page Dashboard Spike (a private artifact) used the claude.ai connector `github` (`https://api.githubcopilot.com/mcp/`, own OAuth client). Every check passed:
- `list_issues` and `search_issues` find issues by label;
- `list_issues` with `fields: [..., "field_values"]` reads `Priority`, `Start date` and `Target date`, and `field_filters` can filter on them;
- `issue_write` `update` with `issue_fields` sets dates and options, and with `state` / `state_reason` closes an issue;
- `add_issue_comment` posts a comment.

Later findings (connector writes that hang from Claude Code, and more): [findings.md](../dashboard-v2/findings.md).

The connector exposes only `get_me`, `list_issues`, `search_issues`, `issue_read`, `issue_write` and `add_issue_comment`. It has no Projects tools, so v2 uses issue fields instead of a Project.

The page asks once for consent to the connector.

Fallback, if the connector stops working: a snapshot in the artifact `db`, as described in ADR 0002.

**Cutover is in scope** as the last phase of the build: the `oz:*` exclusion in the agent-issue docs, the v1 note migration, the end of `### Action points`, and removal of the v1 skills. Until then v1 and v2 run in parallel and v1 keeps working. The `daily-digest` switch from To Do to `oz:task` issues came early, with the v2 build *(2026-11-05)*.

## Calls I made (check these)

- The `oz:` prefix, and track labels without a prefix.
- Reusing `Start date` as snoozed-until, and `Priority` as the only ordering (no backlog).
- Meeting series as a `oz:mtg/<series>` label.
- A hidden `oz:key` marker in the body as the identity.
- Snooze for a deferred card: `Due` − 2 days unless the text implies otherwise.
- A moved meeting: a new card, with the old one linked.
- Deleting a task from the assistant needs a click; other tracker writes do not.
- A sync files comment information into meeting notes only for meeting cards.
- Bitbucket actions go only through a sync, since the page cannot reach local MCP servers (`host:` is `unavailable`).
