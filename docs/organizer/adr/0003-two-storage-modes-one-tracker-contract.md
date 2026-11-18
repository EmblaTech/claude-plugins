---
status: accepted
---

# Two storage modes behind one tracker contract, GitHub first

The skill is meant for others too, so setup offers the `github` storage mode and the `artifact-db` storage mode (the artifact's own `db`, with nothing to install). The page and the routines talk to one small tracker contract, and only its two implementations differ:
- list cards and tasks on the dashboard
- get or create by key
- update the body and fields
- close as done or dismissed
- delete a task
- snooze
- list and add comments

`github` is built first because the user uses it, and `artifact-db` follows once `github` is in use.

## Consequences

- Every feature must be expressible in both stores. Anything GitHub-only (for example GitHub's issue views and filters) is a convenience, never a dependency of the page or the routines.
