// The migration from dashboard-v2: its label, marker and config plans, and a run against fake gh and fs.
// Run from the repo root: node --test "plugins/office/skills/organizer/**/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { planLabels, planConfig, rewriteMarker, migrate } from "./migrate-from-dashboard-v2.mjs";

test("labels: every dsh: label renames to oz:, others stay, a taken oz: name is a conflict", () => {
  const plan = planLabels(["dsh:on", "dsh:mtg/weekly", "dsh:task", "oz:task", "Ops", "ready-for-agent"]);
  assert.deepEqual(plan.renames, [["dsh:on", "oz:on"], ["dsh:mtg/weekly", "oz:mtg/weekly"]]);
  assert.deepEqual(plan.conflicts, [["dsh:task", "oz:task"]]);
});

test("marker: every dsh marker becomes an oz marker, broken ones too; other text and oz markers stay", () => {
  assert.equal(rewriteMarker('Text\n\n<!-- dsh {"key":"a"} -->\n<!--dsh {broken -->'), 'Text\n\n<!-- oz {"key":"a"} -->\n<!--oz {broken -->');
  assert.equal(rewriteMarker('dsh text <!-- oz {"key":"a"} --> <!-- dshx -->'), null);
});

const D = ".claude/dashboard", O = ".claude/organizer";
const has = (...paths) => p => paths.includes(p);

test("config: the old folder moves and its toml is renamed; done is nothing; an old folder beside the new one is a conflict", () => {
  assert.deepEqual(planConfig(has(D, D + "/dashboard.toml")),
    { moves: [[D, O], [O + "/dashboard.toml", O + "/organizer.toml"]], conflicts: [] });
  assert.deepEqual(planConfig(has(O, O + "/organizer.toml")), { moves: [], conflicts: [] });
  assert.deepEqual(planConfig(has(D, D + "/dashboard.toml", O)), { moves: [], conflicts: [[D, O]] });
});

// ---- A project on disk and its tracker repo, as fakes of gh and fs; every write is recorded.
function fakeProject({ labels, files, bodies = [] }) {
  const state = { labels: [...labels], files: { ...files }, bodies: bodies.map(b => ({ ...b })) }, writes = [], out = [];
  const io = {
    listLabels: async repo => { assert.equal(repo, "acme/notes"); return [...state.labels]; },
    editLabel: async (repo, from, to) => { writes.push(["label", from, to]); state.labels = state.labels.map(l => l === from ? to : l); },
    listBodies: async repo => { assert.equal(repo, "acme/notes"); return state.bodies.map(b => ({ ...b })); },
    editBody: async (repo, item, body) => { writes.push(["body", item.kind, item.id]); state.bodies.find(b => b.kind === item.kind && b.id === item.id).body = body; },
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
const V2 = (storage = "github") => fakeProject({
  labels: ["dsh:on", "dsh:task", "Ops"],
  files: { ".claude/dashboard/dashboard.toml": `storage = "${storage}"\nrepo = "acme/notes"\n`, ".claude/dashboard/intake.md": "x" },
  bodies: [
    { kind: "issue", id: 7, body: 'Brief\n\n<!-- dsh {"key":"k"} -->' },
    { kind: "comment", id: 901, body: '<!-- dsh {"claim":"2026-11-01T10:00:00Z"} -->\nTaking it. — Claude' },
    { kind: "comment", id: 902, body: "Plain reply." },
  ],
});

test("run: renames the labels and markers and moves the config, reading the repo from the toml, then points to the next steps", async () => {
  const p = V2();
  await migrate({}, p.io);
  assert.deepEqual(p.state.labels, ["oz:on", "oz:task", "Ops"]);
  assert.deepEqual(p.state.bodies.map(b => b.body), ['Brief\n\n<!-- oz {"key":"k"} -->', '<!-- oz {"claim":"2026-11-01T10:00:00Z"} -->\nTaking it. — Claude', "Plain reply."]);
  assert.deepEqual(Object.keys(p.state.files).sort(), [".claude/organizer/intake.md", ".claude/organizer/organizer.toml"]);
  assert.match(p.out.at(-1), /migration\/README\.md/);
});

test("run: a dry run writes nothing but lists every label and marker it would rewrite, and a second run finds nothing left to do", async () => {
  const dry = V2();
  await migrate({ dryRun: true }, dry.io);
  assert.deepEqual(dry.writes, []);
  assert.ok(dry.out.some(l => l.includes("dsh:on") && l.includes("oz:on")));
  assert.ok(dry.out.some(l => l.includes("issue 7")) && dry.out.some(l => l.includes("comment 901")));
  assert.ok(!dry.out.some(l => l.includes("comment 902")));
  const p = V2();
  await migrate({}, p.io);
  p.writes.length = 0;
  await migrate({}, p.io);
  assert.deepEqual(p.writes, []);
});

test("run: outside GitHub storage only the config moves", async () => {
  const p = V2("artifact-db");
  await migrate({}, p.io);
  assert.deepEqual(p.writes.map(w => w[0]), ["move", "move"]);
  assert.ok(p.out.some(l => l.includes('"artifact-db"')));
});
