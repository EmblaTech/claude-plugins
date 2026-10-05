---
name: init-llm-wiki
description: >
  Initialize Karpathy's LLM Wiki pattern as a development knowledge base in the current repo.
  Use when the user wants to set up a wiki, knowledge base, or dev notes system — or mentions
  "LLM wiki", "Karpathy wiki", "set up a wiki", or "organize project knowledge". Creates the
  full wiki/ directory structure, schema, index, log, and updates root CLAUDE.md.
---

# init-llm-wiki

Sets up [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
as a development knowledge base inside the current repo. Execute all steps without asking questions.

## What gets created

```
wiki/
├── CLAUDE.md          ← wiki schema and operating rules
├── index.md           ← page registry (LLM updates on every ingest)
├── log.md             ← append-only change log
├── raw/
│   ├── specs/         ← design specs and planning docs (.gitkeep)
│   └── assets/        ← downloaded images (.gitkeep)
└── pages/             ← LLM-generated wiki pages
CLAUDE.md              ← repo-level file (created or updated)
.gitignore             ← .obsidian/ added if not present
```

---

## Step 1 — Infer project context

Read any of these to understand the project (stop at the first that has useful info):
1. `CLAUDE.md` (root) — project name and description often at the top
2. `README.md` — title and first paragraph
3. `package.json` — `name` + `description`
4. `pyproject.toml` or `setup.py` — project name and description
5. Recent git log — `git log --oneline -5`

Extract:
- **PROJECT_NAME** — the human-readable project name
- **PROJECT_DESCRIPTION** — one sentence describing what it is/does

If nothing is found, use the repo directory name as PROJECT_NAME and leave PROJECT_DESCRIPTION empty.

---

## Step 2 — Create wiki/ structure

**Idempotency check:** Before creating any files, check whether `wiki/CLAUDE.md` already exists.
If it does, stop immediately and tell the user:

> "The wiki is already initialized in this repo (`wiki/CLAUDE.md` exists). Re-running this skill
> would overwrite `wiki/CLAUDE.md`, `wiki/index.md`, and `wiki/log.md` — discarding any edits
> or log history. If you want to re-initialize from scratch, delete the `wiki/` directory first,
> then run this skill again."

Do not proceed with the remaining steps if the wiki is already initialized.

Create all of these files. Do not skip any.

### wiki/CLAUDE.md

Read `references/wiki-schema-template.md` and copy its full content, replacing:
- `{{PROJECT_NAME}}` → the inferred project name
- `{{PROJECT_DESCRIPTION}}` → the inferred description, formatted as a sentence ending with a period and followed by a newline. If empty, remove the line entirely.

### wiki/index.md

```markdown
# {{PROJECT_NAME}} Wiki Index

Central catalog of all pages in `wiki/pages/`. Updated by the LLM on every ingest.

---

## Decisions

_No pages yet._

## Concepts

_No pages yet._

## Entities

_No pages yet._

## Comparisons

_No pages yet._

## Overviews

_No pages yet._
```

### wiki/log.md

```markdown
# Wiki Log

Append-only record of all wiki operations. Each entry format:
`## [YYYY-MM-DD] <operation> | <title>`

Operations: `ingest`, `query`, `lint`

---
```

### wiki/pages/.gitkeep

Empty file — keeps the directory tracked by git.

### wiki/raw/assets/.gitkeep

Empty file — keeps the assets directory tracked by git.

### wiki/raw/specs/.gitkeep

Empty file — keeps the specs directory tracked by git (specs will be added by the user). Without
this, the empty `specs/` directory is not committed and the structure ends up incomplete.

---

## Step 3 — Create or update root CLAUDE.md

**If root CLAUDE.md does not exist**, create it:

<template>
# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

## Development wiki

This repo uses Karpathy's LLM Wiki pattern as its development knowledge base.
See `wiki/CLAUDE.md` for the full wiki schema and operating instructions.

Quick reference:
- Drop new notes/decisions into `wiki/raw/` and ask Claude to ingest them
- Ask questions — Claude consults `wiki/pages/` and cites sources
- Run lint periodically: "lint the wiki"
- `wiki/raw/` is read-only. Never modify files there.
- `wiki/pages/` is LLM-owned. Only Claude writes there.

## Design specs

When brainstorming or designing a feature, save the spec to:

```
wiki/raw/specs/YYYY-MM-DD-<topic>-design.md
```

## Repository structure

```
wiki/raw/         ← source documents (immutable)
wiki/raw/specs/   ← design specs
wiki/raw/assets/  ← downloaded images
wiki/pages/       ← LLM-generated wiki pages
wiki/index.md     ← page registry
wiki/log.md       ← change log
```
</template>

**If root CLAUDE.md already exists**, insert a `## Development wiki` section. Place it after the
first heading (or at the top if no heading exists). Do not overwrite any existing content.

The section to insert:

<template>
## Development wiki

This repo uses Karpathy's LLM Wiki pattern as its development knowledge base.
See `wiki/CLAUDE.md` for the full wiki schema and operating instructions.

Quick reference:
- Drop new notes/decisions into `wiki/raw/` and ask Claude to ingest them
- Ask questions — Claude consults `wiki/pages/` and cites sources
- Run lint periodically: "lint the wiki"
- `wiki/raw/` is read-only. Never modify files there.
- `wiki/pages/` is LLM-owned. Only Claude writes there.

## Design specs

When brainstorming or designing a feature, save the spec to:

```
wiki/raw/specs/YYYY-MM-DD-<topic>-design.md
```
</template>

---

## Step 4 — Update .gitignore

If `.gitignore` exists, append the following block if `.obsidian/` is not already listed:

```
# Obsidian
.obsidian/
```

If `.gitignore` does not exist, create it with just that block.

---

## Step 5 — Report

Tell the user what was created, then give them the three things they need to know to use it:

1. **Ingest**: "Drop a file in `wiki/raw/` and say 'ingest [filename]' — Claude will read it and update the wiki pages."
2. **Query**: "Ask any question — Claude will check the wiki and cite its sources."
3. **Lint**: "Say 'lint the wiki' periodically to catch orphan pages, broken links, and stale claims."

Also mention: `wiki/CLAUDE.md` is the schema — edit it as conventions evolves.

Also mention the search upgrade path: the index file works well up to ~50 pages; see
`references/search-upgrade.md` (in the skill directory) for guidance on integrating a local
search engine when the wiki outgrows it.

---

## Step 6 — Offer to commit

Do **not** commit automatically. The scaffold touches the repo root (`CLAUDE.md`, `.gitignore`) and
the user may want to review or stage it differently. Ask whether they'd like it committed, and only
if they say yes run:

```bash
git add wiki/ CLAUDE.md .gitignore
git commit -m "feat: initialize LLM wiki development knowledge base"
```

Commit to the current branch — do not create or switch branches unless the user asks.
