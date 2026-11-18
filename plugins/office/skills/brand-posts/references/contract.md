# Script contract

Setup writes each project's `scripts/` folder for that project's data, and the run steps in [SKILL.md](../SKILL.md) call it. This file states what those scripts must do. How they do it (column names, date parsing, file layout, browser, mail app) follows the project's own data. Python 3 standard library, plus PowerShell for Windows-only parts such as Outlook and Task Scheduler. A project gets the scripts its flows use: `render.py` and `deliver.py` always, a sync script per source that needs reshaping, the mail-app part only for `delivery: draft` or `send`, and the schedule part only when setup registers a task.

## Project files

| Path | Holds |
|---|---|
| `brand/brand.md`, `flows/<flow>/flow.md` | config as `- key: value` lines; the first occurrence of a key in a file wins, and a flow key overrides a brand key |
| `templates/` | synced copy of the brand source's templates folder: `<flow>/card.html`, plus `<flow>/email.html` for an email flow, and `fonts/`: the `fonts.txt` recipe, plus the font files and `fonts.css` the fonts sync makes from it |
| `optout.csv` (path from `optout`) | `id,email,scope,date,note`; `scope` is `all`, empty, or one flow name |
| `out/<date>/<flow>/` | one run's output, plus `messages.json` and `manifest.json` (`{key: occasion date}`) |
| `out/dry-run/<date>/<flow>/` | dry-run output, read only by `deliver.py --dry-run` |
| `out/journal.csv` | `flow,date,key,occasion_date,delivery,status,ref,at`, one row per delivered item, for every flow |

## Flow fields

The `Flow` section of `flow.md`. The scripts stop with a clear message on a value outside these, and use the default when a field is missing.

| Field | Values | Default |
|---|---|---|
| `trigger` | `date-in-data`, `event-list`, `cadence`, `other` (comma-separated for several) | `date-in-data` |
| `delivery` | `draft` (mail-app draft; pressing Send is the approval), `send`, `files` | `draft` |
| `personalization` | `template`, `personal` | `personal` |
| `variants` | `1`, `2`, `3` | `1` |
| `weekend_rule` | `same-day`, `friday-before`, `monday-after`, `skip` | `same-day` |
| `language` | any language name (offer English, Norwegian, Sinhala, Tamil) | `English` |
| `browser` | `auto`, a browser path, `playwright`, `none` | `auto` |
| `channel`, `data_source`, `audience`, `schedule` | free text; a `channel` naming a chat (Teams, Slack, WhatsApp, …) makes each post a PNG + caption | |

`ai_marker` is required. A chat channel requires `delivery: files`; `delivery: send` requires `variants: 1`.

## Items

An **item** is one occasion for one person, or one holiday. The flow's `occasions` key picks the kinds: `birthday`, `anniversary` (whole years since `join_date`, from 1 up), `welcome` (the `join_date` itself), `holiday` (a `date,name` row in the `holidays` file).

- **Key**: `<id>-<kind>` for a person (`907-birthday`); `holiday-<slug>` for a holiday, where the slug is the name in lower case with any `(...)` dropped and each run of other characters turned into `-` (`holiday-christmas`). The journal matches on keys, so every project uses this form.
- A 29 Feb birthday falls on 28 Feb in other years.
- **Headline** (`occasion`): "Happy Birthday", "<n> Year(s) Together", `welcome_headline`, or the holiday name; a `headline` in `messages.json` replaces it.
- **Photo**: `--list` gives each person's `photo_save_as`, `<photos>/<id>-<kind>.png`, where the run saves the file the flow's Sync list picks for that occasion. The card uses that file, else `<photos>/<id>.png` (then invariant 9).

## Commands

Each script prints its usage when run without arguments, and finds the project from the folder it runs in.

- **`render.py <flow> <date> --list [--force]`**: prints the items as a JSON list (`key`, `kind`, `date`, `occasion`, `why`, `person`, `first_name`, `team`, `variants`, `language`, and for a person `photo_folder` and `photo_save_as`). It writes nothing. Each skipped item goes to stderr as `skipped<TAB><key><TAB><reason>`.
- **`render.py <flow> <date> <messages.json> [--dry-run] [--force]`**: `messages.json` maps each key to `{message, email, subject?, headline?, salutation?, closing?}`, or to a list of exactly `variants` of them. It writes `<key>.html` and `<key>.png` per item (variants: `<key>-v1`, …). An email flow also gets `<key>.eml` (`X-Unsent: 1`, card inline and attached); a chat flow gets `<key>.txt` (the caption). It also writes `manifest.json`, then prints one line per item.
- **`deliver.py <flow> <date> [--dry-run] [--force] [--open]`**: delivers each item in `delivery` mode; `--open` also opens each new mail-app draft in a window (never a sent one), appends its journal row, and prints `<key><TAB><status><TAB><ref or reason>`. Statuses: `drafted`, `sent`, `files`, `exported` (chat), `failed`, `skipped`; in a dry run the status is `would <action>` (e.g. `would save an Outlook draft`).
- **Sync**, one per source that needs reshaping (e.g. `sync_people.py <flow> <export>`): turns the export a connector gives into the local file `flow.md` names. People file columns: `id,name,display_name,email,birthday` (`MM-DD`)`,join_date` (`YYYY-MM-DD`)`,team,language,photo_folder`, then any other source columns in `snake_case`.
- **Fonts sync** (`sync_fonts.py`): reads `templates/fonts/fonts.txt`, whose font lines are `family | weight | file | url | sha256` (`#` lines are comments), downloads each file that is missing or whose sha256 differs, stops with nothing changed when a download's sha256 differs from the recipe, and writes `fonts.css` beside it with one `@font-face` per line.
- **Schedule**, local only (`schedule_local.ps1 -Flow <flow> -At HH:MM -Days … [-WhatIf|-Show|-Remove]`, plus the runner it registers): one task per flow, which runs this skill for `<flow>` unattended, using the command as installed here (`/brand-posts`, or `/<plugin>:brand-posts` from a plugin), and logs to `out/logs/`.

