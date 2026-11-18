// The tracker contract on the page: both storage modes, run against fakes of their transport.
// Run from the repo root: node --test "plugins/office/skills/organizer/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { githubTracker, artifactDbTracker } from "./tracker.js";

// ---- Fakes. GitHub: the connector call, answering by tool (and method); every call is recorded.
function fakeGithub(answers) {
  const calls = [];
  const call = async (tool, input) => {
    calls.push({ tool, input });
    const a = answers[tool + (input.method ? ":" + input.method : "")];
    if (a instanceof Error || (a && a.code && !a.number)) throw a;
    return typeof a === "function" ? a(input) : a;
  };
  return { calls, tracker: githubTracker({ call, owner: "o", repo: "r", server: "github" }) };
}

// The artifact db: the subset of db.d.ts the page uses, in memory. Writes are recorded.
function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([p, d]) => [p, structuredClone(d)]));
  const writes = [];
  const snap = (path, d) => ({ id: path.split("/").pop(), exists: d !== undefined, data: () => d && structuredClone(d), metadata: {} });
  const docRef = path => ({
    id: path.split("/").pop(), path,
    get: async () => snap(path, docs.get(path)),
    set: async d => { writes.push({ op: "set", path, d }); docs.set(path, structuredClone(d)); },
    update: async d => {
      if (!docs.has(path)) throw { code: "invalid_argument", message: "no document" };
      writes.push({ op: "update", path, d }); docs.set(path, Object.assign(docs.get(path), structuredClone(d)));
    },
    delete: async () => { writes.push({ op: "delete", path }); docs.delete(path); },
    collection: sub => collRef(path + "/" + sub),
  });
  const ops = {
    "==": (a, b) => a === b, "in": (a, b) => b.includes(a),
    "array-contains": (a, b) => Array.isArray(a) && a.includes(b),
  };
  const collRef = (path, filters = [], max = 1000) => ({
    path,
    doc: id => docRef(path + "/" + id),
    where: (f, op, v) => collRef(path, [...filters, [f, op, v]], max),
    limit: n => collRef(path, filters, n),
    get: async () => {
      const out = [...docs.entries()]
        .filter(([p]) => p.startsWith(path + "/") && p.split("/").length === path.split("/").length + 1)
        .filter(([, d]) => filters.every(([f, op, v]) => ops[op](d[f], v)))
        .sort(([a], [b]) => a < b ? -1 : 1).slice(0, max).map(([p, d]) => snap(p, d));
      return { docs: out, size: out.length, empty: !out.length };
    },
  });
  return { docs, writes, db: { doc: docRef, collection: p => collRef(p) } };
}

const NOW = "2026-11-18T10:00:00.000Z";
const dbTracker = seed => { const f = fakeDb(seed); return { ...f, tracker: artifactDbTracker({ db: f.db, now: () => NOW, rand: () => "abc" }) }; };

// One task, as each storage mode holds it.
const META = { key: "task_x", section: "tasks", lead: "20.11" };
const ISSUE = {
  number: 7, title: "Send report", state: "OPEN", updated_at: "2026-11-17T09:00:00Z", comments: 2,
  body: "## Brief\nDo it.\n\n<!-- oz " + JSON.stringify(META) + " -->",
  labels: [{ name: "oz:task" }, { name: "oz:on" }, { name: "Ops" }],
  field_values: [{ field: "Priority", value: "High" }, { field: "Target date", value: "2026-11-20T00:00:00Z" }, { field: "Start date", value: "2026-11-19" }],
};
const DOC = {
  key: "task_x", title: "Send report", body: "## Brief\nDo it.", meta: { section: "tasks", lead: "20.11" },
  labels: ["oz:task", "oz:on", "Ops"], priority: "High", targetDate: "2026-11-20", startDate: "2026-11-19",
  state: "open", type: null, parent: null, blockedBy: [], assignee: null, updated: "2026-11-17T09:00:00Z",
};

