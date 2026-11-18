# Storage mode: artifact-db

How the [tracker contract](../tracker.md) runs on the dashboard page's own artifact db, for `storage = "artifact-db"` in `dashboard.toml`. A record is one document `records/<key>` in the db of the artifact at `artifact-url`; the Cloud conversations live in the same db under `cloud/`. Runs read and write with the `ArtifactData` tool, passing `artifact-url` as `url`; the page uses its own `db` capability. Live checks in [findings](https://github.com/EmblaTech/claude-plugins/blob/main/docs/dashboard-v2/findings.md) (2026-11-18).

## Writes

- **Runs**: every `update`, `set` on an existing document and `delete` passes `if_version` from a fresh `get`. On `version_mismatch`, re-read, re-apply the change and retry. So a run never overwrites the page.
- **The page**: writes only by `update` (merge) and only its own fields: `state`, `startDate`, `priority`, `targetDate`, `labels`, a new task, a comment. It re-reads `labels` just before writing them. Accepted risk: a page label write can overwrite a run's label change from the last few seconds.
- **One writer per run**: the Sync's main thread writes one record at a time, as in GitHub mode; `if_version` is the only guard. Use `batch` (≤50 writes) where a group must land together, as `addComment` does; single writes need no approval click either (findings).

## Operations

| Contract operation | How |
|---|---|
| `list(labels, state, updatedSince, assignee)` | `query` on `records`: `where state == …` (`closed` = `state in [done, dismissed]`; omit for `all`), `updated >= <updatedSince>`, `assignee == …`, and the first label as `labels array-contains`; filter the other labels in memory. No `order_by`: page with `cursor`/`next_cursor`, `limit` 1000; the reader sorts. `updatedSince` filters on the record's own `updated` field, because the db's envelope `updatedAt` cannot be queried (findings). |
| `getByKey(key)` | `get records/<key>`: open and closed alike, no scan |
| `create(record)` | `set records/<key>` with every field of [Encoding](#encoding) |
| `update(title, body, meta)` | `update` with `if_version`, those fields plus `updated` |
| `addLabel(label)` / `removeLabel(label)` | `get` the record, then `update` the whole `labels` array plus `updated`, with `if_version` |
| `setField(name, value)` / `clearField(name)` | `update` `priority`, `targetDate` or `startDate` plus `updated`; clear by writing `null` |
| `setState(done \| dismissed \| open)` | `update` `state` plus `updated` |
| `delete()` | `list records/<key>/comments` and delete each comment, then delete the record: nested documents outlive their parent. The page deletes the same way at once, so the Sync finds no pending deletes |
| `children()` / `parent()` | `query records where parent == <key>`; `get records/<parent>` |
| `setParent(record)` / `addBlockedBy(record)` | `update` `parent` = the parent's key; `update` `blockedBy` with the blocker's key added |
| `comments()` | `list records/<key>/comments`, paged; sort by doc id (time order) |
| `addComment(text)` | one `batch`: `set records/<key>/comments/<ISO-ts>_<rand>` = `{text}` and `update` the record's `updated` with `if_version` |
| `quota()` | [Quota](#quota) |

## Encoding

- **Doc id = key**: `records/<key>`; a character a path segment cannot hold (e.g. `/`) becomes `~`. The path makes keys unique.
- **Document**, every field top-level, because filters reach only top-level fields: `key`, `title`, `body`, `meta` (the [card.md](../card.md#metadata) fields), `labels` (array), `priority` (`Urgent`/`High`/`Medium`/`Low`), `targetDate`, `startDate` (`YYYY-MM-DD`, `null` = cleared), `state` (`open`/`done`/`dismissed`), `type` (`Epic`/`Story`/`Task`), `parent` (a key), `blockedBy` (array of keys), `assignee`, `updated` (ISO UTC ending in `Z`, compared as strings). Every write sets `updated`.
- **Comments**: subcollection `records/<key>/comments/<ISO-ts>_<rand>`, one document per comment, add-only, so page and run appends never overwrite each other. The writer's clock sets the id (the browser's for the page, the machine's for a run); there is no server time. Accepted risk: clock skew can misorder a thread; the run re-reads the thread right before it replies.
- **Labels**: the `labels` array, as the contract names them.
- **Relations**: `parent`, `blockedBy` and `type` fields; `children` is a query, not stored.
- **Record links**: a card has no external URL. A record is `#<key>` in the page URL and opens in place; a gist pointing to another record writes `[…](#<key>)`. `#N` rendering is github-mode only.
- **Assignee**: `agent-assignee` (`"claude"` by default); the page's Local input on the Assistant tab writes it into `assignee`.
- **Agent claim marker** ([comments.md](../comments.md#agent-tasks)): plain comment text, posted check-then-post as the contract says; at-most-once rests on the one writer.
- **Moved meeting**: the old record goes `dismissed` with a comment linking `#<new key>`.

## Status record

`records/status`, encoded like any record: the contract's `updated` is the top-level `updated`; `meta` holds `answered` and `cursors`, plus `docCount` and `commentStore` while [overflow](artifact-db-overflow.md) is in use. The Sync reads it with `get` at the start and writes it once at the end with `update` + `if_version`; the page only reads it. Setup creates it when `get` finds none.

## Limits

- **Size**: a document is at most 256 KiB. A `body` over 200 KiB is not written; report it as error `other`.
- **Retention**: the Sync's cleanup deletes `done` and `dismissed` records, comments first, 90 days after closing. Closing writes `updated`, so count from it; a later comment restarts the count.
- **Document cap**: 25,000 documents and 100 MB per artifact. Near the cap, follow [artifact-db-overflow.md](artifact-db-overflow.md) (dormant until then).
- **Query scans**: the db has no indexes, so a query over a large collection returns `resource_exhausted`; retention keeps `records` small.

## Setup

- `dashboard.toml`: `artifact-url` is the store; publish keeps the data. `agent-assignee` defaults to `"claude"`; no login to ask for.
- The page's capabilities: the tracker needs no `mcp` entry. `db` declares one rule, `records/**`: read and write `owner`, so all records sit on a shared path (not `data/users/`) that only the owner reaches; take the rule syntax from the `artifact-capabilities` skill.
- **Order**: `records/status` lives in the artifact's db, so publish the page first, then create the status record.
- **Routine**: a local Desktop scheduled task whose session holds `ArtifactData`, running the Sync and Local comments as one task. Cloud routines are unverified in this mode; schedule the local task.
- **Permissions**: under Auto permission mode an unattended `ArtifactData` write needs no click (findings, 2026-11-18). A stricter mode may still ask: then allow `ArtifactData` for the task.

## Quota

The db publishes no limits, so `quota()` is absent and the quota gate always passes. Rate limits surface as `resource_exhausted` ([Errors](#errors)).

## Errors

| Contract error | Artifact db |
|---|---|
| `auth` | no session, or no `ArtifactData` tool in it |
| `consent` | none |
| `rate-limited` | `resource_exhausted`; the page slows its polling 4× |
| `not-found` | a missing or hidden document |
| `other` | `quota_exceeded` ("db full": turn overflow on); `unavailable` after one retry; a `body` over 200 KiB; anything else, quoted as it came |

`version_mismatch` is no contract error: re-read and retry ([Writes](#writes)).