## Invariants

These hold in every project. The acceptance checks prove each one.

1. **Opt-out first**: a person whose `id` or `email` is on the opt-out list (scope `all`, empty, or this flow) leaves the run in `--list`, before any photo, message or file.
2. **One delivery per occasion**: an item with a journal row for the same flow, key and occasion date, with a status of `drafted`, `sent`, `files` or `exported`, is skipped by `--list` and by `deliver.py`. `--force` redoes a draft; a `sent` item stays sent.
3. **Dry run is sealed**: `--dry-run` writes project files only under `out/dry-run/` (temporary files outside the project, such as a browser profile, are fine), leaves `out/journal.csv` byte-for-byte unchanged, and makes no draft or send.
4. **AI marker last**: `ai_marker` is the last visible line of every email (HTML and plain text) and every caption.
5. **Weekend rule**: `friday-before` adds Sat and Sun to a Friday run, `monday-after` adds the weekend before to a Monday run, and `skip` drops weekend dates. Under these three rules a weekend run finds nothing, and an item's `why` names its real date.
6. **Every placeholder filled**: a placeholder left unfilled prints a warning. Templates can use, highest precedence first:
   - computed values. Card: `name` (full name; on a holiday "From all of us at <company>"), `first_name` (`display_name`, else the first word of `name`; empty on a holiday), `name_class` (CSS class for long names: empty, `long` over 20 characters, `xlong` over 30; `long` on a holiday), `occasion` (the headline), `message` (the card text), `photo` (an `<img>` or badge), `company`, `frame` (data URI, or empty). Email: `salutation`, `first_name`, `message` (the `email` text), `card_img`, `closing`, `ai_marker`. The subject is a mail header, set from `subject` or a default.
   - the person's people-file columns (empty on a holiday card), then flow keys, then brand keys.

   Messages are written in the flow's `language`, also when the person has a `language` column.
7. **Complete messages**: rendering stops before it writes anything if a key is missing from `messages.json` or has the wrong number of variants.
8. **Offline card**: every local file a template points to (a stylesheet `<link>`, `url(...)` in CSS, including inside that stylesheet, an `src`), relative to the template, is built into the output as inline CSS or a data URI. A missing file or an `http(s)` reference prints a warning.
9. **Graceful photo**: with no photo file the card shows an initials badge, and a holiday shows the logo.

## Acceptance checks

Run them in a scratch copy of the project (`brand/`, `flows/`, `cache/` or other local data, `optout.csv`, `scripts/`, with no `out/`), so the real journal and mailbox stay untouched. In the copy, set the flow to `delivery: files`. Pick a date `D` that has a known item in the data.

| # | Check | Passes when |
|---|---|---|
| 1 | `--list` on `D` | the known item is listed, with the right person and occasion |
| 2 | `--list` on the nearest weekend date with an item (any occasion), under `friday-before` or `monday-after` | empty, and the covering weekday lists that item with its real date in `why` |
| 3 | add the item's `id` to the opt-out list with scope `all`, then with another flow's name | first: the item is skipped as opted out; second: it is listed |
| 4 | render `D` with sample messages, including a holiday when the data has one, with the network off | every file for the channel and `manifest.json` exist, there are no warnings, each PNG's content sits inside the square, and its text is in the brand font |
| 5 | `messages.json` with one key missing | render stops and names the key, and the output folder is unchanged |
| 6 | `--dry-run` render and deliver | "would …" lines, no `out/journal.csv`, files only under `out/dry-run/` |
| 7 | deliver `D`, then `--list` and deliver again | one journal row; the second `--list` and deliver both skip the item |
| 8 | read each `.eml` (both parts) or `.txt` | `ai_marker` is the last visible line of each |
| 9 | for `draft` or `send` with a mail app new to this machine: one real draft addressed to the user, after their yes | the draft shows in their Drafts folder |

**All checks pass** before setup finishes. A failing check means the script is fixed and every check runs again.
