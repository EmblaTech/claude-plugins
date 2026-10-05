# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin marketplace** for the Embla organisation. It provides shared skills that other Embla repos install to get AI-assisted developer workflows (Jira integration, PR review, branch/commit conventions, sprint planning, deployment).

The marketplace manifest is `.claude-plugin/marketplace.json`. Each plugin lives in `plugins/<name>/` and has a `.claude-plugin/plugin.json` metadata file plus a `skills/` directory.

## Plugin and skill structure

```
plugins/<plugin-name>/
  .claude-plugin/plugin.json   ← name, version, description
  skills/<skill-name>/
    SKILL.md                   ← skill entry point (frontmatter: name, description)
    references/                ← supporting reference files loaded by SKILL.md
```

The `SKILL.md` frontmatter `description` field is what Claude Code uses to decide when to auto-trigger the skill. Keep it precise and trigger-phrase-rich.

Reference files in `references/` are not loaded automatically — `SKILL.md` must explicitly say "read `references/foo.md`" before using them.

## Marketplace plugins

The marketplace (`marketplace.json`) contains 3 plugins. `embla-core` has a complete skill set; `project-setup` has three working skills (`audit`, `session-review`, `setup-openwiki`; `config` planned); `grc-gdpr` is a single GRC framework skill vendored from an MIT-licensed upstream, with local citation patches — one plugin per framework so consumers only pay context for what they install; see `docs/grc-upstream.md` for the source commit, the local patches to re-apply, how to add another framework, and re-sync steps. New plugins are added only when they ship at least one working skill — no placeholder stubs.

| Plugin | Description | Status |
|---|---|---|
| `embla-core` | End-to-end dev lifecycle: Jira, PR review, deploy, sprint planning | Active — full skills |
| `project-setup` | Configure and audit a project's Claude Code setup (settings, permissions, plugin/skill coverage, CLAUDE.md health); review Claude Code session history for context/delegation/verification/memory discipline | Active — `audit` and `session-review` skills shipped, `config` (moving from `embla-core`) planned |
| `grc-gdpr` | GDPR (EU privacy) compliance | Active — vendored (MIT); edit via re-sync + local patches in `docs/grc-upstream.md`, not in place |

## Official plugins (settings.json)

These are Anthropic-published plugins enabled in `.claude/settings.json`. Each was added deliberately — understand their role before touching the settings.

| Plugin | Key commands / behaviour | Why we use it |
|---|---|---|
| `plugin-dev` | `/plugin-dev:create-plugin` (8-phase), plugin-validator agent, skill-reviewer agent, 7 sub-skills | Primary scaffold and quality gate for building new Embla plugins |
| `mcp-server-dev` | MCP server scaffolding + validation for Python (FastMCP) and TypeScript (MCP SDK) | Used when a plugin needs to expose MCP tools or wrap an external API |
| `hookify` | `/hookify`, `/hookify:list`, `/hookify:configure`, conversation-analyzer agent | Rapid hook generation from conversation patterns |
| `agent-sdk-dev` | `/agent-sdk-dev:new-sdk-app`, Python and TypeScript validator agents | Used when a plugin requires a standalone Agent SDK application |
| `commit-commands` | `/commit`, `/commit-push-pr`, `/clean_gone` | Handles the commit workflow |
| `security-guidance` | Scans edits for dangerous patterns (command injection, XSS, eval, dangerous HTML, pickle, os.system) | Early warning layer during plugin development since plugins execute shell and process external input |
| `superpowers` | Brainstorming, planning, TDD, debugging, git worktrees, and other metacognitive skills | Core discipline framework used before touching code |
| `skill-creator` | `/skill-creator` guided creation flow | Creating and iterating on skills with structured quality review |
| `code-review` | `/code-review` PR review | Reviewing our own plugin PRs |
| `atlassian` | Jira and Confluence MCP tools | Embla's project tracker and knowledge base |
| `frontend-design` | Design-first UI guidance | Design direction when building skill UI or artifact output |
| `context7` | Fetches live library docs on demand | Keeps SDK/API references current without relying on training data |
| `claude-code-setup` | `claude-automation-recommender` skill (no slash command — auto-invoked) | Read-only codebase scan that recommends MCP servers, hooks, skills, and subagents tailored to this repo. Use when setting up Claude Code for a new repo or auditing what automations would help |
| `claude-md-management` | `/revise-claude-md` (after a session), `claude-md-improver` skill (audit/grade mode) | Grades all CLAUDE.md files A–F and proposes targeted improvements. `/revise-claude-md` captures session learnings into CLAUDE.md |

