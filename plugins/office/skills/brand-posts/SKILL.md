---
name: brand-posts
description: Make today's staff greeting cards (birthdays, work anniversaries, holidays) from SharePoint staff data and photos, with ready-to-send Outlook .eml drafts. Pass `setup` to configure a new project.
disable-model-invocation: true
---

# AI Designer

Reads the staff list, photos, brand assets and holidays from **SharePoint** (read-only) and writes **greeting cards** and **email drafts** for one day to the local outbox, plus (optional) unsent drafts in the user's Outlook Drafts folder. A human opens each draft, checks it and presses send: that is the approval step.

## Branch

- Argument `setup`: follow [SETUP.md](SETUP.md) and stop.
- Otherwise the argument is a date (`YYYY-MM-DD`, default today). Read `ai-designer.md` at the project root; if it is missing, say "run `/brand-posts setup` first" and stop.

Sources are SharePoint URIs from `ai-designer.md`; read them with the Microsoft 365 `read_resource` tool. Never upload, move or edit anything in SharePoint. Downloads and the jobs file go in the session scratchpad; only the finished cards and drafts go to the outbox. The **card and email templates live in SharePoint** (config `Templates`); only the renderer `scripts/render.py` lives in this skill folder. Never keep template copies in the project or the skill.

**Getting a file's bytes:** `read_resource` on an image returns a line `[Image: source: <local path>]`. Copy that file into the scratchpad under a clear name (`frame.png`, `logo.png`, `<id>.png`). No such line means no bytes: treat the image as missing.

**Getting a template:** list the config's templates folder (it shows each file's byte size), read `card.html` and `email.html`, and write each one's text verbatim to the scratchpad (`tpl/card.html`, `tpl/email.html`). Check each saved file's byte count equals the size in the listing; if not, rewrite it (watch line endings and the trailing newline). Never edit the template text.

## Run

1. **Find occasions** for the date. Read the people sheet named in the config (all rows) with its column mapping.
   - _birthday_: day-month of birthday equals the date (birthdays may have no real year). A 29 Feb birthday is celebrated on 28 Feb in non-leap years.
   - _anniversary_: day-month of join date equals the date and at least one full year has passed; note the year count.
   - _holiday_: the date is in the holiday CSV; one card for everyone.

   Done when every row has been checked; list the matches (name, occasion, why) before going on. No matches: say so and stop.

2. **Get templates and images.** Templates as above. Brand frame and logo from the config's brand assets. For each matched person, follow the config's `Photo rule` (per-person folder from the people-file column; try the occasion's file order, case-insensitive). No folder ("No folder"), no file, or no bytes: `photo` is null and the card gets the initials badge. Say who got a badge.

3. **Render.** Write a jobs JSON in the scratchpad (format and placeholder list in the `scripts/render.py` docstring): template paths, company and asset paths from the config, email `to`/`from`/`ai_marker` from the config, and one card per match:
   - `out`: `<id>-birthday`, `<id>-anniversary`, or `holiday-<slug>` (`holiday: true`)
   - `name`: full name; `first_name`: the display name column (holiday: "everyone")
   - `occasion`: "Happy Birthday", "<N> Years Together" (1: "1 Year Together"), or the holiday name
   - `message` (card, 1-2 sentences) and optionally `email_message`, `subject`: written fresh for each person in the brand tone, using their first name and something specific (team, years). No corporate filler.

   Run `python "<skill>/scripts/render.py" <jobs.json> "<project>/<outbox>/<date>"`, adding `--open` when the config's `Email` section has `open_drafts: yes` (default yes when the key is missing): each `.eml` then opens in the default mail app, which in classic Outlook is an editable draft with the card inside. The renderer prints `opened <file>` or `could not open <file>`; pass that on in the report. It writes `<out>.html` (self-contained card), `<out>.png` (when Edge/Chrome is installed) and `<out>.eml` (`X-Unsent: 1` draft, card PNG shown in the body, card HTML attached) per card. If a template has a placeholder the renderer does not fill, it shows up as literal `{{...}}` in the card: check, and tell the user.

4. **Outlook drafts** (only when the config's `Email` section has `outlook_drafts: yes`). The renderer also wrote `outlook-drafts.json` in the outbox day folder. For each entry belonging to this run:
   - no `message_id`: call Microsoft 365 `outlook_create_draft` with `to`, `subject`, `body` exactly as in the file and `bodyType: "html"`. Write the returned id and webLink back into that entry as `message_id` and `web_link`.
   - has `message_id` (a re-run of the same day): call `outlook_update_draft` with that id and the new `to`, `subject`, `body`, `bodyType: "html"`, so the draft is replaced, not duplicated. If it refuses (the draft was already sent or deleted), do not create a new one; tell the user and leave the entry as it is.
   - Pass the body verbatim. If the connector rejects it, report the error for that card and go on; the `.eml` is still there.

   The connector cannot attach files or show images, so these drafts carry the text only, with a bold line naming the card file to attach. Done when every entry has a `message_id` or a reported error.

5. **Report**: a table with one row per match: person, occasion, photo or badge, card file, PNG, draft file, and (when Outlook drafts are on) the Outlook draft link. Remind the user that double-clicking an `.eml` opens it in Outlook as a draft with the card inside. Also remind them that the Outlook Drafts-folder copy needs the card PNG (path in `attach`) dragged in before sending. Done when every match has its card and `.eml` on disk.

Outbound actions stay with the human: the run writes local files and, when switched on, unsent drafts in the user's Drafts folder. Never send email (`outlook_send_draft`, `outlook_send_mail`) or post anything.

