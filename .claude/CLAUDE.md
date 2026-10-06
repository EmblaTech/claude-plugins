# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin marketplace** for the Embla organisation. It provides shared skills that other Embla repos install to get AI-assisted developer workflows (Jira integration, PR review, branch/commit conventions, sprint planning, deployment).

The marketplace manifest is `.claude-plugin/marketplace.json`. Each plugin lives in `plugins/<name>/`:

```
plugins/<plugin-name>/
  .claude-plugin/plugin.json   ← name, version, description
  agents/*.md                  ← named subagent types (embla-core only)
  skills/<skill-name>/
    SKILL.md                   ← entry point (frontmatter: name, description)
    references/                ← loaded only when SKILL.md says "read references/foo.md"
```

## Marketplace plugins

New plugins are added only when they ship at least one working skill — no placeholder stubs.

| Plugin | Description | Status |
|---|---|---|
| `embla-core` | End-to-end dev lifecycle: Jira, PR review, deploy, sprint planning | Active — full skill set (below) |
| `project-setup` | Configure and audit a project's Claude Code setup; review session history for context/delegation/verification/memory discipline | Active — `audit`, `session-review`, `setup-openwiki`; `config` (moving from `embla-core`) planned |
| `grc-gdpr` | GDPR (EU privacy) compliance | Vendored from an MIT upstream with local citation patches — edit via re-sync + patches in `docs/grc-upstream.md`, not in place |

GRC frameworks ship one plugin per framework so consumers only pay context for what they install; `docs/grc-upstream.md` covers the source commit, patches to re-apply, adding a framework, and re-sync.

## Enabled plugins (settings.json)

Each plugin in `.claude/settings.json` was added deliberately — understand its role before touching the settings.

| Plugin | Fires | Why we use it |
|---|---|---|
| `security-guidance` | Passive, on every `Edit`/`Write` | Plugins execute shell and process external input — early warning on dangerous patterns |
| `superpowers` | Auto — almost every non-trivial task | Core discipline: brainstorming, planning, TDD, debugging, worktrees |
| `context7` | Auto — when library/SDK docs are needed | Keeps API references current |
| `atlassian` | Auto — any Jira/Confluence operation | Testing `embla-core` skills against projects whose `embla.json` uses Jira |
| `frontend-design` | Auto — UI or artifact output | Design direction |
| `code-review` | Auto — reviewing a PR or diff | Reviewing our own plugin PRs |
| `claude-code-setup` | Auto — "set up/optimize Claude Code", "what automations would help" | Read-only scan recommending MCP servers, hooks, skills, subagents |
| `claude-md-management` | Auto (`claude-md-improver`) + `/claude-md-management:revise-claude-md` | Grades CLAUDE.md files A–F; captures session learnings |
| `plugin-dev` | Command only: `/plugin-dev:create-plugin` | Scaffold and quality gate (plugin-validator, skill-reviewer agents) for new plugins |
| `mcp-server-dev` | Command only: `/mcp-server-dev:build-mcp-server` | When a plugin exposes MCP tools or wraps an external API |
| `agent-sdk-dev` | Command only: `/agent-sdk-dev:new-sdk-app` | When a plugin needs a standalone Agent SDK app |
| `hookify` | Command only: `/hookify`, `:list`, `:configure` | Hook generation from conversation patterns |
| `commit-commands` | Command only: `/commit`, `/commit-push-pr`, `/clean_gone` | Commit and PR workflow |
| `mattpocock-skills` | `/mattpocock-skills:writing-for-agents` | Authoring guide for skills and agents (see "Adding or editing a skill") |

Personal preferences go in `CLAUDE.local.md` (gitignored, repo root).

## embla-core skills (the primary plugin)

Invoked as `/embla-core:<skill>` unless noted.

