# Search Upgrade Path

The default wiki query workflow — read `wiki/index.md`, pick relevant pages by name/summary, read
those pages — works well at small scale. As the wiki grows beyond ~50 pages the index gets long,
the LLM reads more pages than necessary, and query quality degrades. This document describes when
and how to upgrade.

## When to upgrade

Signs you've hit the wall:
- Queries miss relevant pages that exist in the wiki
- The LLM reads most of the index before finding useful pages
- `wiki/index.md` is regularly over 300 lines
- Query latency is noticeably slow

## Option: qmd (local markdown search)

`qmd` is a local search engine for markdown wikis. It provides hybrid BM25/vector search with LLM
re-ranking and is available as both a CLI tool and an MCP server.

**Why it fits this wiki pattern:**
- Works directly on the `wiki/pages/` directory — no export or transformation needed
- Hybrid search handles both exact-term queries (BM25) and semantic queries (vector)
- LLM re-ranking improves precision on ambiguous questions
- MCP server mode lets Claude query it as a tool, replacing the manual index-read step

**Integration steps:**

1. Install `qmd` and point it at `wiki/pages/`
2. If using as an MCP server, register it in your project's MCP configuration
3. Update `wiki/CLAUDE.md` to instruct the LLM to use `qmd` for queries instead of reading
   the index manually:

   ```
   ## Query workflow (search-enabled)

   Use the `qmd` MCP tool to find relevant pages. Pass the user's question as the query.
   The tool returns ranked page paths — read the top 3–5 and synthesize an answer with citations.
   Fall back to reading wiki/index.md directly if the tool is unavailable.
   ```

4. Keep `wiki/index.md` — it remains useful as a human-readable catalog and fallback

## Keeping the init step unchanged

The `init-llm-wiki` skill does not install or configure `qmd`. The core scaffold stays zero-dependency
on first run. Add search integration as a follow-up step once the wiki is live and growing.
