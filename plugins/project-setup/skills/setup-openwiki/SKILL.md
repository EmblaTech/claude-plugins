---
name: setup-openwiki
description: Set up LangChain OpenWiki's host-driven mode (Claude-authenticated, no API key) in the current repo. Use when asked to "set up OpenWiki", "add OpenWiki to this repo", "wire up repo wiki generation", or "install openwiki integration". Setup only — installs and verifies the integration, does not run wiki generation.
disable-model-invocation: true
---
# setup-openwiki

Installs OpenWiki's host-driven Claude integration — no API key, this session does the work. **Setup only.** Do not run `openwiki` or the init prompt yourself; the `openwiki` skill this installs owns that lifecycle — don't copy or paraphrase its protocol here.

## 1. Preconditions

Git repo (`git rev-parse --show-toplevel`) and Node ≥22 (`node -v`). Stop with a clear message otherwise.

## 2. Safety checks

- Symlink ([upstream #719](https://github.com/langchain-ai/openwiki/issues/719)): if root `CLAUDE.md` is a symlink to `AGENTS.md` (`git ls-files -s`, mode `120000`), stop — concurrent managed-block writes will clobber both.
- If `wiki/CLAUDE.md` exists (`embla-core:init-llm-wiki`'s schema), `AskUserQuestion` before adding a second wiki. No path collision (OpenWiki writes to `openwiki/`), but it's a decision, not a default.

## 3. Install and verify

`openwiki` on PATH, else `npm install -g openwiki` (`langsmith` peer warnings are benign). Snapshot `.mcp.json`, run `openwiki integrations install claude --project .`, then verify — don't trust: `git status --porcelain`; `.mcp.json` diff shows prior servers intact plus a new `openwiki` stdio entry; `.claude/skills/openwiki/SKILL.md` exists. Root `CLAUDE.md` stays untouched at this stage — the `<!-- OPENWIKI:START -->` block only appears after the init run.

## 4. `.openwikiignore`

No default is generated. Propose one from what's actually in the repo — large binary/asset dirs, vendored deps, generated output (e.g. `transcripts/`, `.claude/`, `.git/`, common binary extensions) — write it, show it to the user.

Always include secret/credential patterns in the proposal, and tell the user why: generation reads the whole repo (source and tests) by default, and only paths listed here are "never read, scanned, or reproduced" — nothing is excluded unless listed. Check the repo for each and propose those present, plus the standard ones as a safety net: `.env*`, `*.pem`, `*.key`, `credentials*.json`, `secrets/`, cloud config dirs (e.g. `.aws/`, `.azure/`, `.gcloud/`, `.kube/`). Flag any that are tracked in git (`git ls-files`) — those are already committed and need rotating, not just ignoring.

## 5. CI automation check

Init (out of scope here) adds `.github/workflows/openwiki-update.yml` — daily cron in provider mode, needing OpenAI/LangSmith secrets it won't have, so it fails daily. If that file already exists, `AskUserQuestion`: delete it / restrict to `workflow_dispatch` / translate to a Bitbucket Pipelines job (pattern after `plugins/embla-core/skills/pipeline/`; Bitbucket has no in-YAML cron — use a Scheduled Pipeline plus a `custom:` manual one; no built-in PR-create action — use the REST API). If it doesn't exist yet, just flag it in the final report as something to expect and revisit later.

## 6. Final report

- Restart Claude Code — the MCP server only appears after a restart.
- `/mcp` should then list five tools: `openwiki_begin`, `openwiki_submit_plan`, `openwiki_next_page`, `openwiki_submit_page`, `openwiki_finish`. Missing any is a blocker.
- Next prompt to hand the user: *"Initialize this repository's OpenWiki from the current source and tests."*
- Known bugs: **#86** long runs die on schema validation with no retry. **#653** `.last-update.json` can say `complete` on an early exit — check `openwiki/` contents instead. **#719** — see step 2.
- Rollback: `openwiki integrations uninstall claude --project .`, `npm uninstall -g openwiki` (leaves `.openwikiignore` and any `openwiki/` output in place).