// ---- The record both modes return.
const shared = r => ({ key: r.key, title: r.title, body: r.body, meta: r.meta, labels: r.labels, priority: r.priority,
  targetDate: r.targetDate, startDate: r.startDate, state: r.state });

test("contract: list gives the same record in both modes", async () => {
  const gh = fakeGithub({ list_issues: { issues: [ISSUE] } }).tracker;
  const ad = dbTracker({ "records/task_x": DOC }).tracker;
  const [a] = await gh.list({ labels: ["oz:on"] }), [b] = await ad.list({ labels: ["oz:on"] });
  const want = { key: "task_x", title: "Send report", body: "## Brief\nDo it.", meta: { key: "task_x", section: "tasks", lead: "20.11" },
    labels: ["oz:task", "oz:on", "Ops"], priority: "High", targetDate: "2026-11-20", startDate: "2026-11-19", state: "open" };
  assert.deepEqual(shared(a), want);
  assert.deepEqual(shared(b), want);
  assert.equal(a.id, 7); assert.equal(b.id, "task_x");
});

test("contract: comments come back in time order with body and created_at in both modes", async () => {
  const gh = fakeGithub({ "issue_read:get_comments": [
    { id: 2, body: "second", created_at: "2026-11-17T11:00:00Z", html_url: "u2" },
    { id: 1, body: "first", created_at: "2026-11-17T10:00:00Z", html_url: "u1" }] }).tracker;
  const ad = dbTracker({ "records/task_x": DOC,
    "records/task_x/comments/2026-11-17T11:00:00Z_b": { text: "second" },
    "records/task_x/comments/2026-11-17T10:00:00Z_a": { text: "first" } }).tracker;
  const pick = cs => cs.map(c => [c.body, c.created_at]);
  const want = [["first", "2026-11-17T10:00:00Z"], ["second", "2026-11-17T11:00:00Z"]];
  assert.deepEqual(pick(await gh.comments(7)), want);
  assert.deepEqual(pick(await ad.comments("task_x")), want);
});

test("contract: get carries the relations — parent, done count, type, blockers with their state", async () => {
  const gh = fakeGithub({ "issue_read:get": { ...ISSUE, parent: { number: 3 }, has_parent: true, issue_type: "Story",
    sub_issues_summary: { total: 3, completed: 1 }, blocked_by: [{ number: 9, state: "open" }, { number: 10, state: "closed" }] } }).tracker;
  const ad = dbTracker({
    "records/task_x": { ...DOC, parent: "task_p", type: "Story", blockedBy: ["task_b1", "task_b2"] },
    "records/task_p": { ...DOC, key: "task_p" },
    "records/task_b1": { ...DOC, key: "task_b1" }, "records/task_b2": { ...DOC, key: "task_b2", state: "done" },
    "records/task_c1": { ...DOC, key: "task_c1", parent: "task_x", state: "done" },
    "records/task_c2": { ...DOC, key: "task_c2", parent: "task_x" }, "records/task_c3": { ...DOC, key: "task_c3", parent: "task_x" },
  }).tracker;
  const a = (await gh.get(7)).rel, b = (await ad.get("task_x")).rel;
  assert.deepEqual(a, { parent: 3, hasParent: true, total: 3, completed: 1, type: "Story", blockedBy: [{ id: 9, state: "open" }, { id: 10, state: "done" }] });
  assert.deepEqual(b, { parent: "task_p", hasParent: true, total: 3, completed: 1, type: "Story", blockedBy: [{ id: "task_b1", state: "open" }, { id: "task_b2", state: "done" }] });
});

