# Scripts and tools

Source: Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), read 2026-10-06. Condensed and adapted for this repo.

## Contents
- Bundle utility scripts
- Run or read
- Solve, don't defer
- Plan, validate, execute
- Visual analysis
- Dependencies
- MCP tool names

## Bundle utility scripts

Ship a script for any deterministic operation instead of asking Claude to generate code each run. Pre-made scripts are more reliable, consistent across runs, and cheap: only their output enters context. Document each one in SKILL.md with its command and output shape:

````markdown
**analyze_form.py**: Extract all form fields from a PDF
```bash
python scripts/analyze_form.py input.pdf > fields.json
```
Output: `{"field_name": {"type": "text", "x": 100, "y": 200}}`
````

## Run or read

State the intent for every script:
- **Run** (the usual case): "Run `analyze_form.py` to extract fields."
- **Read as reference** (for complex logic Claude must understand): "See `analyze_form.py` for the extraction algorithm."

## Solve, don't defer

Scripts handle their own error conditions: catch the expected failure, fall back to a sensible default, and print what happened. A script that just crashes leaves Claude guessing.

Every constant carries a comment justifying its value:

```python
# HTTP requests typically complete within 30 seconds;
# the margin covers slow connections
REQUEST_TIMEOUT = 30
```

If the author cannot justify a value, Claude cannot either.

## Plan, validate, execute

For batch, destructive, or high-stakes operations, insert a checkable intermediate artifact:

analyze → **write plan file** (e.g. `changes.json`) → **validate plan with a script** → execute → verify

Validation catches errors before anything changes, the plan is reversible, and errors point at specific problems. Make validator messages specific and actionable: "Field 'signature_date' not found. Available fields: customer_name, order_total, signature_date_signed".

## Visual analysis

When input can be rendered as images (PDF forms, layouts, diagrams), convert it and let Claude inspect the pages visually.

## Dependencies

List every required package and CLI in SKILL.md with its install command; assume nothing is preinstalled:

````markdown
Install the required package: `pip install pypdf`
```python
from pypdf import PdfReader
```
````

Consumers of this marketplace run skills in Claude Code on developer machines and in Bitbucket Pipelines containers, so a skill also names the tools the pipeline image must provide.

## MCP tool names

Name MCP tools fully qualified so Claude finds them when several servers are connected. In Claude Code the form is `mcp__<server>__<tool>`:

```markdown
Post each comment with `mcp__bitbucket__bb_post`.
```

The source page shows the API form `ServerName:tool_name`; in this repo, use the Claude Code form.