| Skill | Purpose |
|---|---|
| `config` | Setup/update `.claude/embla.json` for a project |
| `develop <JIRA-ID>` | Full story workflow: fetch → branch → brainstorm → TDD → commit → PR → Done |
| `jira` | `/jira spec <path>`, `/jira story` etc. — create Jira epics/stories/tasks from a spec or free text |
| `sprint-plan` | 4-phase sprint planner: goal → stories → assign → create in Jira |
| `pr-review <PR_ID>` | 7-agent parallel PR review (see architecture below) |
| `deploy <PR_ID>` | Trigger CI/CD, poll build, transition Jira → Ready for QA |
| `pipeline` / `pipeline check` | Set up/audit `bitbucket-pipelines.yml` + `.mcp.json` for automated PR review; auto-invoked by `config` Phase 5 |
| `resolve-pr-feedback <PR_ID>` | Work through PR review comments after a rejection: explain, fix, commit, resolve comments, reassign to lead |
| `init-llm-wiki` | Bootstrap Karpathy's LLM Wiki pattern as a dev knowledge base |
| `develop-auto` | Pipeline-only: headless counterpart to `develop`, run by the `ai-develop` Bitbucket pipeline when a Jira comment tags `@Claudedev`. Never invoked by a user |

### CI plugin pin

Generated pipelines clone this repo at a pinned commit for `--plugin-dir`, not `main`, so they never pick up unreviewed changes. Two templates carry independent pins:

- `bitbucket-pipelines-template.yml` (AI PR Review) — bump when a change touches `pr-review`'s files.
- `bitbucket-pipelines-ai-develop-template.yml` (`ai-develop`) — bump when a change touches `develop-auto`'s files.

Both live in `plugins/embla-core/skills/pipeline/references/`; the bump process is "Updating the pinned plugin commit" in that skill's `pipeline-templates.md`.

### pr-review architecture

Up to **7 parallel subagents**, registered as named subagent types in `plugins/embla-core/agents/*.md` (`embla-core:code-quality`, `security`, `performance`, `risk`, `coverage`, `dependency`, `requirement`) and invoked by name from Phase 3 of `skills/pr-review/SKILL.md` with data-only prompts.

- **Phase 2.7 (Agent Relevance Judgment)** picks the subset per PR: the orchestrator judges each agent against the diff and that agent's own "Spawn when" criteria (in its `agents/*.md` description), with no fixed rule set. Every exclusion is logged with a one-line reason, since `pipeline` mode runs unattended.
- A haiku subagent handles eligibility (Phase 1) and confidence scoring (Phase 4).
- **Phase 6 Step A** posts comments through `embla-core:poster` (`tools:` scoped to `mcp__bitbucket__bb_post` only) — always this named subagent, since the data traces back to a reviewed PR's diff.

Phases: eligibility → size gate → fetch PR data → agent relevance judgment → review agents → dedup → confidence scoring → coverage gate → format → post/notify → write local file.

`--mode`: `dev` (display only), `lead` (interactive post prompt), `pipeline` (auto-post + Teams notification).

## Central config: `.claude/embla.json`

All embla-core skills read `.claude/embla.json` in the consuming project (not this repo). Full schema: `plugins/embla-core/skills/config/SKILL.md`. Resolution order for every field: `embla.json` → `settings.json` → env var → hardcoded default.

Key sections: `repo` (VCS provider/workspace/slug), `tracker.jira` (siteUrl, cloudId, projectKey, customFields, issueTypes, statuses), `sprint`, branch format fields, `commitMessageFormat`, `team` (lead/qa/ui/devops/dev arrays), notification/threshold settings.

## AI output watermark

Skills that produce a persistent artifact — a PR description, Jira issue/comment, or posted review comment — end it with this footer as its literal last line:

```
🤖 Crafted by Claude AI
```

Currently on: `develop` (PR description), `jira` (every issue description, in `references/formats.md`), `deploy` (Jira deploy comment), `resolve-pr-feedback` (Jira completion comment), `develop-auto` (Jira abort comment). `pr-review` and the `pipeline` CI template keep their own footer, `🤖 Generated with Claude Code` — each output carries exactly one footer. Any new skill posting a similar artifact adds `Crafted by Claude AI`.

## Repo workflow

These conventions apply to work on this repo; consuming projects set their own in `embla.json`.

