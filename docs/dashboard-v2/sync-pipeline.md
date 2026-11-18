# Spec: one hourly change-driven Sync with Intake

Decided 2026-11-15 ([ADR 0009](adr/0009-one-change-driven-sync-with-intake.md), #186). The slices are the sub-issues of #186. The terms are from the [glossary](glossary.md). Status: implemented on branch `dashboard-v2-sync-pipeline` (#193, #194, #195).

## Problem Statement

The user's prep runs on two routines that overlap:
- the **daily digest**, on weekdays at 16:04;
- the dashboard's **Sync**, chained after the digest, plus an hourly **Light sync**.

That causes these problems:
- **Late decisions.** A decision taken at an evening meeting reaches the next morning's meeting brief only after the next day's digest, often after that meeting has happened.
- **No change detection.** A pass re-reads every open PR, and the mail and Teams reads are repeated in two sections. A day with nothing new costs nearly as much as a busy one.
- **Two writers, one tracker.** The digest and the Sync both write to the tracker, coordinated only by chaining.
- **Blocking quota postponement.** The Sync postpones itself when GitHub quota is low (#183), but the postponement needs a scheduled task that always asks permission in an unattended run.
- **Duplicate v1 routines.** Dashboard v1 still runs and builds the same meetings and PRs a second time.
- **Cards only one command can retire.** Only the full Sync takes cards off the page, so a card whose PR merged in the morning stays until the next day.

## Solution

One command, `/dashboard-v2 sync`, runs every hour and does only what changed since the last pass:
1. It checks the GitHub quota and skips when the quota is low.
2. It takes in new transcripts and mail into the meeting notes and the daily brief (the former digest).
3. It reads each source once.
4. It rebuilds only the cards whose inputs changed.
5. It takes off the page the cards whose origin is resolved.

A pass with nothing new costs one cheap check per source. A meeting added mid-day, or a decision made in another meeting, shows up in the brief within the hour. The skill names no provider, so another user can plug in Google, Notion or other sources through setup.

## User Stories

**Freshness**
1. As the user, I want a decision made in an evening meeting to show up in tomorrow's related meeting brief, so that I prepare with it.
2. As the user, I want a meeting added to my calendar mid-day to get a card within the hour, so that I can prepare for it.
3. As the user, I want a cancelled meeting's card to leave the page within the hour, so that the page shows only real meetings.
4. As the user, I want a moved meeting's card to show the new time within the hour, so that I am not misled.
5. As the user, I want a new comment, approval, change request or push on a PR to update its card within the hour, so that I see what needs my review.
6. As the user, I want a merged or declined PR's card to close within the hour, so that the page holds only open work.
7. As the user, I want a closed task issue's card to leave the page within the hour, so that the page stays clean.
8. As the user, I want new mail and Teams messages that need me to become cards within the hour, so that nothing waits a day.
9. As the user, I want a meeting's transcript turned into notes within the hour after it is available, so that the notes are current the same day.

**Cost**
10. As the user, I want a pass with nothing new to make one cheap call per source and no subagents, so that hourly runs do not burn quota or tokens.
11. As the user, I want an unchanged PR not to be re-reviewed, so that diffs are fetched only for PRs that moved.
12. As the user, I want each source read once per pass, so that mail and Teams are not searched twice by two sections.
13. As the user, I want an unchanged meeting's brief not to be rebuilt, so that brief subagents run only for meetings whose inputs changed.
14. As the user, I want the digest's work skipped when there is no new transcript or mail, so that intake costs almost nothing on a quiet hour.

**Cross-references**
15. As the user, I want a task decided in meeting A about meeting series B to appear in B's Prepare list, so that I see it before B.
16. As the user, I want such a task created once, with both series labels, so that I never get duplicates.
17. As the user, I want a cross-reference written into series B's notes to trigger a rebuild of B's next brief, so that the brief reflects it.

**Quota and reliability**
18. As the user, I want a pass to skip when either GitHub quota bucket (REST or GraphQL) is low, so that the page and my sessions keep working.
19. As the user, I want a skipped pass to report one line naming the bucket, its remaining count and its reset time, so that I know why.
20. As the user, I want the next pass after a skip to catch up on everything since the last successful pass, so that nothing is lost.
21. As the user, I want no unattended run ever to wait on a permission prompt, so that scheduled runs never block.
22. As the user, I want an intake failure not to stop the sections, so that cards still update when transcripts fail.
23. As the user, I want each failure named in the status issue and sent as one PushNotification, so that I can act on it.
24. As the user, I want a pass that is still running to keep the next one from starting, so that two passes never write at once.
25. As the user, I want scheduled passes not to depend on connectors whose sign-in expires, so that they run without me.

**Cleanup**
26. As the user, I want a card whose origin is resolved closed on the next pass, so that I do not wait for a daily run.
27. As the user, I want cards that are stale by meaning swept once a day, so that judgement calls stay rare.
28. As the user, I want a swept card only hidden (`oz:on` removed), not deleted, so that it comes back with its history if it becomes relevant again.
29. As the user, I want my snoozed cards left alone by the sweep, so that snoozing keeps working.

**Records**
30. As the user, I want the meeting notes and the daily brief kept, so that I can read what happened.
31. As the user, I want the notes and the brief to keep their current format, so that my reading habits and other readers still work.
32. As the user, I want transcripts and their log kept as now, so that the record is complete.

**Setup and portability**
33. As a new user, I want to declare my sources once in setup, so that every section and topic uses them.
34. As a new user on Google or Notion, I want the skill to work with my connectors, so that I am not tied to Microsoft 365.
35. As a maintainer, I want provider quirks in project references and not in the skill, so that the skill stays portable.
36. As a maintainer, I want each source to declare how it answers "new since <time>", so that a new source plugs in without changes to the skill.
37. As the user, I want one command and one scheduled routine, so that there is one thing to understand and to check.

**Retirement**
38. As the user, I want the v1 routines disabled, so that the same meetings and PRs are not built twice.
39. As the user, I want the daily-digest routine retired once intake runs inside the Sync, so that there is a single writer.

## Implementation Decisions

- **One command.** `sync [section] [params]` is the only pass. `sync light` and the `light-sync` section flag go away, and `light` stops being a reserved name.
- **Stages, in order:** quota gate, then intake, then sources, then sections, then cleanup. A stage's failure is recorded in the status issue and the later stages still run. The only exception is the quota gate, which skips the whole pass.
- **Quota gate.** Before any tracker call, read the free rate-limit endpoint. Check both `core` and `graphql`; below 1000 on either, skip the pass and report one line. There is no postponed task and no push for a skip.
- **Cursor.** Each source has its own, kept as a map from source id to time in the status issue's metadata (next to `answered`) and written at the end of a pass for each source that was read. The status's `updated` time only says when the last pass ran. Intake keeps its own watermark in the transcripts log. A skipped or failed source keeps its old cursor, and so does a source Intake took from the delta (mail) when Intake failed, so the next pass re-reads its gap; a source with no cursor is read in full. *(#193)*
- **Sources.** Each source is declared once in setup: a `[[source]]` entry in `dashboard.toml` (id, tools, prompt) and a `sources/<id>.md` file, mirroring sections. The file says in prose how to ask for new items since a time, what it returns (the calendar returns its whole window every pass; the rest return what is newer than the cursor), a link to the provider's quirks, and "local only" when a cloud run cannot reach it. A source only one section wants (Jira, Bitbucket, the client dossier, Wispr) is declared the same way; there is no custom-source case. The daily brief is not a source of its own: it reaches the sections through the repo-files source. A folder outside the repo is a git source when it is a repo, otherwise a folder source read by file modified time. *(#193)*
- **Delta.** What a source returns on a pass is a list of origin items, each a pointer with a short extract (`source, id, url, kind, time, title, people, extract`), never the full text. A section reads the full item itself when it needs it. *(#193)*
- **Routing.** Each source is read once per pass, and every collector gets the whole delta of the pass and keeps what its prompt asks for, by meaning and track. There is no router agent. Exclusions (e.g. PR-notification mail is not for the digest) belong in the prompt that wants them. *(#193)*
- **Tracks.** One list `tracks = [...]` in `dashboard.toml`; sections and digest topics name tracks only from it, and setup creates their labels. *(#193)*
- **Section prompts** say only what the section wants, by meaning and track, and the card rules. "Where to look", tool names, API quirks, "full run only" and light-sync blocks leave them; quirks move to `reference/<provider>-gotchas.md`. The prs section drops "list every open PR": PRs come by updated time, and cleanup closes merged ones. *(#193)*
- **Change triggers by input:**
  - **Calendar:** read every pass (one call per window). Compared with the meeting cards by event id and last-modified time.
  - **PRs:** listed by the host's updated time past the cursor. A diff is fetched only for a moved PR. Bitbucket participants come only from a single-PR read.
  - **Repo files written by intake** (notes, brief, dossier, docs): read when a git commit since the cursor touched them.
  - **Mail, Teams, Jira, To Do:** queried with a received or modified filter since the cursor, through the official connectors. Teams lists recent chats and takes messages with `createdDateTime` past the cursor, since a chat's `lastUpdatedDateTime` is stale.
- **Meeting briefs.** A full brief is rebuilt only when one of these holds:
  - its event is new or changed;
  - its series notes file gained a commit;
  - a task with its series label was added or changed.
- **Intake.** The former daily digest becomes a reference of the skill, run by subagents:
  - transcripts → per-topic notes;
  - cross-references → other topics' notes;
  - the daily brief;
  - user-owned tasks.

  When a cross-reference ties a task to another series, the task gets that series' label too. It is never a second task.

  How it runs *(#194)*:
  - **Inputs.** Intake reads transcripts itself (the Recordings folders and Wispr) since the watermark in `transcripts/_log.md`. Mail and calendar come from the pass's shared delta like any section's; Intake's prompt holds its own exclusions (PR-notification mail).
  - **All or nothing.** The watermark moves only when the whole stage succeeds. A failed Intake reverts only the file changes it made in this run, keeps the old watermark, and is named in the status issue (not in the brief); the next run starts clean. Task issues are not reverted; the duplicate check catches them.
  - **One commit per run with changes:** transcripts, log, notes and brief together, `docs: intake through <T>`, never pushed. A quiet run makes no commit.
  - **Daily brief.** One `## <date>` entry per day, created by the first run that adds something; later runs append `### Update HH:MM`. A run with nothing new writes nothing, so there are no "nothing new" entries, ranges or weekend rule. The brief moves from `Automation/` to `daily-brief/2026-daily-brief.md`.
  - **Tasks.** Topic subagents return user-owned task rows; the main thread creates the issues with the other tracker writes (one writer). Notes keep `### Action points` until the v1 cutover (#195), since v1 briefs read them.
  - **Reference.** The digest command (`.claude/commands/daily-digest.md`) is deleted; its bootstrap (no log yet) and the M365 transcript troubleshooting move into the Intake reference. `Automation/setup.md` is deleted; setup lives in the skill.
- **Cleanup.** Every pass checks each `oz:on` card's origin (PR, issue, meeting) and closes the resolved ones. The first pass of a local day sweeps the cards stale by meaning. Cleanup only removes `oz:on` and never touches a snoozed card.
- **Scheduling.** One Desktop scheduled routine runs the Sync hourly. The daily-digest routine and the v1 routines are retired; the daily-digest task is disabled in the same change that turns Intake on, so no hour has two writers (#194). Overlap protection relies on Desktop skipping a run while the previous one is still going. A lease on the status issue is the fallback if that ever fails.
- **Provider-neutral skill.** The skill speaks only of sources, cursors, deltas and items. Connector names and quirks live in the project config and in provider references (for Microsoft 365, the project's ms365 gotchas).

## Testing Decisions

- **Seam: one pass, observed from outside.** Run `sync` against the live tracker in a known state, and check two things: the pass's one-line report, and the tracker afterwards (cards, labels, status-issue cursor). The skill is prose run by an agent, so there are no unit seams inside it. A good test asserts only what the user would see, never which tools the agent called.
- **Scenarios (each one a pass):**
  1. **Quiet hour.** Nothing changed: the report is `no changes`, no subagent ran, no commit was made, nothing was added to the daily brief, and the cursor moved.
  2. **New calendar event.** It gets a card. A cancelled one leaves the page.
  3. **PR activity.** A PR comment updates its card. An untouched PR is not re-reviewed.
  4. **Cross-referenced decision.** A commit to series B's notes rebuilds B's next brief. A cross-referenced task carries both series labels.
  5. **Merged PR.** Its card is closed on the next pass.
  6. **Low quota.** A pass below the threshold on either bucket skips with one line and writes nothing.
  7. **Intake failure.** The sections still run, the failure is in the status issue, Intake's file changes are reverted and the watermark has not moved.
- **Prior art:** the agent-tasks rule already relies on a scenario test before release (PRD, Agent tasks). The page's `node --test` suite covers only the page's pure logic and is not touched by this spec.

## Out of Scope

- **Splitting the meeting notes and the daily brief by month, and their size.** Tracked in #185.
- **Unifying the other commands, such as setup.** Tracked in #168.
- **Microsoft Graph delta queries and webhooks.** They are not used while the ms365 MCP sign-in expires in scheduled runs.
- **Deleting the v1 skills and the v1 artifact.** Only their routines are retired.
- **The page's polling (#184).** It is unchanged.

## Further Notes

- **Evidence for the PR trigger (2026-11-15).** In 12 sampled PRs on Bitbucket and GitHub, the updated time moved with every comment, approval, change request, push and merge. Not observed: a Bitbucket change request as the last event, and GitHub inline review comments. See [findings](findings.md#sync-change-detection-2026-11-15-186).
- **Prompt writing.** The skill, source files and section prompts are written with the `mattpocock-skills:writing-for-agents` skill. *(#193)*
