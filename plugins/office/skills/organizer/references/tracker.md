# Tracker contract

The tracker is the one store of record for cards, tasks, their comments and the status. Every run and the page reach it through the operations below, written in one `op(args)` notation, e.g. `list(labels: [dsh:mtg/<series>], state: all)`. How each operation runs is in the **storage reference** that `storage` in `dashboard.toml` names: a built-in storage mode's is `storage/<storage>.md` in this folder; `custom` reads `.claude/dashboard/custom-storage.md`. Read it before the first tracker call.

## Record

A card, a task or the status is a **record**:
- `key`: stable, unique per dashboard ([card.md](card.md#key))
- `title`, `body`
- `meta`: the layout and origin data ([card.md](card.md#metadata)), kept apart from `body`
- `labels`: a set of strings ([Labels](#labels))
- three fields, no others: `Priority` (Urgent / High / Medium / Low), `Target date`, `Start date`
- `state`: `open`, `done` or `dismissed`
- `type`: Epic, Story or Task, tasks only
- `parent`, `blockedBy`: other records, tasks only ([Relations](#relations))
- `assignee`: an opaque string (`agent-assignee`)
- `updated`: moves on any change, a new comment included
- comments, in time order, each with text and time; add-only

## Operations

- `list(labels, state, updatedSince, assignee)`: labels all-of; `state` `open`, `closed` or `all`; paged.
- `getByKey(key)`
- `create(record)`; `update(title, body, meta)`
- `addLabel(label)` / `removeLabel(label)`, one label at a time
- `setField(name, value)` / `clearField(name)`
- `setState(done | dismissed)`; `setState(open)` only by Sync, when the origin is live again
- `delete()`: tasks only, no history
- `children()`, `parent()`, `setParent(record)`, `addBlockedBy(record)`
- `comments()`; `addComment(text)`
- `quota()`, optional: remaining calls and reset time ([SKILL.md](../SKILL.md#quota-gate))

**Snooze** is `Start date` on an open record: hidden while `Start date` is after today, back by itself after; not a state. **Due and order** are `Target date` and `Priority`.

**Errors** come back as `auth`, `consent`, `rate-limited`, `not-found` or `other`; the storage reference maps them.

## Relations

Hierarchy, blocking and type ([ADR 0008](https://github.com/EmblaTech/claude-plugins/blob/main/docs/dashboard-v2/adr/0008-meeting-tasks-by-series-subtasks-native.md)): set them when the source says so, and read the ones the user set by hand.
- **Tasks only.** A meeting or PR card gets no type and no parent; `dsh:*` labels stay the card kind.
- **Parent is a task, never a meeting card.** A task that prepares for a meeting carries the series label `dsh:mtg/<series>`.
- **The relation is the only record.** No child checklist in a parent's body, no "blocked by" line. Subtask counts and "has open subtasks" come from `children()`.

## Labels

Every dashboard label carries the fixed prefix `dsh:`, except the reused `ready-for-agent` and track labels.
- kind: `dsh:meeting`, `dsh:pr`, `dsh:task`
- `dsh:on`: shown on the page; an open record without it is off the page
- `dsh:needs-you`: Claude waits on the user
- `dsh:replied`: Claude replied in the thread; the page removes it when the user opens the card
- `dsh:status`: the status record
- `dsh:mtg/<series>`: the meeting series a card or task belongs to
- `ready-for-agent`, without the prefix: the repo's triage label, reused for agent tasks ([comments.md](comments.md#agent-tasks))
- track labels without prefix, one per area the project splits its work into

## Claim marker

An agent task's claim is a signed comment holding `<!-- dsh {"claim":"<run start, ISO>"} -->` on its own line before the signature: a signed comment ends with the signature, so the marker goes above it.

## Rules every run keeps

- Upsert by key: `getByKey` first, `create` only when no record, open or closed, carries the key. Reopen a closed one only when its source says the matter is live again (a PR reopened).
- One writer: collectors return cards; the main thread writes them one by one. Only Sync creates by key, so key uniqueness needs nothing from the store.
- Delete before anything else: carry out the deletes the page left pending, as the storage reference's Operations say.
- A source that could not be read is a failure, never "nothing new": leave its cards as they are, keep its cursor, and report it in the status record, quoting the error its call returned. A source whose tool or MCP is missing or not connected is the same failure: no call can be made, so the line names the source id and the missing tool in place of an error. A source never attempted is unread, and the Sync run is not done.

## Status record

One open record, key `status`, labelled `dsh:status`. Each run rewrites its body: one line, in the user's language, per source that failed and per thing Claude could not do. Its `meta` holds `updated` (the run time, ISO), `answered` (see [comments.md](comments.md)) and `cursors` (`{"<source id>": "<ISO>"}`). `updated` is only the heartbeat of the last Sync run; `cursors` maps each source id to the time up to which it was read (the time its last successful read began), and a source missing from it is read in full. A Sync run rewrites only the entries of the sources it read. When all is well, the body is empty. The page shows the body as a banner. Send one PushNotification only when the body's problems change: a new problem, or a source that recovered. A source read again drops its line, which is its recovery. When the status record itself can not be written, send the problems in a PushNotification and end the run's report with them. A run that reports nothing at all shows on the page: it warns when `updated` is older than `stale-hours`.

## Other storage modes

The built-in storage modes are the ones with a reference in `storage/`. A `custom` storage mode plugs in through this contract, with its reference in the same sections (Operations, Encoding, Status record, Setup, Quota, Errors); its behaviour is not guaranteed.
