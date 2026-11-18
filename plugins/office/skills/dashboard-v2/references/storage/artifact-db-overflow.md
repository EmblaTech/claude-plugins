# Artifact db: comment overflow

Dormant. Read this only when the artifact-db storage mode nears its document cap (decided in [#224](https://github.com/Debatt-AS/embla-docs/issues/224)).

**The problem.** The artifact db holds at most 25,000 documents and 100 MB. In the artifact-db storage mode every comment is its own document, `records/<key>/comments/<ISO-ts>_<rand>`, so a user who comments a lot can reach the document cap long before the size cap. Past the cap, creates fail with `quota_exceeded`: no new record, no new comment. Facts: `docs/dashboard-v2/research/2026-11-16-artifact-db-capabilities.md` on branch `research/artifact-db-capabilities`.

**The fix: chunks plus an inbox.** Once overflow is on, Sync folds each thread's single comments into chunk documents in the same collection, `records/<key>/comments/c0001`, `c0002`, ..., each holding a `comments` array kept under about 200 KiB. A new chunk starts when the next entry would pass that. The page and agents keep writing every new comment as a single document, as before (the "inbox"); only Sync, through `ArtifactData` with `if_version`, ever writes a chunk. So the page never does an array read-modify-write, and two runs folding at once cannot lose an entry: the stale one is refused, re-reads and retries. At about 1 KiB a comment, one chunk replaces about 200 documents.

**Rejected.**
- Comments as an array on the record: the page would append by read-modify-write without compare-and-set, so concurrent comments get lost, and it races with page edits of the record. This is the reason #224 chose one document per comment.
- Shorter retention: it frees only closed records, does nothing for one long open thread, and throws history away. Keep it as the emergency lever below, not the fix.
- Moving to another storage mode: the right answer only if folding is not enough (see Risks).

## Trigger

- **Who and how often.** Sync counts the db once a day: one paged `list` of `records` plus one paged `list` of each record's `comments` (ids only). There is no count or aggregate in the db, so this is the only true count. It writes the number and the time into the tracker's status.
- **Threshold.** Overflow turns on at **20,000 documents** (80 %). Folding needs free slots, because the first fold of a thread creates a chunk before it deletes any single, so never wait for the cap.
- **Late alarm.** Any `quota_exceeded` on a create, from Sync or reported by the page, turns overflow on at once and goes into the status as a problem. When there is no free slot at all, run the 90-day cleanup early (or shorten its window for this one run) to free a few, then fold.
- **One way.** Overflow, once on, stays on: the status keeps `commentStore: "chunked"` until the user decides to undo it (below).

## Turning it on

0. **Readers first.** Before the first fold, republish the page and update Sync so both read a thread as the union of its chunk entries and its singles. Nothing is folded until both readers are live.
1. Set `commentStore: "chunked"` in the tracker's status.
2. On every Sync run from then on, for each record with singles: read its comments, append the singles not yet in its last chunk to that chunk (or create the next chunk) with `if_version`, then delete exactly the singles it read. Busiest threads first.

It is safe to stop at any point and resume on the next run, because of these rules:
- Each chunk entry is the single's body plus its original doc id.
- Write the chunk first, then delete only the singles that the chunk now holds. A single that arrives during the fold is left for the next run.
- Readers take the union, drop duplicates by id, and sort by id. A single and its chunk copy may both exist for a while (a crash between the two steps); that shows as nothing, never as a gap.
- Chunk ids sort after singles (`c` after a digit), so a paged read in id order during a fold can see an entry twice, never miss one.
- `batch` may group the chunk write and the deletes (up to 50 writes), but nothing relies on it being atomic.

## What keeps working

- **Reading a thread** in time order: the merged, deduplicated list sorted by id (the ISO timestamp prefix). The page's comment query must not filter or order on a field that chunk documents lack, or chunks drop out; sort on the page instead.
- **"Updated" on a new comment** moves as now, because new comments are still singles written the usual way. Folding is silent: it leaves the record's `updated` as it is, and the page's live listener treats a modified chunk or a removed single as no news (new is only an id it has not seen before).
- **Signature, unanswered and claim.** These rules work on the merged thread: unanswered is every user comment after the last signed one; the re-read before posting and the claim check (claim marker before the signature) read the merged thread too. Claims and replies are written as singles like any comment.
- **Cleanup.** The 90-day cleanup already deletes every document under `records/<key>/comments`; chunks live there, so they go too. Deleting a record does not delete its nested documents by itself, so the cleanup must keep listing them.

## Undo

Set `commentStore` back and stop folding. To unfold, Sync recreates each chunk entry as a single under its original id, then deletes the chunk with `if_version`; the same dedupe rule keeps a half-done unfold safe. Unfolding creates documents, so it needs the headroom it once lacked: do it only after the count is well under the threshold. The union reader can stay.

## Risks

- Folding does not shrink bytes. The 100 MB cap becomes the next limit (about 100,000 comments at 1 KiB each).
- If records alone (plus their chunks) grow toward 25,000, folding does not help; then shorten retention or move to another storage mode.
- The daily count costs one `list` per record, which grows with the number of records.
- None of the limits or behaviours above were tested on a live artifact.
