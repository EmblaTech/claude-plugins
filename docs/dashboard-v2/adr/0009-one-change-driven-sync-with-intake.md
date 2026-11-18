---
status: accepted
---

# One hourly change-driven Sync, with the daily digest as its Intake stage

The full Sync and the Light sync of [ADR 0007](0007-sync-and-light-sync-commands.md) differed in three things. The Sync built meeting cards, read sources that only the daily digest changes (the daily brief, the notes, the client dossier), and retired cards that no source held any more. All three can be triggered by change instead of by command, so they now are. The daily digest ran once a weekday as a separate routine and was a second writer to the tracker. It becomes the Sync's first stage, so its notes and cross-references reach the meeting briefs within the hour.

`/dashboard-v2 sync [section] [params]` is the only pass, scheduled hourly. In order:
1. **Quota gate.** Below the threshold the pass skips, and the next pass catches up.
2. **Intake.** New transcripts and mail since the cursor become per-topic meeting notes, cross-references, the daily brief and tasks.
3. **Sources.** Each source is read once with its cursor, and the delta is routed to the sections.
4. **Sections.** Each rebuilds only what its inputs changed.
5. **Cleanup.** Every pass checks each card's origin. The first pass of a day also sweeps cards stale by meaning.

The skill names no provider: sources, cursors and deltas are its terms. The setup names the connectors, and provider quirks live in project references. *(Decided 2026-11-15, #186.)*

## Considered options

- **Keep the two commands and add change detection to each.** Rejected. Once both are change-driven, the only thing left between them is the label.
- **Run the digest more often (add a morning run) and keep chaining it to the Sync.** Rejected. That keeps two writers, and the chained Sync and the hourly pass can still overlap.
- **Postpone a Sync to the quota reset (#183).** Rejected. Creating the one-time task always prompts in a scheduled session, so an unattended postponement blocks. The next hourly pass already covers the gap.
- **Graph delta queries for mail and calendar.** Rejected for now. They exist only in the ms365 MCP, whose token expires often in scheduled runs. The cursor is a received or modified time filter on the official connector.
- **A run-lock on the status issue.** Not built. A Desktop scheduled task skips a run while the previous one is still going, and one task holds the whole pass. If that stops holding, a lease on the status issue is the fallback.
- **Off-the-shelf products.** None covers the whole job: see the [PRD](../../prd/dashboard-v2.md#off-the-shelf-comparison).

## Consequences

- `sync light`, the `light-sync` section flag and *full run only* sources are removed. A section name may now be `light`.
- Card cleanup still only removes `dsh:on`. A card comes back by its key when a later pass returns it.
- The meetings section runs every pass. Reading the calendar is one call per window. A brief is rebuilt when its event changed, when the series' notes file gained a commit, or when a task carrying its series label was added or changed.
- The daily brief and the meeting notes stay: The user reads them. Their size is #185.
- One scheduled routine remains, the hourly Sync. The `daily-digest` routine and the v1 routines are retired (#194, #195).
- ADR 0007's routine names and its "every 30 minutes" no longer hold. ADR 0007 is superseded and not rewritten.
- The spec is [sync-pipeline.md](../sync-pipeline.md). The slices are the sub-issues of #186.