// ---- GitHub encoding.
test("github: the body's last oz marker is the meta, and it never shows in the body; broken JSON leaves meta empty", async () => {
  const two = { ...ISSUE, body: "Text\n<!-- oz {\"key\":\"old\"} -->\n<!-- oz {\"key\":\"new\"} -->" };
  const bad = { ...ISSUE, number: 8, body: "Text\n<!-- oz {broken -->" };
  const [a, b] = await fakeGithub({ list_issues: { issues: [two, bad] } }).tracker.list({ labels: ["oz:on"] });
  assert.deepEqual(a.meta, { key: "new" }); assert.equal(a.body, "Text");
  assert.deepEqual(b.meta, {}); assert.equal(b.body, "Text");
});

test("github: a closed issue is done, or dismissed when not planned; links point to github.com", async () => {
  const [d, x] = await fakeGithub({ list_issues: { issues: [{ ...ISSUE, state: "CLOSED", state_reason: "completed" },
    { ...ISSUE, number: 8, state: "closed", state_reason: "not_planned" }] } }).tracker.list({ labels: ["oz:task"], state: "closed" });
  assert.equal(d.state, "done"); assert.equal(x.state, "dismissed");
  assert.equal(d.url, "https://github.com/o/r/issues/7"); assert.equal(d.ref, "#7");
});

test("github: one page only, full at 100 or when GitHub says more", async () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ ...ISSUE, number: i + 1 }));
  assert.equal((await fakeGithub({ list_issues: { issues: many } }).tracker.list({ labels: ["oz:on"] })).full, true);
  assert.equal((await fakeGithub({ list_issues: { issues: [ISSUE], pageInfo: { hasNextPage: true } } }).tracker.list({ labels: ["oz:on"] })).full, true);
  assert.equal((await fakeGithub({ list_issues: { issues: [ISSUE] } }).tracker.list({ labels: ["oz:on"] })).full, false);
});

test("github: create writes the marker line, the issue fields and the assignee, then links the parent", async () => {
  const { calls, tracker } = fakeGithub({ "issue_write:create": { number: 12, id: 555, html_url: "https://github.com/o/r/issues/12" }, "sub_issue_write:add": {} });
  const r = await tracker.create({ key: "task_n", meta: { section: "tasks" }, title: "T", body: "## Brief\nB", labels: ["oz:task", "oz:on"],
    priority: "Urgent", targetDate: "2026-12-01", assignee: "bot", type: "Task", parent: 4 });
  assert.deepEqual(r, { id: 12, ref: "#12", url: "https://github.com/o/r/issues/12" });
  const c = calls[0].input;
  assert.equal(c.body, "## Brief\nB\n\n<!-- oz {\"key\":\"task_n\",\"section\":\"tasks\"} -->");
  assert.deepEqual(c.issue_fields, [{ field_name: "Priority", field_option_name: "Urgent" }, { field_name: "Target date", value: "2026-12-01" }]);
  assert.deepEqual(c.assignees, ["bot"]); assert.equal(c.type, "Task");
  assert.deepEqual(calls[1], { tool: "sub_issue_write", input: { method: "add", issue_number: 4, sub_issue_id: 555 } });
});

