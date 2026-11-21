# Card

A card is one open record in the tracker: a meeting, a pull request or a task. Collectors return cards; only the main run writes them (see [tracker.md](tracker.md)). Write in the user's language. The user skims the collapsed card, so the gist alone must carry the point.

## What a collector returns

```json
{
  "key": "mtg_weekly-sync_20261105",
  "title": "Weekly sync",
  "body": "## Brief\n…",
  "meta": {"section": "meetings", "group": "Today", "groupRank": 0, "lead": "09:30–10:00"},
  "labels": ["oz:meeting", "oz:mtg/weekly-sync", "<track>"],
  "priority": "Urgent | High | Medium | Low",
  "target": "YYYY-MM-DD",
  "parent": 131,
  "blockedBy": [140],
  "type": "Epic | Story | Task",
  "close": false
}
```

`parent`, `blockedBy` and `type` are optional and only for tasks, set when the source says so (see [tracker.md](tracker.md#relations)); `parent` and `blockedBy` name records as the storage reference does. `close: true` means the matter is over (the meeting happened, the PR merged); the run calls `setState(done)`.

## A card the user asked for

A card made at the user's request, as an action in a comment, an agent task or an instruction, is a task card shaped like one added on the page: key `task_<slug>`, `meta.section` the task section, labels `oz:task` and `oz:on`, linked from the card that asked for it. It shows on the page at once; from the next Sync run on, the tasks section's cap decides whether it stays.

## Key

The identity that lets runs update a card instead of duplicating it:
- `mtg_<series>_<YYYYMMDD>`: the meeting's local date. The series is the subject lowercased, without dates or numbers, spaces as `-`.
- `pr_<repo>_<id>`
- `task_<slug>`: a short slug, stable for the same matter.

A meeting moved to another day gets a new key. The run links the old card to the new one in a comment and calls `setState(dismissed)` on the old one.

## Body

GitHub-flavoured Markdown; the page renders it in full, so links, lists, tables and task lists all work. Fixed headings, each optional except `## Brief`:
- `## Brief`: its first paragraph is the **gist**, shown on the collapsed card: one sentence, the single thing that matters most. The rest opens in place. When the card stands for an **origin item** elsewhere (a pull request, a ticket, a mail or chat thread, a calendar event), the gist opens with a link to it, the item's key as text: `[ABC-123](…) — …`. One click on the card takes the user to the item itself.
- `## Prepare`: prep text for the meeting; the page shows the series' open tasks under the card from its `oz:mtg/<series>` label.
- `## Terms`: `- **term** — what it does for the user`, one per line. The page turns the term's first occurrence into a tooltip. Explain what the user, who is not in the product's day-to-day, would stumble on: modules, client jargon, acronyms.
- `## Prompts`: fenced blocks, each a standalone prompt the user can copy into a fresh session in this project: the task, where it came from, what to read, what done looks like. Only for the user's own work that Claude can move forward.
- `## Suggestions`: up to three `- ` lines, each a ready comment the user might post: a concrete next action naming who and what. Leave out when no next action is clear.

A card with subtasks shows «Subtasks: N», the way a meeting shows its tasks: under the gist while collapsed, after the description once expanded. Expanded, a card shows its description (the Brief after the gist), the subtasks, Prepare and prompts, then Cloud and Local. A task shown as a row under a parent or a meeting expands into the same detail, with the whole Brief as its description and its subtasks after it, so a task's first paragraph must also read well without a collapsed card above it.

Every claim names its source inline (file + date, or a link). Where sources are thin, say so.

## Metadata

The main run writes `meta` beside `key`, stored as the storage reference's Encoding says. Its fields: `section`, `group`, `groupRank`, `collapsed`, `lead`, `badges`, `author`, `repo`, `updated`, `event`, `built`.

- `section`: the `[[section]]` id. A card with an unknown section shows in a catch-all group.
- `group`: the heading the card sits under inside its section; `groupRank` orders the groups (low first); `collapsed: true` folds the group.
- `lead`: the short left rail (time, repo and PR number, due date).
- `badges`: `[{"text", "tone"}]`, tone one of `accent`, `ok`, `warn`, `ai`, `muted`.
- `author`, `repo`, `updated` (ISO): what a section's filter chips match on.
- `event` (`{id, modified}`) and `built` (ISO): the origin event and when a meeting's brief was built; the meetings section compares them with the next Sync run's calendar read and notes commits.
