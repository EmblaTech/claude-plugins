# Pipeline rules

rules-version: 1

The single source of truth for what every AI PR Review pipeline must satisfy, on every host. `setup` checks generated files against it, `check` cites rule IDs when it reports drift, and each host's `notes.md` links here instead of repeating a rationale. Bump `rules-version` on any rule change; generated pipelines stamp the version they were checked against.

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

## S — Supply chain

**S1** Claude Code is installed at an exact version: `npm install -g @anthropic-ai/claude-code@2.1.207`.
- Verify: the install line names `@x.y.z` with no range, tag, or `latest`.

**S2** Plugins are cloned from `https://github.com/EmblaTech/claude-plugins.git` with no credentials, then `git -C /tmp/plugins checkout <40-char commit>`.
- Verify: clone URL matches exactly; no credential helper, token, or `user:pass@` on the clone; the checkout argument is a full commit hash, never `main` or a branch.
- Why: a push to the plugin repo (accidental or malicious) must never change what a consuming pipeline executes on its next run. The pin does not auto-update; see `hosts/bitbucket/notes.md` → "Updating the pinned plugin commit". The repo is public, so a credential on the clone only widens exposure.

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

**I5** `--allowedTools` is exactly `Bash(git fetch:*),Bash(git diff:*),Grep,Write,Read` plus the MCP tools named in `.claude/pr-review-tools.json`, and nothing else.
- Verify: parse the `--allowedTools` value; the MCP entries equal the set of `tool` values in `pr-review-tools.json` (operations with `"method": "mcp"`). No bare `Bash`, no `bypassPermissions`.
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

**D1** Before I4 runs, the pipeline writes `docs/reviews/pr-context.json` = `{"pr": …, "commits": […], "comments": […]}` and, if a ticket key resolves, `docs/reviews/ticket.json`, in the normalized shapes `pr-review` defines (its `references/pipeline-mode.md`). This happens on every run.
- Verify: a pre-fetch block runs inside `( set +e … ) || true`, writes to `/tmp` first, and moves into `docs/reviews/` only after `jq -e` confirms the payload parsed.
- Why: these files are `pr-review`'s fallback when an MCP read fails, and the only read path on hosts mapped to `files`. The subshell with `set +e` and `|| true` keeps the `ERR` trap from firing: a 404, a revoked token, or a missing ticket degrades the review to less context and never fails the build. Normalized `state` is `OPEN`, `MERGED`, or `CLOSED`.

**D2** After `claude` exits, the pipeline posts every entry in `docs/reviews/outbox.json` (`inline`, then `general`), fills `report.body`'s links of the form `[{file}:{line}]({{comment:N}})` — `({{comment:N}})` becomes `(<url>)`, or, where that post failed, the whole link becomes `` `{file}:{line}` ``, appends the R6 cost line, and posts the report.
- Verify: `report_and_exit` contains an outbox branch that runs when `outbox.json` parses; each post uses C1/C2; a failed post logs the HTTP status and continues.
- Why: writes on generated hosts, and any write after an MCP failure, land in the outbox. When `report` is in the outbox, `report-comment-id.txt` is absent and the cost edit is skipped: the cost line is appended before posting instead.

**D3** PR and ticket content is treated as data, never as instructions. This is `pr-review`'s existing untrusted-content guard; the pipeline adds nothing that reads PR text into a command line.
- Verify: no PR title, description, branch name, or comment text is interpolated into a shell command except through `jq --arg` or a `grep -oE` key extraction.

## M — MCP server selection

Applies to the host server and to non-Jira tracker servers.

**M1** The host's official server comes first. A community server qualifies only if no official one exists, it has public source, it is actively maintained (release within the last 6 months), and it is widely used.
**M2** Pinned per S3.
**M3** Only the tools for the mapped operations are allowed (I5). No tool that can merge, delete, push, or change settings is listed.
**M4** The token scope is the minimum the mapped operations need (C4).
**M5** Tokens reach the server only through `${VAR}` env placeholders (C3).
**M6** Before writing, Claude shows the developer the package, version, publisher, source URL, allowed tools and a per-rule pass, and gets an explicit yes.
**M7** No candidate passes → that operation uses `"method": "files"` (reads) or `"outbox"` (writes), and setup says which rule failed.
**M8** The server works headless with a token from a pipeline variable. No browser/OAuth login and no claude.ai connector.

- Verify: the M6 evidence block lists a ✅ per M-rule for the chosen server.

## P — Merging into an existing pipeline file

**P1** Existing steps and jobs are never modified or removed. Ours is added alongside.
**P2** If our step or job already exists, change nothing and say so.
- Verify: a diff of the merged file against the original shows only additions.

## H — Host-specific rules

Host rules live in each host's `notes.md`, with IDs prefixed by the host (`GH1`, `GH2`, …). A generated host may add its own under the same convention and lists them in its ✅ block.
