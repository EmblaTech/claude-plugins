# Intake

The Sync's first stage ([ADR 0009](https://github.com/EmblaTech/claude-plugins/blob/main/docs/dashboard-v2/adr/0009-one-change-driven-sync-with-intake.md)): new transcripts and mail become per-topic meeting notes, cross-references, the daily brief and the user's tasks. The project's facts (where notes, transcripts and the brief live, topics, routing rules, note format, exclusions) are in the prompt named by `[intake] prompt` in `dashboard.toml`; read it first. Intake runs in the middle of step 3 of a sync, after the first wave of sources, so it takes mail and calendar from that delta and reads transcripts itself.

## Find out whether there is anything

Cheap, in this thread, no subagents. Intake has its own **watermark**, the `Last sync:` time in the transcripts log (the prompt gives the path). Note the run's start as `T`.

- **No log yet:** with `.vtt` files already under the transcripts folder, the watermark is the latest `YYYY-MM-DD` in their file names at `T23:59` local; with none, the project is new, and the watermark is three months before `T`.
- **Transcripts:** list every transcript source the prompt names, each on its own, keeping what is newer than the watermark. A source that errors is a failure.
- **Mail:** the delta's mail items, minus what the prompt excludes.

A **quiet run** has no new transcript item and no mail item left. It stops here: no subagent, no file written, no commit, the watermark unchanged.

## Work

Every file Intake changes is recorded for a possible revert: before the first write, copy each existing file it will change to a scratch folder outside the repo; a file it creates is noted. Subagents return paths, summaries and task rows, never transcript or mail content, so this thread stays small.

1. **Fetch.** Merge the transcript items into one work list as the prompt says. Dispatch fetch subagents in batches of about 5 items, up to 5 at a time, each writing its transcripts to the repo and returning the paths written, notes and issues.
2. **Extract.** In parallel: one subagent for the relevant mail, returning short bullets tagged by topic; and for every new transcript, one cross-reference subagent returning bullets about other topics than its own, each tagged with its target topic and its transcript, and marked when it is an action for the user. Mail content is never written verbatim.
3. **Notes.** Per topic with a new transcript or a tagged bullet, one subagent, in parallel (the files differ). It writes the section as the prompt describes and returns the content it added, verbatim, whether the section came from its own transcript, and its task rows. A transcript no topic matches stays in the unsorted folder and is named in the brief.
4. **Tasks.** A topic subagent whose section came from its own transcript returns one row per line that names the user as the owner (title, source topic, meeting date, series); other people's lines stay notes. This thread creates the tasks, with the other tracker writes ([tracker.md](tracker.md)): a `dsh:task` record by [card.md](card.md), labelled `dsh:task`, the track label the prompt names, and `dsh:mtg/<series>` of its meeting. The cross-reference tie is made here, since no topic subagent sees it: a row that matches, by meaning, an action-marked bullet from step 2 about the same transcript also gets the `dsh:mtg/<B>` of that bullet's target series, on the same task. Never a second task, and a cross-reference-only section creates none. The body names its source and links the meeting card when there is one. Before creating, `list(labels: [dsh:task], state: open)`; a near-duplicate title is skipped and noted. 
5. **Brief.** The daily brief is one yearly file. The first run of a local day that adds something creates `## <date>`; a later run that day appends `### Update HH:MM` under it. Each topic gets a `### <area/topic>` subheading with its returned content verbatim, so the brief reads on its own, and a line when the section had no transcript of its own. After the topics, a bullet for each non-empty remainder: ad-hoc recordings and how each was classified, meetings covered by one transcript source only, transcripts left unsorted, mail bullets with no topic, tasks added (link, title, source) and those skipped as duplicates. A quiet run writes nothing, so there are no "nothing new" entries, no ranges and no weekend rule.
6. **Close.** Write `T` as the new `Last sync:` in the log, then make one commit of exactly the files Intake wrote (transcripts, log, notes, brief), `docs: intake through <T date>`, never pushed. The run is done when the commit exists and the scratch copies are deleted.

## Failure

A source that errors, a fetch that fails partway, or a write that does not land fails the stage as a whole. Restore every file from its scratch copy and remove the files Intake created: only this run's changes go, other uncommitted work stays. Leave the watermark as it was and make no commit. Name the failure in the status record with the error the call returned; the brief never carries it. Sections still run. Tasks already created stay, and the next run's duplicate check catches them. The next run starts from the old watermark.

A recording with no transcript text from any source is not a failure: it is a note in the brief's entry.

## Limits

Each rule is kept by the prompt's own wording where the project has one; these bind every project:
- Never push.
- Never mark mail as read.
- Notes and brief only grow: append, never delete or rewrite existing text.
- Never invent a topic folder, and never write a transcript or an attendee name that no source gave.