test("github: a failed parent link is reported with the created task, never thrown", async () => {
  const { tracker } = fakeGithub({ "issue_write:create": { number: 12, id: 555, html_url: "https://github.com/o/r/issues/12" }, "sub_issue_write:add": { code: "other", message: "boom" } });
  const r = await tracker.create({ key: "k", meta: {}, title: "T", body: "B", labels: [], parent: 4 });
  assert.equal(r.id, 12); assert.match(r.parentNotSet, /not linked under #4.*boom/);
});

test("github: snooze is the Start date issue field; done and dismissed close with their reason", async () => {
  const { calls, tracker } = fakeGithub({ issue_write: {}, "issue_write:update": {} });
  await tracker.setField(7, "startDate", "2026-11-20");
  await tracker.setState(7, "done"); await tracker.setState(7, "dismissed");
  assert.deepEqual(calls.map(c => c.input), [
    { method: "update", issue_number: 7, issue_fields: [{ field_name: "Start date", value: "2026-11-20" }] },
    { method: "update", issue_number: 7, state: "closed", state_reason: "completed" },
    { method: "update", issue_number: 7, state: "closed", state_reason: "not_planned" }]);
});

test("github: delete closes as not planned with oz:delete added to the labels read fresh; the Sync deletes it", async () => {
  const { calls, tracker } = fakeGithub({ "issue_read:get_labels": { labels: [{ name: "oz:task" }, { name: "oz:on" }] }, "issue_write:update": {} });
  await tracker.delete(7);
  assert.deepEqual(calls[1].input, { method: "update", issue_number: 7, state: "closed", state_reason: "not_planned", labels: ["oz:task", "oz:on", "oz:delete"] });
});

test("github: removeLabel writes the fresh set without it, and refuses when the label was not read", async () => {
  const { calls, tracker } = fakeGithub({ "issue_read:get_labels": { labels: [{ name: "oz:on" }, { name: "oz:replied" }] }, "issue_write:update": {} });
  assert.deepEqual(await tracker.removeLabel(7, "oz:replied"), ["oz:on"]);
  assert.deepEqual(calls[1].input, { method: "update", issue_number: 7, labels: ["oz:on"] });
  await assert.rejects(tracker.removeLabel(7, "oz:needs-you"), { code: "stale" });
});

test("github: ids are issue numbers, written #N", () => {
  const { tracker } = fakeGithub({});
  assert.equal(tracker.parseId("12"), 12); assert.equal(tracker.parseId("x"), null); assert.equal(tracker.parseId(0), null);
  assert.equal(tracker.refMd(12), "#12"); assert.equal(tracker.idType, "integer");
  assert.equal(tracker.mdBase, "https://github.com/o/r"); assert.equal(tracker.canBlock, false);
});

test("github: connector error codes read as plain sentences", () => {
  const { tracker } = fakeGithub({});
  assert.match(tracker.failText({ code: "consent_required" }), /permission/);
  assert.equal(tracker.failText({ code: "x", message: "y" }), "x: y");
});

// ---- Artifact-db encoding.
test("artifact-db: list filters state and every label; status is records/status", async () => {
  const { tracker } = dbTracker({ "records/a": { ...DOC, key: "a" }, "records/b": { ...DOC, key: "b", labels: ["oz:on"] },
    "records/c": { ...DOC, key: "c", state: "done" }, "records/status": { ...DOC, key: "status", labels: ["oz:status"], body: "Mail failed", meta: { updated: NOW } } });
  assert.deepEqual((await tracker.list({ labels: ["oz:on", "oz:task"] })).map(r => r.id), ["a"]);
  assert.deepEqual((await tracker.list({ labels: ["oz:task"], state: "closed" })).map(r => r.id), ["c"]);
  const s = await tracker.status();
  assert.equal(s.body, "Mail failed"); assert.equal(s.meta.updated, NOW);
  assert.equal((await dbTracker({}).tracker.status()), null);
});

test("artifact-db: a record's link is #<key> in the page; a / in a key is ~ in its doc id", async () => {
  const { tracker, docs } = dbTracker({});
  const r = await tracker.create({ key: "pr_a/b_1", meta: { section: "prs" }, title: "T", body: "B", labels: ["oz:pr"] });
  assert.deepEqual(r, { id: "pr_a/b_1", ref: "", url: "#pr_a/b_1" });
  assert.ok(docs.has("records/pr_a~b_1"));
  assert.equal(tracker.refMd("task_x"), "[task_x](#task_x)");
  assert.equal(tracker.parseId(" task_x "), "task_x"); assert.equal(tracker.parseId(""), null);
  assert.equal(tracker.idType, "string"); assert.equal(tracker.mdBase, ""); assert.equal(tracker.canBlock, true);
});

test("artifact-db: create sets every Encoding field once, open, with updated", async () => {
  const { tracker, docs } = dbTracker({});
  await tracker.create({ key: "task_n", meta: { section: "tasks" }, title: "T", body: "B", labels: ["oz:task"], priority: "Low", assignee: "claude", parent: "task_p", blockedBy: ["task_b"], type: "Task" });
  assert.deepEqual(docs.get("records/task_n"), { key: "task_n", title: "T", body: "B", meta: { section: "tasks" }, labels: ["oz:task"],
    priority: "Low", targetDate: null, startDate: null, state: "open", type: "Task", parent: "task_p", blockedBy: ["task_b"], assignee: "claude", updated: NOW });
});

test("artifact-db: the page writes by merge only its own fields, each with updated", async () => {
  const { tracker, writes } = dbTracker({ "records/task_x": DOC });
  await tracker.setField("task_x", "startDate", "2026-11-20");
  await tracker.setState("task_x", "done");
  assert.deepEqual(writes, [
    { op: "update", path: "records/task_x", d: { startDate: "2026-11-20", updated: NOW } },
    { op: "update", path: "records/task_x", d: { state: "done", updated: NOW } }]);
});

test("artifact-db: removeLabel re-reads the labels first and refuses when the label is gone", async () => {
  const { tracker, writes } = dbTracker({ "records/task_x": { ...DOC, labels: ["oz:on", "oz:replied", "late"] } });
  assert.deepEqual(await tracker.removeLabel("task_x", "oz:replied"), ["oz:on", "late"]);
  assert.deepEqual(writes, [{ op: "update", path: "records/task_x", d: { labels: ["oz:on", "late"], updated: NOW } }]);
  await assert.rejects(tracker.removeLabel("task_x", "oz:replied"), { code: "stale" });
});

test("artifact-db: the record's updated moves, then the comment is its own document under the record", async () => {
  const { tracker, writes } = dbTracker({ "records/task_x": DOC });
  await tracker.addComment("task_x", "hi");
  assert.deepEqual(writes, [
    { op: "update", path: "records/task_x", d: { updated: NOW } },
    { op: "set", path: "records/task_x/comments/" + NOW + "_abc", d: { text: "hi" } }]);
  // no record, no orphan comment
  const empty = dbTracker({});
  await assert.rejects(empty.tracker.addComment("gone", "hi"));
  assert.deepEqual(empty.writes, []);
});

test("artifact-db: create refuses a key already taken, open or closed, and writes nothing", async () => {
  const { tracker, docs, writes } = dbTracker({ "records/task_x": { ...DOC, state: "done" } });
  await assert.rejects(tracker.create({ key: "task_x", meta: {}, title: "New", body: "B", labels: [] }), { code: "exists" });
  assert.deepEqual(writes, []); assert.equal(docs.get("records/task_x").title, "Send report");
});

test("artifact-db: delete removes the comments first, then the record, at once", async () => {
  const { tracker, docs } = dbTracker({ "records/task_x": DOC, "records/task_x/comments/t_a": { text: "a" }, "records/task_y": { ...DOC, key: "task_y" } });
  await tracker.delete("task_x");
  assert.deepEqual([...docs.keys()], ["records/task_y"]);
});

test("artifact-db: a missing record is not-found; the db's budget error slows polling and reads as rate-limited", async () => {
  let slowed = 0;
  const f = fakeDb({});
  const tracker = artifactDbTracker({ db: f.db, now: () => NOW, onRateLimit: () => slowed++ });
  await assert.rejects(tracker.get("nope"), { code: "not_found" });
  f.db.collection = () => { throw { code: "resource_exhausted", message: "scan" }; };
  await assert.rejects(tracker.list({ labels: ["oz:on"] }), { code: "resource_exhausted" });
  assert.equal(slowed, 1);
  assert.match(tracker.failText({ code: "resource_exhausted" }), /rate/i);
  assert.match(tracker.failText({ code: "quota_exceeded" }), /full/);
});
