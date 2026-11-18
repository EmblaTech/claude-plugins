# Following up on comments

A comment from the user on a card is a Local prompt to you ([ADR 0005](../../../../docs/dashboard-v2/adr/0005-cloud-and-local-surfaces.md)), written on the page or straight in the tracker; a sync answers it, the page never does. Claude writes as the user too, so its comments end with `reply-signature`. Every user comment after the last signed comment in its thread is **unanswered**, and you answer it.

**Collect.** Records updated since the status record's `answered` time: `list(labels: [dsh:on], state: open, updatedSince: <answered>)`, the same for `dsh:needs-you`, and `list(labels: [dsh:meeting], state: closed, updatedSince: <answered>)` for meeting cards closed since then. Read each thread with `comments()`. Your batch per thread is its unanswered comments, plus, for a meeting card closed since then, all its prep comments whatever their age. Done when every such thread was read or its failure is in the status record. Write `answered` (this run's start time) into the status record's `meta` only when the whole batch is done (below); a run that fell short leaves it, so the next run picks the rest up.

**Read each batch with its card in view:** the card's title and body, the whole thread (signed replies included), and for a meeting card the meeting's notes. Then:
- **Information** (what was agreed, a thought, context) goes where the project keeps such notes. When nothing in the project says where, it stays on the card and the reply says so. A comment on a meeting still ahead is prep for its brief: leave it on the card and file it after the meeting, on the first run once the card closes. PR comments stay on the card.
- **An action** is yours to carry out, by the most local, reversible means: a repo edit, a new task card (see [card.md](card.md), linked from this card), a draft message.
- **Sending** (mail, chat, invites, PR comments) only when the comment says to send, under the project's rules for outgoing messages. On a PR you may comment, ask or request changes; approving stays the user's click.
- **Heavy work** (multi-step research, a code review, a long document) goes to a subagent with `model: "opus"`, given the comment and what you already know.
- **Changing the card** is fine when the comment asks: rewrite the brief, close it, snooze it, or defer it into a task with a `Target date`. A deferred task's `Start date` is 2 days before its `Target date` unless the text implies another.
- **Ambiguous** (a target or recipient you would have to guess): ask instead of acting.

**Reply** once per batch, in the same thread, in the user's language, ending with the signature. Re-read the thread just before posting: when a signed reply has appeared since you collected it, another run answered, so post nothing. The reply says what you did with links, or the one question you need answered. Filing a closed meeting card's prep comments gets one short line saying where they went, with a link. Every reply adds `dsh:replied`, which puts a badge on the collapsed card. After a question, add `dsh:needs-you` and send one PushNotification naming the card and the question. Remove `dsh:needs-you` from a card once the user has commented after your question.

**Commit** only the repo files you changed, naming the cards in the message.

Done when every collected comment has a signed reply after it and every closed meeting card's prep comments are filed.

## Agent tasks

An open `dsh:task` card labelled `ready-for-agent` and assigned to `agent-assignee` (`dashboard.toml`) is an **agent task**: its title and brief are the assignment, and you carry it out. The Assistant tab's Local input creates such cards; the user may also label one by hand.

**Collect** with `list(labels: [dsh:task, ready-for-agent], state: open, assignee: <agent-assignee>)`; other assignees' cards belong to their own runs. Label and assignee alone decide, whether the card is on the page or not. Read each thread with `comments()`. A card whose thread holds a comment with the claim marker ([tracker.md](tracker.md)) is **claimed**: it is never taken again, by this run or any later one.

**Claim** each unclaimed card before any work: re-read its thread, and while it is still unclaimed post one signed comment saying you take it, with the claim marker (this run's start time) on the line before the signature. One claim, one attempt: a run cut off mid-work leaves the card claimed, and nobody retries it. That is safe only because the user sees every agent task that stops moving: a card claimed by an earlier run that still has no report gets `dsh:needs-you` and one PushNotification naming it, once, and stays the user's to decide.

**Work** each claimed card in its own `general-purpose` subagent (a fork cannot start subagents), one card at a time so tasks never collide on a repo, `model: "opus"` for heavy work. Hand it the card's title, brief and thread, and let it use subagents and skills as the task needs, and whatever means suit: a direct commit, a branch and PR, another repo (clone it when needed or when the task says so). Claim, comments and labels stay with you, merging and approving with the user. The subagent returns what it did, with links; one that fails or returns nothing counts as a task you could not finish.

**Finish** with one signed report per card, from the subagent's result. Add `dsh:replied`. When the result waits on the user (a PR to review, a question, a task you could not finish and why), add `dsh:needs-you` and send one PushNotification naming the card. Only then remove `ready-for-agent`, from a fresh read of the labels.

Done when every collected card is claimed, every card claimed by this run has its signed report, and `ready-for-agent` is off each reported card.
