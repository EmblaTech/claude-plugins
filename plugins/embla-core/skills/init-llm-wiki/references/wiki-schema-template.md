# {{PROJECT_NAME}} Development Wiki

This is the development knowledge base for **{{PROJECT_NAME}}**.
{{PROJECT_DESCRIPTION}}
This is an internal developer tool, not part of the product itself.

> **Schema document** — This file (`wiki/CLAUDE.md`) tells the LLM how to operate the wiki.
> Read it at the start of every session before touching any wiki files.

---

## The core idea

Most people's experience with LLMs and documents looks like RAG: you upload a collection of files,
the LLM retrieves relevant chunks at query time, and generates an answer. This works, but the LLM
is rediscovering knowledge from scratch on every question. There's no accumulation.

The idea here is different. Instead of just retrieving from raw documents at query time, the LLM
**incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of
markdown files that sits between you and the raw sources. When you add a new source, the LLM doesn't
just index it for later retrieval. It reads it, extracts the key information, and integrates it into
the existing wiki — updating entity pages, revising topic summaries, noting where new data contradicts
old claims, strengthening or challenging the evolving synthesis. The knowledge is compiled once and
then *kept current*, not re-derived on every query.

This is the key difference: **the wiki is a persistent, compounding artifact.** The cross-references
are already there. The contradictions have already been flagged. The synthesis already reflects
everything you've read. The wiki keeps getting richer with every source you add and every question
you ask.

## Architecture

There are three layers:

**Raw sources** (`wiki/raw/`) — your curated collection of source documents. Notes, specs, decisions,
research, meeting recordings. These are immutable — the LLM reads from them but never modifies them.
This is your source of truth.

**The wiki** (`wiki/pages/`) — a directory of LLM-generated markdown files. Summaries, entity pages,
concept pages, comparisons, an overview, a synthesis. The LLM owns this layer entirely. It creates
pages, updates them when new sources arrive, maintains cross-references, and keeps everything
consistent. You read it; the LLM writes it.

**The schema** — this file (`wiki/CLAUDE.md`). It tells the LLM how the wiki is structured, what the
conventions are, and what workflows to follow when ingesting sources, answering questions, or
maintaining the wiki. You and the LLM co-evolve this over time as you figure out what works.

## Page type conventions

Not enforced via subdirectories — naming conventions only:

- `decision-*` — product and architecture decisions (what was chosen and why)
- `concept-*` — domain concepts relevant to the project
- `entity-*` — specific things (tools, libraries, APIs, competitors, frameworks)
- `comparison-*` — cross-source or cross-topic comparisons and analyses (often filed from query results)
- `overview-*` — high-level synthesis pages that link across many topics

## Operations

**Ingest.** You drop a new source into `wiki/raw/` (or a subdirectory) and tell the LLM to process
it. The LLM reads the source, discusses key takeaways, writes or updates relevant pages in
`wiki/pages/`, updates `wiki/index.md`, and appends one entry to `wiki/log.md`. A single source
might touch 5–15 wiki pages. Ingest sources one at a time and stay involved — read the summaries,
check the updates, guide what to emphasize.

**Query.** You ask questions against the wiki. The LLM reads `wiki/index.md` first to find relevant
pages, drills into them, and synthesizes an answer with citations (linking to pages and their
source files). Answers can be filed back into the wiki as new pages — comparisons, analyses,
discovered connections. Your explorations compound in the knowledge base just like ingested sources.

**Lint.** Periodically, ask the LLM to health-check the wiki. Look for: contradictions between pages,
stale claims that newer sources have superseded, orphan pages with no inbound links, important
concepts mentioned but lacking their own page, missing cross-references, broken `[[wiki-links]]`.
Use each page's `updated` frontmatter date to flag pages not refreshed since newer related sources
were ingested.

## Indexing and logging

**`wiki/index.md`** is content-oriented. A catalog of every page in `wiki/pages/` — each listed with
a link, a one-line summary, and optionally the date it was last updated. Organized by category.
The LLM updates it on every ingest. When answering a query, the LLM reads the index first.

**`wiki/log.md`** is chronological. An append-only record of ingests, queries, and lint passes.
Each entry starts with a consistent prefix: `## [YYYY-MM-DD] <operation> | <title>`.
Example: `## [2026-06-10] ingest | Project Setup Design`

## Page formatting rules

- Every page starts with a minimal YAML frontmatter block. Set `updated` to the date you last wrote
  the page — lint uses it to surface pages that may have gone stale:
  ```yaml
  ---
  updated: YYYY-MM-DD
  ---
  ```
- After the frontmatter, a one-line `> summary` blockquote
- Every page ends with a `## Sources` section listing `wiki/raw/` files it was built from
- Cross-references use `[[page-name]]` syntax (Obsidian-compatible)
- No page grows beyond ~500 words — split into linked pages instead
- Every claim that comes from a source should be traceable to a `wiki/raw/` file

## Spec storage convention

Design specs for this project go in `wiki/raw/specs/` so they are ingested as raw sources,
bootstrapping the knowledge base from day one.

## Why this works

The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the
bookkeeping. Updating cross-references, keeping summaries current, noting when new data contradicts
old claims, maintaining consistency across dozens of pages. Humans abandon wikis because the
maintenance burden grows faster than the value. LLMs don't get bored, don't forget to update a
cross-reference, and can touch 15 files in one pass.

The human's job is to curate sources, direct the analysis, and ask good questions.
The LLM's job is everything else.

## Tips

- **Obsidian's graph view** is the best way to see the shape of the wiki — what's connected,
  which pages are hubs, which are orphans.
- **Download images locally** to `wiki/raw/assets/` so the LLM can reference them directly.
- The wiki is just a git repo of markdown files — version history and branching for free.
- At small scale the index file is enough for navigation; no embedding infrastructure needed.
  When the wiki grows beyond ~50 pages, consider a local search engine — see `references/search-upgrade.md`
  in the `init-llm-wiki` skill directory for options and integration guidance.
