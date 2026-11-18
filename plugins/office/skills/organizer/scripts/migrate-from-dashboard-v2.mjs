// Migrates a project from the dashboard-v2 skill to organizer: dsh:* labels to oz:*, .claude/dashboard/ to .claude/organizer/.
const OLD = "dsh:", NEW = "oz:";

// Which labels to rename; an old label whose new name already exists is a conflict, left for the user.
export function planLabels(names) {
  const have = new Set(names), renames = [], conflicts = [];
  for (const old of names.filter(n => n.startsWith(OLD))) {
    const to = NEW + old.slice(OLD.length);
    (have.has(to) ? conflicts : renames).push([old, to]);
  }
  return { renames, conflicts };
}

const DIR_OLD = ".claude/dashboard", DIR_NEW = ".claude/organizer";
const TOML_OLD = DIR_NEW + "/dashboard.toml", TOML_NEW = DIR_NEW + "/organizer.toml";

// Which config paths to move, given `exists(path)`; an old path whose new one exists is a conflict, and nothing moves past it.
export function planConfig(exists) {
  const moves = [];
  if (exists(DIR_OLD)) {
    if (exists(DIR_NEW)) return { moves, conflicts: [[DIR_OLD, DIR_NEW]] };
    moves.push([DIR_OLD, DIR_NEW]);
    if (exists(DIR_OLD + "/dashboard.toml")) moves.push([TOML_OLD, TOML_NEW]);
    return { moves, conflicts: [] };
  }
  if (!exists(TOML_OLD)) return { moves, conflicts: [] };
  if (exists(TOML_NEW)) return { moves, conflicts: [[TOML_OLD, TOML_NEW]] };
  return { moves: [[TOML_OLD, TOML_NEW]], conflicts: [] };
}

// A top-level `key = "value"` of the toml, whichever name and folder it has now.
function tomlValue(io, key) {
  const file = [TOML_NEW, TOML_OLD, DIR_OLD + "/dashboard.toml"].find(f => io.exists(f));
  const m = file && String(io.readText(file)).match(new RegExp("^" + key + '\\s*=\\s*"([^"]*)"', "m"));
  return m ? m[1] : null;
}

// One run: labels, then config, then the republish instruction. Safe to re-run; a dry run only prints.
// io: listLabels(repo), editLabel(repo, from, to), exists(path), readText(path), move(from, to), log(line).
// Returns the number of conflicts left for the user.
export async function migrate({ repo, dryRun = false }, io) {
  const act = dryRun ? "would rename" : "renamed";
  let conflicts = 0;
  const storage = tomlValue(io, "storage");
  repo = repo || tomlValue(io, "repo");
  if (storage && storage !== "github") io.log(`labels: storage is "${storage}", not GitHub; no labels renamed`);
  else if (!repo) io.log("labels: no repo in the toml and no --repo given; no labels renamed");
  else {
    const plan = planLabels(await io.listLabels(repo));
    for (const [from, to] of plan.renames) { if (!dryRun) await io.editLabel(repo, from, to); io.log(`label ${from} ${act} to ${to}`); }
    for (const [from, to] of plan.conflicts) io.log(`label conflict: both ${from} and ${to} exist in ${repo}; merge them by hand`);
    conflicts += plan.conflicts.length;
    if (!plan.renames.length && !plan.conflicts.length) io.log(`labels: no ${OLD}* labels left in ${repo}`);
  }
  const cfg = planConfig(io.exists);
  for (const [from, to] of cfg.moves) { if (!dryRun) io.move(from, to); io.log(`${from} ${act} to ${to}`); }
  for (const [from, to] of cfg.conflicts) io.log(`config conflict: both ${from} and ${to} exist; merge them by hand`);
  conflicts += cfg.conflicts.length;
  if (!cfg.moves.length && !cfg.conflicts.length) io.log("config: nothing left to move");
  io.log(dryRun ? "Dry run: nothing changed." : "Now republish the page: run /office:organizer setup republish the page.");
  return conflicts;
}

// CLI: node migrate-from-dashboard-v2.mjs [--dry-run] [--repo owner/name], from the project root.
if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const args = process.argv.slice(2), at = args.indexOf("--repo");
  const gh = a => execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const io = {
    // gh lists 30 labels by default; one oz:mtg/<series> label per meeting series can pass that, so ask for all.
    listLabels: async r => JSON.parse(gh(["label", "list", "--repo", r, "--limit", "1000", "--json", "name"])).map(l => l.name),
    editLabel: async (r, from, to) => gh(["label", "edit", from, "--name", to, "--repo", r]),
    exists: p => fs.existsSync(p),
    readText: p => fs.readFileSync(p, "utf8"),
    move: (from, to) => fs.renameSync(from, to),
    log: line => console.log(line),
  };
  try {
    const conflicts = await migrate({ dryRun: args.includes("--dry-run"), repo: at >= 0 ? args[at + 1] : undefined }, io);
    process.exitCode = conflicts ? 1 : 0;
  } catch (e) {
    console.error(`migration stopped: ${(e.stderr || e.message || e).toString().trim()}\nNeeds the gh CLI, logged in (gh auth login), run from the project root. What is done stays done; rerun to finish.`);
    process.exitCode = 2;
  }
}
