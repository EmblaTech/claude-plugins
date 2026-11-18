# Research: the "software factory" video and Claude Duet

Preliminary research for two issues in the source project, 2026-11-11. Asks: what the video's concept is, what Claude Duet is, what dashboard v2 could borrow, and which parts of v2 may be outdated.

## The video

**What it is.** [Build a Better Software Factory with Claude Code](https://youtu.be/RiaTyJ2POVo) by ZazenCodes (YouTube oEmbed). It is the follow-up to [Build Your Own AI Software Factory with Claude Code](https://youtu.be/ctoaIC4LHmI) (published 2026-10-07, per a third-party channel list).

**Gap.** The transcript, description and publish date could not be fetched (YouTube page text came back empty; a transcript site returned 403). The summary below comes from the video's own source code, which the author's repo index links to this exact video URL: [`src/software-factory-claude-code-v2`](https://github.com/zazencodes/zazencodes-season-3/tree/main/src/software-factory-claude-code-v2) (README and `DESIGN.md`). What is said on camera may differ.

**Concept.** A Claude Code "software factory" installed in your own project. GitHub issues are the queue: you label an issue `factory`, run `/factory run`, and a pipeline of subagents takes it to a merged PR. The approver "merges what it's sure of and hands you the rest".

**Pipeline.** intake (accept / NEEDS-INFO / reject, rates risk and surfaces such as `ui` or `security`) → route (a script picks reviewers and models from `config.json`) → spec-writer → builder (draft PR, own git worktree and branch) → gate (a script runs the project's test, lint, typecheck and build) → reviewers (code always; security, UX, UI only when intake flagged them) → approver (APPROVE, or ESCALATE with label `factory:needs-human`). Review rounds are capped; then a human steps in.

**Design rules from `DESIGN.md`.**
- Scripts do the deterministic stages (checks, state moves, merge); agents do judgement (build it? what? is it good?).
- Each stage leaves a file that opens with a short summary, so a human skims and drills in only where needed.
- "Issues are the queue; you trigger the run." No schedule, no GitHub Actions, runs locally on your Claude plan.
- One orchestrator session runs all jobs (concurrency 3 by default); agents reply briefly to keep its context small.
- `bin/job` is the only writer of `job.json` and refuses illegal state moves. "State is files, so runs resume" after a crash or compaction.
- The `factory` label is the trust boundary: only users with triage or write access can add it. Issue text reaches agents as quoted data.
- Humans interact by: intake's questions as issue comments (job parks until answered); merging the PR = approval; `/factory <anything>` = feedback file for another build round, or a question about jobs.
- A local `dashboard.html` shows each job as a card with gate and review results, risk, cost and time. Cost is the API-equivalent price summed from subagent transcripts; the author warns the transcript format is undocumented and may break.

**What changed from v1 (per `DESIGN.md`).** One command drains the whole queue in parallel instead of one job per session; risk-based routing instead of all reviewers on every job; scripted checks before review and merge instead of LLM opinion only; PR per issue merged on GitHub instead of local merges; intake asks on the issue instead of stalling.

## Claude Duet

**What it is (official).** [Introducing Claude Duet](https://claude.com/resources/articles/claude-duet), Anthropic, 2026-10-21, research preview. A separate app (iOS, Android, claude.ai) where Claude works as a proactive agent for professionals and small business owners, built on Opus 5.5.
- **Morning brief** on the most important items across connected apps.
- **Proactive messages:** checks connected accounts every few hours (not continuously, to save usage) and messages only when something needs attention; you set what and how often.
- **Background tasks** (scheduling to dashboards, forecasts, prototypes, web apps) on its own VM with its own browser; notifies when done or needing review.
- **One ongoing thread**, text or voice. Carries over memory, skills and connected apps from the Claude account. Uses the 6,000+ Marketplace connectors and plugins.
- **Approvals:** reads, drafts and prepares on its own; before sending, paying, signing or deleting it "shows you exactly what it's about to do and waits for your approval". Some actions are off-limits even with approval (trading, moving money).
- **Access:** waitlist, US only, Pro / Max / Ultra; shares the plan's usage limits, background checks count.
- **Known limits:** may misjudge urgency or misread a thread; cannot yet show its browser.

**Secondary coverage** ([TechCrunch](https://techcrunch.com/?p=3180587), [VKTR](https://www.vktr.com/ai-platforms/claude-duet-anthropic-previews-an-ai-agent-that-messages-you-first/)) calls it a "digital chief of staff" and says Team and Enterprise plans come later; that last point is not on the official page.

**Unverified.** Whether Duet can use the GitHub connector specifically, whether it has an API or any way to drive it from a page or routine, whether it can work on a repo, and when it reaches users outside the US.

## What dashboard v2 could borrow

Each idea checked against what v2 already has (load-bearing test).

| Idea | Source | v2 today | Verdict |
|---|---|---|---|
| GitHub issues as the queue, gated by a label | factory | ADR 0001, `oz:on` | Already have: validates ADR 0001 |
| Park and ask on the issue when unclear (NEEDS-INFO) | factory | `oz:needs-you` + question reply | Already have |
| Scripts decide mechanics, agents judge | factory | PRD Conventions: mechanics in page tool code (`OZ.*`), judgement in the rules turn | Already have |
| One writer of state that refuses illegal moves | factory (`bin/job`) | tracker.md "one writer"; no explicit state machine | Stricter version; new only if illegal transitions show up in practice |
| Label as trust boundary (only triage/write can add it) | factory | repo private to the user | Not needed while single-user; worth a line in setup when others install the skill |
| Per-run cost from subagent transcripts, shown on the status issue | factory | nothing | **New.** Useful for the 30-min `update` cost question; carries the same undocumented-format risk |
| Skimmable per-stage files with a summary line | factory | collectors return cards; no per-run record beyond the status issue | Probably not needed: the tracker's comment history is the record |
| A `oz:task` handed to a factory-style pipeline that opens a PR | factory | Future: "hands-free Run Claude" | **New, optional.** A local `/factory run` on a labelled issue is a hands-free path the PRD has not tried; only for repo-code tasks, not this docs repo |
| "Check every few hours, message only when something needs attention" | Duet | `update` every 30 min, PushNotification on new needs-you / failures | Already have; Duet's cadence (hours) hints 30 min may be more than needed |
| Morning brief across apps | Duet | meeting briefs + tasks radar | Already have, narrower scope |
| Approval shows exactly what will be done | Duet | write rule: preview + Allow/Deny | Already have, same pattern |

## Which parts of v2 may be outdated

**By the factory video: none.** It is a code-delivery pipeline, not a personal prep page. It confirms v2's main choices (issues as queue, labels as state, scripts for mechanics, ask-and-park). Nothing in v2 is superseded by it.

**By Claude Duet: possibly some, but only if the user gets access.** Today Duet is a US-only waitlist, so nothing is outdated now. If it becomes available to the user, these PRD parts overlap and may become redundant:
- **Meeting briefs and the tasks radar** vs Duet's morning brief.
- **PushNotification for needs-you and new PR reviews** vs Duet's proactive messages.
- **Assistant tab, Ask mode** (still unbuilt) vs Duet's one ongoing thread with all connectors. Strongest case to pause: it is not built yet.
- **Long-task fallback (deep link to Claude Code) and the Future item "hands-free Run Claude"** vs Duet's background tasks on its own VM.

What Duet does not replace, as far as the official page shows:
- per-card comment threads on a shared, durable tracker (ADR 0001) with history and the GitHub mobile app;
- filing information into meeting notes and editing the repo;
- local MCP servers (Bitbucket PRs) and organisation-specific PR grouping and recommendations;
- a skill other people can install with their own config (ADR 0003).

**Suggested next step.** Join the Duet waitlist to learn whether it is open outside the US; until then keep v2 as is, and hold the unbuilt Ask mode until Duet's availability is known.

## Sources

Primary:
- [Introducing Claude Duet](https://claude.com/resources/articles/claude-duet), Anthropic (official).
- [zazencodes-season-3 README](https://github.com/zazencodes/zazencodes-season-3) (links the folder to `youtu.be/RiaTyJ2POVo`), [v2 folder README](https://github.com/zazencodes/zazencodes-season-3/tree/main/src/software-factory-claude-code-v2), [v2 DESIGN.md](https://github.com/zazencodes/zazencodes-season-3/blob/main/src/software-factory-claude-code-v2/DESIGN.md): the author's own code.
- YouTube oEmbed for title and channel.

Secondary:
- [TechCrunch on Claude Duet](https://techcrunch.com/?p=3180587), [VKTR on Claude Duet](https://www.vktr.com/ai-platforms/claude-duet-anthropic-previews-an-ai-agent-that-messages-you-first/).
- [ZazenCodes Substack teaser for the v1 video](https://zazencodes.substack.com/p/build-your-own-software-factory-with).

Low reliability, used only as leads: [prepublish.ai channel list](https://prepublish.ai/youtube-channel/zazencodes) (v1 date and length), Perplexity search.

## Confidence and gaps

- **Video concept:** medium-high. Based on the source code the author ties to this video, not on the video itself; transcript and publish date not obtained.
- **Claude Duet:** high for what the official page states; low for anything beyond it (API, GitHub connector, non-US timing, Team/Enterprise).
- **"Outdated" verdict:** a judgement, conditional on Duet access.
