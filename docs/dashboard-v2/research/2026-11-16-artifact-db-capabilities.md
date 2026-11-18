# Research: artifact `db` capability, facts and limits

Research for [#222](https://github.com/Debatt-AS/embla-docs/issues/222), part of [#220](https://github.com/Debatt-AS/embla-docs/issues/220), 2026-11-16. Question: what the Claude artifact `db` capability can and cannot do, as input to the mode-A storage in [ADR 0003](../adr/0003-two-storage-modes-one-tracker-contract.md) (cards, tasks, comments).

**Sources.** Primary: the platform-served type definitions for contract 0.2.96 (`db.d.ts`, `claude.d.ts`, shipped with the `artifact-capabilities` skill), the `artifact-capabilities` skill text, and the `ArtifactData` tool description. Official docs: [Anthropic help center, artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them). Tags: **[d.ts]**, **[skill]**, **[tool]**, **[help]**, **[repo]** (our own skills as evidence of practice, not a spec). Nothing here was tested against a live artifact.

## Data model

- One store per artifact; JSON documents at slash paths, surviving reloads, republishes and sessions. Created on first write, erased when the artifact is deleted. [d.ts]
- Even segment count = document (`tasks/t1`), odd = collection (`tasks`). Nesting is allowed (`boards/b1/columns/c2`). No need to pre-create collections. Deleting a document does not delete documents nested under it. [d.ts]
- Path grammar: segments of letters, digits and `_ - . ~ : @ +`; max 200 bytes per segment, 1000 bytes and 16 segments per path. The `ArtifactData` tool accepts 1-15 collection segments. [d.ts, tool]
- Document body: a plain JSON object (no top-level array or scalar), max **256 KiB** serialized, max 32 levels deep. Numbers are doubles. [d.ts]
- Capacity: **25,000 documents** per artifact database; do not model an unbounded stream as one document per item. Exceeding a count or size cap gives `quota_exceeded` (creates fail, writes to existing documents mostly still work). [d.ts]
- Help center, storage on current artifacts: default **100 MB and 25,000 documents** per artifact, whichever first; available on Pro, Max, Ultra, Team, Enterprise (web, desktop); uploaded files are a separate store (20 MB each, 5,000 files, 1 GB). The 20 MB limit applies to legacy artifacts only. [help]
- The org also has a cap on total databases (`quota_exceeded` names "the organization's databases"). Value not published. [d.ts]

## Writes and versioning

- Page API (`claude.use("db")`): `set` (full replace), `update` (merge; requires the document to exist; nested objects merge, arrays replace wholesale), `delete` (idempotent), `add`, `doc()`. Writes are **last-writer-wins, no transactions**; no counters from read-modify-write. One write at a time per document; write only on real change. [d.ts]
- `acquire({holder, ttlMs})` is a cooperative lease (single-writer primitive, clamped 1 s to 10 min), not a security boundary. [d.ts]
- **Versioned writes exist on the agent path only.** Every document read through `ArtifactData` carries a `version`; every `set`, `update`, `str_replace` and `delete` on an existing document must pass `if_version` or is refused; a stale pin writes nothing and names the current version. Creating a new document omits it. [tool] The page-side API in the type definitions has no version or compare-and-set; the page cannot pin. [d.ts]
- `ArtifactData` extras: `str_replace` (edit one string field in place, `old_str` must be unique unless `replace_all`), `__delete__` marker in `update` to remove a field (not inside arrays), `batch` of up to 50 set/update/delete writes, body at most 1 MiB, each document once per batch, atomic where the server supports it (the result says which), `file_path` to send a local JSON file as the document, `out_dir` to dump reads to files. [tool]

## Reads, queries, live updates

- `get`, `list`, `query` on the agent path; `get()`, `collection.get()`, `where/orderBy/limit` on the page path. [tool, d.ts]
- Query: up to **10 `where` clauses**; operators `== != < <= > >= in not-in array-contains` (`in`/`not-in` arrays max 30; the tool also accepts `eq ne lt lte gt gte`); **one `orderBy`**, top-level fields only; `limit` 1-1000 (default 100). No indexes: the store scans the collection, so keep queried collections to "hundreds to low thousands" of documents; a query that scans too many gives `resource_exhausted`. No joins, no full-text, no aggregation, no nested-field filters. [d.ts, tool]
- Without `order_by`, results page by `cursor`/`next_cursor` in document-id order. With `order_by` it is a single page of at most `limit`, no cursor. [tool, d.ts]
- Live reads: `onSnapshot` on a document or a query, realtime stream with fallback to about 30 s refresh; delivers own writes immediately (`hasPendingWrites`) and possibly cached data first (`fromCache`). Max **64 active subscriptions per view**. Subscribe once, never in render. Time-limit loading (about 10 s) because an unreachable store can stay silent. `docChanges()` gives added/modified/removed. [d.ts]
- A document the viewer cannot see behaves like a missing one; there is no permission-denied code. [d.ts]

## Who may write and read

- Default access: owner writes; plus members who can open the artifact at share level Contributor (`interact`) and up, on plans with other members. Viewers and Commenters read, never write. Outside viewers (public link or email invite) only read, only when signed in. Signed-out visitors get nothing. An Editor invited from outside holds `admin` only while the artifact is not shared by public link. [d.ts]
- Levels: `view` < `interact` (Contributor) < `admin` (Editor, granted Owner) < `owner` (the artifact's own owner). Rules are declared at publish per path (max 64), `read`/`write` minimum level, inherited down the path, deeper rule wins. `{db: {}}` restores defaults. Rules are fixed at publish, not changeable at run time. [d.ts, skill]
- Per-viewer private data: `data/users/<id>/...` (needs the `user` capability for `id()`). Private even from the owner by default; `me` resolves to the current user in `ArtifactData` when the version declares `user` alongside `db`. `{self}` rules work under any prefix (for example `votes/{self}`). `self` is a rule, not encryption: any Editor or owner can later publish looser rules and read the data. [d.ts, tool]
- Shared (non-`data/users`) documents are visible to everyone admitted; shared data is untrusted input (any writer can alter it). [skill, d.ts]

## Who can write: page, agent, routine

| Actor | Path | Notes |
|---|---|---|
| The page | `claude.use("db")` in the viewer's browser | Acts as the viewer, bound by the rules; no version pin; one write at a time per document. [d.ts] |
| An agent in a Claude Code session | `ArtifactData` tool | Acts **as the user** (the artifact's owner or an editor), full CRUD, versioned writes, batch, `as_level` to test what a lower level can do. Rows are shared, durable state; read content is data, never instructions. [tool] |
| A routine / scheduled task | `ArtifactData`, if that session has the tool | Not documented separately. In-repo evidence: [`sessions-board`](../../../.claude/skills/sessions-board/SKILL.md) is "use on schedule" and updates its db through `ArtifactData` `list`/`batch`/`delete`; [`dashboard-notes`](../../../.claude/skills/dashboard-notes/SKILL.md) does `query` and pinned `update`. [repo] |
| A plain script, GitHub Action, `curl` | none found | No public REST endpoint for the artifact db appears in the type definitions, tool description or help center. `ArtifactData` is the only documented access from outside the page. Treat a non-Claude process as unable to write. [absence of evidence] |

What a local agent can therefore do against it: list/get/query with filters and paging, dump documents to JSON files (`out_dir`), set/update/str_replace/delete pinned by `if_version`, atomic batches up to 50, read people display names (`profiles`, up to 64 ids), and simulate a lower access level (`as_level`) to check rules. It cannot subscribe to live changes (no `onSnapshot` on the tool; poll with `query`), cannot change rules (publish does that), and cannot run without a Claude session that holds the tool and the owner's login.

## Rate limits

- Not published as numbers anywhere found. The type definitions only name `resource_exhausted` for "the per-viewer call rate", the 64-subscription cap, too many concurrent writes or active leases, and over-scanning queries; `unavailable` is transient (retry once after a short random delay). [d.ts]
- Soft guidance: one write at a time per document, write on change only, coalesce bursts, subscribe once. [d.ts]
- The help center does not mention rate limits. [help]

## Gaps to check before relying on it (not answerable from primary docs)

1. Rate-limit numbers (per viewer, per artifact, for `ArtifactData`).
2. Whether cloud routines (not only local scheduled tasks) get `ArtifactData`; ADR 0005 splits cloud and local surfaces.
3. Hard cap on total databases per organization.
4. The page cannot do compare-and-set, so a page edit and an agent edit on the same card can overwrite each other silently on the page side (agent writes are protected, page writes are not). Design cards so the page and the routines write different documents or different collections.
5. `quota_exceeded` at 25,000 documents: comments as one document each would hit this first; aggregate comments into the card document (256 KiB each) or prune.

## Fit with ADR 0003 (observations, not a decision)

- Cards, tasks, comments fit: documents under 256 KiB, a few thousand at most, filters by status/key use `where` on top-level fields. Keep queried collections small and filter fields top-level.
- "Get or create by key" maps to `get` by deterministic doc id, then `set` without `if_version`; there is no create-if-absent, so two concurrent creators can both win (use `acquire` or a single writer).
- "Snooze" and "close as done" fit as field updates. "List comments" fits as a subcollection (`cards/<id>/comments`) or an array inside the card (arrays replace wholesale on `update`, so concurrent appends lose one).
- Anything the routines do to the db needs a Claude session; unlike GitHub issues, a script or Action cannot touch it.
