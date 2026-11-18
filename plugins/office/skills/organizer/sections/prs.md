# Pull requests

One card per open pull request.

**Wants** <by meaning and track, filled in by setup: which pull requests, and how to judge the ones from a repo of a special kind>.

## Every card

- `title`: the PR title; `meta.lead`: `<repo> #<id>`; labels `dsh:pr` and the repo's track label
- `meta.author` (display name), `meta.repo` (slug), `meta.updated` (last update): the page's filter chips match on them
- `meta.badges`: one `✓ <first name>` per approver, tone `ok` (the user's own approval as "me"); the kind (`feature`, `bugfix`, `refactor`, `config`, `docs`, `tests`, `deps`); `AI-config`, tone `ai`, when the PR touches AI configuration
- `close: true` once it is merged or closed

## Groups, by the user's next move

A PR goes into the first group it matches, `groupRank` in this order; name the groups in the user's language:
0. **Replies and questions to me**: a live thread. The user commented and someone wrote after them (badge "new reply", `accent`); their comment is the newest ("no reply", `muted`); someone mentioned them and they have not written since ("question", `warn`). The brief quotes each exchange with the comment's link; a thread waiting on the user gets a prompt that drafts the reply.
1. **My PRs**: the user is the author. The gist says who approved, who asked for changes, and whether it can merge.
2. **Waiting for my review**: the user is a reviewer and has not approved. Review card, below.
3. **Approved by others**: short gist.
4. **Stale**, `collapsed`: no reviewers, no activity for over 14 days, or a duplicate of another open PR (same ticket key or same change); the gist says which.
5. **All open**, `collapsed`: the rest, with author and kind in the gist.

Within a group, `Priority` puts first the PRs where the user's move unblocks the most or the risk is highest.

## Review card

- Read the description, diffstat and diff.
- **Verdict** badge: "can approve" (`ok`) when the change is under about 150 lines, matches its description, tests or docs move with it, and it touches no AI configuration, secrets, auth, deploy or data migration; else "take a look" (`warn`).
- **Gist:** what the PR does for the product or the team, in one sentence, plus the reason for the verdict. Approving stays the user's click.
- **Brief:** what changes (one line per meaningful change, with its file); where a user sees it (which screen or command, left out when no user does); for "take a look", what to look at, with file and line per concern, plus a prompt that drafts review comments.
- **AI configuration** is anything that changes how an agent behaves: `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.mcp.json`, plugin manifests, prompts and model settings.
- **Terms:** every feature, module or screen the PR touches. **Suggestions:** a comment, a question or a change request the user could post.

## Moved PRs

Only PRs that moved arrive, since a comment, approval, change request, push or merge all move a PR's updated time. A PR with no card gets a full card, review included. A carded PR is re-read only when it arrived: read the PR in full through its source then (diff, comments, participants). An untouched PR's card stays as it is, with no calls for it. A merged or closed PR is closed by the cleanup of the pass.

Done when every moved PR has a current card, every live thread on the user's comments or mentions is in a brief, and every verdict cites the files that decided it.
