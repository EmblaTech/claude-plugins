# Migrating a dashboard-v2 install

Temporary: remove this folder, and the SKILL.md line pointing here, once every project has migrated.

A project set up while this skill was `dashboard-v2` keeps its config in `.claude/dashboard/dashboard.toml`, its cards under `dsh:*` labels and their key and meta in `<!-- dsh {...} -->` markers; this skill reads none of them. The page reads the tracker live, so migrate and republish in one go, from the project root:

1. **Script.** Run `node <this folder>/migrate-from-dashboard-v2.mjs --dry-run` and show the user its plan; on a yes, run it without `--dry-run`. It needs the `gh` CLI, logged in (`gh auth login`). With `storage = "github"` it renames every `dsh:*` label in the toml's `repo` to `oz:*` (issues keep their labels) and rewrites the marker to `<!-- oz {...} -->` in every issue body and comment holding one; in every mode it moves `.claude/dashboard/` to `.claude/organizer/` and renames `dashboard.toml` to `organizer.toml`. A rerun skips what is done. A `conflict` line (old and new name both exist) exits 1: settle it with the user and rerun.
2. **Artifact-db storage only.** The script renamed nothing in the tracker; do it with `ArtifactData` on the page's `artifact-url`: in every `records/<key>` document, rewrite each `dsh:` label in `labels` to `oz:`; in every comment of every record (`records/<key>/comments`, or where [artifact-db-overflow.md](../references/storage/artifact-db-overflow.md) puts them), rewrite `<!-- dsh` to `<!-- oz` in its `text`. Batch the writes; done when a re-read finds no `dsh:` label and no comment holding `<!-- dsh`.
3. **Old names in files.** The script moves files without reading them. Grep `.claude/organizer/` and the project's `CLAUDE.md` files for `dsh:`, `.claude/dashboard`, `dashboard.toml` and `/dashboard-v2`, and rewrite each hit to `oz:`, `.claude/organizer`, `organizer.toml` and `/office:organizer`.
4. **Scheduled task.** Replace `dashboard-v2-update`, which runs the old command, with the **Sync** task of [setup's Schedule step](../references/setup.md#3-write).
5. **Republish** the page as in **Page** and **Publish** of [setup's Write step](../references/setup.md#3-write).

Done when the script reports nothing left to do, the old task is gone and the republished page shows the cards.
