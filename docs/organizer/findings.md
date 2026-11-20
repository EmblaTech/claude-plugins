# Organizer: findings

Until 2026-11 called Dashboard v2; labels were `dsh:*`.

Facts learned while building and running the Organizer dashboard that shape its mechanics. Newest first.

## Sync change detection (2026-11-15, #186)

**PR updated time** was checked on 12 PRs: two Bitbucket repos and GitHub `EmblaTech/claude-plugins`.
- `updated_on` (Bitbucket) and `updated_at` (GitHub) moved with every comment, approval, change request, push and merge.
  - A Bitbucket PR: an approval's `participated_on` equalled `updated_on` to the microsecond.
  - Bitbucket PR 1439: a comment bumped `updated_on` 17 ms later.
  - GitHub PR 39: a change-request review bumped `updated_at` one second later.
- Not observed: a Bitbucket change request as the last event, and GitHub inline review comments.
- Neither host documents what bumps the field.
- The Bitbucket list endpoint returns `participants` as null. A single-PR read returns them.
- Catch-all listings:
  - Bitbucket: `pullrequests?q=updated_on>"<ts>"&sort=-updated_on`;
  - GitHub: `pulls?sort=updated&direction=desc`.

**Microsoft 365:**
- **ms365 MCP.** Its token expires often and it needs a new sign-in, so scheduled passes cannot rely on it. That includes its delta tools (`list-mail-folder-messages-delta`, `list-calendar-view-delta`).
- **Official M365 connector.** It has no delta, so the cursor is a received or modified time filter.
- **Graph Teams chat delta** (`getAllMessages/delta`) is app-only (`Chat.Read.All`) and not available delegated.
- **Transcript change notifications** need a webhook endpoint, so transcripts stay on calendar plus Recordings listing.
- **Calendar.** Reading it is one call per window, and the brief subagents are the expensive part.

