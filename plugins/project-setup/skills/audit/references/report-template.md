# Report Template

This is the exact structure the orchestrator uses to synthesize the four subagents' findings into one report. Follow it — don't invent a different shape per run, since a consistent format is what makes repeat audits comparable over time.

```markdown
# Claude Code Setup Audit — <project name>

<one-line session-freshness result, e.g. "Session freshness: OK (started N minutes ago)" or the refusal message if the gate failed>

<If the gate failed, STOP HERE. Nothing below this line exists in a failed-gate report.>

## Summary

<2-3 sentences max: overall health impression, count of H/M/L findings, the single most important thing to fix if there is one. Nothing else — elaboration belongs in the finding lines below, not here.>

## Config & Permissions

<Findings from that subagent, each as exactly one line:>
- **[SEVERITY] [MARKER]** <one-clause finding> — <one-clause why>. <file:key if applicable>

<Include [OK] findings, not just problems — but each [OK] line is a single short clause too, e.g. "- **[OK]** No secrets found in either settings file.">

## Plugins & Skills Coverage

<Same one-line-per-finding format. Include the reputation tier called out for anything non-official, any gap candidates found (reputation-vetted), and required-MCP connected/authorized status — fold the tier/gap/MCP detail into the same single line, don't add a second sentence.>

## CLAUDE.md Structure

<Same format. End this section with one line noting that content quality is out of scope, delegated to `claude-md-management:claude-md-improver`.>

## Automation Opportunities

<Same format, capped at M severity. Each finding includes an explicit delegation line naming `claude-code-setup:claude-automation-recommender` — fold it into the same line, don't add a second sentence. OK for this section to be empty — say "no automation gaps surfaced" rather than omitting the section.>

## What this audit didn't judge

- CLAUDE.md content accuracy/quality — see `claude-md-management:claude-md-improver`
- Concrete hook/subagent/MCP/rule design — see `claude-code-setup:claude-automation-recommender`
```

The report body ends at "## What this audit didn't judge". Nothing else is printed into the markdown — no closing prompts, no orchestrator asides. The save/apply-fixes decisions happen afterward as real interactive tool calls (see `SKILL.md` Step 6), not as text the user reads and replies to in prose.

## Formatting rules

- Order findings within each section by severity (H, then M, then L) — the user should hit the important stuff first without scanning.
- **Every finding is exactly one line**: severity, marker, one clause statement, one clause why, location. No second paragraph, no elaboration on compounding detail, no per-finding process commentary. If a subagent's finding runs long, compress it — don't pass verbose prose through to the report. If something genuinely needs more explanation than one line allows, that's a signal to raise it with the user directly in chat, not to expand the report line.
- No orchestrator meta-commentary embedded in the report body (e.g. "this contradicts the rubric, flagging for review") — that kind of process/judgment-call flag belongs in a chat message around the tool call, never written into the report text itself. The report is findings only.
- Don't omit a section because it came back empty. An empty section with "no findings" is itself informative (it means that category checked out clean) — silently dropping the header reads as "this category wasn't checked at all."
- If a `[FIX]` finding turns out, on reflection during synthesis, to touch a secret or require judgment the subagent didn't have visibility into, downgrade it to `[WARN]` before it reaches the user rather than offering to auto-apply something risky. The subagent's marker is a strong signal, not a binding instruction — the orchestrator is the last checkpoint before something gets offered as auto-applicable.
- **Resolution tag:** once Step 6 applies a finding, its line gets `— fixed this run` appended (never delete the line). A line without that tag is, by definition, still open — that's how "what's left to fix" is read off the report without needing a separate tracking structure.
