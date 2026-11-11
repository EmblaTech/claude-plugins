# Setup

Records where everything lives so a plain `/brand-posts` run needs nothing else. Source data stays in **SharePoint** and is only read. Setup writes exactly **one local file**, `ai-designer.md` at the project root, holding links, URIs, column mappings and brand values (no staff data). The card and email templates live in SharePoint; only the renderer ships inside this skill folder. Never create template files locally. Runs write cards and drafts to the local outbox (default `out/`).

Re-running setup overwrites `ai-designer.md`.

Tools: Microsoft 365 connector `sharepoint_search`, `sharepoint_folder_search`, `read_resource`. Setup never uploads or changes anything in SharePoint. (Runs with `outlook_drafts: yes` also use `outlook_create_draft` / `outlook_update_draft`, which write only to the user's Drafts folder.)

## 1. Ask for the sources

Ask the user in plain chat (they paste links or folder names):

| item | what it is |
|---|---|
| people | workbook/CSV with id, full name, display name, email, birthday, join date (team, photo folder optional) |
| photos | photo root: files named by id (`<id>.png`), or one sub-folder per person named in a people-file column |
| brand | brand notes (colours, fonts, tone, company name, footer) plus any asset images (frame, logo) |
| holidays | `date,name` CSV; `none` allowed |
| templates | SharePoint folder holding `card.html` and `email.html` |
| email | recipient (e.g. all-staff address); sender optional (blank: Outlook uses the default account); also put drafts in the Outlook Drafts folder? (yes/no; those drafts are text only, the card is attached by hand); open each `.eml` draft in Outlook after a run? (yes/no, default yes) |

If a link is missing, search (`sharepoint_search` by filename, `sharepoint_folder_search` for folders) and let the user pick. Never guess between duplicates: show both paths and ask.

## 2. Resolve each source to a connector URI

`read_resource` only takes `file:///<driveId>/<itemId>` (or `file:///<driveId>/<path from drive root>`), not `https://` links. Links with `Doc.aspx?sourcedoc=...` carry no path: search by the `file=` name instead. Record `driveId`, item id and URI for each source. A folder can be listed by reading its URI.

## 3. Read and check

- **people**: read the workbook. Use the sheet its notes name as the list to read (prefer an active-staff sheet; skip inactive rows). Map columns to `id, name, display_name, email, birthday, join_date, team, photo_folder`; record the sheet, mapping and date formats (a birthday may be day-month only). Missing id/name/birthday/join_date: tell the user and stop.
- **photos**: list the root and one person's folder. Record a `Photo rule`: layout, which column names the folder, file names inside, and the order to try per occasion (occasion-specific photo first, then the ID photo). If the people file names a photo-folder URL, check it agrees with the root.
- **brand**: read the notes; copy colours (hex), font, tone, company name and footer into the config. Record URIs of asset images (frame/background, logo).
- **holidays**: read it; record the URI and the dates found.
- **templates**: list the folder and read both files; record their URIs and the placeholders each uses. Compare with the placeholder list in `scripts/render.py`; report any the renderer does not fill.

Done when every source has a URI (or explicit `none`) and the reads succeeded.

## 4. Write `ai-designer.md` at the project root

Sections, in order:
- `Sources`: table of item | link | uri | notes (people sheet + column mapping + date formats; photo layout).
- `Photo rule`: per occasion, the file order to try, and what "no folder" looks like.
- `Brand`: company, colours (primary, accent, background, text, photo box), font, footer, tone, languages; asset table (frame, logo URIs).
- `Holidays`: URI and the dates it holds today.
- `Templates`: folder URI, `card.html` and `email.html` URIs, placeholders found.
- `Email`: to, from (or blank), ai_marker `(drafted by AI Designer, review before sending)`, delivery = local `.eml` with `X-Unsent: 1`, card PNG in the body, card HTML attached; `outlook_drafts: yes|no` (yes: also an unsent text-only draft in the Outlook Drafts folder via Microsoft 365 `outlook_create_draft`); `open_drafts: yes|no` (yes: the run opens each `.eml` in the default mail app).
- `Outbox`: `out/` (cards and drafts go to `out/<YYYY-MM-DD>/`).
- `Connectors`: Microsoft 365 used read-only; others seen by tool name only.

Show the user the config, then stop.
