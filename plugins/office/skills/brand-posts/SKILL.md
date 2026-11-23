---
name: brand-posts
description: Makes a day's branded posts for a flow, such as staff birthdays, work anniversaries and holidays: brand-styled cards plus Outlook email drafts, .eml files or chat-ready PNGs that a person reviews and sends. Use when the user asks for today's or a date's greeting cards, birthday or anniversary emails, or holiday posts, with `[flow] [date] [--dry-run]`, or passes `setup [flow]` to set up a project or add a flow.
disable-model-invocation: true
---

# Brand posts

Turns a flow's sources into **branded cards**, plus **email drafts** or **chat posts** (PNG + caption), for one day. Each **item** is one person-occasion (or one holiday), identified by its **key**. A human reviews each item and presses Send or posts it: that is the approval step, unless the flow says `delivery: send`.

## Project

The project folder holds the data and its own `scripts/`, which setup wrote for that data to meet [contract.md](references/contract.md) (read it when writing or fixing a script). Run the scripts from the project folder. Each prints its usage when run without arguments: that usage is the reference for its flags, files and output.

- `brand/brand.md` + `flows/<flow>/flow.md` are the config (a flow key overrides a brand key) and the single source of truth for where data lives.
- `<out>` is the run's output folder: `out/<date>/<flow>/`, or `out/dry-run/<date>/<flow>/` in a dry run.
- `out/journal.csv` records every delivered item, so a rerun skips it.

## Requirements

- Python 3 (`winget install Python.Python.3.12`); the scripts use only its standard library.
- `curl` for the fonts sync (included in Windows 10 and later).
- A Chromium browser for card PNGs: Microsoft Edge (included in Windows) or Chrome; otherwise `pip install playwright` then `playwright install chromium`.
- Classic Outlook on the same PC for `delivery: draft` or `send`.
- The Microsoft 365 connector (or the connector for wherever the data lives) for the Sync steps.

## Branch

- `setup [flow]`: follow [setup.md](references/setup.md) and stop.
- Otherwise the arguments are `[flow] [date] [--dry-run]`, in any order. The flow is a folder under `flows/`: the one named, else the only one there is; with several and none named, ask which. The date is `YYYY-MM-DD` (default today). If `brand/brand.md`, the flow's `flow.md` or `scripts/` is missing, tell the user to run this skill with `setup` first, quoting the command as they invoked it (`/brand-posts setup`, or `/<plugin>:brand-posts setup` from a plugin), and stop.
- **`--dry-run`**: run every step, passing `--dry-run` to `render.py` and `deliver.py`. Work from the local copies in `cache/` and `brand/` instead of syncing, and say so; still fetch the items' photos in step 2, so the cards match a real run. Report what a real run would do.
- **Scheduled run** (the prompt says so): nobody is watching. Take the flow's settings as given; when something needs a decision, stop there and explain it in the report.

## Run

0. **Sync**: follow the Sync list in `brand/source.md` (when it exists), then the one in the flow's Sources. If a source's tool won't connect, say so and use the local copy.

   Done when each Sync item is refreshed, or reported as using the local copy.

1. **Find items**: `python scripts/render.py <flow> <date> --list`. List each item (name, occasion, date, why) and the `skipped` lines from stderr:
   - **opted out**: report only the count and keys. These people leave the run here, before any photo or message.
   - **already delivered**: the journal's duplicate guard. Redo one with `--force` when the user asks for it.

   No items: say so, and for a weekend date say which weekday's run covers it; then stop.

   Done when the items and the skipped lines are listed.

2. **Write messages**: fetch photos for the items (the flow's Sources say how), then write `<out>/messages.json` in the shape `render.py`'s usage gives, in the flow's `language` and the brand's `tone`:
   - `personalization: personal`: fresh per person (team, years, first name). `template`: one text per occasion type, changing only the name, the year count and the holiday name.
   - `variants` 2-3: versions that differ in angle, not just wording; the reviewer keeps one.
   - A `language` other than English: also give `headline`, `salutation` and `closing`, so the card and email are entirely in that language.
   - A chat `channel`: `email` is the caption, one or two lines.

   Done when every item has an entry with `variants` versions, written entirely in the flow's `language`.

3. **Render**: `python scripts/render.py <flow> <date> <out>/messages.json`.

   Done when it prints a line for every key with no warnings, and you have looked at each card PNG and its text sits inside the square.

4. **Deliver**: `python scripts/deliver.py <flow> <date> --open`, which opens each new draft for the user to review; a scheduled run leaves out `--open`. With `delivery: send` the mail goes out unreviewed, so first show the user the drafts and get their go-ahead in this conversation (a scheduled run goes ahead).

   Done when every item has a status line (in a dry run, a "would …" line). For a `failed` item, say why and point the user to its `.eml` file.

5. **Report**: a table per item (card, draft or chat files, delivery result), then the skipped items and, in a dry run, a line saying nothing was delivered.