## Plugin auto-trigger guide

Not all plugins work the same way. This section tells Claude and the team exactly when each plugin fires.

### Always-on / passive

These run in the background with no invocation needed.

| Plugin | When it activates |
|---|---|
| `security-guidance` | Every `Edit`/`Write` call — silently scans for dangerous patterns (command injection, XSS, eval, dangerous HTML, pickle, os.system) |

### Auto-triggers via natural language

Claude invokes these when the conversation context matches — no command needed.

| Plugin | Trigger phrases / conditions |
|---|---|
| `superpowers` | Before any implementation, brainstorming, debugging, planning, writing specs or plans — fires on almost every non-trivial task |
| `context7` | When SDK, API, or library docs are needed mid-task (e.g. asking about Claude API params, Angular lifecycle hooks, NestJS decorators) |
| `atlassian` | Any Jira or Confluence operation: fetch issue, create ticket, search pages, post comments |
| `frontend-design` | Building UI components, asking for design direction, creating artifact output |
| `skill-creator` | Creating a new SKILL.md or editing an existing one |
| `code-review` | Reviewing a PR or the current diff for correctness and quality |
| `claude-code-setup` | "Set up Claude Code for this repo", "what automations would help", "optimize my Claude Code setup", "audit my workflow" |
| `claude-md-management` | "Audit/improve/check CLAUDE.md", "CLAUDE.md maintenance", "project memory optimization", "grade my CLAUDE.md" |

### Explicit command only

Claude never auto-invokes these — the user must type the command.

| Plugin | Commands |
|---|---|
| `commit-commands` | `/commit`, `/commit-push-pr`, `/clean_gone` |
| `hookify` | `/hookify`, `/hookify:list`, `/hookify:configure` |
| `plugin-dev` | `/plugin-dev:create-plugin` |
| `mcp-server-dev` | `/mcp-server-dev:build-mcp-server` |
| `agent-sdk-dev` | `/agent-sdk-dev:new-sdk-app` |
| `claude-md-management` | `/revise-claude-md` (capture session learnings into CLAUDE.md) |

**Pipeline-invoked only (never typed by a user):** `embla-core:develop-auto` — triggered exclusively by the `ai-develop` Bitbucket pipeline when a Jira comment tags `@Claudedev`.

### Tips

- Press `#` during any session to have Claude capture learnings directly into CLAUDE.md
- Use `CLAUDE.local.md` (gitignored, at repo root) for personal preferences not shared with the team

## embla-core skills (the primary plugin)

`embla-core` covers the full dev lifecycle:

| Skill | Invocation | Purpose |
|---|---|---|
| `config` | `/embla-core:config` | Setup/update `.claude/embla.json` for a project |
| `develop` | `/embla-core:develop <JIRA-ID>` | Full story workflow: fetch → branch → brainstorm → TDD → commit → PR → Done |
| `jira` | `/jira spec <path>` or `/jira story` etc. | Create Jira epics/stories/tasks from a spec or free-text |
| `sprint-plan` | `/embla-core:sprint-plan` | 4-phase sprint planner: goal → stories → assign → create in Jira |
| `pr-review` | `/embla-core:pr-review <PR_ID>` | 7-agent parallel PR review (code-quality, security, performance, risk, coverage, dependency, requirement) |
| `deploy` | `/embla-core:deploy <PR_ID>` | Trigger CI/CD, poll build, transition Jira → Ready for QA |
| `pipeline` | `/embla-core:pipeline` (setup) or `/embla-core:pipeline check` | Set up/audit `bitbucket-pipelines.yml` + `.mcp.json` for automated Bitbucket PR review; auto-invoked by `config` Phase 5 |
| `resolve-pr-feedback` | `/embla-core:resolve-pr-feedback <PR_ID>` | Work through open PR review comments after a rejection: explain, fix, commit, resolve Bitbucket comments, reassign to lead |
| `init-llm-wiki` | `/embla-core:init-llm-wiki` | Bootstrap Karpathy's LLM Wiki pattern as a dev knowledge base |
| `develop-auto` | invoked headlessly by the `ai-develop` Bitbucket pipeline (never by a user) | Non-interactive counterpart to `develop`: fetch → implement → PR with no human gates, for CI-triggered runs tagged `@Claudedev` in a Jira comment |

