# Setup

Writes the project's config and templates so a plain `/office:greetings` run needs nothing else. Re-running setup overwrites the config; keep templates the user has edited unless they ask.

## 1. Discover sources

The run needs four things: a **people file** (name, email, birthday, join date), a **photo folder** (files named by person id: jpg, png or svg), **brand notes** (colours, fonts, tone), and a **holiday list**.

- Look in the project folder first (`test-data/`, `data/`, any CSV/XLSX with those columns).
- Note which connectors this session has (SharePoint, OneDrive, Google Drive, Outlook) by their tool names only. Record them in the config as candidate sources for later; setup reads nothing through them.
- Ask the user to confirm each source and the email recipient (e.g. the all-staff address). When nobody can answer, take local files and say so in the config.

Done when each of the four has a path (or an explicit "none") and you have read the people file's header and brand notes.

## 2. Write `ai-designer.md` at the project root

Sections: `Sources` (path per item, plus the connectors found), `Brand` (colours, fonts, tone, company name: copied from the brand notes so cards render without them), `Holidays` (path to the holiday file, a `date,name` CSV; only dates the user or a source gives), `Email` (recipient, sender name and address, AI marker line: "(drafted by AI Designer, review before sending)"), `Outbox` (default `out/`).

## 3. Write templates

- `templates/card.html`: a 1080x1080 social-post card, self-contained (inline CSS, web fonts from Google Fonts with system fallbacks). Top to bottom, as one tight centred group: the occasion as the big headline ("Happy Birthday", "5 Years Together", the holiday name), the round photo with an accent ring, the full name, a 1-2 sentence message, the company name small at the bottom. Decorative shapes use brand colours only. Name font size shrinks with length (CSS `clamp` or a length class) so 25+ character names stay within two lines. Placeholders: `{{name}}`, `{{occasion}}`, `{{message}}`, `{{photo}}`, `{{company}}`. A holiday card uses the same template with the company logo badge in place of the photo.
- `templates/email.html`: short HTML email body with placeholders `{{first_name}}`, `{{message}}`, `{{ai_marker}}`.
- `scripts/`: put the generator code the run needs here (e.g. `scripts/render.py` taking a date) so later runs reuse it instead of rewriting it.

Done when the config and both templates exist; show the user the config.
