Threshold = the Publish threshold already resolved in SKILL.md's Runtime Resolution table (REVIEW_PUBLISH_THRESHOLD env → embla.json → settings.json → 60) — do not re-derive it here.

# Phase 4 — Confidence Scoring

Dispatch a single Haiku subagent via Agent tool (`subagent_type: general-purpose, model: haiku`) with ALL deduped issues and `open_comments` in one prompt. One request, one response, one map.

## Prompt template

```
You are scoring code review issues for confidence. Return a JSON object mapping issue index → score + reason.

PR Title: {title}
PR Description: {description}
Relevant CLAUDE.md excerpts: {claude_md_excerpts}
Open (unresolved) existing PR comments: {open_comments}

Issues (indexed from 0):
[0] file={file}, line={line}, severity={severity}
    description: {description}
[1] ...
[...]

Rubric (apply to each issue):
0   — False positive. Does not hold up to light scrutiny, or is pre-existing.
25  — Uncertain. Might be real, might not. Cannot verify from the diff alone.
50  — Confirmed. Verifiable in the diff. May be minor or infrequent.
75  — High confidence. Clearly real, will be hit in practice. Important to fix.
100 — Certain. Directly confirmed. Happens frequently. Critical.

Guidance:
- Pre-existing issues (not introduced in this PR): score 0
- Things a linter/typechecker catches: score 0
- Issues flagged based on CLAUDE.md that aren't actually present in the diff: score 0
- Issues likely intentional given the PR description: score 25 or lower
- Project-specific rule violations (`any` usage, side effects in map, swallowed errors): score 75–100
- If an issue was confirmed resolved by a later commit/comment already in the PR discussion: score 0
- If an issue matches an OPEN (unresolved) existing comment — same `file`, `line` within ±3, and the same underlying concern — do NOT score it 0 for that reason alone. Score it normally on its own merits, but additionally set `is_duplicate_of_open: true` and `matched_comment: "{file}:{line}"` (the existing open comment's location). This issue is real and must still be tracked — it must not be re-posted as a new inline comment. When rendering reports, resolve `{date}` by looking up `matched_comment`'s `file:line` against the corresponding entry in `open_comments` (which carries `date`, per Phase 2.2).

TONE CHECK: also return a boolean `tone_ok` per issue. `false` if the description contains "consider", "maybe", "perhaps", "might want to", or similar hedging — see output-format.md's Voice & Tone section for the required direct style. If `tone_ok: false`, include a rewritten `polished` description that removes hedging.

Return a single JSON object, no prose:
{
  "0": {"score": 90, "reason": "Direct any usage confirmed", "tone_ok": true},
  "1": {"score": 80, "reason": "...", "tone_ok": false, "polished": "..."},
  "2": {"score": 70, "reason": "Still missing trailing comma per prior review", "tone_ok": true, "is_duplicate_of_open": true, "matched_comment": "src/foo.ts:42"},
  ...
}
```