**CI plugin pin:** generated pipelines clone this repo at a pinned commit for `--plugin-dir`, not `main` directly, so pipelines don't silently pick up unreviewed changes. If your change to `plugins/embla-core/skills/**` should reach existing pipelines, bump the pinned commit in `plugins/embla-core/skills/pipeline/references/bitbucket-pipelines-template.yml` — see "Updating the pinned plugin commit" in that skill's `pipeline-templates.md` for the full process.

Two pipeline templates each carry their own independent pin: `bitbucket-pipelines-template.yml` (AI PR Review) and `bitbucket-pipelines-ai-develop-template.yml` (`ai-develop`/`develop-auto`). They don't need to point at the same commit or be bumped together — only bump a template's pin when a change actually touches the skill files that pipeline runs (`pr-review`'s files for one, `develop-auto`'s for the other).

## Central config: `.claude/embla.json`

All embla-core skills read from `.claude/embla.json` in the consuming project (not this repo). The full schema is in `plugins/embla-core/skills/config/SKILL.md`. Key resolution order for every field: `embla.json` → `settings.json` → env var → hardcoded default.

Key sections: `repo` (VCS provider/workspace/slug), `tracker.jira` (siteUrl, cloudId, projectKey, customFields, issueTypes, statuses), `sprint`, branch format fields, `commitMessageFormat`, `team` (lead/qa/ui/devops/dev arrays), notification/threshold settings.

## Branch and commit conventions

Branch format (Embla standard, also in `plugins/embla-core/skills/develop/references/branch-conventions.md`):
- Feature: `s{sprint}/feature/{JIRA-ID}/short-description`
- Bug/patch: `s{sprint}/patch/{JIRA-ID}/short-description`
- Release: `release/{version}`

Commits follow Conventional Commits with skill scope:
```
<type>(<skill-name>): <short description>
<type>(<skill-name>/EM-XXXX): <short description>   ← Jira ID optional
```
Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`.

## PR description format

This repo's PRs live on Bitbucket (`bitbucket.org/emblaftdev/embla-claude-plugins`), not GitHub — use the `mcp__bitbucket__bb_get`/`bb_post`/`bb_put` MCP tools for PR create/read/update, not the `gh` CLI.

When creating a PR via `/commit-push-pr`, Claude generates the description using this structure:

```markdown
## Summary
<bullet point per meaningful change — derived from commit messages>

## Motivation
<why this change was needed — what problem it solves or workflow gap it fills>

## Test Plan
<checklist of verification steps>

