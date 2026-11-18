# dashboard-v2 (in development)

Before you edit a Markdown file in this folder (`SKILL.md`, `references/`, `sections/`), invoke `mattpocock-skills:writing-for-agents` and apply it to the edit: agents read these files at run time.

## Page UI

How the page is built and themed; the why is in [ADR 0006](adr/0006-theme-as-token-file.md).

- **Files, one job each:** `page.html` markup and config JSON; `base.css` layout and components; `theme.css` token values; `logic.js` pure logic, no DOM, imported by `page.test.mjs`; `tracker.js` the tracker contract, one implementation per storage mode over an injected transport, tested on fakes in `tracker.test.mjs`; `app.js` DOM and wiring, which reaches records only through `tracker.js`. Plain JS, no build step.
- **Tokens only:** every colour, font, radius, shadow and spacing in `page.html`, `base.css` and `app.js` is a `var(--…)`; the test fails on a colour literal. A new visual need is a new token in the required set in `base.css`, with values in every theme.
- **Token names** follow the DESIGN.md spec (`--color-*`, `--type-<level>-*`, `--rounded-*`, `--space-*`, plus `--elevation-*`, which the spec keeps in prose); the required set is the `Required tokens` comment in `base.css`, and the test reads it from there.
- **Style by level, not by value:** a component takes a whole type level and steps from the rounded and spacing scales; a one-off size or radius is a sign the component belongs to another level or step. The type tokens appear only in the per-level rules at the top of `base.css`, plus `--type-emphasis-weight` for bold inside body text. Derived values stay token-based (`calc(var(--space-xs) / 2)`, `color-mix()` of two tokens).
- **A theme is values, never layout.** Every theme gives the whole required set in its light `:root` block; its two dark blocks (`prefers-color-scheme` + `[data-theme]` selectors) override the colours only, plus `--elevation-raised` when the dark shadow differs.
- **A theme comes from a style source** (a DESIGN.md) through setup's [Theme](../../plugins/office/skills/dashboard-v2/references/setup.md#theme) step, which keeps both in the config.
- **Behaviour lives in `logic.js`** where it can be pure, so it stays under test; `app.js` stays thin.

## Checking the live page

Open the published artifact in Claude in Chrome: the desktop app's built-in browser pane renders it blank (the artifact frame loads with origin `null`). The tests run in the repo's pre-commit hook whenever this folder or the config Theme is staged.
