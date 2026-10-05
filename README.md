# Embla Claude Plugins

A [Claude Code](https://docs.claude.com/en/docs/claude-code) **plugin marketplace** for the Embla organisation. It ships shared skills that other Embla repos install to get AI-assisted developer workflows: Jira integration, PR review, branch/commit conventions, sprint planning, deployment, Claude Code setup audits, and GDPR compliance.

## Contents

- [Plugins](#plugins)
- [Installation](#installation)
- [Getting started](#getting-started)
- [Plugin reference](#plugin-reference)
- [Repository layout](#repository-layout)
- [Contributing](#contributing)

## Plugins

| Plugin | Version | What it gives you |
|---|---|---|
| [`embla-core`](plugins/embla-core) | 1.5.1 | End-to-end dev lifecycle: Jira, story development, PR review, deploy, sprint planning, CI pipelines |
| [`project-setup`](plugins/project-setup) | 0.3.0 | Audit a project's Claude Code setup, review session history, set up OpenWiki |
| [`grc-gdpr`](plugins/grc-gdpr) | 1.0.3 | GDPR compliance: code/system audits, privacy notices, DPAs, DPIAs, article-cited Q&A (vendored, MIT) |

Install only the plugins you need. Each one adds its skill descriptions to every session's context.

## Installation

### 1. Add the marketplace

From inside Claude Code in the consuming repo:

```
/plugin marketplace add EmblaTech/claude-plugins
```

### 2. Install plugins

```
/plugin install embla-core@embla-claude-plugins
/plugin install project-setup@embla-claude-plugins
/plugin install grc-gdpr@embla-claude-plugins
```

### 3. Share the setup with your team (recommended)

Commit the marketplace and enabled plugins to the consuming repo's `.claude/settings.json` so every developer gets them automatically:

```json
{
  "extraKnownMarketplaces": {
    "embla-claude-plugins": {
      "source": { "source": "github", "repo": "EmblaTech/claude-plugins" }
    }
  },
  "enabledPlugins": {
    "embla-core@embla-claude-plugins": true,
    "project-setup@embla-claude-plugins": true
  }
}
```

Plugins auto-update when their `version` changes in this repo.

## Getting started

1. **Configure the project.** Run `/embla-core:config`. It creates `.claude/embla.json` in your repo with the repo, Jira, sprint, branch-format, and team settings that the other `embla-core` skills read.
2. **Check your Claude Code setup.** Ask Claude to "audit my Claude Code setup". This runs `project-setup:audit`.
3. **Start a story.** Run `/embla-core:develop EM-1234`.

## Plugin reference

### `embla-core`

| Skill | Invocation | Purpose |
|---|---|---|
| `config` | `/embla-core:config` | Create or update `.claude/embla.json` for a project |
| `develop` | `/embla-core:develop <JIRA-ID>` | Full story workflow: fetch, branch, brainstorm, TDD, commit, PR, then Done |
| `jira` | `/jira spec <path>`, `/jira story`, `/jira bug` … | Create Jira epics, stories, tasks, and bugs from a spec or free text |
| `sprint-plan` | `/embla-core:sprint-plan` | Plan a sprint in 4 phases: goal, stories, assignment, then creation in Jira |
| `pr-review` | `/embla-core:pr-review <PR_ID> [--mode dev\|lead\|pipeline]` | Bitbucket PR review with up to 7 parallel agents (code quality, security, performance, risk, coverage, dependency, requirement) |
| `resolve-pr-feedback` | `/embla-core:resolve-pr-feedback <PR_ID>` | Work through review comments after a rejection: explain, fix, commit, resolve, reassign |
| `deploy` | `/embla-core:deploy <PR_ID>` | Trigger CI/CD, poll the build, move Jira to Ready for QA |
| `pipeline` | `/embla-core:pipeline` or `/embla-core:pipeline check` | Set up or audit `bitbucket-pipelines.yml` and `.mcp.json` for AI PR review and `ai-develop` |
| `init-llm-wiki` | `/embla-core:init-llm-wiki` | Bootstrap a Karpathy-style LLM Wiki as a dev knowledge base |
| `develop-auto` | *CI only* | Headless version of `develop`, triggered by the `ai-develop` pipeline when a Jira comment tags `@Claudedev` |

**Configuration.** Every `embla-core` skill reads `.claude/embla.json` in the consuming project. Each field resolves in this order: `embla.json`, then `settings.json`, then an env var, then a hardcoded default. The full schema is in [`plugins/embla-core/skills/config/SKILL.md`](plugins/embla-core/skills/config/SKILL.md).

**Conventions enforced:**

- Branches: `feature/{JIRA-ID}/short-description`, `patch/{JIRA-ID}/short-description`, `release/{version}` (formats are configurable per project in `embla.json`)
- Commits: Conventional Commits, e.g. `feat(scope/EM-1234): short description`

### `project-setup`

| Skill | Invocation | Purpose |
|---|---|---|
| `audit` | Ask to "audit my Claude Code setup" | Severity-tagged report covering settings placement, MCP health, permissions, plugin drift, stack coverage, and CLAUDE.md placement |
| `session-review` | `/project-setup:session-review` | Review session history for context, delegation, verification, and memory discipline, with quoted citations |
| `setup-openwiki` | `/project-setup:setup-openwiki` | Install LangChain OpenWiki's host-driven integration (no API key) |

A `config` skill is planned. It will move here from `embla-core`.

### `grc-gdpr`

| Skill | Invocation | Purpose |
|---|---|---|
| `gdpr-compliance` | Mention GDPR, data protection, DPIA, etc. | Audit code and systems, draft privacy notices and DPAs, review data flows, answer questions with article citations |

This plugin is vendored from an MIT-licensed upstream with local citation patches. Don't edit it in place. Follow the re-sync process in [`docs/grc-upstream.md`](docs/grc-upstream.md).

## Repository layout

```
.claude-plugin/marketplace.json      Marketplace manifest (lists all plugins)
plugins/<plugin-name>/
  .claude-plugin/plugin.json         Plugin name, version, description
  agents/*.md                        Named subagents (e.g. pr-review's 7 reviewers)
  skills/<skill-name>/
    SKILL.md                         Skill entry point (frontmatter: name, description)
    references/                      Supporting files, loaded only when SKILL.md says so
docs/                                Upstream/vendoring notes
.claude/                             This repo's own Claude Code settings and CLAUDE.md
```

## Contributing

Contributor guidance lives in [`.claude/CLAUDE.md`](.claude/CLAUDE.md). The rules you're most likely to hit:

- **Always bump the plugin version.** Any change to a plugin must bump `version` in its `plugin.json`. Without the bump, consumers keep the old copy.
- **New skill in an existing plugin:** add `skills/<name>/SKILL.md` and bump the version. `marketplace.json` doesn't change.
- **New plugin:** add `plugins/<name>/.claude-plugin/plugin.json`, at least one working skill, and a `marketplace.json` entry, all in the same PR. Placeholder stubs aren't accepted.
- **CI pins:** generated pipelines clone this repo at a pinned commit. If a change to `pr-review` or `develop-auto` should reach existing pipelines, bump the pin in that skill's pipeline template. See the `pipeline` skill's `pipeline-templates.md`.
- **Use the right authoring skill:** `/writing-for-agents` (from mattpocock-skills) for new and edited skills, `/plugin-dev:create-plugin` for new plugins.
- **PR descriptions** follow the format in CLAUDE.md: Summary, Motivation, Test Plan, Jira Ticket.
