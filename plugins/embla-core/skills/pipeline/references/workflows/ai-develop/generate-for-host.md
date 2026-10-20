# Generating the ai-develop pipeline

Followed by `setup` step 6 for every combination except Bitbucket + Jira. The output is a pipeline file and `.mcp.json` blocks that pass every rule `pipeline-rules.md` → "AD" applies to ai-develop. Nothing is written until the developer approves the full draft.

The draft is a **port** of `workflows/ai-develop/template.yml`: every rule-bearing line survives; only host and tracker plumbing changes.

Copy this checklist into your reply and tick it off:

```
Generate ai-develop for <host> + <tracker>:
- [ ] 1. Read the rules and the reference template
- [ ] 2. Confirm host and tracker facts from official docs
- [ ] 3. Draft the pipeline file
- [ ] 4. Choose MCP servers and allowed tools
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
- the trigger and job wrapper (inputs `ISSUE_KEY`, `COMMENTER_ID`, `SPRINT_NUMBER`; one shell for the whole sequence). Tracker and host on the same platform → the trigger is a comment event in this file, its condition matching `@claudedev` case-insensitively and excluding the run's own account;
- AD1's key pattern, to the tracker's format;
- `post_jira_comment` → `post_tracker_comment`, with the tracker's endpoint, payload and auth through `curl -K -` (C1);
- the git credential helper and the host env in `.pipeline-env` (I2);
- `--allowedTools` and the `claude` arguments (`/embla-core:develop-auto $ISSUE_KEY $COMMENTER_ID $SPRINT_NUMBER`);
- the finish path: when `develop-auto-result.json` has `"outcome": "pr_pending"`, open the PR from `docs/reviews/develop-auto-outbox.json` with the host's create-PR call. On success, replace `{{pr_url}}` in the outbox's `success_comment` and post it with `post_tracker_comment`, then exit `0`. On failure, post `Branch <branch> was pushed but the PR could not be opened (HTTP <status>). A human needs to open it.` and exit `1`.

Done when the draft is a complete file and each change maps to a fact from step 2.

## 4. Choose MCP servers and allowed tools

- **Tracker** (Jira: the `atlassian` block in `workflows/ai-develop/mcp.json`; others chosen under M1–M8 with M6 evidence, starting from a server already in `.mcp.json`): allow its read, comment, transition, assign and edit-fields tools (M3 for ai-develop).
- **Host:** read tools only, or none. The PR is opened by the script (step 3).
- No tracker server passes → `develop-auto` cannot fetch the ticket, so stop: `Cannot generate ai-develop for <tracker>: no MCP server passed <rule>. No files were written.`

Done when every allowed MCP tool appears in an M6 evidence block.

## 5. Check every rule

Walk `pipeline-rules.md` and run the **verify** of every rule the AD table applies, plus AD1–AD4. On a failure, fix the draft and re-check that rule. Three failed rounds on one rule → `Cannot generate ai-develop for <host>: rule <ID> — <reason>. No files were written.`

Done when every applicable rule ID has a ✅.

## 6. Present the draft and get an explicit yes

Show: the full pipeline file; the `.mcp.json` blocks; the M6 evidence; one line per rule (`✅ AD1 — ISSUE_KEY matches ^[0-9]+$`, citing the line). Ask: `Write these files? (yes / revise / abort)`. `revise` → apply the change, return to step 5. `abort` → `Aborted. No files were written.`

## 7. Write the files with the header stamp

First line of a standalone file: `# Generated by embla-core:pipeline for <host> ai-develop — rules-version <N>`. When the ai-develop block merges into a file that already exists (P1/P2), the stamp goes as a comment line directly above the block instead. Add `.mcp.json` blocks only when their key is missing (C3).

## 8. Print the variable checklist

Same table format as `hosts/bitbucket/variables.md`: every secret and variable the file and `.mcp.json` reference, each token's minimum scope, where to set it, marked secret/masked. Inputs (`ISSUE_KEY`, `COMMENTER_ID`, `SPRINT_NUMBER`) read `supplied by the trigger`.
