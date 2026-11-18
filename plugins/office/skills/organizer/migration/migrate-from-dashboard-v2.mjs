// Migrates a project from the dashboard-v2 skill to organizer: dsh:* labels to oz:*, <!-- dsh {...} --> markers to
// <!-- oz {...} -->, .claude/dashboard/ to .claude/organizer/. How to run it: README.md beside this file.
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

// A body with every dsh marker turned into an oz marker, or null when it holds none.
const MARKER = /<!--(\s*)dsh\b/g;
export function rewriteMarker(body) {
  const text = String(body || ""), out = text.replace(MARKER, "<!--$1oz");
  return out === text ? null : out;
}

const DIR_OLD = ".claude/dashboard", DIR_NEW = ".claude/organizer";
const TOML_OLD = DIR_OLD + "/dashboard.toml", TOML_MOVED = DIR_NEW + "/dashboard.toml", TOML_NEW = DIR_NEW + "/organizer.toml";

// Which config paths to move, given `exists(path)`; an old folder beside a new one is a conflict, and nothing moves.
export function planConfig(exists) {
  if (!exists(DIR_OLD)) return { moves: [], conflicts: [] };
  if (exists(DIR_NEW)) return { moves: [], conflicts: [[DIR_OLD, DIR_NEW]] };
  const moves = [[DIR_OLD, DIR_NEW]];
  if (exists(TOML_OLD)) moves.push([TOML_MOVED, TOML_NEW]);
  return { moves, conflicts: [] };
}

// A top-level `key = "value"` of the toml, before or after the move.
function tomlValue(io, key) {
  const file = [TOML_NEW, TOML_OLD].find(f => io.exists(f));
  const m = file && String(io.readText(file)).match(new RegExp("^" + key + '\\s*=\\s*"([^"]*)"', "m"));
  return m ? m[1] : null;
}

// One run: labels and markers (GitHub storage only), then config. Safe to re-run; a dry run only prints.
// io: listLabels(repo), editLabel(repo, from, to), listBodies(repo) -> [{kind: "issue" | "comment", id, body}],
// editBody(repo, item, body), exists(path), readText(path), move(from, to), log(line).
// Returns the number of conflicts left for the user.
export async function migrate({ dryRun = false } = {}, io) {
  const act = dryRun ? "would rename" : "renamed";
  let conflicts = 0;
  const storage = tomlValue(io, "storage"), repo = tomlValue(io, "repo");
  if (storage && storage !== "github") io.log(`labels and markers: storage is "${storage}", not GitHub; rewrite them by hand as README.md says`);
  else if (!repo) io.log("labels and markers: no repo in the toml; nothing renamed");
  else {
    const plan = planLabels(await io.listLabels(repo));
    for (const [from, to] of plan.renames) { if (!dryRun) await io.editLabel(repo, from, to); io.log(`label ${from} ${act} to ${to}`); }
    for (const [from, to] of plan.conflicts) io.log(`label conflict: both ${from} and ${to} exist in ${repo}; merge them by hand`);
    conflicts += plan.conflicts.length;
    if (!plan.renames.length && !plan.conflicts.length) io.log(`labels: no ${OLD}* labels left in ${repo}`);
    let markers = 0;
    for (const item of await io.listBodies(repo)) {
      const body = rewriteMarker(item.body);
      if (body === null) continue;
      if (!dryRun) await io.editBody(repo, item, body);
      io.log(`${item.kind} ${item.id}: marker dsh ${act} to oz`);
      markers++;
    }
    if (!markers) io.log(`markers: no dsh markers left in ${repo}`);
  }
  const cfg = planConfig(io.exists);
  for (const [from, to] of cfg.moves) { if (!dryRun) io.move(from, to); io.log(`${from} ${act} to ${to}`); }
  for (const [from, to] of cfg.conflicts) io.log(`config conflict: both ${from} and ${to} exist; merge them by hand`);
  conflicts += cfg.conflicts.length;
  if (!cfg.moves.length && !cfg.conflicts.length) io.log("config: nothing left to move");
  io.log(dryRun ? "Dry run: nothing changed."
    : conflicts ? "Settle the conflicts above and rerun this script."
    : "Script done. Go on with the steps after it in migration/README.md.");
  return conflicts;
}

// CLI: node migrate-from-dashboard-v2.mjs [--dry-run], from the project root.
// Matched by file name, not URL: a symlinked plugin path or a drive-letter case would make a URL check skip the run silently.
if (/migrate-from-dashboard-v2\.mjs$/.test(process.argv[1] || "")) {
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const gh = (a, input) => execFileSync("gh", a, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1 << 28 });
  // `--paginate --jq` prints one compact JSON object per line, across every page.
  const lines = (path, jq) => gh(["api", "--paginate", path, "--jq", jq]).split("\n").filter(Boolean).map(l => JSON.parse(l));
  const io = {
    // gh lists 30 labels by default; one oz:mtg/<series> label per meeting series can pass that, so ask for all.
    listLabels: async r => JSON.parse(gh(["label", "list", "--repo", r, "--limit", "1000", "--json", "name"])).map(l => l.name),
    editLabel: async (r, from, to) => gh(["label", "edit", from, "--name", to, "--repo", r]),
    listBodies: async r => [
      ...lines(`repos/${r}/issues?state=all&per_page=100`, '.[] | {kind: "issue", id: .number, body}'),
      ...lines(`repos/${r}/issues/comments?per_page=100`, '.[] | {kind: "comment", id: .id, body}'),
    ],
    // The body goes on stdin: a long one passed as an argument would pass the command-line limit.
    editBody: async (r, item, body) => gh(["api", "-X", "PATCH", item.kind === "issue" ? `repos/${r}/issues/${item.id}` : `repos/${r}/issues/comments/${item.id}`, "--input", "-"], JSON.stringify({ body })),
    exists: p => fs.existsSync(p),
    readText: p => fs.readFileSync(p, "utf8"),
    move: (from, to) => fs.renameSync(from, to),
    log: line => console.log(line),
  };
  try {
    const conflicts = await migrate({ dryRun: process.argv.includes("--dry-run") }, io);
    process.exitCode = conflicts ? 1 : 0;
  } catch (e) {
    console.error(`migration stopped: ${(e.stderr || e.message || e).toString().trim()}\nNeeds the gh CLI, logged in (gh auth login), run from the project root. What is done stays done; rerun to finish.`);
    process.exitCode = 2;
  }
}
