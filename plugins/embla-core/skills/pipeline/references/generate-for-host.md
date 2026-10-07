# Generating a pipeline for an unknown host

Followed by `setup` when `references/hosts/<repo.provider>/` does not exist (e.g. `gitlab`, `azure-devops`). The output is a pipeline file, a `.mcp.json` block, and a `pr-review-tools.json` that pass every rule in `pipeline-rules.md`. Nothing is written until the developer approves the full draft.

The generated pipeline is a **port** of the reference implementation, not a fresh design: every rule-bearing line survives, and only host plumbing changes.

## Contents
- 1. Read the rules and both reference templates
- 2. Confirm host facts from official docs
- 3. Draft the pipeline file
- 4. Choose the read MCP server and build tools.json
- 5. Check every rule
- 6. Present the draft and get an explicit yes
- 7. Write the files with the header stamp
- 8. Print the variable checklist

Copy this checklist into your reply and tick it off:

```
Generate for <provider>:
- [ ] 1. Read the rules and both reference templates
- [ ] 2. Confirm host facts from official docs
- [ ] 3. Draft the pipeline file
- [ ] 4. Choose the read MCP server and build tools.json
- [ ] 5. Check every rule (max 3 rounds per rule)
- [ ] 6. Present the draft and get an explicit yes
- [ ] 7. Write the files with the header stamp
- [ ] 8. Print the variable checklist
```

## 1. Read the rules and both reference templates

Read `pipeline-rules.md`, `hosts/bitbucket/template.yml` (the reference implementation) and `hosts/github/template.yml` (the second port, which shows exactly which parts vary between hosts). Also read the tracker block chosen in `setup` step 5.

Done when you can name, for each rule ID, the line(s) of the Bitbucket template that satisfy it.

## 2. Confirm host facts from official docs

Look each fact up via context7 or the host's official documentation; record the source URL beside each:

| Fact | Example (GitHub) |
|---|---|
| CI file path and format | `.github/workflows/<name>.yml` |
| PR trigger, and whether it can run fork code with secrets | `on: pull_request` (safe) vs `pull_request_target` (unsafe) |
| Whether separate steps share one shell (R1) | No — keep the whole sequence in one script block |
| Built-in variables: PR id, repo/project, source and target branch | `github.event.pull_request.number`, … |
| Secret store and how to mark a value masked | Repository secrets |
| A built-in or minimal-scope token for PR comments (C4) | `GITHUB_TOKEN` + `permissions:` |
| REST endpoints: get PR, list commits, list comments, post inline comment, post comment, edit comment | `GET /repos/{o}/{r}/pulls/{n}`, … |
| Auth header for those endpoints | `Authorization: Bearer <token>` |
| A container image option so I1–I4 run as in Bitbucket | `container: node:24` |

Done when every row has a value and a source. Any row you cannot confirm → stop, print `Cannot generate a pipeline for <provider>: could not confirm <facts>. No files were written.`, and end setup.

## 3. Draft the pipeline file

Start from `hosts/bitbucket/template.yml` and change only:
- the trigger and job/step wrapper (keep one shell for the whole sequence);
- built-in variable names (`$BITBUCKET_PR_ID` → the host's PR id, etc.);
- API base URLs and the auth line inside `curl -K -` (C1);
- the D1 pre-fetch `jq` mapping from the host's PR, commit, and comment JSON into the normalized `pr-context.json` shape (state normalized to `OPEN`/`MERGED`/`CLOSED`);
- the D2 outbox `jq` mapping from outbox items into the host's comment-create payloads, and the posted-URL path in the response;
- the fallback comment's payload shape (R3);
- the `.pipeline-env` exports: `ANTHROPIC_API_KEY` plus whatever env the chosen MCP server reads (I2);
- the image, when the host's runner needs a different one.

The tracker marker is replaced by the tracker block exactly as for a known host. On a generated host the cost line is appended before posting (writes are always outbox, so there is no comment id to patch); keep the `report-comment-id.txt` branch anyway so a later move to MCP writes stays correct.

Done when the draft is a complete file and each change above maps to a host fact from step 2.

## 4. Choose the read MCP server and build tools.json

Writes are always `"method": "outbox"` on a generated host (`post_inline_comment`, `post_comment`); the pipeline script posts them.

For the three reads (`get_pr`, `list_commits`, `list_comments`), choose a server under M1–M8, starting from any host server already in the project's `.mcp.json`. For each candidate, collect the M6 evidence: package or image, exact version, publisher, source URL, last release date, the tool names you will allow, the token env var and its minimum scope, and a pass/fail per M-rule.
- A candidate passes → map each read: `"method": "mcp"`, the `mcp__<server>__<tool>` name, `args` with `{PR_ID}`/`{workspace}`/`{repo}` placeholders, and `fields` paths into the tool's result (list operations add `"list": "<path>"` when the array is nested).
- No candidate passes → all three reads use `"method": "files"` (M7), `.mcp.json` gets no host block, and you record which rule failed.

Set `tracker` as `setup` step 5 decided. Then set `--allowedTools` in the draft to the base set plus exactly the `mcp` tools in this tools.json (I5).

Done when every operation has a `method` and every `mcp` operation has `tool`, `args`, and `fields`.

## 5. Check every rule

Walk `pipeline-rules.md` top to bottom and run each rule's **verify** against the draft, the `.mcp.json` block, and tools.json. Include any host-specific rules you identified (e.g. a trigger that can expose secrets to fork code gets its own `<HOST>1` rule).

On a failure, fix the draft and re-check that rule. After three failed rounds on the same rule, stop: print `Cannot generate a compliant pipeline for <provider>: rule <ID> — <reason>. No files were written.` and end setup.

Done when every rule ID has a ✅.

## 6. Present the draft and get an explicit yes

Show, in this order:
1. the full pipeline file;
2. the `.mcp.json` block (or "none — reads use files");
3. the tools.json;
4. the M6 evidence block for the chosen server;
5. one line per rule ID: `✅ S1 — @anthropic-ai/claude-code@2.1.207`, citing the line that satisfies it.

Ask: `Write these files? (yes / revise / use files+outbox instead of MCP / abort)`.
- `yes` → step 7.
- `revise` → take the developer's change, return to step 5.
- `use files+outbox` → set every read to `files`, drop the `.mcp.json` block and its tools from `--allowedTools`, return to step 5.
- `abort` → `Aborted. No files were written.`

## 7. Write the files with the header stamp

The pipeline file's first line is exactly:

```
# Generated by embla-core:pipeline for <provider> — rules-version <N>
```

with `<N>` from `pipeline-rules.md`. `check` uses this line to recognise a generated host. Merge into an existing pipeline file under P1/P2, write `.mcp.json` (add the block only if its key is missing) and `.claude/pr-review-tools.json`.

## 8. Print the variable checklist

Print a table in the same format as `hosts/bitbucket/variables.md`, listing every secret and variable the pipeline and `.mcp.json` reference, each token's minimum scope (C4), where to set it in the host's secret store, and the tracker's rows. End with the instruction to mark every value secret/masked.
