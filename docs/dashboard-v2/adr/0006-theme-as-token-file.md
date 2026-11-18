---
status: accepted
---

# A theme is a file of token values; the page and its layout are shared

The user wants to choose how the dashboard looks, from a default or from a published design (a Refero style, any DESIGN.md), and to keep that choice apart from the page code, with a theme switcher possible later. So the page is split into files: `page.html` (markup and the config JSON), `base.css` (layout and components, using only `var(--…)`), `logic.js` (pure logic, imported by the tests), `app.js` (DOM and wiring) and `theme.css` (token values only). A theme changes only `theme.css`; every theme shares the same layout. Setup turns the chosen **style source** (a DESIGN.md) into `theme.css` and keeps both in the dashboard's config. *(Decided 2026-11-12, #132.)*

Token names follow the DESIGN.md spec (google-labs-code/design.md, Apache-2.0, alpha): `--color-*`, `--type-<level>-*`, `--rounded-*`, `--space-*`. `base.css` fixes the small required set the page uses; the spec's `components` group guides how `base.css` styles our components and is not turned into tokens.

## Considered options

- **Tokens injected inline into `page.html`, like `__DASHBOARD_CONFIG__`.** Rejected: works for one theme, but a switcher would need every theme inside the page, and colours drift back into the markup.
- **Each theme restyles the whole page, layout included.** Rejected: every theme becomes a fork of the page, and switching between them is no longer a file swap.
- **Keep our own 14 token names and map each DESIGN.md onto them.** Rejected: DESIGN.md carries type scale, radii and spacing our names cannot hold; adopting the spec's names lets a style source map almost one to one.
- **TypeScript with a build step.** Rejected for now: the repo has no build, and no requirement needs types. JSDoc with `// @ts-check` can be added later without rework.
- **Linting the style source with `@google/design.md lint`.** Rejected: a new alpha dependency that checks the DESIGN.md, not our `theme.css`; the agent checks contrast of the required pairs when it writes `theme.css`.

## Consequences

- One redesign now, taking a DESIGN.md as the model for the components; behaviour, texts and the logic tests stay as they are. The current look (IBM Plex, teal) becomes the default theme, shipped with the skill and copied into the config by setup.
- `theme.css` holds a light block with every token and a dark block that overrides the colours only (changed 2026-11-12: type, rounded and spacing do not change in dark). The DESIGN.md spec has no dark mode: dark values come from the source's `*-dark` tokens where it has them, otherwise the agent derives them and marks them as derived.
- Fonts come from Google Fonts only (the artifact's rule); a font missing there is replaced by the nearest one, and setup says so.
- Refero builds its DESIGN.md in the browser and its robots.txt blocks AI crawlers, so a Refero style comes in through its **Copy .md** button (pasted by the user) or the Refero MCP, never by scraping.
- A test fails if a colour literal appears in `page.html`, `base.css` or `app.js`.
- The page publishes as several artifact files. A switcher would add more `theme.css` files and a choice between them; it is not built now.
- A light/dark switcher inside one Theme is built (2026-11-12, #161): Auto / Light / Dark in the header, remembered per viewer in localStorage, sets `data-theme` on `<html>` (Auto removes it and follows the system); a small inline script in `page.html` applies the stored choice before first paint. Choosing between several Theme files is still not built.
- Sections carry no positional colour (changed 2026-11-12, #161): colour only where it means a state; `warning`, `error`, `ok`, `ai` come from the Style source or are derived at its own chroma (setup's Theme step).
