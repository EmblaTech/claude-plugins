# Frontmatter and naming

Source: Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), read 2026-10-06. Condensed and adapted for this repo.

At startup Claude Code loads only `name` and `description` from every installed skill, then picks the right skill from 100+ candidates using those two fields alone. They decide whether a skill fires at all.

## `name`

Hard limits:
- At most 64 characters.
- Lowercase letters, numbers, and hyphens only.
- No XML tags; no reserved words `anthropic` or `claude`.

Naming pattern, in order of preference:
1. Gerund: `processing-pdfs`, `reviewing-prs`, `writing-documentation`.
2. Noun phrase: `pdf-processing`, `pr-review`.
3. Verb phrase: `process-pdfs`, `review-prs`.

Name the specific activity (`analyzing-spreadsheets`, not `utils`, `helper`, `data`, or `files`). Within one plugin, keep one pattern: existing skills here use short noun or verb phrases (`pr-review`, `sprint-plan`, `deploy`), so a new skill matches its neighbours rather than switching to gerunds. Renaming an existing skill changes its slash command, so leave current names alone.

## `description`

Hard limits:
- Non-empty, at most 1,024 characters.
- No XML tags.

Content:
- **Third person.** The description is injected into the system prompt; a mixed point of view hurts discovery. Write "Reviews Bitbucket PRs…", never "I can help…" or "You can use this to…".
- **What + when.** First what the skill does, then the triggers: "Use when…" followed by concrete situations, file types, and phrases a user would say.
- **Key terms.** Include the nouns the user will actually type (`PDF`, `.xlsx`, `bitbucket-pipelines.yml`, `Jira`).

Good:

```yaml
description: Extracts text and tables from PDF files, fills forms, merges documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

Too vague to select: `Helps with documents`, `Processes data`.

Existing descriptions that open with "Use when…" stay as they are until the skill is next edited; an edit rewrites the description to lead with the third-person "what" sentence. Changing a description changes when the skill triggers, so treat it as a behaviour change and bump the plugin version.

## Agent definitions (`plugins/*/agents/*.md`)

The source page covers skills only; these rules are an Embla adaptation. An agent's `description` is the same kind of selection pointer, so the same rules apply: third person, what + when (for this repo's review agents, the "Spawn when" / "Skip when" criteria), concrete key terms, at most 1,024 characters.

## Plugin and marketplace descriptions

Also an Embla adaptation. `plugin.json` and `.claude-plugin/marketplace.json` descriptions are what a human reads when choosing what to install: state what the plugin does in one sentence with its key terms, third person.
