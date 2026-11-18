// The page's pure logic, no DOM: app.js and page.test.mjs import it.
export const DSH = (() => {
  // The contract's labels (references/tracker.md#labels), the same in every storage mode.
  const LABELS = Object.freeze({ on: "dsh:on", task: "dsh:task", meeting: "dsh:meeting", status: "dsh:status",
    needsYou: "dsh:needs-you", replied: "dsh:replied", series: "dsh:mtg/", agent: "ready-for-agent", prefix: "dsh:" });
  const HEADS = { brief: "Brief", prepare: "Prepare", terms: "Terms", prompts: "Prompts", suggestions: "Suggestions" };

  // A record's body (tracker.js): the fixed `## ` headings. Its meta is the record's own, kept apart by the storage mode.
  function parseCard(body) {
    const parts = {}; let cur = "brief"; const lines = { brief: [] };
    let fence = false;
    for (const line of String(body || "").replace(/\r\n/g, "\n").split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      const h = !fence && line.match(/^##\s+(.+?)\s*$/);
      const id = h && Object.keys(HEADS).find(k => HEADS[k].toLowerCase() === h[1].toLowerCase());
      if (id) { cur = id; lines[cur] = lines[cur] || []; continue; }
      (lines[cur] = lines[cur] || []).push(line);
    }
    for (const k of Object.keys(HEADS)) parts[k] = (lines[k] || []).join("\n").trim();
    const terms = {};
    for (const l of parts.terms.split("\n")) {
      const m = l.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*[—–:-]\s*(.+?)\s*$/);
      if (m) terms[m[1]] = m[2];
    }
    const prompts = [...parts.prompts.matchAll(/(```|~~~)[^\n]*\n([\s\S]*?)\n\1/g)].map(m => m[2].trim());
    const suggestions = parts.suggestions.split("\n").map(l => l.match(/^\s*[-*]\s+(.+?)\s*$/)).filter(Boolean).map(m => m[1]);
    return { brief: parts.brief, prepare: parts.prepare, terms, prompts, suggestions };
  }

  // Record fields: startDate = snoozed until, targetDate = due, priority = order within a group.
  const labelNames = rec => (rec.labels || []).map(l => typeof l === "string" ? l : l.name);
  // Dates compare by day, whatever time part the store adds.
  const day = v => String(v || "").slice(0, 10);
  // A label write replaces the whole set: compute it from a fresh read, and refuse (null) unless the label is really
  // there, so a bad read can never strip `dsh:on` and the rest.
  const withoutLabel = (read, label) => {
    const names = labelNames({ labels: (read && read.labels) || [] });
    return names.includes(label) ? names.filter(l => l !== label) : null;
  };
  const isVisible = (rec, today) => !(day(rec.startDate) > today);
  // Ids are issue numbers in one storage mode and keys in the other: numbers compare as numbers, the rest as text.
  const byId = (a, b) => typeof a.id === "number" && typeof b.id === "number" ? a.id - b.id : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;

  const PRIORITY = ["urgent", "high", "medium", "low"];
  const rank = rec => { const i = PRIORITY.indexOf(String(rec.priority || "").toLowerCase()); return i < 0 ? PRIORITY.length : i; };
  const byOrder = (a, b) => {
    const ny = i => i._lifted || labelNames(i).includes(LABELS.needsYou) ? 0 : 1;
    const due = i => day(i.targetDate) || "9999-99-99";
    return ny(a) - ny(b) || rank(a) - rank(b) || (due(a) < due(b) ? -1 : due(a) > due(b) ? 1 : 0) || byId(a, b);
  };

  // Dates are local YYYY-MM-DD strings; ⏸ offers the next working day or +7 days.
  function snoozeDate(today, week) {
    const [y, m, d] = today.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    if (week) t.setUTCDate(t.getUTCDate() + 7);
    else do t.setUTCDate(t.getUTCDate() + 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6);
    return t.toISOString().slice(0, 10);
  }
  // A date the model gives for ⏸: a real YYYY-MM-DD after today, else nothing.
  const snoozeUntil = (date, today) => {
    const s = String(date || "");
    const real = /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
    return real && s > today ? s : null;
  };


  // ---- Relations (ADR 0008, #169): parent, blocked-by and type, read by the storage mode's `get` (tracker.js).
  const isOpen = i => String(i.state || "open").toLowerCase() === "open";
  const TYPES = ["Epic", "Story", "Task"];
  // What a card needs to know about its place in the tree: the `rel` of a `get`, none before one.
  const relOf = r => r?.rel || { parent: null, hasParent: false, total: 0, completed: 0, type: "", blockedBy: [] };
  const countLabel = r => r.total ? r.completed + "/" + r.total : "";
  // The words on the «Tasks: N» / «Subtasks: N» buttons: English, or the config's `labels`.
  const uiLabels = labels => ({ tasks: labels?.tasks || "Tasks", subtasks: labels?.subtasks || "Subtasks" });
  const canDone = r => r.total - r.completed <= 0;
  const openSubs = list => (list || []).filter(isOpen).sort(byId);
  const isBlocked = r => (r.blockedBy || []).some(isOpen);
  // One level per click: a level is fetched when first expanded, kept until `reset` (a poll), never fetched ahead.
  function lazyTree(fetch) {
    const cache = new Map();
    return {
      expand(n) {
        if (!cache.has(n)) cache.set(n, Promise.resolve().then(() => fetch(n)).catch(e => { cache.delete(n); throw e; }));
        return cache.get(n);
      },
      reset: () => cache.clear(),
    };
  }
  // From a subtask up to its root. A parent met twice is a cycle (the artifact db may hold one): stop and say so. 8 levels is GitHub's own limit.
  async function walkUp(start, parentOf, max = 8) {
    const path = [start], seen = new Set(path);
    let cur = start;
    while (path.length < max) {
      const p = await parentOf(cur);
      if (p == null) break;
      if (seen.has(p)) return { root: cur, path, cycle: true };
      seen.add(p); path.push(p); cur = p;
    }
    return { root: cur, path, cycle: false };
  }
  // Walks → root id -> { path, cycle }: the card to place as needing Ilya and the cards to open on the way down.
  const liftMap = walks => {
    const m = new Map();
    walks.forEach(w => { const e = m.get(w.root) || { path: new Set(), cycle: false }; w.path.forEach(n => e.path.add(n)); e.cycle = e.cycle || w.cycle; m.set(w.root, e); });
    return m;
  };
  // What a task row shows once expanded: the list item it was drawn from, with the body (and labels) of its own `get`.
  // A failed or missing read leaves the list item as it was.
  const rowIssue = (item, got) => got && !(got instanceof Error) ? { ...item, body: got.body ?? item.body, labels: got.labels || item.labels, rel: got.rel || item.rel } : item;
  // The detail a card and a task row share, in one order. A card shows the brief's first paragraph (the gist) in its head,
  // so its description is the rest; a row has no head text, so its description is the whole brief.
  function detailParts(c, { total = 0, gistShown = true } = {}) {
    const [gist, ...rest] = c.brief.split(/\n\s*\n/);
    const description = gistShown ? rest.join("\n\n") : c.brief;
    return { gist: gist || "", description,
      order: [description && "description", total && "subtasks", c.prepare && "prepare", c.prompts.length && "prompts", "cloud", "local"].filter(Boolean) };
  }
  // A task in a Cloud prompt: its own place in the tree and no more. A parent lists its open children; a child gets its
  // direct parent's brief and its open siblings. Further ancestors, comments and other Cloud chats are never passed in.
  // A record is named to Claude as `#<id>`, the id its tools take.
  function hierarchyText(n, { rel, kids = [], parent, sibs = [], relOf: rOf = relOf } = {}) {
    const meta = i => { const r = rOf(i), l = labelNames(i).filter(x => !x.startsWith(LABELS.prefix));
      return (r.type ? " [" + r.type + "]" : "") + (l.length ? " (" + l.join(", ") + ")" : "") + (isBlocked(r) ? " Blocked" : ""); };
    const out = [];
    if (rel?.total) {
      const open = openSubs(kids).map(k => "- #" + k.id + " " + k.title + meta(k));
      out.push("Subtasks: " + rel.completed + " of " + rel.total + " done. Open:", ...(open.length ? open : ["(none)"]));
    }
    if (parent) {
      const pr = rOf(parent), body = String(parent.body || "").trim();
      out.push("Parent #" + parent.id + (pr.type ? " [" + pr.type + "]" : "") + ": " + parent.title + (body ? "\n" + body : ""));
      const sib = openSubs(sibs).filter(s => s.id !== n);
      out.push("Siblings (open): " + (sib.length ? sib.map(s => "#" + s.id + " " + s.title).join("; ") : "none"));
    }
    return out.join("\n");
  }
  const seriesLabels = rec => labelNames(rec).filter(l => l.startsWith(LABELS.series));
  const seriesOnPage = recs => new Set(recs.filter(i => labelNames(i).includes(LABELS.meeting)).flatMap(seriesLabels));
  // Open tasks carrying any of `labels`, each once: a task of two series of one meeting still counts once.
  const seriesTasks = (tasks, labels) => { const seen = new Set(); return tasks.filter(t => isOpen(t) && labelNames(t).includes(LABELS.task) && labels.some(l => labelNames(t).includes(l)) && !seen.has(t.id) && seen.add(t.id)); };
  // The cards the sections show: no subtask (it shows under its parent), no task of a series that has a card on the page.
  const topLevel = (recs, rels, onPage) => recs.filter(i => !(rels[i.id]?.hasParent)
    && !(labelNames(i).includes(LABELS.task) && seriesLabels(i).some(l => onPage.has(l))));

  // Claude writes as the user, so its comments are told apart only by the reply signature at the end.
  const isClaude = (c, sig) => String(c.body || "").trimEnd().endsWith(sig);
  const byTime = list => [...list].sort((a, b) => String(a.created_at) < String(b.created_at) ? -1 : String(a.created_at) > String(b.created_at) ? 1 : 0);
  // The user's comments after the last signed reply: what a sync still has to answer.
  function unanswered(comments, sig) {
    const t = byTime(comments || []);
    let last = -1; t.forEach((c, i) => { if (isClaude(c, sig)) last = i; });
    return t.slice(last + 1);
  }
  // A reply always carries the link to every task it created.
  const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withLinks = (text, made) => made.reduce((t, m) => new RegExp("#" + reEsc(m.id) + "(?![\\w-])").test(t) ? t : t + " [#" + m.id + "](" + m.url + ")", String(text || ""));

  // ---- GitHub-flavoured Markdown, the subset issue bodies and comments use. The artifact CSP rules out a CDN
  // library, so it is inline. Everything is escaped first; only http(s)/mailto links become anchors, plus `#<key>`
  // links to a record on this page (artifact-db mode), which open in place.
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const anchor = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  function inline(raw) {
    const keep = []; const hold = h => "\u0000" + (keep.push(h) - 1) + "\u0000";
    let s = String(raw).split(/(`[^`\n]+`)/).map(p => /^`[^`]+`$/.test(p) ? hold("<code>" + esc(p.slice(1, -1)) + "</code>") : esc(p)).join("");
    s = s.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_, t, u) => hold(anchor(u, t)));
    s = s.replace(/\[([^\]\n]+)\]\((#[A-Za-z0-9_.~:@+\/-]+)\)/g, (_, t, u) => hold(`<a href="${u}">${t}</a>`));
    s = s.replace(/\bhttps?:\/\/[^\s<\u0000]+/g, u => {
      const tail = (u.match(/(?:[.,;:!?)]|&#39;|&quot;)+$/) || [""])[0];
      const url = u.slice(0, u.length - tail.length);
      return hold(anchor(url, url)) + tail;
    });
    if (BASE) s = s.replace(/(^|[\s(])#(\d+)\b/g, (_, pre, n) => pre + hold(anchor(BASE + "/issues/" + n, "#" + n)));
    s = s.replace(/\*\*(?=\S)(.+?)\*\*/g, "<strong>$1</strong>").replace(/__(?=\S)(.+?)__/g, "<strong>$1</strong>")
      .replace(/~~(?=\S)(.+?)~~/g, "<del>$1</del>")
      .replace(/(^|[^\w*])\*(?=\S)(.+?)\*(?![\w*])/g, "$1<em>$2</em>").replace(/(^|[^\w])_(?=\S)(.+?)_(?!\w)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  }
  const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const FENCE = /^\s*(```|~~~)/;
  const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  const isTable = (l, next) => l.includes("|") && next != null && SEP.test(next) && next.includes("-");
  const startsBlock = (l, next) => !l.trim() || FENCE.test(l) || /^#{1,6}\s/.test(l) || /^\s*>/.test(l) || HR.test(l) || LIST.test(l) || isTable(l, next);
  function list(items) {
    const base = items[0].ind, tag = items[0].ord ? "ol" : "ul";
    let out = `<${tag}>`, i = 0;
    while (i < items.length) {
      const it = items[i++]; const kids = [];
      while (i < items.length && items[i].ind > base) kids.push(items[i++]);
      const task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
      out += task
        ? `<li class="task"><input type="checkbox" disabled${task[1] === " " ? "" : " checked"}> ${inline(task[2])}`
        : `<li>${inline(it.text)}`;
      out += (kids.length ? list(kids) : "") + "</li>";
    }
    return out + `</${tag}>`;
  }
  // `base` (a repo URL) turns `#N` into an issue link, as on github.com; nested calls inherit it.
  let BASE = "";
  function md(text, base) {
    if (base === undefined) return render(text);
    const prev = BASE; BASE = base || "";
    try { return render(text); } finally { BASE = prev; }
  }
  function render(text) {
    const L = String(text || "").replace(/\r\n/g, "\n").split("\n"); const out = []; let i = 0;
    while (i < L.length) {
      const l = L[i];
      if (!l.trim()) { i++; continue; }
      const f = l.match(FENCE);
      if (f) { const body = []; i++; while (i < L.length && !L[i].trim().startsWith(f[1])) body.push(L[i++]); i++; out.push("<pre><code>" + esc(body.join("\n")) + "</code></pre>"); continue; }
      const h = l.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/);
      if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
      if (HR.test(l)) { out.push("<hr>"); i++; continue; }
      if (/^\s*>/.test(l)) { const q = []; while (i < L.length && /^\s*>/.test(L[i])) q.push(L[i++].replace(/^\s*>\s?/, "")); out.push("<blockquote>" + render(q.join("\n")) + "</blockquote>"); continue; }
      if (isTable(l, L[i + 1])) {
        const head = cells(l); i += 2; const rows = [];
        while (i < L.length && L[i].includes("|") && L[i].trim()) rows.push(cells(L[i++]));
        out.push("<table><thead><tr>" + head.map(c => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>"
          + rows.map(r => "<tr>" + head.map((_, k) => "<td>" + inline(r[k] || "") + "</td>").join("") + "</tr>").join("") + "</tbody></table>");
        continue;
      }
      if (LIST.test(l)) {
        const items = [];
        while (i < L.length && L[i].trim()) {
          const m = L[i].match(LIST);
          if (m) items.push({ ind: m[1].replace(/\t/g, "    ").length, ord: /\d/.test(m[2]), text: m[3] });
          else items[items.length - 1].text += " " + L[i].trim();
          i++;
        }
        out.push(list(items)); continue;
      }
      const p = [l]; i++;
      while (i < L.length && !startsBlock(L[i], L[i + 1])) p.push(L[i++]);
      out.push("<p>" + p.map(x => inline(x.trim())).join("<br>\n") + "</p>");
    }
    return out.join("\n");
  }

  // The last run is too old, or none is recorded: the routine has stopped writing.
  const isStale = (updated, now, hours) => !(now - Date.parse(updated) <= hours * 3600e3);

  // ---- Assistant. `sample` is memoryless: every call gets the rules turn, then the chat the page keeps.
  // The cap counts UTF-8 bytes; drop the oldest turns first, never the rules or the newest user turn.
  const utf8 = s => new TextEncoder().encode(s).length;
  function trimTurns(rules, turns, maxBytes) {
    const t = [...turns];
    let size = utf8(rules.content) + t.reduce((n, x) => n + utf8(x.content), 0);
    while (t.length > 1 && size > maxBytes) size -= utf8(t.shift().content);
    return [rules, ...t];
  }

  // What the "new task" tool writes: a record for the tracker's `create`. The rules a prompt could bend are fixed here:
  // the `dsh:` labels, a key that does not collide (a new matter by definition, so it carries the minute it was made),
  // valid fields only. Ids (`card`, `parent`, `blockedBy`) go through the storage mode's `ctx.parseId`; `ctx.refMd`
  // writes the link to the card the task belongs to.
  const OPTIONS = ["Urgent", "High", "Medium", "Low"];
  function newTask(input, ctx) {
    const known = new Set(ctx.known || []), parseId = ctx.parseId || (x => Number(x) > 0 ? Number(x) : null), refMd = ctx.refMd || (id => "#" + id);
    const extra = [input.series && LABELS.series + input.series, input.track].filter(l => l && known.has(l) && (!l.startsWith(LABELS.prefix) || l.startsWith(LABELS.series)));
    const priority = OPTIONS.find(o => o.toLowerCase() === String(input.priority || "").toLowerCase());
    const target = /^\d{4}-\d{2}-\d{2}$/.test(input.target || "") ? input.target : "";
    const slug = String(input.slug || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "new";
    const card = input.card == null ? null : parseId(input.card);
    const body = "## Brief\n" + String(input.brief || input.title).trim() + (card != null ? "\n\n→ " + refMd(card) : "");
    // An agent task (ADR 0005): `ready-for-agent`, the repo's triage label, is added whether or not a card carries it yet.
    if (ctx.assignee) extra.push(LABELS.agent);
    // Local input has no title of its own: its first line is one, cut to GitHub-list length.
    const first = String(input.brief || "").trim().split("\n")[0].trim();
    const title = String(input.title || "").trim() || (first.length > 80 ? first.slice(0, 79) + "…" : first);
    const parent = input.parent == null ? undefined : parseId(input.parent) ?? undefined;
    const blockedBy = [...new Set((input.blockedBy || []).map(parseId).filter(x => x != null))];
    const type = TYPES.find(t => t.toLowerCase() === String(input.type || "").toLowerCase());
    return { key: "task_" + slug + "_" + ctx.stamp, meta: { section: ctx.section, lead: target ? target.slice(8, 10) + "." + target.slice(5, 7) : "—" },
      title, body, labels: [...new Set([LABELS.task, LABELS.on, ...extra])], priority, targetDate: target || undefined, assignee: ctx.assignee || undefined,
      parent, blockedBy: blockedBy.length ? blockedBy : undefined, type };
  }

  // The write rule: does a tool call wait for the user's click? Decided from the tool's annotations, never its name,
  // with the MCP defaults (no `readOnlyHint` is a write, no `destructiveHint` is destructive), so an unknown tool asks.
  // Reads never ask; tracker writes ask only when destructive (delete); any other write asks, on a preview.
  const needsClick = (a, tracker) => !a?.readOnlyHint && (!tracker || a?.destructiveHint !== false);

  // ---- Cloud chat (ADR 0005). The repo branch the assistant reads: the one with the newest commit.
  const commitDate = c => String(c?.commit?.committer?.date || c?.commit?.author?.date || "");
  const lastActive = heads => (heads || []).filter(h => h && h.name && h.date).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.name || null;
  // A file read: the text comes in an embedded resource (`text`, or `blob` in base64), after a download notice.
  const b64utf8 = b => new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0)));
  function fileText(result) {
    const blocks = (result && result.content) || [];
    const res = blocks.map(c => c && c.resource).filter(Boolean)
      .map(r => typeof r.text === "string" ? r.text : typeof r.blob === "string" ? b64utf8(r.blob) : "").filter(Boolean);
    return res.length ? res.join("\n\n") : blocks.filter(c => c && c.type === "text").map(c => c.text).join("\n");
  }
  // `sample` refuses a tool description over 1 KB: cut `text` to `max` UTF-8 bytes, ending in "…" when cut.
  function fitBytes(text, max) {
    const enc = new TextEncoder(), t = String(text ?? "");
    if (enc.encode(t).length <= max) return t;
    let lo = 0, hi = t.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (enc.encode(t.slice(0, m) + "…").length <= max) lo = m; else hi = m - 1; }
    return t.slice(0, lo).replace(/[\uD800-\uDBFF]$/, "") + "…";
  }
  // `sample` refuses an inputSchema over 4 KB: shed what the model can do without, in steps (notes, then long
  // descriptions, then all descriptions) until the JSON fits `max` bytes; null when even the bare shape is too big.
  function fitSchema(schema, max) {
    const size = x => new TextEncoder().encode(JSON.stringify(x)).length;
    const walk = (x, f) => Array.isArray(x) ? x.map(v => walk(v, f)) : x && typeof x === "object"
      ? Object.fromEntries(Object.entries(x).flatMap(([k, v]) => f(k, v, x) ?? [[k, walk(v, f)]])) : x;
    // A key named "description" inside `properties` is a property, not a note.
    const note = (k, v, o) => o.type !== undefined || o.$ref !== undefined || o.anyOf || o.oneOf || o.items || o.properties || o.enum;
    const steps = [
      (k, v, o) => ["examples", "title", "$comment", "default"].includes(k) && note(k, v, o) ? [] : null,
      (k, v, o) => k === "description" && typeof v === "string" && note(k, v, o) ? [[k, fitBytes(v, 120)]] : null,
      (k, v, o) => k === "description" && typeof v === "string" && note(k, v, o) ? [] : null,
    ];
    let s = schema;
    for (const f of [null, ...steps]) { if (f) s = walk(s, f); if (size(s) <= max) return s; }
    return null;
  }
  // One `sample` call takes at most `max` tools: the page's own first, then the connector tools setup chose.
  // The tracker server is reached only through the page's own tools, so none of its raw tools (a repo write) gets in.
  function pickTools(own, extra, trackerServer, max = 16) {
    const room = Math.max(0, max - own.length);
    return [...own.slice(0, max), ...(extra || []).filter(t => t.server !== trackerServer).slice(0, room)];
  }
  // A connector write goes out only with the AI marker in one of its text fields; no marker set fails closed.
  const hasMarker = (input, marker) => !!marker && (function walk(v) {
    return typeof v === "string" ? v.includes(marker) : v && typeof v === "object" ? Object.values(v).some(walk) : false;
  })(input);
  // A stored conversation is one db document (≤ 256 KiB): drop the oldest turns to fit, never the newest.
  function fitConversation(turns, maxBytes) {
    const t = [...turns];
    while (t.length > 1 && utf8(JSON.stringify({ turns: t })) > maxBytes) t.shift();
    return t;
  }
  // A failed exchange leaves its user turn unanswered: the new message takes its place.
  const nextTurns = (turns, text) => [...(turns.length && turns[turns.length - 1].role === "user" ? turns.slice(0, -1) : turns), { role: "user", content: text }];

  // A card in a Cloud prompt: the card without its metadata line, then its comment thread (read only), oldest first.
  // Over `maxBytes` (UTF-8) the oldest comments go first; the newest always stays.
  function cardView(rec, comments, sig, maxBytes = Infinity, hier = "") {
    const top = "The card #" + rec.id + ": " + rec.title + "\n\n" + String(rec.body || "").trim()
      + (hier ? "\n\nIts place in the task hierarchy:\n" + (maxBytes < Infinity ? fitBytes(hier, Math.floor(maxBytes / 3)) : hier) : "")
      + "\n\nIts comment thread, read only (a sync answers it), oldest first:\n\n";
    const cs = byTime(comments || []).map(c => (isClaude(c, sig) ? "Claude" : "User") + ", " + c.created_at + ":\n" + c.body);
    const SEP = "\n\n---\n\n";
    let cut = 0;
    const text = () => top + (cut ? "(" + cut + " older comment" + (cut > 1 ? "s" : "") + " left out)" + SEP : "") + (cs.slice(cut).join(SEP) || "(no comments)");
    while (cut < cs.length - 1 && utf8(text()) > maxBytes) cut++;
    return text();
  }

  // ---- Long tasks (#130). One `sample` call allows only a few tool rounds, so the page continues it, up to MAX_ROUNDS
  // calls. The rules turn tells Claude to end an unfinished answer with MARK; the page strips it and asks for the rest.
  const MARK = "[[continue]]", MAX_ROUNDS = 5;
  const splitMark = reply => { const t = String(reply || "").trimEnd(), more = t.endsWith(MARK); return { text: more ? t.slice(0, -MARK.length).trimEnd() : t, more }; };
  // The next call is memoryless: it gets what Claude said so far and the order to go on.
  const continueInput = (input, said) => [...input, { role: "assistant", content: said || "(no text yet)" },
    { role: "user", content: "Continue the task where you stopped. If it is still not finished after this call, end your answer with " + MARK + " again." }];
  // `claude://code/new` only prefills: the user presses Enter. Every value is encoded; no folder means no `folder` param.
  const deepLink = (folder, task) => "claude://code/new?" + (folder ? "folder=" + encodeURIComponent(folder) + "&" : "") + "q=" + encodeURIComponent(task);
  // The folder select: the config default first, then the folders used before, newest first, no repeats.
  const folderOptions = (def, recent) => [...new Set([def, ...(recent || [])].map(f => String(f || "").trim()).filter(Boolean))];
  const rememberFolder = (recent, folder, max = 5) => folderOptions(folder, recent).slice(0, max);

  // The viewer's theme choice as stored: an explicit light or dark, else auto (follow the system).
  const themeChoice = v => v === "light" || v === "dark" ? v : "auto";

  // ---- Poll pacing (#184).
  const HOURLY_LIMIT = 5000, SLOW_SHARE = 0.5, SLOW_FACTOR = 4, HOUR_MS = 60 * 60 * 1000;
  // The calls inside the rolling hour: a call exactly an hour old has left it.
  const recentCalls = (callTimes, now) => callTimes.filter(t => now - t < HOUR_MS);
  const pollDelay = (baseMs, callTimes, now, rateLimitedUntil) =>
    now < rateLimitedUntil || recentCalls(callTimes, now).length > HOURLY_LIMIT * SLOW_SHARE ? baseMs * SLOW_FACTOR : baseMs;
  // The connector's exact rate-limit wording is not known, so the match is loose and lives only here. `x` is a thrown
  // error or a tool result; a result's text counts only when it is an error, so a found issue about rate limits does not.
  const RATE_LIMIT = /rate[ _-]?limit|\b429\b|abuse detection/i;
  const isRateLimit = x => !!x && RATE_LIMIT.test([x.code, x.message,
    ...(x.isError && Array.isArray(x.content) ? x.content.map(c => c?.text) : [])].filter(Boolean).join(" "));

  return { LABELS, rowIssue, detailParts, hierarchyText, isOpen, relOf, countLabel, uiLabels, canDone, openSubs, isBlocked, lazyTree, walkUp, liftMap, seriesLabels, seriesOnPage, seriesTasks, topLevel, MARK, MAX_ROUNDS, splitMark, continueInput, deepLink, folderOptions, rememberFolder, themeChoice, HOUR_MS, pollDelay, recentCalls, isRateLimit, commitDate, lastActive, fileText, fitBytes, fitSchema, pickTools, hasMarker, fitConversation, nextTurns, cardView, needsClick, trimTurns, newTask, isStale, parseCard, labelNames, withoutLabel, isVisible, byOrder, snoozeDate, snoozeUntil, isClaude, byTime, unanswered, withLinks, md, esc };
})();
