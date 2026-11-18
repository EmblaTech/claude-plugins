---
status: superseded by 0009
---

# Commands are `sync`, `sync light` and `setup`; any other text is an instruction

A new user could not tell the skill's run modes apart: the bare `/dashboard-v2` was the full pass, `update` was the frequent incremental one, and nothing in either name said which was which. So the modes are renamed in plain English around one verb: `/dashboard-v2 sync [section] [params]` is the full pass (a **Sync**), `/dashboard-v2 sync light` is the frequent pass (a **Light sync**), `setup` stays, and the bare call prints the commands and the section names from the config. Any other text after `/dashboard-v2` (e.g. "add a task to call the supplier") is an instruction, handled like the Local instruction input on the Assistant tab, so the user need not remember the syntax. The same holds inside setup: `setup <text>` (e.g. "make the theme lighter", "add a section", "add a source to a section") runs only the setup steps the text touches, takes the text as the answer to their question, republishes the page if it changed and reports what changed; when the text matches no step, setup asks rather than running in full. This replaces `setup theme`, which becomes one such case. A sync does everything a light sync does, plus analysing every source and retiring cards no source holds. *(Decided 2026-11-12, #168.)*

## Considered options

- **Keep the names and add a command table to SKILL.md.** Rejected: the names themselves carried no meaning; a table explains them only to someone who reads it.
- **`rebuild` for the full pass.** Rejected: it reads as rebuilding the page, not refreshing what is on it.
- **`reconcile` / `catch-up`.** Rejected: precise (Kubernetes vocabulary) but not plain English.
- **`sync` for the frequent pass and `sync deep` for the full one.** Rejected by the user in favour of the full pass owning the bare verb.
- **`review` or `scan` for the full pass.** Rejected: `review` clashes with pull request review, which the dashboard shows.
- **Aliases for `update` and the bare call during a transition.** Rejected: every caller is updated in the same change, and no other install is known.

## Consequences

- Text is a command only when its first word is `sync` or `setup`; an instruction that starts with either word is read as that command.
- `light` is the only reserved section name; a section name always comes after `sync`, so it can never be taken for a command.
- A light sync closes a card only when its origin item was plainly resolved (issue closed, PR merged); retiring a card because a source no longer holds it needs a full sync, since a light sync sees only what is new.
- `setup` ends by offering a first sync, so a new user does not land on an empty page. Republishing the page stays inside `setup`; there is no separate command for it.
- The routines are named after their commands: `dashboard-v2-sync` (daily) and `dashboard-v2-sync-light` (every 30 minutes), replacing `dashboard-v2-update`.
- ADR 0005 and issues #126, #138, #151 still say `update`; they record what was decided then and are not rewritten.
