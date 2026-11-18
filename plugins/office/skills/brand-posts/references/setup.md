# Setup

`setup [flow]` makes a flow ready so that a plain run of this skill for that flow needs nothing else. Each goal below says what a flow needs and when it is done. Work out what is already in place, reach the goals not yet met in any order, and stop when all are done.

The project holds its data and its own `scripts/`, which setup writes for that data to meet [contract.md](contract.md). Read the contract before the Scripts goal.

## Contents
- Asking the user
- Running setup again
- Finding sources
- Goals
- Finish

## Asking the user

Ask every question through `AskUserQuestion`:

- 2-4 concrete options built from what you found (actual file names, column headers, addresses, values).
- Up to 4 related questions per call, so setup takes a few rounds.
- Ask only for decisions and for facts no source holds; look up the rest yourself in the project, the data or a connected tool.
- With no answer, use the default and keep the value clean: add a line under its section, `TODO: <key> is to be confirmed (<why>)`, which the scripts never read.

## Running setup again

Each run adds or updates one flow.

- Keep what exists and still holds (brand, assets, other flows, templates the user edited), and change it when the user asks.
- No flow named: ask which flow to add or update, offering a new one (named from the user's goal) beside each existing one.
- Named flow exists: ask whether to update it or create a new one under another name, and write to its files once they answer.

## Finding sources

Find the data yourself: the project folder first, then this session's connected tools (file stores, spreadsheets, mail, calendars). If a source sits behind a tool that isn't connected yet, start its authentication, give the user the link, then read the source.

Record in the project's `flow.md` how to reach each source again (IDs, sheet or folder, the read call that worked, quirks you hit), so a run refreshes the data without searching.

## Goals

### Brand

`brand/brand.md` holds the brand as `- key: value` lines (company, footer, tone, colours, font, `logo`, `frame`), with the images in `brand/assets/`, so cards render offline. When the brand's source of truth lives elsewhere, `brand/source.md` records how to reach it and a Sync list that refreshes both. It is a separate file because the sync overwrites `brand.md`.

**Done when** `brand.md` has every key the templates use and each asset path points to a file that exists. An existing brand file already meets this.

### Flow definition

`flow.md` opens with a `Flow` section of `- key: value` fields. Their allowed values and defaults are under Flow fields in [contract.md](contract.md); offer those as the options. Beyond the table:

- `delivery: send` skips review entirely, so offer it only when the user raises it, and confirm it with them.
- `friday-before` and `monday-after` pair with a weekday schedule.
- A chat `channel` (Teams, Slack, WhatsApp) makes each post a PNG plus caption that a human posts, with `delivery: files`.
- A language whose script the brand font lacks (Poppins has no Sinhala or Tamil) needs a font for that script in the `fonts.txt` recipe, e.g. Noto Sans Sinhala or Noto Sans Tamil.

**Done when** every field holds a value the user chose or confirmed, or a default with its TODO line.

### Data

The trigger decides what the flow needs: `date-in-data`, records with a date column plus the fields messages use; `event-list`, dated `date,name` rows; `cadence`, the rhythm and each post's content source; `other`, what the user describes. Images are optional: the card falls back to an initials badge or the logo.

In `flow.md`, `Sources` gives a local path per input and a Sync list for each input refreshed from elsewhere; `Occasions` states the matching rules in plain words. A staff table becomes the people file (columns in contract.md). Map each people-file column to a real header, and ask only about fields with no clear header, offering the actual header names. Write the map in a `Columns` section of `flow.md` as `- col_<people column>: <header>` lines (the prefix keeps them apart from flow keys such as `language`), with the table's date formats and its "no value" markers, so a renamed column is a one-line fix. When the data holds photos, record in the Sync list which file each occasion uses, as found in the real folders.

**Done when** you have read a sample of each source through the route recorded in `flow.md`, and every people-file column the flow uses is mapped or confirmed absent.

### Opt-out list (GDPR)

`optout` in `Sources` (default `optout.csv`, shared by all flows) is a CSV of `id,email,scope,date,note`, where `scope` is `all` or one flow name. Opted-out people leave a run before any photo or message.

**Done when** the file exists (header only, if nobody has opted out) and the user has said whether there are opt-outs to add, or which source a sync step should refresh it from.

### Delivery

The `Email` section has `recipient`, `sender_name`, `sender_address` and `ai_marker`; a chat flow needs only `ai_marker`, which ends every email and caption. Default marker: "(drafted by AI Designer, review before sending)".

**Done when** the recipient is confirmed or has its TODO line. For `delivery: draft` with a mail app new to this project, offer one test draft.

### PNG export

Find a headless browser on this machine (Edge, Chrome or Chromium at their usual install paths, then Playwright) and take a test screenshot. If none works, ask whether to install Edge, Chrome or Playwright. An email flow can run with `browser: none` (the HTML card is attached instead); a chat flow needs a browser.

**Done when** the test screenshot works and `flow.md` has `browser: auto`, or an email-only flow has `browser: none` by the user's choice.

### Templates

Templates live in the brand source, in a `templates/` folder beside `brand/`: `<flow>/card.html`, plus `<flow>/email.html` for an email flow, and shared `fonts/fonts.txt`. The folder holds only text a connector reads back exactly (`mcp__claude_ai_Microsoft_365__read_resource` reads `.html` and `.txt`, and refuses `.css` and font files), so the fonts are a recipe: one line per font file with a fixed public URL and its sha256 (format in contract.md, Fonts sync). Each run's brand Sync list copies the folder to the project's `templates/`, then the fonts sync downloads the files and writes the `fonts.css` each card links as `../fonts/fonts.css`. Changes are made in the source. A flow whose templates the source lacks gets new ones, written here and uploaded to the source after the user says yes. A font with no public URL (a paid corporate font) is installed on each machine that renders instead. The card is a 1080x1080 page in the brand colours and font. Layout: headline, round photo with an accent ring, name, a 1-2 sentence message, and the company name small at the bottom, as one centred group. The email keeps `{{ai_marker}}` as its last line. The placeholders available are in contract.md (Every placeholder filled). A new flow may start from another flow's templates.

**Done when** the flow's templates are in the source and in the project's `templates/`, each uses only placeholders contract.md lists and points only to files inside `templates/`, and the email's last line is `{{ai_marker}}`. Acceptance check 4, under Scripts, proves the card fits.

### Scripts

Write `scripts/` to meet [contract.md](contract.md) for the data you read: the export format each connector gives, the header row's position, the date formats, the templates' placeholders, and the browser and mail app on this machine. Settings that can change without new code (column map, paths, recipients) are read from `flow.md`. A project that already has scripts keeps each one that still passes the checks; rewrite only what a data or flow change breaks.

Show the user the list of scripts and what each covers before writing them; they are the project's code and get reviewed with it.

**Done when** every acceptance check in contract.md passes in a scratch copy, the real sync has written the people file with no date warnings, and `flow.md` names the data shape the scripts were built for (sheet, header row, date formats), so a later change in the source points back to this goal.

### Schedule

A flow has at most one scheduled task, and `schedule: manual` already meets this goal. Otherwise ask where it runs; "not now" is a valid answer.

- **Local (default, recommended):** `schedule_local.ps1` from the project folder. Show its `-WhatIf` preview, then register after a yes. It runs only while the user is signed in, because Outlook drafts need their session.
- **Cloud:** a scheduled cloud agent (the `/schedule` skill). It needs the project somewhere it can reach (a Git repository, or a Drive or SharePoint folder through connected tools) and has no classic Outlook, so it uses `delivery: files` or a mail tool it can reach; say so before the user picks. Move or upload the project only after the user says yes.

An unattended run has to get through without permission prompts. Show the user the allow list (the project's `scripts/` by their real path, edits under `out/` and `cache/`, the Sync list's read tools), then add it to `.claude/settings.json`.

**Done when** the flow has one task (`schedule_local.ps1 -Show` lists it) or the user chose "not now", noted in `flow.md` next to `schedule`.

## Finish

Show the user the `Flow` section, each source and how it is refreshed, the opt-out file, the browser, the schedule, and every TODO line.
