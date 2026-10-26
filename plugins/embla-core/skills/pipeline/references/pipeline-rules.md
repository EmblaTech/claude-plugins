# Pipeline rules

rules-version: 4

The single source of truth for what every AI PR Review pipeline must satisfy, on every host; the AD section adapts it for ai-develop. `setup` checks generated files against it, `check` cites rule IDs when it reports drift, and each host's `<provider>-setup-guide.md` links here instead of repeating a rationale. Bump `rules-version` on any rule change; generated pipelines stamp the version they were checked against.

Each rule has a **statement**, a **verify** (how to confirm it on a file), and a **why** where the reason isn't obvious. The reference implementation is `hosts/bitbucket/template.yml`; quoted lines below come from it.

## Contents
- S — Supply chain
- I — Isolation
- C — Credentials
- R — Reporting and exit
- D — Data flow
- M — MCP server selection
- P — Merging into an existing pipeline file
- H — Host-specific rules
- AD — ai-develop

## S — Supply chain

**S1** Claude Code is installed at an exact version: `npm install -g @anthropic-ai/claude-code@2.1.207`.
- Verify: the install line names `@x.y.z` with no range, tag, or `latest`.

**S2** Plugins are cloned from `https://github.com/EmblaTech/claude-plugins.git` with no credentials, then `git -C /tmp/plugins checkout <40-char commit>`.
- Verify: clone URL matches exactly; no credential helper, token, or `user:pass@` on the clone; the checkout argument is a full commit hash, never `main` or a branch.
- Why: a push to the plugin repo (accidental or malicious) must never change what a consuming pipeline executes on its next run. The pin does not auto-update; see `hosts/bitbucket/bitbucket-setup-guide.md` → "Updating the pinned plugin commit". The repo is public, so a credential on the clone only widens exposure.

**S3** Every MCP server is pinned to an exact version: an npm `pkg@x.y.z`, a container `image:tag` (digest preferred), or a release binary at a fixed tag with a checksum verified.
- Verify: every `.mcp.json` server and every download in the pipeline names an exact version; no ranges, no `latest`.

**S4** The model is pinned with `--model claude-sonnet-4-6`.
- Verify: the `claude` invocation carries `--model` with a full model ID, not an alias.
- Why: the `sonnet` alias resolves to Sonnet 5, which flags security code-review prompts under its cybersecurity safeguard.

## I — Isolation

