# Skill and agent checklist

Source: Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), read 2026-10-06. Condensed and adapted for this repo.

Run through every item before committing a new or edited skill, agent definition, or reference file. Mark items that do not apply (e.g. no scripts) as N/A.

## Core quality
- [ ] `name`: ≤64 chars, lowercase/numbers/hyphens, no `anthropic`/`claude`, matches the plugin's naming pattern
- [ ] `description`: ≤1,024 chars, third person, states what it does and when to use it, includes key terms
- [ ] SKILL.md body under 500 lines; extra detail in reference files
- [ ] Every reference file linked directly from SKILL.md, with the condition for reading it
- [ ] Every reference file over 100 lines opens with `## Contents` matching its `##` headings
- [ ] Consistent terminology; one default approach plus at most one fallback
- [ ] No time-sensitive instructions (superseded methods in "Old patterns")
- [ ] Examples are concrete
- [ ] Workflows have numbered steps with a clear done condition

## Code and scripts
- [ ] Scripts handle their own errors with helpful messages
- [ ] Every constant justified in a comment
- [ ] Each script marked as run or read
- [ ] Required packages and CLIs listed with install commands
- [ ] Forward slashes in every path
- [ ] MCP tools named `mcp__<server>__<tool>`
- [ ] Validation step or plan-validate-execute loop for destructive or batch operations

## Testing
- [ ] Three evaluation scenarios recorded in the PR Test Plan
- [ ] Tested on each model the skill runs on
- [ ] Tested with real usage, not only the scenarios

## Repo rules (from CLAUDE.md)
- [ ] Plugin `version` bumped in `plugins/<plugin>/.claude-plugin/plugin.json`
- [ ] New plugin registered in `.claude-plugin/marketplace.json`
