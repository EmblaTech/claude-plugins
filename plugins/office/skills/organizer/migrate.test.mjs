// The migration from dashboard-v2: its label and config plans, and a run against fake gh and fs.
// Run from the repo root: node --test "plugins/office/skills/organizer/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { planLabels, planConfig, migrate } from "./scripts/migrate-from-dashboard-v2.mjs";

test("labels: every dsh: label renames to oz:, others stay, a taken oz: name is a conflict", () => {
  const plan = planLabels(["dsh:on", "dsh:mtg/weekly", "dsh:task", "oz:task", "Ops", "ready-for-agent"]);
  assert.deepEqual(plan.renames, [["dsh:on", "oz:on"], ["dsh:mtg/weekly", "oz:mtg/weekly"]]);
  assert.deepEqual(plan.conflicts, [["dsh:task", "oz:task"]]);
});

const D = ".claude/dashboard", O = ".claude/organizer";
const has = (...paths) => p => paths.includes(p);

test("config: the old folder moves and its toml is renamed; a half-done run only renames the toml; done is nothing", () => {
  assert.deepEqual(planConfig(has(D, D + "/dashboard.toml")),
    { moves: [[D, O], [O + "/dashboard.toml", O + "/organizer.toml"]], conflicts: [] });
  assert.deepEqual(planConfig(has(O, O + "/dashboard.toml")),
    { moves: [[O + "/dashboard.toml", O + "/organizer.toml"]], conflicts: [] });
  assert.deepEqual(planConfig(has(O, O + "/organizer.toml")), { moves: [], conflicts: [] });
});

test("config: an old folder or toml beside its new one is a conflict and nothing moves", () => {
  assert.deepEqual(planConfig(has(D, D + "/dashboard.toml", O)), { moves: [], conflicts: [[D, O]] });
  assert.deepEqual(planConfig(has(O, O + "/dashboard.toml", O + "/organizer.toml")),
    { moves: [], conflicts: [[O + "/dashboard.toml", O + "/organizer.toml"]] });
});

// ---- A project on disk and its tracker repo, as fakes of gh and fs; every write is recorded.
function fakeProject({ labels, files }) {
  const state = { labels: [...labels], files: { ...files } }, writes = [], out = [];
  const io = {
    listLabels: async repo => { assert.equal(repo, "acme/notes"); return [...state.labels]; },
    editLabel: async (repo, from, to) => { writes.push(["label", from, to]); state.labels = state.labels.map(l => l === from ? to : l); },
    exists: p => Object.keys(state.files).some(f => f === p || f.startsWith(p + "/")),
    readText: p => state.files[p],
    move: (from, to) => {
      writes.push(["move", from, to]);
      state.files = Object.fromEntries(Object.entries(state.files).map(([f, t]) => [f === from || f.startsWith(from + "/") ? to + f.slice(from.length) : f, t]));
    },
    log: line => out.push(line),
  };
  return { io, state, writes, out };
}
const V2 = () => fakeProject({
  labels: ["dsh:on", "dsh:task", "Ops"],
  files: { ".claude/dashboard/dashboard.toml": 'storage = "github"\nrepo = "acme/notes"\n', ".claude/dashboard/intake.md": "x" },
});

test("run: renames the labels and moves the config, reading the repo from the toml, then says to republish", async () => {
  const p = V2();
  await migrate({}, p.io);
  assert.deepEqual(p.state.labels, ["oz:on", "oz:task", "Ops"]);
  assert.deepEqual(Object.keys(p.state.files).sort(), [".claude/organizer/intake.md", ".claude/organizer/organizer.toml"]);
  assert.match(p.out.at(-1), /\/office:organizer setup/);
});

test("run: a dry run writes nothing, and a second run finds nothing left to do", async () => {
  const dry = V2();
  await migrate({ dryRun: true }, dry.io);
  assert.deepEqual(dry.writes, []);
  assert.ok(dry.out.some(l => l.includes("dsh:on") && l.includes("oz:on")));
  const p = V2();
  await migrate({}, p.io);
  p.writes.length = 0;
  await migrate({}, p.io);
  assert.deepEqual(p.writes, []);
});
