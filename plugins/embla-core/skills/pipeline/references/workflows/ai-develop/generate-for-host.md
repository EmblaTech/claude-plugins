# Generating the ai-develop pipeline

Followed by `setup` step 6 for every combination except Bitbucket + Jira. The output is a pipeline file and `.mcp.json` blocks that pass every rule `pipeline-rules.md` → "AD" applies to ai-develop. Nothing is written until the developer approves the full draft.

The draft is a **port** of `workflows/ai-develop/template.yml`: every rule-bearing line survives; only host and tracker plumbing changes.

Copy this checklist into your reply and tick it off:

```
Generate ai-develop for <host> + <tracker>:
- [ ] 1. Read the rules and the reference template
- [ ] 2. Confirm host and tracker facts from official docs
- [ ] 3. Draft the pipeline file
- [ ] 4. Research the repo, derive the allowlist, get approval
- [ ] 5. Check every rule (max 3 rounds per rule)
- [ ] 6. Present the draft and get an explicit yes
- [ ] 7. Write the files with the header stamp
- [ ] 8. Print the variable checklist
```

## 1. Read the rules and the reference template

Read `pipeline-rules.md` (the AD table says which rules apply), `workflows/ai-develop/template.yml`, `workflows/ai-develop/ai-develop-setup-guide.md`, and `hosts/github/template.yml` (shows how a host port changes job wrapper, env and auth).

Done when you can name, for each rule that applies, the reference-template line that satisfies it.

## 2. Confirm host and tracker facts from official docs

Record a source URL beside each:

| Fact | Bitbucket + Jira reference |
|---|---|
| Pipeline file path; a pipeline started by API or manually, with inputs | `bitbucket-pipelines.yml`, `pipelines: custom: ai-develop:` + variables |
| Whether separate steps share one shell (R1) | yes — one `script:` list |
| Secret store and masking | repository variables, *Secured* |
| A token that can push a branch and open a PR, minimum scope (C4) | `BITBUCKET_API_TOKEN` |
| Git push credential mechanism | `credential.helper` from env |
| REST: create PR — endpoint, payload, auth header, PR URL path in the response | `POST /2.0/repositories/{w}/{r}/pullrequests` |
| Tracker REST: add comment — endpoint, payload, auth header | `POST /rest/api/2/issue/{key}/comment`, Basic |
| Tracker issue-key format (AD1) | `^[A-Z][A-Z0-9]+-[0-9]+$` |
| Container image option, so I1/I2 run as in the reference | `image: node:24` |

Done when every row has a value and a source. Any row unconfirmed → print `Cannot generate ai-develop for <host> + <tracker>: could not confirm <facts>. No files were written.` and end step 6.

## 3. Draft the pipeline file

Start from the reference template and change only:
- the trigger and job wrapper (inputs `ISSUE_KEY`, `COMMENTER_ID`; one shell for the whole sequence). Tracker and host on the same platform → the trigger is a comment event in this file, its condition matching `@claudedev` case-insensitively and excluding the run's own account;
- AD1's key pattern, to the tracker's format;
- `post_jira_comment` → `post_tracker_comment`, with the tracker's endpoint, payload and auth through `curl -K -` (C1);
- the git credential helper and the host env in `.pipeline-env` (I2);
- `--allowedTools`, filled from step 4's approved allowlist, the same list passed to the run with `--append-system-prompt` (both built from one shell variable, so the run knows exactly which command forms it may use), and the other `claude` arguments (`/embla-core:develop-auto $ISSUE_KEY $COMMENTER_ID`);
- the finish path: when `develop-auto-result.json` has `"outcome": "pr_pending"`, open the PR from `docs/reviews/develop-auto-outbox.json` with the host's create-PR call. On success, replace `{{pr_url}}` in the outbox's `success_comment` and post it with `post_tracker_comment`, then exit `0`. On failure, post `Branch <branch> was pushed but the PR could not be opened (HTTP <status>). A human needs to open it.` and exit `1`.
- AD7: the service containers the tests need, from step 4d, with their connection variables exported in `.pipeline-env`. Port them into the draft after step 4 approves them;
- AD5: when the result file is missing, unparseable or `outcome: incomplete`, keep the reference template's fallback comment and forced exit `1`. Port that branch line for line.

Done when the draft is a complete file and each change maps to a fact from step 2.

## 4. Research the repo, derive the allowlist, get approval

The allowlist is researched for this project and approved by the developer. Nothing is copied from the reference template's `--allowedTools`, which fits one stack.