- **Hosting:** GitHub (`github.com/EmblaTech/claude-plugins`) — use the `gh` CLI for PRs and issues. Work is tracked as GitHub issues on the team's GitHub Project.
- **Branches:** `<type>/<short-description>` (e.g. `docs/update-claude-md`).
- **Commits:** Conventional Commits with skill scope — `<type>(<skill-name>): <short description>`. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`.
- **PR description** (generated by `/commit-push-pr`):

```markdown
## Summary
<bullet point per meaningful change — derived from commit messages>

## Motivation
<why this change was needed — what problem it solves or workflow gap it fills>

## Test Plan
<checklist of verification steps>

## Linked Issue
<`Closes #<n>` for the GitHub issue this PR resolves; write N/A if none>
```

### Skill to use per artifact

Invoke the skill before touching files.

| What you're writing | Skill |
|---|---|
| `SKILL.md`, `references/` file, or agent definition (new or edited) | `/mattpocock-skills:writing-for-agents` |
| Design spec (`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`) | `/superpowers:brainstorming` |
| Implementation plan (`docs/superpowers/plans/`) | `/superpowers:writing-plans` |
| New plugin scaffold | `/plugin-dev:create-plugin` |
| New MCP integration | `/mcp-server-dev:build-mcp-server` |
| New Agent SDK app | `/agent-sdk-dev:new-sdk-app` |
| CLAUDE.md update / audit | `/claude-md-management:revise-claude-md` / `claude-md-improver` |
| Commit and PR | `/commit-push-pr` |

## Adding or editing a skill

`/mattpocock-skills:writing-for-agents` is the single authoring guide for skills and agents here; its rules take precedence over `superpowers:writing-skills` and `plugin-dev:skill-development` when those also match. The `SKILL.md` frontmatter `description` decides when Claude Code auto-triggers the skill — keep it precise and trigger-phrase-rich.

### Skill authoring best practices

`docs/best-practices/` condenses Anthropic's skill-authoring guide for this repo. Before creating or editing a `SKILL.md`, reference file, agent definition, or plugin/marketplace description, read the file for each part of the work:

| Working on | Read |
|---|---|
| `name`, `description`, plugin/agent descriptions | `docs/best-practices/frontmatter-and-naming.md` |
| SKILL.md layout, splitting into `references/`, progressive disclosure | `docs/best-practices/structure-and-references.md` |
| Steps, workflows, templates, examples | `docs/best-practices/writing-instructions.md` |
| Bundled scripts, dependencies, MCP tool names | `docs/best-practices/scripts-and-tools.md` |
| Testing a new or changed skill | `docs/best-practices/evaluation.md` |

The work is done when every item in `docs/best-practices/checklist.md` is ticked or marked N/A.

**Every change to a plugin** (skill content, `plugin.json`, its `marketplace.json` description) bumps `version` in `plugins/<plugin-name>/.claude-plugin/plugin.json`. Auto-update pulls a plugin only when its version changes; an unbumped version leaves consumers on the old copy.

- **New skill in an existing plugin:** create `skills/<new-skill>/SKILL.md` (+ `references/`), bump the plugin version. `marketplace.json` stays unchanged — it points to plugins, not skills.
- **New plugin:** create `plugins/<new-plugin>/.claude-plugin/plugin.json` and at least one `skills/<skill-name>/SKILL.md`, and add its entry to `.claude-plugin/marketplace.json` in the same PR (the entry is inert until merged).

## Keeping CLAUDE.md current

A **major change** is any change that leaves this file wrong or incomplete:
- a plugin, skill, or agent added, removed, or renamed
- a plugin enabled or disabled in `.claude/settings.json`
- a change to this repo's workflow: hosting, issue tracking, branch/commit/PR conventions, or the tool used for an artifact type
- a change to a cross-skill rule documented here (watermark, CI plugin pin, `embla.json` resolution order)

Edit this file only through `claude-md-management` (`/claude-md-management:revise-claude-md` to update, `claude-md-improver` to audit), even when `writing-for-agents` matches: before a major change's PR, run `revise-claude-md` and commit its edits on the same branch until every section mentioning the change matches the new state, keeping the file under 200 lines.
