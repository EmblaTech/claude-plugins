# Structure and references

Source: Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), read 2026-10-06. Condensed and adapted for this repo.

## Contents
- How Claude loads a skill
- SKILL.md size budget
- Progressive disclosure patterns
- References one level deep
- Table of contents in long reference files
- File naming and layout
- Signs the structure is wrong

## How Claude loads a skill

1. **Metadata:** `name` and `description` of every skill sit in the system prompt from startup.
2. **SKILL.md:** read from disk only when the skill becomes relevant.
3. **Reference files:** read only when SKILL.md points Claude to them for the current task.
4. **Scripts:** executed, not read; only their output enters context.

Files on disk cost zero context until read, so bundle complete reference material freely. Once read, every token competes with the conversation, so SKILL.md itself stays lean.

## SKILL.md size budget

- Body under **500 lines**. Split into reference files as it approaches that.
- SKILL.md is the table of contents: overview, the steps every run needs, and pointers to the rest.

## Progressive disclosure patterns

**High-level guide with references.** Quick start inline; advanced topics behind links.

```markdown
## Advanced features
**Form filling**: See [FORMS.md](FORMS.md) for the complete guide
**API reference**: See [REFERENCE.md](REFERENCE.md) for all methods
```

**Domain split.** One reference file per domain, so a sales question loads only `reference/sales.md`, never finance or marketing.

```
bigquery-skill/
  SKILL.md            ← overview + one line per domain file
  reference/finance.md
  reference/sales.md
  reference/product.md
```

**Conditional details.** Inline the common path; link the rare one with its condition.

```markdown
For simple edits, modify the XML directly.
**For tracked changes**: See [REDLINING.md](REDLINING.md)
```

Every pointer states *when* to read the file, not just that it exists. Large conditional workflows also move to their own file, with SKILL.md telling Claude which file matches which task.

## References one level deep

Link every reference file **directly from SKILL.md**. When Claude reaches a file through another reference file, it may only preview it (`head -100`) and miss content.

```
Good:  SKILL.md → advanced.md
       SKILL.md → reference.md
       SKILL.md → examples.md

Bad:   SKILL.md → advanced.md → details.md
```

If a reference file needs another file, add that file's pointer to SKILL.md instead.

## Table of contents in long reference files

Any reference file over **100 lines** opens with a `## Contents` list. Each entry matches a `##` heading further down, in the same order, so a partial read still shows the file's full scope and Claude can jump to the section it needs.

```markdown
# API Reference

## Contents
- Authentication and setup
- Core methods

## Authentication and setup
...
## Core methods
...
```

## File naming and layout

- Name files by content: `form_validation_rules.md`, not `doc2.md`.
- Group by domain or feature: `reference/finance.md`, not `docs/file1.md`.
- Forward slashes in every path (`references/guide.md`); backslash paths break on the Linux CI runners.
- In this repo, supporting files live in the skill's `references/` folder (see CLAUDE.md).

## Signs the structure is wrong

Watch how Claude navigates a skill in real runs:
- **Unexpected read order:** the structure is less intuitive than assumed.
- **Missed references:** the pointer wording is too weak; make the condition explicit.
- **Same file read every run:** that content belongs in SKILL.md.
- **File never read:** unnecessary, or its pointer is poorly signalled.