**a. Dev tools, from the repo.** Read the repo's own build and test setup: manifests and lockfiles (`package.json` and its lockfile, `pom.xml`, `build.gradle*`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `Cargo.toml`, `*.csproj`), test configs and existing tests, `Makefile` and script folders, and any existing CI file. Find every command `develop-auto` may need to get from a fresh clone to a tested change: install dependencies, generate code, apply migrations or seed data the tests rely on, build, lint or typecheck, run the tests. The run decides at run time which of them a diff needs, so the allowlist covers the whole loop, not only the test command. For each, prefer the command the repo itself declares (a manifest script, a `Makefile` target, an existing CI step) over the underlying tool's raw CLI, since the declared one carries the repo's non-default paths and flags. Write it in the form the run will invoke from the repo root, and allow it as `Bash(<command>:*)` at the narrowest prefix that covers it (`Bash(<runner> test:*)`, not `Bash(<runner>:*)`). A repo with several packages or suites → allow each one's commands. Add `Bash(git:*)` for branch, commit and push, and the file tools `Read,Write,Edit,Grep,Glob`. No test command detectable → ask the developer for it; without one `develop-auto` reports "tests not run" on every PR.

**b. Operations, from `develop-auto`.** List what the skill does against the tracker and host: fetch the ticket, post a comment, assign, transition status, open the PR. For each, name the tool that performs it, from a server chosen under M1–M8 with M6 evidence (Jira: the `atlassian` block in `workflows/ai-develop/mcp.json`; others starting from a server already in `.mcp.json`), or `none`, with what the skill does instead:
- assign or transition with no tool → logged and skipped;
- PR creation → the outbox file, opened by the script (step 3). The allowlist names no PR-creating command (no `Bash(gh:*)` or similar);
- fetch with no tool → stop: `Cannot generate ai-develop for <tracker>: no MCP server passed <rule>. No files were written.`

Host MCP tools are read-only or none (M3 for ai-develop). **Same platform for host and tracker** (GitHub issues + GitHub): the PR-review `.mcp.json` `github` block is read-only. When an ai-develop block needs different tools under the same key, write it to `.mcp.ai-develop.json` and pass that file to `--mcp-config`. Status moves on a user-owned Projects board need more than the run's token, so they fall back to logged and skipped; say that in the variable checklist.

**c. Approval.** Show one table with a row per allowed entry and the evidence for it: the repo file that justifies each Bash command, the `develop-auto` operation each MCP tool serves, and the fallback for each operation with no tool. Ask: `Use this allowlist? (yes / revise / abort)`. `revise` → apply the change and show the table again. `abort` → `Aborted. No files were written.`

**d. Services, from the repo.** The run installs, generates and migrates for itself, with the commands from step a. It cannot start a service, so derive each one the tests need (database, cache, queue) from the repo's compose file and test config, and provide it as the host's service container or sidecar: image, port, credentials, health check. Export the connection variable the tests read in the `.pipeline-env` heredoc. Never run a container tool inside the job: the job is already a container. Add a row per service to the step-c table with the repo file that justifies it.

Done when every entry has evidence, every operation has a tool or a fallback, every service the tests need has a service container, and the developer answered `yes`.

## 5. Check every rule

Walk `pipeline-rules.md` and run the **verify** of every rule the AD table applies, plus AD1–AD7. On a failure, fix the draft and re-check that rule. Three failed rounds on one rule → `Cannot generate ai-develop for <host>: rule <ID> — <reason>. No files were written.`

Done when every applicable rule ID has a ✅.

## 6. Present the draft and get an explicit yes

Show: the full pipeline file; the `.mcp.json` blocks; the M6 evidence; the approved allowlist table from step 4; one line per rule (`✅ AD1 — ISSUE_KEY matches ^[0-9]+$`, citing the line). Ask: `Write these files? (yes / revise / abort)`. `revise` → apply the change, return to step 5. `abort` → `Aborted. No files were written.`

## 7. Write the files with the header stamp

First line of a standalone file: `# Generated by embla-core:pipeline for <host> ai-develop — rules-version <N>`. When the ai-develop block merges into a file that already exists (P1/P2), the stamp goes as a comment line directly above the block instead. Add `.mcp.json` blocks only when their key is missing (C3).

## 8. Print the variable checklist

Same table format as `hosts/bitbucket/variables.md`: every secret and variable the file and `.mcp.json` reference, each token's minimum scope, where to set it, marked secret/masked. Inputs (`ISSUE_KEY`, `COMMENTER_ID`) read `supplied by the trigger`.

Then print these notes that apply to the host:
- GitHub: a PR opened with the workflow's `GITHUB_TOKEN` does not trigger other workflows, so AI PR Review does not run on it unless a PAT or GitHub App token opens the PR.
- GitHub: the repo setting "Allow GitHub Actions to create and approve pull requests" must be on, or PR creation returns 403.