## Jira Ticket
<full Jira URL — resolved from branch name (e.g. EM-24395 in `s226/feature/EM-24395/...`) or embla.json; write N/A if none>
```

The Jira ticket link is auto-resolved: Claude checks the current branch name for a ticket ID pattern (`EM-\d+`) before writing N/A.

## AI output watermark

Skills that produce a persistent artifact — a PR description, Jira issue/comment, or posted review comment — end that content with a footer as its literal last line:

```
🤖 Crafted by Claude AI
```

Currently on: `develop` (PR description), `jira` (every issue description, in `references/formats.md`), `deploy` (Jira deploy comment), `resolve-pr-feedback` (Jira completion comment), `develop-auto` (Jira abort comment). `pr-review` and the `pipeline` CI template keep their own pre-existing footer, `🤖 Generated with Claude Code` — don't add both to the same output. Any new skill that posts a similar artifact should add this footer too.

## pr-review architecture

The review skill runs up to **7 parallel subagents**, registered as named subagent types in `plugins/embla-core/agents/*.md` (`embla-core:code-quality`, `embla-core:security`, `embla-core:performance`, `embla-core:risk`, `embla-core:coverage`, `embla-core:dependency`, `embla-core:requirement`) and invoked by name from Phase 3 of `skills/pr-review/SKILL.md` with data-only prompts. Which subset of the 7 actually runs is decided per PR by Phase 2.7 (Agent Relevance Judgment) — the orchestrator judges each agent's relevance against the diff and that agent's own "Spawn when" criteria (in its `agents/*.md` description), with no fixed rule set; every exclusion is logged with a one-line reason for audit, since `pipeline` mode runs unattended. A haiku subagent handles eligibility (Phase 1) and confidence scoring (Phase 4). Phase 6 Step A delegates comment posting to a dedicated named subagent, `embla-core:poster` (also in `agents/*.md`, `tools:` scoped to `mcp__bitbucket__bb_post` only) — never `general-purpose`, since that data traces back to a reviewed PR's diff. Phase structure: eligibility → size gate → fetch PR data → agent relevance judgment → review agents → dedup → confidence scoring → coverage gate → format → post/notify → write local file.

`--mode` flag controls posting: `dev` (display only), `lead` (interactive post prompt), `pipeline` (auto-post + Teams notification).

## Adding or editing a skill

1. Skill entry point must be `SKILL.md` with YAML frontmatter containing `name` and `description`.
2. Supporting content goes in `references/` — `SKILL.md` must explicitly instruct the agent to read each reference file.
3. Register new plugins in `.claude-plugin/marketplace.json`.

## Docs

`docs/superpowers/specs/` — design specs for features (named `YYYY-MM-DD-<topic>-design.md`).
`docs/superpowers/plans/` — implementation plans for features.

## Team workflow

When working in this repo, use the right Claude Code skill for each artifact type. Invoke these skills before touching any files — they guide structure and catch mistakes early.

| What you're writing | Skill to invoke |
|---|---|
| New `SKILL.md` | `/skill-creator` |
| Editing an existing skill | `/superpowers:writing-skills` |
| `CLAUDE.md` | `/init` |
| Design spec | `/superpowers:brainstorming` |
| Implementation plan | `/superpowers:writing-plans` |
| New plugin scaffold | `/plugin-dev:create-plugin` |
| New MCP integration | `/mcp-server-dev:build-mcp-server` |
| New Agent SDK app | `/agent-sdk-dev:new-sdk-app` |
| Bootstrap dev wiki | `/embla-core:init-llm-wiki` |
| Set up/audit CI PR-review pipeline | `/embla-core:pipeline` |
| Work through PR review feedback after rejection | `/embla-core:resolve-pr-feedback` |
| Setting up Claude Code for a new repo | `claude-code-setup` (claude-automation-recommender) |
| Capture session learnings into CLAUDE.md | `/revise-claude-md` |
| Audit CLAUDE.md quality across the repo | `claude-md-management` (claude-md-improver) |
| Creating and pushing a PR | `/commit-push-pr` (commit-commands) |

## Plugin & skill registration

**Any change to a plugin** (new skill, edited skill content, tweaked `plugin.json`/`marketplace.json` description, etc.) must bump that plugin's `version` in `plugins/<plugin-name>/.claude-plugin/plugin.json`. Auto-update only pulls a plugin when its version changes — an unbumped version means consumers silently keep the old copy.

**Adding a new skill to an existing plugin** (e.g. a new skill inside `embla-core`):
1. Create `skills/<new-skill>/SKILL.md` and `references/` as needed
2. Bump the version in `plugins/<plugin-name>/.claude-plugin/plugin.json`
3. No change to `.claude-plugin/marketplace.json` — the marketplace points to the plugin source, not individual skills

**Adding a completely new plugin**:
1. Create `plugins/<new-plugin>/.claude-plugin/plugin.json`
2. Create `plugins/<new-plugin>/skills/<skill-name>/SKILL.md`
3. Add the new plugin entry to `.claude-plugin/marketplace.json` in the same PR — the entry is inert until merged, no separate follow-up PR needed