**Scheduling.** A Desktop scheduled task skips a run while its previous run is still going ([docs](https://code.claude.com/docs/en/desktop-scheduled-tasks)). Cloud routines reject a cron more often than hourly.

**Permission prompts.** In a session started by a schedule, the app asks before `create_scheduled_task` (seen 2026-11-15 with #183's postponement), so an unattended run cannot rely on creating tasks.

## Relations through the GitHub connector (2026-11-14, #169)

Checked with the claude.ai GitHub connector's tool list and live calls on #131.

**Exposed.**
- Sub-issues: `issue_read` `get_sub_issues` (open and closed, with `body`, string `labels`, `state`; no type, no parent field), `get_parent`, and `get` (`has_parent`, `has_children`, `sub_issues_summary` {completed, total}, `issue_type`). Write: `sub_issue_write` `add` / `remove` / `reprioritize` (takes the child's numeric `id`, not its number) and `issue_write` `create` with `parent_issue_number` (cannot be combined with `issue_fields`).
- Issue type: `issue_read` `get` returns `issue_type` ("Epic" on #131); `issue_write` `type` sets or clears it; `list_issue_types` lists Task, Bug, Feature, Epic, Story.

**Missing: dependencies (blocked-by).** No connector tool reads or writes them, and `get` carries no blocked-by field. So the page cannot show a "Blocked" mark from live data, and the page's `create_task` cannot set `blockedBy`. The Code tab can use `gh api .../dependencies/blocked_by` (collectors, skill), but the page has no `gh`. No workaround built; the decision is #182.

**Also missing.** `list_issues` returns no parent, children count or type (its `fields` list has none of them), so the page needs one `issue_read` `get` per task card to know its parent, done count and type.

## Card dialogue (2026-11-10, #128)

*Historical since [ADR 0005](adr/0005-cloud-and-local-surfaces.md) (2026-11-11): the page no longer answers comments, so catch-up, the card queue and `reply` were removed in #151 (2026-11-12) and their unverified items below need no check. Two `sample` calls at once stays open: two Cloud chats can now run together.*

Built and checked in headless Chromium with stubbed `mcp` and `sample`: catch-up on open answers a thread with an unanswered comment and skips one already signed, a comment sent from a card gets a signed reply plus `oz:replied`, and a signed reply that lands during the run makes `reply` post nothing, a reply on an open card adds no `oz:replied`, a question adds `oz:needs-you`, and `snooze_card` hides the card while `close_card` refuses to dismiss a task. The stub showed one bug, fixed: a model that signs inline before the page appends the task link left two signatures, so `OZ.signed` now removes the signature anywhere in the model's text.

**Not yet verified, to check in the Claude desktop app** after setup republishes the page:
- `add_issue_comment` called from inside a `sample` tool (`reply`) lands on the issue, with no Allow click (a tracker write under the write rule);
- whether the platform itself asks for any consent on that call (the Allow click in Launch Lab was that page's own gate);
- a card run overlapping an Assistant-tab chat: two `sample` calls at once.

## Assistant spike tails (2026-11-10)

Tested in Claude Launch Lab (a private test artifact) v7, Claude desktop app, chat through `sample` with page tools.

- **Create a task from the chat works.** `issue_write` create through a `sample` tool, behind the Allow click, made #120 with labels `oz:task`, `oz:on` and issue fields `Priority` = High, `Target date` = 2026-11-14 in one call (about 23 s). The page doubled the `[spike]` title prefix: a page bug, not a connector one.
- **`search_code` covers only the default branch.** A string only on `wip` gave 0 hits, a string on `main` gave 32. So search cannot find new files on a working branch; reading by path is the way there.
- **`get_file_contents` by `ref` works once the page tool reads every content block.** The first block is only "successfully downloaded text file (SHA: …)"; the file text comes in a second block, an embedded resource (`resource.text`, or `resource.blob` in base64). Launch Lab v8 collects all blocks: `openwiki/index.md` from `wip` read in full.
- **Last active branch: 3 calls, about 12.8 s** for 2 branches (`list_branches`, then one `list_commits` per branch). Too slow per message: work it out once when the page opens.
- **Mail from the page.** `outlook_create_draft` made the draft. `outlook_send_mail` and `outlook_send_draft` are also available to the page in this tenant (not "Needs approval"); not called.
- **Tool annotations are visible.** `describeTool` gives `readOnlyHint` and `destructiveHint` (e.g. `get_me` read-only, `outlook_send_mail` destructive), so the write rule can be decided from annotations, not tool names.
- **`sample.limits()`**: `maxPromptBytes` 262144, at most 16 tools per call, tiers `default`, `complex`, `quick`, `inherit`. A 10 KB conventions prompt (Cyrillic, about 19 KB in UTF-8) is 7.4% of the cap. The 16-tool cap means the assistant cannot get every tool of every connector: setup must pick the tools.
- **Not tested:** `add_issue_comment` through the Allow click.

## Launching Claude from a dashboard card (2026-11-09)

**Goal.** A card button that starts Claude on the card's task, billed to the subscription, not the API. Tested with a scratch artifact, Claude Launch Lab (private; its click log is in its `lab/journal` db doc). All tests: artifact opened in the Claude desktop app on the user's Windows machine.

**Works: deep links that prefill the prompt.** The user presses Enter to send.
- `claude://code/new?folder=<path>&q=<prompt>` opens a new Code chat in the desktop app. Docs: [Open Claude Desktop with a link](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link).
- `vscode://anthropic.claude-code/open?prompt=<prompt>` opens a new chat in VS Code with the Claude Code extension.
- Both work from a link with `target="_blank"`. URL-encode every value with `encodeURIComponent`.

**Does not work.**
- `claude-cli://open?cwd=&q=`: the handler is registered (`claude.exe --handle-uri`), exits 0 at once, and the terminal flashes and closes. Matches the known Windows bug [claude-code#86056](https://claudeissues.com/issue/86056-bug-windows-claude-cli-deep-link-terminal-opens-and-immediately-closes-no-intera) (closed as not planned). Docs: [Deep links](https://code.claude.com/docs/en/deep-links).
- Auto-submit: no deep link sends the prompt. Auto-submit existed only as a vulnerability, patched ([Oasis Security report](https://oasis.security/resources/reports/claude-url-scheme-prompt-injection)).
- `host:bitbucket` through the artifact `mcp` capability: `unavailable` in the desktop app, so the page cannot reach local MCP servers. A local "launch claude" tool via this bridge is unproven.
- The page cannot see whether an OS handler fired. Window blur is a weak hint; record the outcome by hand (Launch Lab has ✓/✗ buttons).

**Cloud connectors from a page.** After `permissions.request(["mcp:<server>"])`, Gmail, Google Calendar, Microsoft 365, Atlassian, Supabase, Wispr Flow and EULER all showed `connected` and `granted`. `listTools()` lists only servers declared in the page manifest, and shows `unknown` until the user has granted them. A page cannot enumerate all connectors. No connector starts Claude Code.

**Works: multi-turn chat in the page.** `sample` with page `tools` that call the `github` connector (`list_issues`, `issue_read`, `add_issue_comment`). Two turns ran: `list_issues` and `read_issue` both succeeded. Subscription-billed, no API key.
- The page keeps the turns and passes them on each call; one call remembers nothing. Tool results do not carry over between turns.
- A call allows only a few tool rounds, about 30-90 s per call on the default tier. Docs: the `sample` capability types in the artifact-capabilities skill.
- Writes: `add_issue_comment` is gated by an in-page Allow/Deny button; not yet tried. `issue_write` is not exposed.
- Not a Claude Code session: no files, no terminal, and it runs only while the page is open.
- The journal stores outcomes, not message text, so what Claude answered is not recorded.
- Confirmed by the user: a full chat with history, working in the page.

**Open: how the chat learns the dashboard conventions.** `sample` has no system prompt, so instructions go in a leading user turn. The conventions (labels, comment signature, card types) live in `plugins/office/skills/organizer/references/` (`tracker.md`, `comments.md`, `card.md`, about 10 KB together). Options under consideration, none chosen:
- Enforce mechanical rules in the page's tool code (reply signature, `oz:` labels, the full-set rewrite of `labels`, approval before writes) and keep only judgement rules in the prompt.
- Fill the prompt at setup time, when `page.html` is built and published (`references/setup.md`, step 3), so it follows the skill files.
- Read the files from the repo at chat start through the `github` connector. Needs a file-read tool declared in the manifest; not checked.
- Input size cap: check `sample.limits()` before relying on a long prompt.

**Untested options for a hands-free start.**
- Routine with API trigger: `POST /v1/claude_code/routines/<id>/fire` with a bearer token created only in the web UI. Starts a cloud session on the subscription. Preview, rate-limited. Needs a proxy to keep the token off the page. Docs: [Routines](https://code.claude.com/docs/en/routines), [Fire a routine](https://platform.claude.com/docs/en/api/claude-code/routines-fire).
- `claude-code-action` with `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`: subscription-billed, but cannot use claude.ai connectors. Docs: [GitHub Actions](https://code.claude.com/docs/en/github-actions).
- claude.ai/code has no prompt-prefill URL ([claude-code#19023](https://github.com/anthropics/claude-code/issues/19023), closed as not planned).

## GitHub connector writes hang from Claude Code (2026-11-06)

**Symptom.** From a Claude Code session (desktop app, Code tab), every connector `issue_write` `update` returns "An interactive form has been shown to the user…" and writes nothing. This covers any update, not just `issue_fields`: a title-only update on #100 did the same. No form appears in the Code tab, so the routine cannot write cards.

**The page is not affected.** From the dashboard artifact, the same connector's `issue_write` writes at once: ⏸ on #100 set `Start date` with no form (tested in Chrome).

**Mechanism.** The form is MCP Apps form deferral in [github-mcp-server](https://github.com/github/github-mcp-server). `shouldDeferToForm` in `pkg/github/ui_capability.go` defers a write when the client advertises the `io.modelcontextprotocol/ui` capability, unless the feature flag `mcp_apps_disable_form_deferral` is on. The desktop app advertises that capability for claude.ai connectors but does not render this form. The artifact bridge evidently does not advertise it. This is inferred from the behaviour, not documented. Deferral became the default around 2026-10-01 (per user reports in [#3455](https://github.com/github/github-mcp-server/issues/3455), not an official source).

**Upstream.** Open, no maintainer reply: [#3538](https://github.com/github/github-mcp-server/issues/3538) (same symptom in the Code tab), [#2823](https://github.com/github/github-mcp-server/issues/2823), [#3415](https://github.com/github/github-mcp-server/issues/3415), [#3455](https://github.com/github/github-mcp-server/issues/3455) (asks for an opt-out on managed connectors), [#3488](https://github.com/github/github-mcp-server/issues/3488).

**What does not work.**
- Passing `_ui_submitted: true` to `issue_write`: still deferred.
- Claude Code settings: there is no per-server switch for the UI capability. `Elicitation` hooks do not help, because the server does not use elicitation.

**Options.**
- A custom claude.ai connector at `https://api.githubcopilot.com/mcp/?features=mcp_apps_disable_form_deferral`. The flag is documented in the server's [server-configuration.md](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md). One user in #2823 reports it works on the hosted endpoint; GitHub has not confirmed it. Page and routine would keep one shared connector. Being tested.
- `gh` (`gh issue edit`, `gh api graphql` `setIssueFieldValue`) for routine writes. This works (tested on #100), but gives the routine a second write path and needs `gh` on every machine that runs it.

## Artifact db: nested paths and approval click (2026-11-18, #256)

A private test artifact (page declares `db`, holds test docs only; an earlier test artifact was gone by 2026-11-18). Checked with `ArtifactData` from an interactive session.

- **Nested path works.** `set`, `list`, `query` (`where` on a data field), `update` with `if_version` and `batch` (a `records/<key>` doc plus `records/<key>/comments/<id>`, atomic) all succeed on `records/<key>/comments`. A stale `if_version` returns `version_mismatch`. The flat `comments/` fallback (#225) is not needed.
- **No `updatedSince`.** The `ArtifactData` schema has none, and `updatedAt` is envelope metadata, not a data field, so `where updatedAt` matches nothing. A cursor-style read needs a client-written field (e.g. `ts`) to filter on.
- **Approval click from an unattended scheduled task: not needed (2026-11-18).** Task `artifact-db-approval-probe` ran from the Scheduled sidebar and finished with no prompt, denial or wait: a single `set` and a 2-write `batch` (nested `records/sched1/comments/*`) both committed. Caveat: the task was saved and run in Auto permission mode; a run under a stricter mode may still ask. Single writes need no click, so `batch` (≤50) is for atomicity only, not to avoid clicks, and no allow-rule is needed for #226 under Auto.
