# Writing instructions

Source: Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), read 2026-10-06. Condensed and adapted for this repo.

## Contents
- Concise by default
- Degrees of freedom
- Workflows with checklists
- Feedback loops
- Templates and examples
- Conditional workflows
- Terminology, defaults, and dates

## Concise by default

Claude is already very capable; add only what it lacks. For each paragraph ask: does Claude need this explanation, and does it justify its token cost? A 50-token code snippet beats 150 tokens explaining what a PDF is and why a library helps.

## Degrees of freedom

Match specificity to how fragile the task is:

| Freedom | Form | Use when |
|---|---|---|
| High | Numbered prose steps | Many approaches are valid; context decides (code review) |
| Medium | Pseudocode or a parameterised script | A preferred pattern exists, some variation is fine (report generation) |
| Low | One exact command, "run exactly this" | Fragile, order-critical, consistency matters (migrations, deploys) |

Narrow bridge with cliffs on both sides: exact guardrails. Open field: a direction, then trust.

## Workflows with checklists

Break complex tasks into numbered steps. For long ones, give a checklist Claude copies into its reply and ticks off:

```
Task Progress:
- [ ] Step 1: Analyze the form (run analyze_form.py)
- [ ] Step 2: Create field mapping (edit fields.json)
- [ ] Step 3: Validate mapping (run validate_fields.py)
- [ ] Step 4: Fill the form (run fill_form.py)
- [ ] Step 5: Verify output (run verify_output.py)
```

Each step then gets its own short section with the exact command and what "done" looks like, including where to loop back ("If verification fails, return to Step 2").

## Feedback loops

Run validator → fix errors → repeat; proceed only when it passes. The validator can be a script (`validate.py`) or a reference document (a style guide Claude checks against). This pattern greatly improves output quality on any quality-critical step.

## Templates and examples

- **Strict template** for fixed formats (API payloads, PR descriptions, Jira bodies): "ALWAYS use this exact structure" plus the template.
- **Flexible template** when adaptation helps: "a sensible default; adjust sections to the analysis".
- **Input/output pairs** when quality depends on style: two or three concrete examples convey tone and detail better than a description. Keep examples concrete, never abstract placeholders alone.

## Conditional workflows

Put the decision point first, then one branch per case:

```markdown
1. Determine the modification type:
   **Creating new content?** → follow "Creation workflow"
   **Editing existing content?** → follow "Editing workflow"
```

When branches grow large, move each into its own reference file and point to it from the decision.

## Terminology, defaults, and dates

- **One term per concept** throughout a skill: always "field", always "extract", always "API endpoint".
- **One default plus one escape hatch** instead of a menu: "Use pdfplumber for text extraction. For scanned PDFs needing OCR, use pdf2image with pytesseract."
- **Timeless instructions.** Describe the current method only; move superseded methods into a collapsed "Old patterns" section:

```markdown
## Current method
Use the v2 endpoint: `api.example.com/v2/messages`

## Old patterns
<details><summary>Legacy v1 API (deprecated 2025-08)</summary>
`api.example.com/v1/messages` — no longer supported.
</details>
```
