// The tracker contract on the page (references/tracker.md): one interface, one implementation per storage mode.
// Each takes its transport as an argument, so page.test.mjs and tracker.test.mjs run it on fakes; app.js picks one by `storage`.
//
// A record, as both modes return it: { id, key, ref, url, title, body, meta, labels: [string], priority, targetDate,
// startDate, state: open | done | dismissed, comments (a count, when the mode has one), updated, rel (only from `get`) }.
// `id` is what the other operations take: the issue number on GitHub, the key in the artifact db.
// `rel` is { parent, hasParent, total, completed, type, blockedBy: [{ id, state }] }.
// A comment is { id, body, created_at, url }. Fields are named as in the contract's artifact-db encoding:
// `priority`, `targetDate`, `startDate` (snooze).
import { DSH } from "./logic.js";

const L = DSH.LABELS;
const day = v => (v == null || v === "" ? null : String(v).slice(0, 10));
const arr = (x, k) => Array.isArray(x) ? x : (x && Array.isArray(x[k]) ? x[k] : []);

// ---- GitHub: one issue per record, through the viewer's claude.ai connector (references/storage/github.md).
// `call(tool, input)` is the connector call with owner and repo filled in, answering the tool's payload.
export function githubTracker({ call, owner, repo, server = "github" }) {
  const base = `https://github.com/${owner}/${repo}`;
  // `\x3c` is `<`, kept so the code stays safe if it is ever inlined in a <script> (an HTML-comment opener there derails the parser).
  const META = /\x3c!--\s*dsh\s+(\{[\s\S]*?\})\s*-->/g;
  // The key and meta ride in the body's marker line; the last one wins, a broken one gives none.
  const splitMeta = body => {
    const text = String(body || "").replace(/\r\n/g, "\n");
    let meta = {};
    for (const m of text.matchAll(META)) { try { meta = JSON.parse(m[1]); } catch { meta = {}; } }
    return { meta, body: text.replace(META, "").replace(/\x3c!--\s*dsh[\s\S]*?-->/g, "").trim() };
  };
  const FIELD = { priority: "Priority", targetDate: "Target date", startDate: "Start date" };
  const field = (i, name) => { const f = (i.field_values || []).find(x => String(x.field || x.name || "").toLowerCase() === name.toLowerCase()); return f ? String(f.value ?? "") : ""; };
  const state = i => String(i.state || "open").toLowerCase() === "open" ? "open" : i.state_reason === "not_planned" ? "dismissed" : "done";
  const record = i => {
    const { meta, body } = splitMeta(i.body);
    return { id: i.number, key: meta.key || "", ref: "#" + i.number, url: i.html_url && String(i.html_url).includes("/issues/") ? i.html_url : base + "/issues/" + i.number,
      title: i.title || "", body, meta, labels: DSH.labelNames(i), priority: field(i, FIELD.priority) || null,
      targetDate: day(field(i, FIELD.targetDate)), startDate: day(field(i, FIELD.startDate)), state: state(i),
      comments: typeof i.comments === "number" ? i.comments : undefined, updated: i.updated_at || "" };
  };
  // `issue_read get` is the only call that carries the parent, the done count, the type and the blockers.
  const rel = g => {
    const sum = g.sub_issues_summary || {}, t = g.issue_type;
    return { parent: g.parent?.number ?? null, hasParent: !!(g.has_parent || g.parent), total: sum.total || 0, completed: sum.completed || 0,
      type: (t && typeof t === "object" ? t.name : t) || "", blockedBy: arr(g.blocked_by).map(b => ({ id: b.number, state: state(b) })) };
  };
  // Reads only: one call can fail in a burst ("upstream_error"), so each is tried twice. Writes are never repeated.
  const again = async f => { try { return await f(); } catch { await new Promise(r => setTimeout(r, 600)); return f(); } };
  const FIELDS = ["number", "title", "body", "labels", "state", "state_reason", "updated_at", "comments", "field_values"];
  const t = {
    name: "GitHub", idType: "integer", canBlock: false, mdBase: base, quotaNote: "GitHub quota",
    parseId: x => Number.isInteger(Number(x)) && Number(x) > 0 ? Number(x) : null,
    refMd: id => "#" + id,
    // One page only, at most 100: `full` says more may exist.
    async list({ labels, state: s = "open" }) {
      const r = await again(() => call("list_issues", { labels, state: s === "all" ? undefined : s.toUpperCase(), perPage: 100, fields: FIELDS }));
      const items = arr(r, "issues").map(record);
      return Object.assign(items, { full: !!r?.pageInfo?.hasNextPage || items.length >= 100 });
    },
    async status() { return (await t.list({ labels: [L.status] }))[0] || null; },
    async get(id) { const r = await again(() => call("issue_read", { method: "get", issue_number: id })), g = r?.issue || r; return Object.assign(record(g), { rel: rel(g), nodeId: g.id }); },
    async parent(id) { const r = await again(() => call("issue_read", { method: "get_parent", issue_number: id })); return r?.number ?? r?.parent?.number ?? r?.issue?.number ?? null; },
    async children(id) { return arr(await again(() => call("issue_read", { method: "get_sub_issues", issue_number: id, perPage: 100 })), "sub_issues").map(record); },
    async comments(id) {
      return DSH.byTime(arr(await call("issue_read", { method: "get_comments", issue_number: id, perPage: 100 }), "comments")
        .map(c => ({ id: c.id, body: c.body, created_at: c.created_at, url: c.html_url })));
    },
    addComment: (id, text) => call("add_issue_comment", { issue_number: id, body: text }),
    // Labels and fields in the same call; the sub-issue link is its own call (`parent_issue_number` cannot go with
    // `issue_fields`), and takes the child's id, not its number.
    async create({ key, meta, title, body, labels, priority, targetDate, assignee, type, parent }) {
      const fields = [...(priority ? [{ field_name: FIELD.priority, field_option_name: priority }] : []), ...(targetDate ? [{ field_name: FIELD.targetDate, value: targetDate }] : [])];
      // `\x3c` is `<`, as in META above.
      const text = String(body || "") + "\n\n\x3c!-- dsh " + JSON.stringify({ key, ...meta }) + " -->";
      const r = await call("issue_write", Object.assign({ method: "create", title, body: text, labels }, fields.length ? { issue_fields: fields } : {},
        assignee ? { assignees: [assignee] } : {}, type ? { type } : {}));
      const url = r?.html_url || r?.url || "", n = r?.number || Number((String(url).match(/\/issues\/(\d+)/) || [])[1]);
      if (!n) throw { code: "no_issue", message: "the tracker did not return the new issue" };
      // The issue exists by now: a failed link is reported with it, never thrown, so a retry cannot duplicate the task.
      let parentError;
      if (parent) try { await call("sub_issue_write", { method: "add", issue_number: parent, sub_issue_id: r?.id ?? (await t.get(n)).nodeId }); } catch (e) { parentError = t.failText(e); }
      return Object.assign({ id: n, ref: "#" + n, url: String(url).includes("/issues/") ? url : base + "/issues/" + n },
        parentError ? { parentNotSet: "the task was created, but not linked under #" + parent + ": " + parentError } : {});
    },
    setState: (id, s) => call("issue_write", s === "open" ? { method: "update", issue_number: id, state: "open" }
      : { method: "update", issue_number: id, state: "closed", state_reason: s === "done" ? "completed" : "not_planned" }),
    // The connector cannot delete: close as not planned and tag `dsh:delete`; the next Sync deletes it.
    async delete(id) {
      const read = await call("issue_read", { method: "get_labels", issue_number: id });
      const names = DSH.labelNames({ labels: arr(read, "labels") });
      return call("issue_write", { method: "update", issue_number: id, state: "closed", state_reason: "not_planned", labels: [...new Set([...names, "dsh:delete"])] });
    },
    // `labels` replaces the whole set: re-read first, since a run may have added labels since the poll.
    async removeLabel(id, label) {
      const keep = DSH.withoutLabel(await call("issue_read", { method: "get_labels", issue_number: id }), label);
      if (!keep) throw { code: "stale", message: "labels could not be read, nothing was written" };
      await call("issue_write", { method: "update", issue_number: id, labels: keep });
      return keep;
    },
    setField: (id, name, value) => call("issue_write", { method: "update", issue_number: id, issue_fields: [
      name === "priority" ? { field_name: FIELD[name], field_option_name: value } : { field_name: FIELD[name], value }] }),
    failText: e => ({
      consent_required: "no permission for the GitHub connector: allow it at the next prompt",
      approval_required: "no permission for the GitHub connector",
      not_in_manifest: "tool not declared in the artifact: run /office:organizer setup republish the page",
      server_not_connected: "the GitHub connector is not connected in claude.ai",
      server_not_found: "connector \"" + server + "\" not found in claude.ai",
      needs_reauth: "the GitHub connector asks to sign in again",
      selection_required: "two connectors named \"" + server + "\"",
    }[e?.code] || (e?.code || "error") + (e?.message ? ": " + e.message : "")),
  };
  return t;
}

