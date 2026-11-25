# Organizer coding standards

Judgement rules a reviewer checks on any diff touching the dashboard: the skill (`plugins/office/skills/organizer/`), its config (`.claude/organizer/`), these design docs and the page code.

- **Single source of truth.** Each rule or fact lives in one file; every other file points to it. A rule restated in a second file (e.g. a storage-mode detail copied into `setup.md`) is a finding, even when both copies agree today.
- **Mode-neutral shared files.** Files every storage mode reads (`SKILL.md`, `references/tracker.md`, `references/card.md`, `references/setup.md`, the page's `app.js`) speak in tracker-contract terms: record, kind, storage mode. Anything one storage mode does differently lives in `references/storage/<name>.md` or `tracker.js`.
- **Glossary moves with the change.** A term the diff adds, renames or redefines gets its `glossary.md` entry in the same change; old names it retires are gone from skill, config, docs and page code.
- **Written for agents.** Skill and `CLAUDE.md` prose passes `mattpocock-skills:writing-for-agents`.
