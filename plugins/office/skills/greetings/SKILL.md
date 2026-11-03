---
name: greetings
description: Make today's staff greeting cards (birthdays, work anniversaries, holidays) and ready-to-send email drafts. Pass `setup` to configure a new project.
disable-model-invocation: true
---

# AI Designer

Turns the staff list into **greeting cards** and **email drafts** for one day. A human reviews each draft and presses send: that is the approval step.

## Branch

- Argument `setup`: follow [SETUP.md](SETUP.md) and stop.
- Otherwise the argument is a date (`YYYY-MM-DD`, default today). Read `ai-designer.md` at the project root; if it is missing, say "run `/office:greetings setup` first" and stop.

All paths come from `ai-designer.md` and resolve against the project root. The config is the single source of truth for where data lives.

## Run

1. **Find occasions** for the date:
   - _birthday_: month-day of `birthday` equals the date.
   - _anniversary_: month-day of `join_date` equals the date and at least one full year has passed; mention the year count.
   - _holiday_: the date appears in the config's holiday list; one card for everyone.

   Done when every person in the people file has been checked; list the matches (name, occasion, why) before going on. No matches: say so and stop.

2. **Make one card per match** from the card template. You write the messages; the scripts in `scripts/` render them (their usage line says how to pass the messages). Fill name, occasion, the photo, and a short message in the brand tone that is specific to the person (team, years, first name), written fresh for each card. Embed the photo as a data URI so the card is one self-contained HTML file. A person with no photo gets the brand initials badge instead. Write to `<outbox>/<date>/<id>-<occasion>.html` (holiday: `holiday-<slug>.html`).

3. **Make one email draft per card** from the email template: `.eml` with `X-Unsent: 1` (opens as an editable draft in Outlook), recipient from the config, subject and short HTML body in the brand tone, card attached. Build it with Python's `email` package. Write next to the card as `.eml`. End the body with the AI marker from the config.

4. **Report**: a table of the files written. Done when every match from step 1 has both a card and a draft on disk.

Outbound actions stay with the human: the run writes files only.