// ---- Artifact db: one document `records/<key>` per record, in the page's own `db` (references/storage/artifact-db.md).
// The page writes only by merge, only its own fields, and every write moves `updated`.
export function artifactDbTracker({ db, now = () => new Date().toISOString(), rand = () => Math.random().toString(36).slice(2, 8), onRateLimit = () => {} }) {
  const docOf = key => db.doc("records/" + String(key).replace(/\//g, "~"));
  const record = d => ({ id: d.key, key: d.key, ref: "", url: "#" + d.key, title: d.title || "", body: d.body || "", meta: { key: d.key, ...(d.meta || {}) },
    labels: Array.isArray(d.labels) ? d.labels : [], priority: d.priority || null, targetDate: day(d.targetDate), startDate: day(d.startDate),
    state: d.state || "open", updated: d.updated || "" });
  // Every call: the db's budget error slows polling, like a GitHub rate limit.
  const guard = f => async (...a) => { try { return await f(...a); } catch (e) { if (e?.code === "resource_exhausted") onRateLimit(e); throw e; } };
  const read = async key => { const s = await docOf(key).get(); if (!s.exists) throw { code: "not_found", message: "no record " + key }; return s.data(); };
  const query = q => q.limit(1000).get().then(s => s.docs.map(d => d.data()));
  const t = {
    name: "the dashboard", idType: "string", canBlock: true, mdBase: "", quotaNote: "db rate limit",
    parseId: x => { const s = String(x ?? "").trim(); return s ? s : null; },
    refMd: id => "[" + id + "](#" + id + ")",
    // The first label filters in the db, the rest in memory (one array-contains per query).
    list: guard(async ({ labels = [], state: s = "open" }) => {
      let q = db.collection("records");
      if (s === "open") q = q.where("state", "==", "open"); else if (s === "closed") q = q.where("state", "in", ["done", "dismissed"]);
      if (labels[0]) q = q.where("labels", "array-contains", labels[0]);
      const docs = await query(q);
      const items = docs.filter(d => labels.every(l => (d.labels || []).includes(l))).map(record);
      return Object.assign(items, { full: docs.length >= 1000 });
    }),
    status: guard(async () => { const s = await docOf("status").get(); return s.exists ? record(s.data()) : null; }),
    // Relations come from the record's own fields; the done count is a query on `parent`.
    get: guard(async key => {
      const d = await read(key);
      const kids = await query(db.collection("records").where("parent", "==", d.key));
      const blockers = await Promise.all((d.blockedBy || []).map(async b => { const s = await docOf(b).get(); return s.exists ? { id: b, state: s.data().state || "open" } : null; }));
      return Object.assign(record(d), { rel: { parent: d.parent || null, hasParent: !!d.parent, total: kids.length, completed: kids.filter(k => k.state !== "open").length,
        type: d.type || "", blockedBy: blockers.filter(Boolean) } });
    }),
    parent: guard(async key => (await read(key)).parent || null),
    children: guard(async key => (await query(db.collection("records").where("parent", "==", key))).map(record)),
    // Ids are `<ISO time>_<rand>`, so id order is time order.
    comments: guard(async key => (await docOf(key).collection("comments").limit(1000).get()).docs
      .map(s => ({ id: s.id, body: String(s.data().text ?? ""), created_at: s.id.split("_")[0], url: undefined }))),
    // The page has no batch: `updated` moves first, so a failed second write leaves a record marked changed with no new
    // comment (a harmless re-read), never a comment the Sync's `updatedSince` cannot see. `update` also checks the record exists.
    addComment: guard(async (key, text) => {
      const ts = now();
      await docOf(key).update({ updated: ts });
      await docOf(key).collection("comments").doc(ts + "_" + rand()).set({ text });
    }),
    // `set` replaces a whole document: a key already taken (open or closed) is refused, never overwritten.
    create: guard(async ({ key, meta, title, body, labels, priority, targetDate, assignee, type, parent, blockedBy }) => {
      if ((await docOf(key).get()).exists) throw { code: "exists", message: "a record with key " + key + " already exists, nothing was written" };
      await docOf(key).set({ key, title, body, meta: meta || {}, labels: labels || [], priority: priority || null, targetDate: targetDate || null, startDate: null,
        state: "open", type: type || null, parent: parent || null, blockedBy: blockedBy || [], assignee: assignee || null, updated: now() });
      return { id: key, ref: "", url: "#" + key };
    }),
    setState: guard((key, s) => docOf(key).update({ state: s, updated: now() })),
    // Nested documents outlive their parent: the comments go first.
    delete: guard(async key => {
      const cs = await docOf(key).collection("comments").limit(1000).get();
      for (const c of cs.docs) await docOf(key).collection("comments").doc(c.id).delete();
      await docOf(key).delete();
    }),
    // Re-read just before writing: a run may have changed the labels since the poll.
    removeLabel: guard(async (key, label) => {
      const keep = DSH.withoutLabel(await docOf(key).get().then(s => s.exists ? s.data() : null), label);
      if (!keep) throw { code: "stale", message: "labels could not be read, nothing was written" };
      await docOf(key).update({ labels: keep, updated: now() });
      return keep;
    }),
    setField: guard((key, name, value) => docOf(key).update({ [name]: value ?? null, updated: now() })),
    failText: e => ({
      resource_exhausted: "the db's rate limit: slowing down",
      quota_exceeded: "the db is full: turn overflow on (run /office:organizer setup)",
      not_found: "the record is gone",
      not_granted: "the page has no access to its db",
      revoked: "the page lost access to its db",
    }[e?.code] || (e?.code || "error") + (e?.message ? ": " + e.message : "")),
  };
  return t;
}
