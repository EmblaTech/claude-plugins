---
status: accepted (spike passed 2026-11-04)
---

# The page reads the tracker live by label and keeps no copy

The page queries the tracker for open issues labelled `oz:on` through the viewer's claude.ai GitHub connector (artifact `mcp` capability, polled every ≥30 s), and writes ✓ / ✕ / ⏸ and comments straight back. Routines decide what is on the dashboard by setting the label and the `Priority` issue field, so the page has no selection logic and is never republished for data. The rich brief lives in the issue body under fixed Markdown headings.

## Considered options

- **Snapshot.** A routine writes a curated JSON of today's cards into the artifact `db`. This works without a connector, but it duplicates the tracker's structure in a second store and needs an inbox to carry clicks back. It is the fallback if the spike fails.
- **Baked into the HTML (v1).** Every change needs a republish, and parallel runs collided.
- **Supabase or another external database.** The artifact CSP blocks fetch and WebSocket to other hosts.

## Consequences

- It only works for a viewer who has authorised the GitHub connector, which is fine for a personal page.
- Mode A needs a second read path in the page (`db` `onSnapshot`) behind the same rendering.

- The connector (`api.githubcopilot.com/mcp`) exposes issue tools but no Projects tools, which is why ordering and snooze use issue fields rather than a Project.
