// The page's DOM and wiring: reads the config, talks to the tracker and Cloud, renders the cards.
import { DSH } from "./logic.js";
import { githubTracker, artifactDbTracker } from "./tracker.js";

(() => {
  const CFG = JSON.parse(document.getElementById("dsh-config").textContent);
  // The contract's labels (logic.js), the same in every storage mode.
  const L = DSH.LABELS, SIG = CFG.replySignature || "— 🤖 Claude", SERVER = CFG.server || "github";
  const GITHUB = (CFG.storage || "github") === "github";
  // `repo` is the GitHub storage mode's store and the repo the Assistant reads; another storage mode may leave it out.
  const [OWNER, REPO] = String(CFG.repo || "").split("/");
  const POLL_MS = Math.max(30, CFG.pollSeconds || 60) * 1000;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const onCtrlEnter = (ta, f) => { ta.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f(); } }; };
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const today = () => ymd(new Date());
  // A new task's key carries the minute it was made (see DSH.newTask): YYYYMMDD-HHMM.
  const keyStamp = () => { const d = new Date(); return ymd(d).replace(/-/g, "") + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0"); };
  const dm = s => String(s || "").slice(8, 10).replace(/^0/, "") + "." + String(s || "").slice(5, 7);
  const when = iso => { try { return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  // `#N` becomes a link only where the storage mode says what it points to.
  const mdr = text => DSH.md(text, tracker ? tracker.mdBase : "");
  // `markup` always comes from DSH.md / DSH.esc, which escape everything.
  const html = (cls, markup) => { const d = el("div", "md" + (cls ? " " + cls : "")); d.innerHTML = markup; return d; };
  document.getElementById("h").textContent = CFG.title || "Dashboard";

  // ---- Tracker contract (ADR 0003): the storage mode `storage` names, made in the start-up block at the end once its
  // transport is there (the connector for GitHub, the page's own db for the artifact db). Until then, null.
  let mcp = null, tracker = null;
  const payload = r => r && (r.payload ?? (() => { try { return JSON.parse(r.content?.[0]?.text); } catch { return r.content; } })());
  // Poll pacing (#184): every connector call goes through here, so the page knows its own GitHub calls in the last hour
  // and whether GitHub said the rate limit was hit (then it stays slow for an hour). The artifact db reports its own
  // budget errors through `rateLimited`.
  let CALLS = [], LIMITED_UNTIL = 0;
  const rateLimited = () => { LIMITED_UNTIL = Date.now() + DSH.HOUR_MS; };
  async function callTool(server, tool, input) {
    const github = GITHUB && server === SERVER, limited = x => { if (github && DSH.isRateLimit(x)) rateLimited(); };
    if (github) CALLS = DSH.recentCalls(CALLS, Date.now()).concat(Date.now());
    try { const r = await mcp.callTool(server, tool, input, { cache: false }); if (r?.isError) limited(r); return r; }
    catch (e) { limited(e); throw e; }
  }
  const pollDelay = () => DSH.pollDelay(POLL_MS, CALLS, Date.now(), LIMITED_UNTIL);
  const arr = (x, k) => Array.isArray(x) ? x : (x && Array.isArray(x[k]) ? x[k] : []);
  const failText = e => tracker ? tracker.failText(e) : (e?.code || "error") + (e?.message ? ": " + e.message : "");

  // ---- State kept across polls, so a refresh never eats an open card or a half-written comment.
  // Every map below is keyed by the record's `id` (tracker.js): an issue number or a key, by storage mode.
  const OPEN = new Set(), DRAFTS = {}, GONE = new Map();   // GONE: id -> polls since a click hid it
  const THREADS = {};                                      // id -> comments (or an Error), loaded when a card opens
  let ISSUES = [], STATUS = null, LOAD_ERR = null, HASH_MISS = null, lastSig = "";
  // Relations (ADR 0008): per task its parent / done count / type, the open tasks per series on the page, the roots lifted by a
  // subtask that needs Ilya, and the subtask levels opened so far (loaded one level per click).
  let RELS = {}, SERIES = {}, LIFT = new Map(), REL_ERR = null;
  // ROWS: task rows expanded in place; ROWGET: the one `get` each of them reads (an Error when it failed). EXP holds only
  // the series lists a meeting card opens ("s<n>").
  const LIFTED = {}, EXP = new Set(), TREE = {}, WALKED = new Set(), ROWS = new Set(), ROWGET = {}, T_LOADING = new Map();
  const tree = DSH.lazyTree(n => tracker.children(n));
  // Silence is the signal: no fresh run means nothing could report the failure.
  const stale = () => !LOAD_ERR && DSH.isStale(STATUS?.meta.updated, Date.now(), CFG.staleHours || 26);

  // ---- Filters: a section with `filters` gets author / repo / last-activity chips, at most one of each on.
  const FKEY = "dashboard-v2.filter";
  const F = (() => { try { return JSON.parse(localStorage.getItem(FKEY) || "{}"); } catch { return {}; } })();
  const fget = id => Object.assign({ author: "", repo: "", age: "all" }, F[id]);
  const fset = (id, k, v) => { F[id] = Object.assign(fget(id), { [k]: v }); try { localStorage.setItem(FKEY, JSON.stringify(F)); } catch {} render(true); };
  const passes = (sec, meta) => {
    const f = fget(sec.id), flt = sec.filters || {};
    const r = (flt.repos || []).find(x => x.label === f.repo);
    const since = f.age === "all" ? null : Date.now() - (f.age === "day" ? 1 : 7) * 864e5;
    return (!f.author || meta.author === f.author) && (!r || (r.repos ? r.repos.includes(meta.repo) : meta.repo === r.repo))
      && (!since || !meta.updated || Date.parse(meta.updated) >= since);
  };
  function filterBar(sec) {
    const flt = sec.filters || {}, f = fget(sec.id), bar = el("div", "filters");
    const chips = (k, list, fill) => {
      const row = el("span", "chips");
      list.forEach(x => {
        const b = el("button", "chip"); b.type = "button"; fill(b, x); b.setAttribute("aria-pressed", String(f[k] === x.id));
        b.onclick = () => fset(sec.id, k, f[k] === x.id ? "" : x.id); row.append(b);
      });
      bar.append(row);
    };
    if (flt.authors?.length) chips("author", flt.authors.map(a => Object.assign({ id: a.name }, a)), (b, a) => {
      b.title = a.name; if (a.avatar) { const i = el("img"); i.src = a.avatar; i.alt = ""; b.append(i); } b.append(a.label || a.name);
    });
    if (flt.repos?.length) chips("repo", flt.repos.map(r => Object.assign({ id: r.label }, r)), (b, r) => b.append(r.label));
    const seg = el("span", "seg");
    [["day", "24 h"], ["week", "week"], ["all", "all"]].forEach(([v, t]) => {
      const b = el("button", "mk", t); b.type = "button"; b.setAttribute("aria-pressed", String(f.age === v));
      b.onclick = () => fset(sec.id, "age", v); seg.append(b);
    });
    bar.append(seg);
    return bar;
  }

  // ---- Terms: wrap the first occurrence of each term in the rendered text with a tooltip.
  function addTerms(root, terms) {
    Object.entries(terms).forEach(([word, tip]) => {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        if (n.parentElement.closest("a, code, .term, button, .subtasks, .thread")) continue;
        const i = n.data.indexOf(word); if (i < 0) continue;
        const hit = n.splitText(i); hit.splitText(word.length);
        const s = el("span", "term", word); s.tabIndex = 0; s.append(el("span", "tip", tip));
        hit.replaceWith(s); break;
      }
    });
  }

  // ---- ✓ / ✕ / ⏸: write to the tracker, hide at once, bring the card back if the write fails.
  // ✕ on a task deletes it, as the storage mode deletes (GitHub hands it to the next Sync).
  // A task can show twice (its card and a row), so every box of that id gets the message.
  const showErr = (n, text) => document.querySelectorAll("[data-err]").forEach(b => { if (b.dataset.err === String(n)) b.textContent = text; });
  async function act(issue, kind, arg) {
    const n = issue.id;
    if (kind === "done" && RELS[n] && !DSH.canDone(RELS[n])) {
      showErr(n, "Not done: it still has open subtasks."); return;
    }
    GONE.set(n, 0); render(true);
    try {
      if (kind === "done") await tracker.setState(n, "done");
      else if (kind === "dismiss") {
        if (DSH.labelNames(issue).includes(L.task)) await tracker.delete(n);
        else await tracker.setState(n, "dismissed");
      } else if (kind === "snooze") await tracker.setField(n, "startDate", arg);
    } catch (e) {
      GONE.delete(n); render(true);
      showErr(n, "Not saved: " + failText(e));
    }
  }

  // A click anywhere else closes an open day choice.
  document.addEventListener("click", e => { if (!e.target.closest(".acts")) document.querySelectorAll(".popover").forEach(p => { p.hidden = true; }); });
  function actions(issue, sec, rel) {
    const box = el("span", "acts");
    if (sec.cardActions === false) return box;
    const b = (t, title, f) => { const x = el("button", "mk", t); x.type = "button"; x.title = title; x.onclick = e => { e.stopPropagation(); f(); }; box.append(x); return x; };
    const ok = b("✓", "Done", () => act(issue, "done"));
    if (rel && !DSH.canDone(rel)) { ok.disabled = true; ok.title = "Open subtasks first"; }
    b("✕", DSH.labelNames(issue).includes(L.task) ? "Delete task" : "Dismiss", () => act(issue, "dismiss"));
    // The day choice is a popover under ⏸, so it never adds a line to the row.
    const pick = el("span", "popover"); pick.hidden = true;
    b("⏸", "Snooze", () => { const was = pick.hidden; document.querySelectorAll(".popover").forEach(p => { p.hidden = true; }); pick.hidden = !was; });
    [["tomorrow", false], ["next week", true]].forEach(([t, wk]) => {
      const x = el("button", "mk outline", t); x.type = "button";
      x.onclick = e => { e.stopPropagation(); act(issue, "snooze", DSH.snoozeDate(today(), wk)); }; pick.append(x);
    });
    box.append(pick);
    return box;
  }

  function thread(issue, sugg) {
    const n = issue.id, box = el("div", "thread");
    const list = el("div", "cm-list");
    const fill = () => {
      list.textContent = "";
      const cs = THREADS[n];
      if (cs === undefined) { list.append(el("div", "cm-meta", "Loading comments…")); return; }
      if (cs instanceof Error) { list.append(el("div", "err", "Comments did not load: " + failText(cs))); return; }
      const waiting = new Set(DSH.unanswered(cs, SIG).map(c => c.id));
      cs.forEach(c => {
        const claude = DSH.isClaude(c, SIG), d = el("div", "cm" + (claude ? " claude" : ""));
        d.append(html("", mdr(c.body)));
        const meta = el("div", "cm-meta", (claude ? "Claude" : "You") + " · " + when(c.created_at) + (waiting.has(c.id) ? " · waiting for Claude" : ""));
        if (c.url) { const a = el("a", null, "on " + tracker.name); a.href = c.url; a.target = "_blank"; a.rel = "noopener"; meta.append(" · ", a); }
        d.append(meta); list.append(d);
      });
    };
    fill();
    const add = el("div", "row"), plus = el("button", "mk outline", "+ Comment"); plus.type = "button"; add.append(plus);
    const ed = el("div", "editor"), ta = el("textarea"); ta.rows = 3; ta.value = DRAFTS[n] || "";
    // A comment is a Local prompt (ADR 0005): a sync answers it with local tools; the page never does.
    ta.placeholder = "Prompt for Claude: what to do, what to note, what to add to the brief. The next sync answers it.";
    ta.setAttribute("aria-label", "New comment");
    const row = el("div", "row"), save = el("button", "btn primary", "Send"), cancel = el("button", "btn", "Cancel"), err = el("span", "err");
    save.type = cancel.type = "button"; save.title = "Ctrl+Enter";
    row.append(save, cancel, err); ed.append(ta, row);
    const open = text => { if (text) ta.value = text; DRAFTS[n] = ta.value; ed.hidden = false; add.hidden = true; ta.focus(); };
    ed.hidden = DRAFTS[n] === undefined; add.hidden = !ed.hidden;
    plus.onclick = () => open();
    sugg.slice(0, 3).forEach(s => { const c = el("button", "mk suggest", s); c.type = "button"; c.title = s; c.onclick = () => open(s); add.append(c); });
    ta.oninput = () => { DRAFTS[n] = ta.value; };
    onCtrlEnter(ta, () => save.click());
    cancel.onclick = () => { delete DRAFTS[n]; ta.value = ""; err.textContent = ""; ed.hidden = true; add.hidden = false; };
    save.onclick = async () => {
      const text = ta.value.trim(); if (!text || save.disabled) return;
      save.disabled = true; err.textContent = "Sending…";
      try { await tracker.addComment(n, text); delete DRAFTS[n]; ta.value = ""; err.textContent = ""; ed.hidden = true; add.hidden = false; loadThread(n, fill); }
      catch (e) { err.textContent = "Not sent (" + failText(e) + "). Your text is kept."; }
      finally { save.disabled = false; }
    };
    box.append(list, add, ed);
    box._fill = fill;
    return box;
  }
  // One read in flight per issue, however many details ask for it at once.
  function loadThread(n, fill) {
    if (!T_LOADING.has(n)) T_LOADING.set(n, tracker.comments(n).then(c => { THREADS[n] = c; }, e => { THREADS[n] = Object.assign(new Error(e?.message || ""), { code: e?.code }); }).finally(() => T_LOADING.delete(n)));
    return T_LOADING.get(n).then(fill);
  }

  // ---- Relations on the page. A level of subtasks loads when it is first opened; nothing is fetched ahead.
  const loadChildren = n => tree.expand(n).then(l => { if (TREE[n] !== l) { TREE[n] = l; render(true); } }, e => { TREE[n] = Object.assign(new Error(e?.message || ""), { code: e?.code }); render(true); });
  // `depth` is the level of the rows in the box: 1 under a card or a meeting, one more for each row inside a row.
  function subtree(n, depth) {
    const box = el("div", "subtasks"), kids = TREE[n];
    loadChildren(n);   // cached within a poll, read again after it, so a level opened before is never stale
    if (kids === undefined) { box.append(el("div", "cm-meta", "Loading subtasks…")); return box; }
    if (kids instanceof Error) { box.append(el("div", "err", "Subtasks did not load: " + failText(kids))); return box; }
    const open = DSH.openSubs(kids).filter(i => !GONE.has(i.id));
    open.forEach(i => box.append(taskRow(i, depth)));
    if (!open.length) box.append(el("div", "cm-meta", "No open subtasks."));
    return box;
  }
  const relBadges = (bs, n, rel) => {
    if (DSH.countLabel(rel)) bs.append(el("span", "badge accent", DSH.countLabel(rel)));
    if (rel.type) bs.append(el("span", "badge", rel.type));
    if (DSH.isBlocked(rel)) bs.append(el("span", "badge warn", "Blocked"));
    if (LIFT.get(n)?.cycle) bs.append(el("span", "badge warn", "cycle in parents"));
  };
  // The link-external icon: the record where it lives, in a new tab; a `#<key>` link opens it in place on this page.
  const openIcon = url => {
    const a = el("a", "open-icon"), here = String(url).startsWith("#"), label = here ? "Link to this card" : "Open on " + tracker.name;
    a.href = url; if (!here) { a.target = "_blank"; a.rel = "noopener"; }
    a.title = label; a.setAttribute("aria-label", label);
    a.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/></svg>';
    return a;
  };

  // The detail a card and a task row share, in one order (DSH.detailParts): description, subtasks, Prepare and prompts,
  // Cloud, Local (ADR 0005). `o.open`: build what needs the network now (a card's detail is built hidden and filled on click).
  function detail(issue, sec, c, o) {
    const n = issue.id, det = el("div", "detail"), parts = DSH.detailParts(c, { total: o.depth ? o.rel?.total : 0, gistShown: o.gistShown });
    const part = (title, markup) => { const d = el("div"); if (title) d.append(el("h3", "part", title)); d.append(html("", markup)); det.append(d); return d; };
    const th = thread(issue, c.suggestions);
    parts.order.forEach(id => {
      if (id === "description") det._desc = part("", mdr(parts.description));
      else if (id === "subtasks") {
        const d = el("div", "subs"), box = el("div"); d.append(el("h3", "part", "Subtasks"), box); det.append(d); det._subBox = box;
        if (o.open) box.append(subtree(n, o.depth + 1));
      } else if (id === "prepare") part("Prepare", mdr(c.prepare));
      else if (id === "prompts") c.prompts.forEach(p => {
        const d = el("div", "prompt"); d.append(html("", "<pre><code>" + DSH.esc(p) + "</code></pre>"));
        const b = el("button", "btn", "Copy"); b.type = "button";
        b.onclick = async () => { try { await navigator.clipboard.writeText(p); b.textContent = "Copied"; } catch { b.textContent = "Select and copy"; } setTimeout(() => { b.textContent = "Copy"; }, 2500); };
        d.append(b); det.append(d);
      });
      else if (id === "cloud") {
        addTerms(det, c.terms);   // before the two surfaces, so a term in a chat or a comment is left alone
        const d = el("div"); d.append(el("h3", "part", "Cloud"), cardChat(issue, sec)); det.append(d);
      } else {
        const d = el("div"); d.append(el("h3", "part", "Local"), th); det.append(d);
      }
    });
    det._th = th;
    if (o.open && THREADS[n] === undefined) loadThread(n, th._fill);
    if (o.open) { CLOUD[chatKey(n)]?.load(); }
    return det;
  }

  // One `get` when a row opens: the body, the subtask count, the type and the blockers. Until then only the list item shows.
  function loadRow(n) {
    return tracker.get(n).then(g => { ROWGET[n] = g; RELS[n] = DSH.relOf(g); }, e => { ROWGET[n] = Object.assign(new Error(e?.message || ""), { code: e?.code }); }).then(() => render(true));
  }
  // A task as a row, under its parent or under a meeting. Its caret, its title and a click on the row open it in place into the
  // card's detail; a subtask with subtasks of its own lists them there, so the tree goes as deep as it is opened.
  function taskRow(issue, depth = 1) {
    const n = issue.id, open = ROWS.has(n), got = ROWGET[n], ri = DSH.rowIssue(issue, got), rel = RELS[n] || DSH.relOf(ri);
    const onPath = [...LIFT.values()].some(e => e.path.has(n));
    const row = el("div", "task-row" + (onPath ? " path" : "") + (open ? " open" : "")), head = el("div", "task-head");
    row.style.setProperty("--depth", depth);
    const toggle = () => {
      const s = window.getSelection?.(); if (s && !s.isCollapsed && s.toString().trim()) return;
      if (ROWS.has(n)) { ROWS.delete(n); render(true); return; }
      ROWS.add(n); delete THREADS[n]; loadRow(n); render(true);
    };
    const caret = el("button", "mk caret", open ? "▾" : "▸"); caret.type = "button"; caret.title = "Details"; caret.setAttribute("aria-expanded", String(open));
    caret.onclick = e => { e.stopPropagation(); toggle(); };
    const bs = el("span", "badges"); relBadges(bs, n, rel);
    const due = issue.targetDate; if (due) bs.append(el("span", "badge accent", "due " + dm(due)));
    const end = el("span", "row-end"); end.append(openIcon(issue.url), actions(ri, {}, rel));
    head.append(caret, ...(issue.ref ? [el("span", "cm-meta", issue.ref)] : []), el("span", "title", issue.title), bs, end);
    head.onclick = e => { if (!e.target.closest("a, button, .term")) toggle(); };
    const err = el("div", "err"); err.dataset.err = n;
    row.append(head, err);
    if (open) {
      const body = el("div", "row-detail");
      if (got === undefined) body.append(el("div", "cm-meta", "Loading…"));
      else {
        if (got instanceof Error) body.append(el("div", "err", "Details did not load: " + failText(got)));
        body.append(detail(ri, {}, DSH.parseCard(ri.body), { open: true, rel, depth, gistShown: false }));
      }
      row.append(body);
    }
    return row;
  }
  // The open tasks of the series a meeting card carries, the same under every occurrence.
  const seriesOf = issue => DSH.seriesTasks(Object.values(SERIES).flat(), DSH.seriesLabels(issue)).filter(t => !GONE.has(t.id) && !RELS[t.id]?.hasParent);

  function card(issue, sec) {
    const c = DSH.parseCard(issue.body), meta = issue.meta, n = issue.id, labels = DSH.labelNames(issue), rel = RELS[n];
    const node = el("article", "card" + (labels.includes(L.needsYou) ? " needs-you" : ""));
    node.dataset.card = n;
    node.append(el("div", "lead", meta.lead || issue.ref || "—"));
    const head = el("div", "head"); head.tabIndex = 0; head.setAttribute("role", "button");
    const tr = el("div", "title-row"); tr.append(el("span", "title", issue.title), openIcon(issue.url));
    const bs = el("span", "badges");
    if (labels.includes(L.needsYou)) bs.append(el("span", "badge warn", "needs you"));
    if (labels.includes(L.replied)) bs.append(el("span", "badge ai", "Claude replied"));
    if (rel) relBadges(bs, n, rel);
    const due = issue.targetDate; if (due && sec.cardActions !== false) bs.append(el("span", "badge accent", "due " + dm(due)));
    (meta.badges || []).forEach(b => bs.append(el("span", "badge " + (b.tone || ""), b.text)));
    labels.filter(l => !l.startsWith(L.prefix)).forEach(l => bs.append(el("span", "badge", l)));
    if (typeof issue.comments === "number" && issue.comments) bs.append(el("span", "badge", "💬 " + issue.comments));
    tr.append(bs, actions(issue, sec, rel)); head.append(tr);
    // The gist is the brief's first paragraph; the rest opens in place.
    const err = el("div", "err"); err.dataset.err = n;
    const det = detail(issue, sec, c, { open: OPEN.has(n), rel, depth: 0, gistShown: true });
    head.append(html("gist", mdr(DSH.detailParts(c).gist)), err);
    addTerms(head, c.terms);
    node.append(head);
    det.hidden = !OPEN.has(n);
    node.append(det);
    // «Задачи: N»: the open tasks of this meeting's series, as full rows, opened on click.
    const ser = labels.includes(L.meeting) ? seriesOf(issue) : [];
    if (ser.length) {
      const k = "s" + n, box = el("div", "series"), t = el("button", "mk outline", "Задачи: " + ser.length + (EXP.has(k) ? " ▾" : " ▸"));
      t.type = "button"; t.setAttribute("aria-expanded", String(EXP.has(k)));
      t.onclick = () => { if (EXP.has(k)) EXP.delete(k); else EXP.add(k); render(true); };
      box.append(t);
      if (EXP.has(k)) ser.forEach(x => box.append(taskRow(x)));
      node.insertBefore(box, det);
    }
    let subBox = null;
    // «Подзадачи: N»: the same box as a meeting's tasks; the level is read when it first opens.
    if (rel?.total) {
      const k = "c" + n, open = EXP.has(k), box = el("div", "series"), t = el("button", "mk outline", "Подзадачи: " + rel.total + (open ? " ▾" : " ▸"));
      t.type = "button"; t.setAttribute("aria-expanded", String(open));
      t.onclick = () => { if (EXP.has(k)) EXP.delete(k); else EXP.add(k); render(true); };
      box.append(t);
      if (open) box.append(subtree(n, 1));
      subBox = box;
    }
    // The text first, then the subtasks: under the gist while closed, after the description once open.
    const place = () => { if (subBox) { if (!det.hidden && det._desc) det._desc.after(subBox); else node.insertBefore(subBox, det); } };
    place();
    if (OPEN.has(n)) node.classList.add("open");
    const toggle = () => {
      const s = window.getSelection?.(); if (s && !s.isCollapsed && s.toString().trim()) return;
      det.hidden = !det.hidden; node.classList.toggle("open", !det.hidden); place();
      if (det.hidden) { OPEN.delete(n); return; }
      // The thread and the Cloud history load only when a card opens, never on the poll.
      OPEN.add(n); loadThread(n, det._th._fill); CLOUD[chatKey(n)]?.load();
      // Opening the card is reading Claude's reply: drop `dsh:replied` and its badge.
      if (labels.includes(L.replied)) {
        tracker.removeLabel(n, L.replied)
          .then(keep => { issue.labels = keep.map(name => ({ name })); render(true); })
          .catch(e => showErr(n, "The \"replied\" label was not removed: " + failText(e)));
      }
    };
    head.onclick = e => { if (!e.target.closest("a, button, .term")) toggle(); };
    head.onkeydown = e => { if (e.target === head && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } };
    return node;
  }


  // ---- Render: config sections in file order; within a section, groups by `groupRank`, then first appearance.
  function render(force) {
    // `today` is in the signature so a snooze that ends overnight brings its card back.
    const sig = JSON.stringify([ISSUES, ISSUES.full, STATUS && STATUS.body, LOAD_ERR, REL_ERR, RELS, ROWGET, TREE, SERIES, [...LIFT.keys()], stale(), [...GONE.keys()], today()]);
    if (!force && sig === lastSig) return;
    // Never rebuild under the user's cursor; the next poll renders once they leave the comment box.
    if (!force && document.activeElement?.matches?.("#sections textarea")) return;
    lastSig = sig;
    const t = today();
    [...ISSUES, ...Object.values(LIFTED)].forEach(i => { delete i._lifted; });
    const shown0 = ISSUES.filter(i => DSH.isVisible(i, t) && !GONE.has(i.id));
    // Subtasks show under their parent and series tasks under their meeting; a root lifted by a subtask that needs Ilya stays.
    const cards = DSH.topLevel(shown0, RELS, DSH.seriesOnPage(shown0));
    LIFT.forEach((e, root) => {
      const i = ISSUES.find(x => x.id === root) || LIFTED[root];
      if (i && !GONE.has(root)) { i._lifted = true; if (!cards.includes(i)) cards.push(i); }
    });
    const visible = cards.map(i => Object.assign(i, { _meta: i.meta })).sort(DSH.byOrder);
    const banners = document.getElementById("banners"); banners.textContent = "";
    if (LOAD_ERR) { const b = el("div", "banner error"); b.append(el("strong", null, "Tracker not read: "), LOAD_ERR); banners.append(b); }
    if (REL_ERR) { const b = el("div", "banner error"); b.append(el("strong", null, "Subtasks not read: "), REL_ERR); banners.append(b); }
    if (HASH_MISS) { const b = el("div", "banner"); b.append(el("strong", null, "Not a card on the page: "), HASH_MISS + " (a subtask, a meeting's task or a closed record)"); banners.append(b); }
    if (stale()) { const u = STATUS?.meta.updated; const b = el("div", "banner"); b.append(el("strong", null, "Routine stalled: "), u ? "last run " + new Date(u).toLocaleString() : "no run yet"); banners.append(b); }
    const status = STATUS && DSH.parseCard(STATUS.body).brief;
    if (status) { const b = el("div", "banner"); b.append(html("", mdr(status))); banners.append(b); }
    const root = document.getElementById("sections"), nav = document.getElementById("nav");
    root.textContent = ""; nav.textContent = "";
    const secs = (CFG.sections || []).slice(), known = new Set(secs.map(s => s.id));
    // A card whose section is not in the config is shown, not dropped.
    if (visible.some(i => !known.has(i._meta.section))) secs.push({ id: "_other", title: "No section" });
    secs.forEach(sec => {
      const mine = visible.filter(i => sec.id === "_other" ? !known.has(i._meta.section) : i._meta.section === sec.id);
      const shown = sec.filters ? mine.filter(i => passes(sec, i._meta)) : mine;
      const g = el("section", "group"); g.id = "s-" + sec.id; g.append(el("h2", "group-title", sec.title));
      const a = el("a", null, sec.title + " · " + shown.length); a.href = "#" + g.id;
      a.onclick = e => { e.preventDefault(); g.scrollIntoView({ block: "start" }); }; nav.append(a);
      if (sec.filters) g.append(filterBar(sec));
      const groups = new Map();
      shown.forEach(i => {
        const m = i._meta, k = m.group || "", r = Number.isFinite(m.groupRank) ? m.groupRank : 999;
        if (!groups.has(k)) groups.set(k, { rank: r, collapsed: false, items: [] });
        const gr = groups.get(k); gr.items.push(i); gr.collapsed = gr.collapsed || !!m.collapsed; gr.rank = Math.min(gr.rank, r);
      });
      [...groups.entries()].sort((x, y) => x[1].rank - y[1].rank).forEach(([name, gr]) => {
        const label = name + (gr.collapsed && name ? " · " + gr.items.length : "");
        let box;
        if (gr.collapsed) { box = el("details", "sub"); const s = el("summary"); s.append(el("h2", "sub-title", label)); box.append(s); }
        else { box = el("div", "sub"); if (name) box.append(el("h2", "sub-title", label)); }
        gr.items.forEach(i => box.append(card(i, sec)));
        g.append(box);
      });
      if (!shown.length) g.append(el("p", "empty", mine.length ? "Nothing matches the filter." : "Empty."));
      root.append(g);
    });
    if (ISSUES.full) root.append(el("p", "empty", "Showing the first 100 cards: the page's limit, the tracker may hold more."));
    OPEN.forEach(n => { if (!visible.some(i => i.id === n)) OPEN.delete(n); });
  }

  // Relations of the cards just read: one `get` per task (the list call has none), the series' open tasks, the walk up from
  // every subtask that needs Ilya. A failure shows as a banner, never as "no subtasks".
  async function loadRelations(items) {
    const t = today(), isTask = i => DSH.labelNames(i).includes(L.task);
    const onPage = DSH.seriesOnPage(items.filter(i => DSH.isVisible(i, t)));
    const series = {};
    await Promise.all([...onPage].map(async l => { series[l] = await tracker.list({ labels: [L.task, l] }); }));
    const tasks = new Map();
    [...items.filter(isTask), ...Object.values(series).flat()].forEach(i => tasks.set(i.id, i));
    const rels = {};
    const raw = {};
    await Promise.all([...tasks.keys()].map(async n => { raw[n] = await tracker.get(n); rels[n] = DSH.relOf(raw[n]); }));
    const parentOf = async n => {
      if (!rels[n]) rels[n] = DSH.relOf(await tracker.get(n));
      return rels[n].parent ?? (rels[n].hasParent ? await tracker.parent(n) : null);
    };
    const needs = items.filter(i => DSH.labelNames(i).includes(L.needsYou) && rels[i.id]?.hasParent);
    const walks = await Promise.all(needs.map(i => DSH.walkUp(i.id, parentOf)));
    await Promise.all(walks.filter(w => !items.some(i => i.id === w.root)).map(async w => { LIFTED[w.root] = await tracker.get(w.root); }));
    // Open the path once, when the walk first finds it; after that the user's own clicks decide.
    walks.forEach(w => {
      const key = w.path.join(">");
      if (WALKED.has(key)) return;
      WALKED.add(key); OPEN.add(w.root); w.path.slice(1).forEach(n => ROWS.add(n));
    });
    // Rows open in place (the path above included) are read again, so their body and counts are as fresh as a card's.
    // A closed or removed row is dropped; a task already read above is not read twice.
    ROWS.forEach(n => { if (GONE.has(n)) ROWS.delete(n); });
    await Promise.all([...ROWS].map(async n => { try { const g = raw[n] || await tracker.get(n); ROWGET[n] = g; rels[n] = DSH.relOf(g); } catch {} }));
    // Open levels are read again, so a poll shows subtasks closed or added since.
    tree.reset();
    await Promise.all([...ROWS, ...OPEN].filter(n => rels[n]?.total).map(async n => { try { TREE[n] = await tree.expand(n); } catch {} }));
    RELS = rels; SERIES = series; LIFT = DSH.liftMap(walks);
  }
  async function poll() {
    let stamp;
    try {
      const [items, status] = await Promise.all([tracker.list({ labels: [L.on] }), tracker.status()]);
      ISSUES = items; STATUS = status; LOAD_ERR = null;
      try { await loadRelations(items); REL_ERR = null; } catch (e) { REL_ERR = failText(e); }
      // A clicked card stays hidden until the tracker stops listing it, or for two polls, whichever comes first.
      GONE.forEach((k, n) => { if (!items.some(i => i.id === n) || k >= 2) GONE.delete(n); else GONE.set(n, k + 1); });
      stamp = "Updated " + new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      LOAD_ERR = failText(e);
      stamp = "Not updated";
    }
    document.getElementById("stamp").textContent = stamp + (pollDelay() > POLL_MS ? " · refresh slowed: " + tracker.quotaNote : "");
    render(false);
  }

  // ---- Tabs: Cards (the dashboard) and Assistant; the open tab is remembered per viewer.
  const TKEY = "dashboard-v2.tab";
  const showTab = id => {
    ["cards", "assistant"].forEach(t => { document.getElementById(t).hidden = t !== id; document.getElementById("tab-" + t).setAttribute("aria-selected", String(t === id)); });
    try { localStorage.setItem(TKEY, id); } catch {}
  };
  document.getElementById("tab-cards").onclick = () => showTab("cards");
  document.getElementById("tab-assistant").onclick = () => showTab("assistant");
  showTab((() => { try { return localStorage.getItem(TKEY) === "assistant" ? "assistant" : "cards"; } catch { return "cards"; } })());

  // ---- Theme switcher: Auto / Light / Dark, remembered per viewer; `data-theme` on <html> picks the Theme's block,
  // none follows the system. page.html's inline script applies the stored choice before first paint.
  const THKEY = "dashboard-v2.theme";
  const setTheme = (t, save) => {
    if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    document.querySelectorAll("#theme button").forEach(b => b.setAttribute("aria-pressed", String(b.value === t)));
    if (save) try { localStorage.setItem(THKEY, t); } catch {}
  };
  document.querySelectorAll("#theme button").forEach(b => { b.onclick = () => setTheme(b.value, true); });
  setTheme(DSH.themeChoice((() => { try { return localStorage.getItem(THKEY); } catch { return null; } })()), false);

  // ---- Assistant: Cloud chats (ADR 0005), one on the Assistant tab and one per card. The page keeps the turns in the
  // artifact `db` (the last conversation per chat, until "New conversation"); every call starts with the rules turn
  // setup baked in. The rules, the labels, the signature and the write gate are the page's; the judgement is Claude's.
  const RULES = { role: "user", content: CFG.rules || "Help the user with their dashboard. Change nothing unless they ask." };
  const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const AS = CFG.assistant || {};
  const DOC_MAX = 200 * 1024;                                // one db document holds 256 KiB; keep a margin
  let sample = null, db = null, budget = 131072, BRANCH = null, CONNECTORS = [];
  const sampleText = e => ({
    cancelled: "Stopped.",
    rate_limited: "Too many requests to Claude: try again later.",
    session_expired: "Sign in to claude.ai again.",
    refused: "Claude declined this request.",
  }[e?.code] || (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed", "tools_unavailable"].includes(e?.code)
    ? "Claude is not available on this page." : "Claude did not answer (" + (e?.code || "error") + (e?.message ? ": " + String(e.message).slice(0, 300) : "") + "). Try again."));
  // What Claude needs on every call: the date, the cards on the page, and where repo reads go.
  const board = () => {
    const d = new Date(), lines = ISSUES.map(i => "#" + i.id + " [" + (i.meta.section || "") + "] " + i.title
      + " (" + DSH.labelNames(i).filter(l => l.startsWith(L.series) || !l.startsWith(L.prefix)).join(", ") + ")");
    return "Today is " + WEEKDAY[d.getDay()] + ", " + today() + ".\nRepo " + OWNER + "/" + REPO + ": file reads go to branch "
      + (BRANCH || "(none chosen: ask the user, then call set_branch)") + "; code search covers only the default branch.\nCards on the dashboard:\n" + (lines.join("\n") || "none");
  };

  // ---- The write rule (PRD "Write rule"): every page tool goes through `gated`. A tool that needs a click shows a preview
  // with Allow / Deny in its own chat; Deny reaches Claude as a tool error. `check` refuses before any click is asked.
  // Each approval ends once: Allow, Deny, or the call ending (Stop, timeout, error) as Deny with its buttons gone.
  const gated = (chat, { annotations, tracker: inTracker, preview, check, execute, ...tool }) => Object.assign(tool, {
    async execute(input) {
      check?.(input);
      if (DSH.needsClick(annotations, inTracker)
        && !await chat.approve(preview ? preview(input) : "<pre><code>" + DSH.esc(JSON.stringify(input, null, 2)) + "</code></pre>"))
        throw new Error("The user denied this action: nothing was done.");
      return execute(input);
    },
  });
  const READ = { readOnlyHint: true }, WRITE = { readOnlyHint: false, destructiveHint: false };
  const createTool = (run, card) => ({
    annotations: WRITE, tracker: true,
    name: "create_task",
    description: "Create one task card on the dashboard and return its number and link. The page adds the labels, key and card format. Only when the user asks for a task.",
    inputSchema: { type: "object", required: ["title", "slug", "brief"], properties: {
      title: { type: "string", description: "Short task title in the user's language." },
      slug: { type: "string", description: "Two to four English words in kebab-case naming the matter, e.g. send-report-draft." },
      brief: { type: "string", description: "One sentence in the user's language: what is to be done and why now. More detail may follow after a blank line. Not the priority, date or link: those go in their own fields." },
      priority: { type: "string", enum: ["Urgent", "High", "Medium", "Low"], description: "Only when the message makes it clear." },
      target: { type: "string", description: "Due date as YYYY-MM-DD, only when the message makes it clear." },
      series: { type: "string", description: "The <series> of a dsh:mtg/<series> label in the card list, when the task prepares for that meeting." },
      card: { type: tracker.idType, description: "The id of the card the task belongs to" + (card ? " (this card, #" + card + ", unless the user names another)." : ", when the message points to one.") },
      track: { type: "string", description: "A label without the dsh: prefix from the card list, when the task clearly belongs to that track." },
      parent: { type: tracker.idType, description: "The id of a task this one is a subtask of, only when the user says so. Not a meeting card." },
      blockedBy: { type: "array", items: { type: tracker.idType }, description: "Ids of tasks that must be done first." + (tracker.canBlock ? "" : " This page cannot set it yet: it is refused.") },
      type: { type: "string", enum: ["Epic", "Story", "Task"], description: "The issue type, only when the user names one." },
    } },
    async execute(input) {
      if (!tracker.canBlock && (input.blockedBy || []).length) throw new Error("Blocked-by cannot be set from this page: the " + tracker.name + " connector has no dependencies tool. Nothing was created; offer the task without it.");
      const known = [...new Set(ISSUES.flatMap(DSH.labelNames))];
      const r = await tracker.create(DSH.newTask(input, { stamp: keyStamp(), section: CFG.taskSection, known, parseId: tracker.parseId, refMd: tracker.refMd }));
      run.made.push(r);
      return r;
    },
  });
  // Only a task card on the page, looked up by id: the preview shows the page's own title, never the model's text.
  const taskCard = n => {
    const id = tracker.parseId(n), i = ISSUES.find(x => x.id === id && !GONE.has(x.id));
    if (!i) throw new Error("#" + n + " is not a card on the dashboard");
    if (!DSH.labelNames(i).includes(L.task)) throw new Error("#" + n + " is not a task: only tasks can be deleted");
    return i;
  };
  const deleteTool = run => ({
    annotations: { readOnlyHint: false, destructiveHint: true }, tracker: true,
    name: "delete_task",
    description: "Delete one task card from the dashboard, as its ✕ button does. The user confirms it on the page first.",
    inputSchema: { type: "object", required: ["card"], properties: { card: { type: tracker.idType, description: "The id of the task card to delete." } } },
    preview: input => { const i = taskCard(input.card); return "Delete task " + mdr(tracker.refMd(i.id)) + " " + DSH.esc(i.title) + "?"; },
    async execute(input) {
      const i = taskCard(input.card);
      await tracker.delete(i.id);
      run.hide.push(i.id);
      return { deleted: i.id };
    },
  });
  // A comment from Cloud is signed, so it would count as answering every user comment before it: while the thread has
  // one waiting for a sync, nothing is posted.
  const commentTool = (run, card) => ({
    annotations: WRITE, tracker: true,
    name: "post_comment",
    description: "Post a comment in a card's thread, only when the user asks for one. Write only the text: the page signs it.",
    inputSchema: { type: "object", required: card ? ["body"] : ["card", "body"], properties: {
      card: { type: tracker.idType, description: card ? "The card's id; this card, #" + card + ", unless the user names another." : "The card's id." },
      body: { type: "string", description: "The comment in Markdown, in the user's language." },
    } },
    async execute({ card: c, body }) {
      const n = tracker.parseId(c ?? card);
      if (!ISSUES.some(i => i.id === n)) throw new Error("#" + n + " is not a card on the dashboard");
      if (DSH.unanswered(await tracker.comments(n), SIG).length)
        throw new Error("#" + n + " has a comment waiting for the sync; a signed comment now would mark it answered. Nothing was posted.");
      await tracker.addComment(n, String(body || "").trim() + "\n\n" + SIG);
      run.posted.push(n);
      return { posted: n };
    },
  });
  // ✓ / ✕ / ⏸ from a card's Cloud chat, only on cards that have those buttons. Deleting a task needs a click, so it stays ✕'s.
  const closeTool = (issue, run) => ({
    annotations: WRITE, tracker: true,
    name: "close_card",
    description: "Close this card, as its ✓ (done) or ✕ (dismiss) button does, only when the user says so. A task card can only be closed as done here.",
    inputSchema: { type: "object", required: ["done"], properties: { done: { type: "boolean", description: "True when the matter is done, false when it is dismissed." } } },
    async execute({ done }) {
      if (!done && DSH.labelNames(issue).includes(L.task)) throw new Error("Deleting a task needs the user's click: they can press ✕ on the card.");
      await tracker.setState(issue.id, done ? "done" : "dismissed");
      run.hide.push(issue.id);
      return { closed: issue.id };
    },
  });
  const snoozeTool = (issue, run) => ({
    annotations: WRITE, tracker: true,
    name: "snooze_card",
    description: "Hide this card until a date, as its ⏸ button does, only when the user says so; it comes back by itself on that date.",
    inputSchema: { type: "object", required: ["until"], properties: { until: { type: "string", description: "YYYY-MM-DD, after today." } } },
    async execute({ until }) {
      const d = DSH.snoozeUntil(until, today());
      if (!d) throw new Error("\"" + until + "\" is not a date after today (YYYY-MM-DD).");
      await tracker.setField(issue.id, "startDate", d);
      run.hide.push(issue.id);
      return { snoozed: issue.id, until: d };
    },
  });

  // ---- Repo, read only: the page's own read tools are the only way in; no repo write is ever given to the model.
  // The tools come from `assistant.repo` in the config, by job (read_file, search_code, list_branches, list_commits).
  const REPO_JOBS = (CFG.assistant || {}).repo || {};
  const raw = (job, input) => {
    const t = REPO_JOBS[job];
    if (!t) throw new Error("No tool is set for the repo job " + job + ".");
    return callTool(t.server, t.tool, Object.assign({ owner: OWNER, repo: REPO }, input));
  };
  const short = (s, n) => s.length > n ? s.slice(0, n) + "\n…(cut at " + n + " characters)" : s;
  // Settles once the page has worked out the branch, so a read sent right after opening waits for it.
  let branchFound; const branchReady = new Promise(r => { branchFound = r; });
  // Worked out once when the page opens: the branch with the newest commit (one call per branch, so capped).
  const branchNames = async () => arr(payload(await raw("list_branches", { perPage: 100 })), "branches").map(b => b.name).filter(Boolean);
  async function findBranch() {
    const names = (await branchNames()).slice(0, 20);
    const heads = await Promise.all(names.map(async name => {
      try { return { name, date: DSH.commitDate(arr(payload(await raw("list_commits", { sha: name, perPage: 1, fields: ["sha", "commit"] })), "commits")[0]) }; }
      catch { return { name, date: "" }; }
    }));
    return DSH.lastActive(heads);
  }
  const repoTools = () => [{
    annotations: READ, name: "read_file",
    description: "Read one file of the repo " + OWNER + "/" + REPO + " by path, from the current branch unless another is given.",
    inputSchema: { type: "object", required: ["path"], properties: {
      path: { type: "string", description: "Path from the repo root." },
      branch: { type: "string", description: "Only when the user names another branch for this one read." },
    } },
    async execute({ path, branch }) {
      await branchReady;
      const ref = branch || BRANCH;
      if (!ref) throw new Error("No branch is chosen: ask the user which branch, then call set_branch.");
      return { branch: ref, path, text: short(DSH.fileText(await raw("read_file", { path, ref: "refs/heads/" + ref })), 60000) };
    },
  }, {
    annotations: READ, name: "search_code",
    description: "Search the code of " + OWNER + "/" + REPO + ". Covers only the default branch: a file new on another branch is not found, read it by path.",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string", description: "GitHub code search terms." } } },
    async execute({ query }) {
      const r = payload(await raw("search_code", { query: "repo:" + OWNER + "/" + REPO + " " + query, perPage: 10, fields: ["path", "name"] }));
      return { total: r?.total_count, paths: arr(r, "items").map(i => i.path) };
    },
  }, {
    annotations: READ, name: "set_branch",
    description: "Switch the branch file reads go to, when the user says so. Stays for this page until it is reloaded.",
    inputSchema: { type: "object", required: ["branch"], properties: { branch: { type: "string", description: "The branch name." } } },
    async execute({ branch }) {
      const names = await branchNames();
      if (!names.includes(branch)) throw new Error("No branch \"" + branch + "\". Branches: " + names.join(", "));
      BRANCH = branch;
      return { branch };
    },
  }];

  // ---- Connector tools setup chose (`assistant.tools`): wrapped as they are, behind the write rule. A write must
  // carry the AI marker, and always waits for a click on a preview of what it sends.
  // A tool is described only once the viewer has allowed its connector, so one without a schema is left out (never
  // guessed) and described again on the next message; the first message asks the viewer once for those connectors.
  let connectorsReady = Promise.resolve(), askedConnectors = false;
  const DESCRIBED = {};                                      // "server/tool" -> wrapped tool
  async function loadConnectors(ask) {
    const missing = (AS.tools || []).filter(t => !DESCRIBED[t.server + "/" + t.tool]);
    if (!missing.length) return;
    if (ask && !askedConnectors) {
      askedConnectors = true;
      try { await (await window.claude?.use?.("permissions"))?.request([...new Set(missing.map(t => "mcp:" + t.server))]); } catch {}
    }
    const run = { made: [], hide: [], posted: [] }, any = { number: 0, labels: [] };
    const used = new Set([createTool(run), deleteTool(run), commentTool(run), closeTool(any, run), snoozeTool(any, run), ...repoTools(), ...CONNECTORS].map(t => t.name));
    await Promise.all(missing.map(async ({ server, tool }) => {
      let d; try { d = await mcp.describeTool(server, tool); } catch { return; }
      const inputSchema = DSH.fitSchema(d?.inputSchema || { type: "object" }, 4000);
      if (!inputSchema) return;
      let name = String(tool).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
      if (used.has(name)) name = (String(server).replace(/[^A-Za-z0-9]/g, "") + "_" + name).slice(0, 64);
      used.add(name);
      const write = !d?.annotations?.readOnlyHint;
      DESCRIBED[server + "/" + tool] = {
        server, tool, name, annotations: d?.annotations, tracker: false,
        description: (tail => DSH.fitBytes("[" + server + "] " + (d?.description || tool), 1000 - new TextEncoder().encode(tail).length) + tail)(write ? " Put the marker \"" + (CFG.aiMarker || "") + "\" in the text you send." : ""),
        inputSchema,
        check: input => { if (write && !DSH.hasMarker(input, CFG.aiMarker)) throw new Error("Not sent: the text must carry the AI marker \"" + (CFG.aiMarker || "(none set: run setup)") + "\". Add it and call again."); },
        preview: input => "<strong>" + DSH.esc(server) + " · " + DSH.esc(tool) + "</strong><pre><code>" + DSH.esc(JSON.stringify(input, null, 2)) + "</code></pre>",
        async execute(input) {
          const r = await callTool(server, tool, input);
          const p = r?.payload;
          return short(p !== undefined && typeof p !== "string" ? JSON.stringify(p) : String(p ?? DSH.fileText(r)), 30000);
        },
      };
    }));
    // In the order setup chose.
    CONNECTORS = (AS.tools || []).map(t => DESCRIBED[t.server + "/" + t.tool]).filter(Boolean);
  }

  // ---- One Cloud chat. Its DOM is built once and moved between renders, so an Allow / Deny or a streaming answer
  // survives a poll. Stored at `cloud/tab` or `cloud/card-<id>`, a `/` in a key written `~` (a db path segment cannot hold it).
  const CLOUD = {};
  const chatKey = n => "card-" + String(n).replace(/\//g, "~");
  // Folders for «Open in Claude Code»: the config default plus the ones this viewer used, kept in the page (a viewer's own
  // browser storage, not the shared `db`); an artifact frame without storage keeps them until the page closes.
  let recentMem = null;
  const getRecent = () => recentMem || (recentMem = (() => { try { return JSON.parse(localStorage.getItem("dsh-folders") || "[]"); } catch { return []; } })());
  const setRecent = l => { recentMem = l; try { localStorage.setItem("dsh-folders", JSON.stringify(l)); } catch {} };
  const folders = pick => DSH.folderOptions(pick || CFG.projectFolder, getRecent());
  function cloudChat(key, opts) {
    if (CLOUD[key]) { CLOUD[key].opts = opts; return CLOUD[key].node; }
    const node = el("div", "editor"), list = el("div", "chat"); list.setAttribute("aria-live", "polite");
    const ta = el("textarea"); ta.rows = 3; ta.placeholder = opts.placeholder; ta.setAttribute("aria-label", "Message to Claude");
    const row = el("div", "row"), send = el("button", "btn primary", "Send"), stop = el("button", "btn", "Stop"), fresh = el("button", "btn", "New conversation"), err = el("span", "err");
    send.type = stop.type = fresh.type = "button"; send.title = "Ctrl+Enter"; stop.disabled = true;
    const prog = el("span", "cm-meta"), hand = el("div", "row");
    row.append(send, stop, fresh, prog, err); node.append(list, ta, row, hand);
    const st = CLOUD[key] = { node, opts, turns: null, loading: null, ctl: null, gen: 0, pending: new Set() };
    const say = (cls, markup) => { const d = html("msg " + cls, markup); list.append(d); return d; };
    const show = () => { list.textContent = ""; (st.turns || []).forEach(t => say(t.role === "user" ? "you" : "claude", t.role === "user" ? DSH.esc(t.content) : mdr(t.content))); };
    st.approve = markup => new Promise(resolve => {
      const d = say("approve", markup), r = el("div", "row"), yes = el("button", "btn primary", "Allow"), no = el("button", "btn", "Deny");
      yes.type = no.type = "button";
      const end = ok => { if (!st.pending.delete(end)) return; r.remove(); d.append(el("div", "cm-meta", ok ? "Allowed" : "Denied")); resolve(ok); };
      st.pending.add(end);
      yes.onclick = () => end(true); no.onclick = () => end(false);
      r.append(yes, no); d.append(r);
    });
    const denyAll = () => [...st.pending].forEach(end => end(false));
    const doc = () => db && db.doc("cloud/" + key);
    // Loaded once, on first view; a db that does not answer within 10 s leaves an empty chat that is not saved over.
    st.load = () => st.loading || (st.loading = (async () => {
      if (!(await dbReady)) { st.turns = []; err.textContent = "History is not kept on this page (no db)."; return; }
      try {
        const snap = await Promise.race([doc().get(), new Promise((_, no) => setTimeout(() => no({ code: "timeout", message: "no answer in 10 s" }), 10000))]);
        const t = snap.exists ? snap.data()?.turns : null;
        st.turns = Array.isArray(t) ? t.filter(x => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string") : [];
      } catch (e) { st.turns = []; st.noSave = true; err.textContent = "History did not load (" + (e?.code || "error") + "): this conversation is not saved."; }
      show();
    })());
    const save = async () => {
      if (!db || st.noSave) return;
      try { await doc().set({ turns: DSH.fitConversation(st.turns, DOC_MAX), updated: new Date().toISOString() }); }
      catch (e) { err.textContent = "Not saved (" + (e?.code || "error") + ")."; }
    };
    // After the cap: «Open in Claude Code», a deep link with the task prefilled, in a folder chosen here (#130).
    const handoff = (task, said) => {
      hand.textContent = "";
      const sel = el("select"), a = el("a", "btn primary", "Open in Claude Code");
      sel.setAttribute("aria-label", "Project folder");
      const fill = pick => { sel.textContent = ""; folders(pick).forEach(f => sel.append(new Option(f, f))); sel.value = pick || sel.value; };
      const link = () => { a.href = DSH.deepLink(sel.value, (st.opts.ref ? st.opts.ref + "\n\n" : "") + task + "\n\nProgress so far:\n" + said.slice(-2000)); };
      fill(); link(); sel.onchange = link;
      a.target = "_blank"; a.rel = "noopener"; a.onclick = () => { if (sel.value) { setRecent(DSH.rememberFolder(getRecent(), sel.value)); } };
      const note = el("span", "cm-meta", "Not finished in " + DSH.MAX_ROUNDS + " steps. The link only fills the message: press Enter there.");
      hand.append(...(sel.options.length ? [sel] : []), a, note);
    };
    async function run() {
      const text = ta.value.trim(); if (!text || send.disabled) return;
      if (!sample) { err.textContent = "Claude is not available on this page."; return; }
      await st.load();
      ta.value = ""; err.textContent = ""; hand.textContent = "";
      st.turns = DSH.nextTurns(st.turns, text); show();
      // `gen` changes on "New conversation": a run it interrupted no longer writes into the cleared chat.
      const out = say("claude", DSH.esc("Thinking…")), r = { made: [], hide: [], posted: [] }, gen = st.gen;
      st.ctl = new AbortController(); send.disabled = true; stop.disabled = false;
      try {
        await connectorsReady;
        if (mcp) await (connectorsReady = loadConnectors(true).catch(() => {}));
        const ctx = await st.opts.context();
        const input = DSH.trimTurns(RULES, [...st.turns.slice(0, -1), { role: "user", content: ctx + "\n\nThe user's message:\n" + text }], budget);
        if (!tracker) throw { code: "no_tracker", message: "the tracker is not reachable on this page" };
        const tools = DSH.pickTools(st.opts.tools(r), CONNECTORS, GITHUB ? SERVER : null).map(t => gated(st, t));
        // A long task: one `sample` call allows few tool rounds, so continue while Claude marks the answer unfinished (#130).
        let said = "", more = true, round = 0;
        while (more && round < DSH.MAX_ROUNDS) {
          round++;
          prog.textContent = "Step " + round + " of up to " + DSH.MAX_ROUNDS + "…";
          const got = await sample(round === 1 ? input : DSH.continueInput(input, said), { signal: st.ctl.signal, cache: false, tools,
            onText: ({ text: t }) => { out.innerHTML = mdr(said ? said + "\n\n" + t : t); } });
          const part = DSH.splitMark(got.text);
          said = said ? said + "\n\n" + part.text : part.text; more = part.more;
          out.innerHTML = mdr(said);
        }
        prog.textContent = "";
        const reply = DSH.withLinks(said, r.made);
        out.innerHTML = mdr(reply);
        if (gen === st.gen) st.turns.push({ role: "assistant", content: reply });
        if (more) handoff(text, said);
      } catch (e) {
        if (e?.text) out.innerHTML = mdr(e.text); else out.remove();
        say("note", DSH.esc(sampleText(e)) + r.made.map(m => " " + mdr(tracker.refMd(m.id))).join(""));
        if (gen === st.gen && (r.made.length || r.hide.length || r.posted.length))
          st.turns.push({ role: "assistant", content: "Done before the stop: " + [...r.made.map(m => "created #" + m.id), ...r.hide.map(n => "closed or snoozed #" + n), ...r.posted.map(n => "commented on #" + n)].join(", ") + "." });
      } finally {
        denyAll(); prog.textContent = "";
        send.disabled = false; stop.disabled = true;
        if (gen === st.gen) await save();
        r.hide.forEach(n => GONE.set(n, 0));
        r.posted.forEach(n => { if (OPEN.has(n)) loadThread(n, () => render(true)); });
        if (r.hide.length) render(true);
        if (r.made.length || r.hide.length) poll();
      }
    }
    send.onclick = run;
    stop.onclick = () => { denyAll(); st.ctl?.abort(); };
    fresh.onclick = async () => {
      denyAll(); st.ctl?.abort();
      await st.load();
      st.gen++; st.turns = []; st.noSave = false; err.textContent = ""; show();
      if (db) { try { await doc().delete(); } catch (e) { err.textContent = "Not cleared (" + (e?.code || "error") + ")."; } }
    };
    onCtrlEnter(ta, run);
    return node;
  }
  // A task's place in its tree for its Cloud prompt, read fresh on every message: its open children, or its direct parent's
  // brief and its siblings. Nothing further up, and no comments or chats of the others.
  async function hierarchyOf(n) {
    try {
      const rel = RELS[n] || DSH.relOf(await tracker.get(n));
      const pn = rel.parent ?? (rel.hasParent ? await tracker.parent(n) : null);
      const [kids, parent, sibs] = await Promise.all([rel.total ? tracker.children(n) : [], pn != null ? tracker.get(pn) : null, pn != null ? tracker.children(pn) : []]);
      return DSH.hierarchyText(n, { rel, kids, parent, sibs, relOf: i => RELS[i.id] || DSH.relOf(i) });
    } catch (e) { return "(Its place in the hierarchy could not be read: " + failText(e) + ")"; }
  }
  // A card's chat: the card and its whole thread, read fresh on every message, then the conversation.
  function cardChat(issue, sec) {
    const n = issue.id, buttons = sec.cardActions !== false;
    return cloudChat(chatKey(n), {
      ref: "Dashboard card #" + n + (CFG.repo ? " in " + CFG.repo : "") + ": " + issue.title,
      placeholder: "Ask Claude about this card. It changes the tracker only when you ask it to.",
      async context() {
        const i = ISSUES.find(x => x.id === n) || issue;
        let cs = THREADS[n];
        try { cs = THREADS[n] = await tracker.comments(n); } catch {}
        const room = Math.floor(budget / 4);
        return "Mode: Cloud chat on #" + n + ".\n" + board() + "\n\n" + DSH.cardView(i, Array.isArray(cs) ? cs : [], SIG, room, await hierarchyOf(n));
      },
      tools: r => {
        const i = ISSUES.find(x => x.id === n) || issue;
        return [commentTool(r, n), createTool(r, n), ...(buttons ? [closeTool(i, r), snoozeTool(i, r)] : []), deleteTool(r), ...repoTools()];
      },
    });
  }
  const dbReady = (async () => { try { db = await window.claude?.use?.("db"); } catch { db = null; } return db; })();
  (async () => {
    try {
      sample = await window.claude?.use?.("sample");
      const lim = sample && await sample.limits().catch(() => null);
      // Tool rounds count toward the same cap, so the history gets half of it.
      if (!lim?.tools) sample = null; else budget = Math.floor(lim.maxPromptBytes / 2);
    } catch { sample = null; }
    if (!sample) Object.values(CLOUD).forEach(st => st.node.querySelector(".err").textContent = "Claude is not available on this page.");
  })();
  document.getElementById("tab-cloud").append(cloudChat("tab", {
    placeholder: "Ask Claude anything, or ask for a task. It changes the tracker only when you ask it to.",
    context: async () => "Mode: Cloud chat on the Assistant tab.\n" + board(),
    tools: r => [createTool(r), deleteTool(r), commentTool(r), ...repoTools()],
  }));
  CLOUD.tab.load();

  // Local on the Assistant tab (ADR 0005): the text becomes an agent task, which the sync claims and carries out.
  // The user's own click, like a comment's Send: no Claude call and no approval in between.
  (() => {
    const box = document.getElementById("tab-local"), ta = el("textarea"), row = el("div", "row");
    const send = el("button", "btn primary", "Create agent task"), msg = el("span", "err");
    ta.rows = 3; ta.setAttribute("aria-label", "Agent task");
    ta.placeholder = "A task for Claude with local tools: what to do and what done looks like. The next sync takes it and reports in the card's comments.";
    send.type = "button"; send.title = "Ctrl+Enter";
    row.append(send, msg); box.append(ta, row);
    if (!CFG.agentAssignee) { ta.disabled = send.disabled = true; msg.textContent = "No agent-assignee in the config: run /dashboard-v2 setup agent assignee."; return; }
    onCtrlEnter(ta, () => send.click());
    send.onclick = async () => {
      const text = ta.value.trim(); if (!text || send.disabled) return;
      send.disabled = true; msg.className = "err"; msg.textContent = "Creating…";
      try {
        // The text is often not English, so the slug can not come from it; a short time suffix keeps two tasks in one minute apart.
        const slug = "agent-" + Date.now().toString(36).slice(-4);
        const r = await tracker.create(DSH.newTask({ slug, brief: text }, { stamp: keyStamp(), section: CFG.taskSection, assignee: CFG.agentAssignee }));
        ta.value = ""; msg.textContent = ""; msg.className = "cm-meta";
        const a = el("a", null, r.ref || "the task"); a.href = r.url;
        if (!String(r.url).startsWith("#")) { a.target = "_blank"; a.rel = "noopener"; }
        msg.append("Created ", a, ": the next sync takes it.");
        poll();
      } catch (e) { msg.textContent = "Not created (" + failText(e) + "). Your text is kept."; }
      finally { send.disabled = false; }
    };
  })();

  // A record's link in artifact-db mode is `#<key>` in the page URL: open that card in place, on load and on every click,
  // the link to the card already in the URL included (it fires no hashchange). A key that is not a card on the page
  // (a subtask, a series task, a closed record) says so instead of doing nothing.
  const openFromHash = () => {
    let key; try { key = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!key || GITHUB || key.startsWith("s-")) return;
    const rec = ISSUES.find(i => String(i.id) === key);
    HASH_MISS = rec ? null : key;
    if (rec) OPEN.add(rec.id);
    render(true);
    document.querySelectorAll("article.card").forEach(c => { if (c.dataset.card === key) c.scrollIntoView({ block: "start" }); });
  };
  window.addEventListener("hashchange", openFromHash);
  document.addEventListener("click", e => { const a = e.target.closest?.("a[href^='#']"); if (a && a.getAttribute("href") === location.hash) openFromHash(); });

  (async () => {
    try { mcp = await window.claude?.use?.("mcp"); } catch { mcp = null; }
    // The tracker: GitHub through the connector, or the artifact db through the page's own `db`.
    if (GITHUB) {
      if (mcp) tracker = githubTracker({ owner: OWNER, repo: REPO, server: SERVER,
        call: async (tool, input) => payload(await callTool(SERVER, tool, Object.assign({ owner: OWNER, repo: REPO }, input))) });
    } else if (CFG.storage === "artifact-db") {
      if (await dbReady) tracker = artifactDbTracker({ db, onRateLimit: rateLimited });
    }
    if (!tracker) {
      branchFound();
      LOAD_ERR = GITHUB ? "the page has no connector access (the mcp capability is not available in this window)"
        : CFG.storage === "artifact-db" ? "the page has no access to its db (the db capability is not available in this window)"
        : "storage \"" + CFG.storage + "\" is not one the page can read: run /dashboard-v2 setup";
      render(true); return;
    }
    // Once per page open, alongside the first poll: where repo reads go, and the connector tools setup gave the assistant.
    // Both need the connector, which the artifact db does not.
    if (mcp) {
      const want = AS.branch || "last-active";
      if (want === "last-active") findBranch().then(b => { BRANCH = b; }, () => {}).then(branchFound);
      else { if (want !== "ask") BRANCH = want; branchFound(); }
      connectorsReady = loadConnectors(false).catch(() => {});
    } else branchFound();
    await poll();
    openFromHash();
    // One chain of timeouts, each delay worked out afresh; the other poll() calls (tab shown, a card created) are extra.
    const tick = async () => { try { if (!document.hidden) await poll(); } finally { setTimeout(tick, pollDelay()); } };
    setTimeout(tick, pollDelay());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  })();
})();