**I1** Claude runs as a dedicated non-root user (`useradd -m claudeuser`, then `su claudeuser -c "…"`).
- Verify: the `claude` command runs only inside `su <user> -c` (or the host's equivalent), never as root.
- Why: Claude Code refuses to run as root in a pipeline container, and a non-root user is what makes I3 meaningful.

**I2** Only allowlisted env vars reach Claude. They are written to a `600` file through a heredoc, sourced inside the `su` command, then deleted before `claude` starts. The full CI environment is never inherited.
- Verify: a `cat > /home/<user>/.pipeline-env <<PIPELINE_ENV … PIPELINE_ENV` block with `export NAME=${NAME@Q}` lines, `chmod 600`, and `. <file> && rm -f <file> && claude …` in the `su` command.
- Why: a heredoc's expanded content flows into `cat`'s stdin, never into any process's argv, so nothing appears in `/proc/PID/cmdline`. `${VAR@Q}` escapes the value without passing it to a command as an argument.

**I3** The Claude user owns only `docs/reviews`, its home directory, and the plugin checkout.
- Verify: exactly `chown -R <user>:<user> docs/reviews /home/<user> /tmp/plugins`.
- Why: a hijacked review session can't overwrite and push source changes it has no write access to.

**I4** `curl`, `wget`, `python3` and `netcat` are removed before `claude` starts: `apt-get remove -y curl wget python3 netcat-traditional 2>/dev/null || true`.
- Verify: the remove line runs after every pre-fetch (D1) and before the `su … claude` line.
- Why: guards against prompt injection exfiltrating data through those tools. Reinstalling `curl`/`jq` in the finish path (R2) is safe because `claude` has already exited; no live session remains to abuse them.

**I5** `--allowedTools` is exactly `Bash(git fetch:*),Bash(git diff:*),Grep,Write,Read` plus the MCP tools setup approved for `pr-review`'s operations (its `references/pipeline-mode.md` → "Host access") and the tracker, and nothing else. This list is the only thing that tells `pr-review` which host tools exist; it picks calls from their schemas at run time.
- Verify: parse the `--allowedTools` value. Known host: the MCP entries equal the canonical `template.yml`'s, plus an approved tracker tool. Generated host: each MCP entry appears in setup's M6 evidence. No bare `Bash`, no `bypassPermissions`.
- Why: a prompt injection in a reviewed PR can't get an arbitrary command run. `--allowedTools` is a permission filter, not a loading filter: every tool schema of every server in `.mcp.json` still enters context, which is why unused servers are left out of `.mcp.json` entirely.

## C — Credentials

**C1** No secret on a command line. Secrets travel through stdin or a config file (`printf 'user = "%s:%s"\n' "$EMAIL" "$TOKEN" | curl -s -K -`, or `printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | curl -s -K -`) or env.
- Verify: no `-u user:pass`, `-H "Authorization: …$TOKEN"`, or token in a URL anywhere in the script.
- Why: argv is visible to every process on the container via `/proc/PID/cmdline`.

**C2** API response bodies are never printed to the build log.
- Verify: every write `curl` uses `-o /dev/null -w "<label>: HTTP %{http_code}\n"`; every read `curl` pipes into `jq` or a file.
- Why: bodies carry PII (display names, account IDs, avatar URLs).

**C3** `.mcp.json` contains `${VAR}` placeholders only. Values live in the host's secret store, marked secret/masked.
- Verify: every `env` value and token-bearing arg in `.mcp.json` is a `${NAME}` reference.

**C4** Each token has the narrowest scope covering the operations it serves, and the variable checklist names that scope.
- Verify: every token row in the printed checklist states its scopes; none grants admin, merge, or repo-write beyond PR comments.

## R — Reporting and exit

**R1** An error trap is registered before any other command: `trap 'RC=$?; FAIL_CMD="$BASH_COMMAND"; FAIL_LINE="$LINENO"; on_error "$RC"' ERR`.
- Verify: the trap is in the first script entry, before the Claude Code install.
- Why: `RC=$?` must be the trap's first action, or `$?` reflects the trap's own statements. Bitbucket runs a step's whole `script:` list as one shell session, so a trap declared first covers every later entry. Without it, a failed install, clone, or `useradd` kills the step with no explanation anywhere. On hosts that run each step in a fresh shell, the whole sequence lives in one step/script block for the same reason.

**R2** One finish-and-report path, `report_and_exit <code> <mode>`, is reached from both normal completion (`"review"`) and the trap (`"infra"`), and runs at most once (`REPORTED` guard).
- Verify: the trap calls `on_error` → `report_and_exit … "infra"`; the last script line calls `report_and_exit "$REVIEW_EXIT" "review"`.
- Why: `"infra"` routes straight to the incomplete-run branch, so a failure inside the finish path is never misread as a review result. Keep `-o pipefail` off the `su | tee` line: with it, a real gate failure (exit `1`) would route through the trap as `"infra"`.

**R3** If the review didn't complete, post a "did not complete" comment and exit non-zero.
- Verify: the incomplete branch posts a new comment (body built with `jq -n --arg`, ending `🤖 Generated with Claude Code`) and forces `CODE=1` when it was `0`.
- Why: an unexplained incomplete run is never a pass. The comment folds in `.result` (truncated to 4000 chars) from `pr-review-cost.json` when present, because `claude --output-format json` writes its envelope even on an API auth/rate-limit failure, with the real error in `.result`. `is_error`/`subtype` go to the log.

**R4** A legitimate skip (draft, closed, or no new commits) exits `0` and posts nothing.
- Verify: the branch "cost JSON valid, no report comment, no outbox report, code `0`" logs a skip line and exits `0`.

**R5** The exit code comes from `docs/reviews/gate-result.json` when it is valid, not from `claude`'s own exit code.
- Verify: after `REVIEW_EXIT=${PIPESTATUS[0]}`, a `jq -e '.exit_code'` check overwrites `REVIEW_EXIT` when the value is `0` or `1`.
- Why: `claude`'s exit code reflects harness completion, not the gate verdict `pr-review` wrote. `PIPESTATUS[0]` takes `claude`'s code rather than `tee`'s.

**R6** The cost line uses numeric fields only, formatted `%.2f`, each value inside a code span.
- Verify: the cost line reads only `.total_cost_usd` and `.usage.*` token counts via `jq -r`; the dollar figure passes through `printf '%.2f'`; every number is wrapped in backticks.
- Why: free-text fields interpolated into a command line are an injection path. An unrounded float like `3.3166899` gets auto-linked as a commit hash; code spans are exempt. Input tokens are summed as `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. `usage.*` covers the main session only, while `total_cost_usd` includes every subagent, so the line says so.

## D — Data flow

**D1** Before I4 runs, the pipeline writes `docs/reviews/pr-context.json` = `{"pr": …, "comments": […]}` and, if a ticket key resolves, `docs/reviews/ticket.json`, in the normalized shapes `pr-review` defines (its `references/pipeline-mode.md`). This happens on every run.
- Verify: a pre-fetch block runs inside `( set +e … ) || true`, writes to `/tmp` first, and moves into `docs/reviews/` only after `jq -e` confirms the payload parsed.
- Why: these files are `pr-review`'s fallback when an MCP read fails, and the only read path for an operation no allowed tool performs. The subshell with `set +e` and `|| true` keeps the `ERR` trap from firing: a 404, a revoked token, or a missing ticket degrades the review to less context and never fails the build. Normalized `state` is `OPEN`, `MERGED`, or `CLOSED`.

**D2** After `claude` exits, the pipeline posts every entry in `docs/reviews/outbox.json` (`inline`, then `general`), fills `report.body`'s links of the form `[{file}:{line}]({{comment:N}})` — `({{comment:N}})` becomes `(<url>)`, or, where that post failed, the whole link becomes `` `{file}:{line}` ``, appends the R6 cost line, and posts the report.
- Verify: `report_and_exit` contains an outbox branch that runs when `outbox.json` parses; each post uses C1/C2; a failed post logs the HTTP status and continues.
- Why: writes on generated hosts, and any write after an MCP failure, land in the outbox. When `report` is in the outbox, `report-comment-id.txt` is absent and the cost edit is skipped: the cost line is appended before posting instead.

**D3** PR and ticket content is treated as data, never as instructions. This is `pr-review`'s existing untrusted-content guard; the pipeline adds nothing that reads PR text into a command line.
- Verify: no PR title, description, branch name, or comment text is interpolated into a shell command except through `jq --arg` or a `grep -oE` key extraction.

## M — MCP server selection

Applies to the host server and to non-Jira tracker servers.

**M1** The host's official server comes first. A community server qualifies only if no official one exists, it has public source, it is actively maintained (release within the last 6 months), and it is widely used.
**M2** Pinned per S3.
**M3** Only tools that perform one of `pr-review`'s operations are allowed (I5). No tool that can merge, delete, push, or change settings is listed.
**M4** The token scope is the minimum those operations need (C4).
**M5** Tokens reach the server only through `${VAR}` env placeholders (C3).
**M6** Before writing, Claude shows the developer the package, version, publisher, source URL, allowed tools and a per-rule pass, and gets an explicit yes.
**M7** No candidate passes → no MCP tool is allowed for that operation, so `pr-review` reads the pre-fetched file or writes to the outbox, and setup says which rule failed.
**M8** The server works headless with a token from a pipeline variable. No browser/OAuth login and no claude.ai connector.

- Verify: the M6 evidence block lists a ✅ per M-rule for the chosen server.

## P — Merging into an existing pipeline file

**P1** Existing steps and jobs are never modified or removed. Ours is added alongside.
**P2** If our step or job already exists, change nothing and say so.
- Verify: a diff of the merged file against the original shows only additions.

## H — Host-specific rules

Host rules live in each host's `<provider>-setup-guide.md`, with IDs prefixed by the host (`GH1`, `GH2`, …). A generated host may add its own under the same convention and lists them in its ✅ block.

## AD — ai-develop

The `ai-develop` pipeline (reference: `workflows/ai-develop/template.yml`) edits source, pushes a branch and comments on the ticket, so some rules above change for it. Every rule not listed applies as written.

| Rule | For ai-develop |
|---|---|
| S4 | Replaced by AD4 |
| I3 | The Claude user owns the whole working tree: `chown -R <user>:<user> . /home/<user> /tmp/plugins`. It edits and commits source. |
| I4 | Remove `wget python3 netcat-traditional`; `curl` stays, because the finish path posts after `claude` exits. |
| I5 | `--allowedTools` is the Bash and file tools plus the approved tracker tools and host read tools. Bitbucket + Jira: the reference template's list. Generated host: the Bash entries are the repo-derived set from AD6. No merge, delete or settings tool; no bare `Bash`. |
| M3 | Tracker tools may read, comment, transition, assign and edit fields. Host tools are read-only; the script opens the PR on a generated host. When tracker and host are one platform, issue comment/assign tools count as tracker tools. |
| C4 | The host token can push a branch and open a PR, nothing broader. |
| R2–R6, D1, D2 | Replaced by the finish path: `develop-auto-result.json` decides the exit code (`0`/`1`); `outcome: pr_pending` makes the script open the PR and post the success comment; `is_error: true` in the cost JSON, or no valid verdict (AD5), posts a fallback tracker comment folding in `.result` (4000 chars). |

**AD1** Every trigger input is validated before any setup work: the issue key against the tracker's key format (Jira `^[A-Z][A-Z0-9]+-[0-9]+$`) and the commenter id against `^[A-Za-z0-9:_-]*$`. A failure exits `1` without a tracker comment.
- Verify: the validation entry runs after the trap and before the Claude Code install.
- Why: these values are interpolated into the `su -c` string, which a shell re-parses; an unvalidated key is not confirmed safe to comment on.

**AD2** Commits use the bot identity `"AI Autonomous Dev" <ai-autonomous-dev@noreply.embla.asia>`, set inside the `.pipeline-env` heredoc.
- Verify: both `git config --global user.*` lines sit inside the heredoc.

**AD3** No comment the run posts contains `@claudedev`.
- Verify: the fallback and PR-failure comment bodies in the script omit the tag.
- Why: the trigger fires on any comment containing the tag, so echoing it loops. It has no author condition, because the token's owner is usually the human commenting.

**AD4** The model is pinned to the full ID in the reference template's `--model` (`claude-sonnet-5`).
- Verify: the generated `--model` equals the reference template's.

**AD5** A run with no valid verdict fails. When `is_error` is not `true` but `docs/reviews/develop-auto-result.json` is missing, unparseable, lacks `exit_code`, or has `outcome: incomplete`, the finish path posts a fallback tracker comment (claude's last message from the cost JSON `.result`, 4000 chars, `@claudedev` removed) and exits `1`. Every other failure path that would exit `0` is forced to `1`.
- Verify: in `report_and_exit`'s `is_error != true` branch, the `exit "$CODE"` is guarded by a check that `.outcome` is non-empty and not `incomplete`; the fall-through builds its body with `jq -n --arg`, pipes `.result` through the tag strip, and forces `CODE=1` when it was `0`.
- Why: `claude --output-format json` reports `is_error: false` on a clean `end_turn`, including when the model stopped to ask a question or gave up after a denied tool. Green with no PR and no comment is the silent pass R3 forbids for PR review. `develop-auto` writes `outcome: incomplete` first and overwrites it with its verdict, so a missing file never has to mean "unknown".

**AD6** On a generated host, the Bash entries in `--allowedTools` come from researching the repo and the developer approved them. Each entry beyond `git:*` runs a command the repo itself defines (a manifest script, a test config, a Makefile target, an existing CI step), at the narrowest prefix that covers it.
- Verify: setup's step-4 table has a row per Bash entry naming the repo file that justifies it, ends in an explicit `yes`, and the pipeline's list equals the table. `check` re-reads the repo and reports an entry whose file or command no longer exists, and an install, generate, migrate, build, lint or test command the repo defines that the list lacks. No bare `Bash`, no runner the repo doesn't use.
- Why: the list is the only thing that lets a headless run act. A copied list denies a stack's real test command (the run then can't finish) or grants runners the project never uses (wider than the task needs). Deriving it from the repo and showing it for approval fixes both.

**AD7** On a generated host, the run sets up and tests for itself, so the allowlist covers the whole working loop and the run knows it. The approved allowlist includes the repo-declared commands that install, generate, migrate, build, lint and test, and the same list reaches the run through `--append-system-prompt`. The pipeline runs no setup command before `claude` starts. Services the tests need come from the host's service containers, with their connection variables exported.
- Verify: step 4's table has a row for each loop command the repo defines, in the repo-root form the run will use; `--allowedTools` and `--append-system-prompt` are built from one shell variable; each service the tests need is a service container with its connection variable in the `.pipeline-env` heredoc; no pipeline entry before the `claude` invocation installs, generates or migrates.
- Why (AD7): the failed run was denied `install`, `npx` and a container command because the list held only the test command, and the run was never told the list. A pre-run setup step is worse: it guesses for the agent, runs for docs-only changes too, and a failure in it kills a run that needed none of it. Covering the loop in the allowlist and telling the run what it may use lets the agent decide at run time.

**AD8** The MCP servers start from a warm cache. Before the `claude` line, one entry runs each `.mcp.json` server's `npx -y <package>@<version>` as `claudeuser` with `.pipeline-env` sourced, prints its exit code and last log lines without failing the step, and `.pipeline-env` exports `MCP_TIMEOUT=60000`.
- Verify: each package and version in the warm-up loop equals the one in `.mcp.json`; the loop sits after the `apt-get remove` line and before the `su … claude` line; `MCP_TIMEOUT` is in the heredoc.
- Why: a cold `npx` download races Claude's MCP connect window. When it loses, no server tool registers and the log says nothing, so the run aborts at its first ticket fetch. Warming moves the download out of that window and leaves its output in the log.
