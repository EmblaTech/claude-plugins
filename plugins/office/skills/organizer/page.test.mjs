// Tests for the page's pure logic (logic.js) and its Theme contract (ADR 0006).
// Run from the repo root: node --test "plugins/office/skills/organizer/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DSH } from "./logic.js";

const BODY = `## Brief
The user owes the SoW draft. See [ABC-12](https://example.com/ABC-12).

## Prepare
- [ ] #41 Draft SoW

## Terms
- **Acme** — the property-management client
- **SoW** — statement of work

## Prompts
\`\`\`
Draft the SoW for Acme.
\`\`\`

\`\`\`text
Second prompt
\`\`\`

## Suggestions
- Ask Alex to approve the SoW
- Move the meeting to Friday`;

test("card: splits the body by its fixed headings", () => {
  const c = DSH.parseCard(BODY);
  assert.equal(c.brief, "The user owes the SoW draft. See [ABC-12](https://example.com/ABC-12).");
  assert.equal(c.prepare, "- [ ] #41 Draft SoW");
  assert.deepEqual(c.terms, { Acme: "the property-management client", SoW: "statement of work" });
  assert.deepEqual(c.prompts, ["Draft the SoW for Acme.", "Second prompt"]);
  assert.deepEqual(c.suggestions, ["Ask Alex to approve the SoW", "Move the meeting to Friday"]);
});

test("card: a body without headings is all brief", () => {
  const c = DSH.parseCard("Just text\n\nmore");
  assert.equal(c.brief, "Just text\n\nmore");
  assert.deepEqual(c.terms, {});
  assert.deepEqual(c.prompts, []);
});

// A record as tracker.js returns it (the marker line and the GitHub issue fields are tracker.test.mjs's).
const issue = (id, labels = [], f = {}) => ({ id, labels, ...f });

test("visibility: hidden while Start date is after today, back on that date", () => {
  const i = issue(1, [], { startDate: "2026-11-06" });
  assert.equal(DSH.isVisible(i, "2026-11-05"), false);
  assert.equal(DSH.isVisible(i, "2026-11-06"), true);
  assert.equal(DSH.isVisible(issue(2), "2026-11-05"), true);
});

test("ordering: needs-you, then Priority, then Target date; unset last", () => {
  const list = [
    issue(1, [], { priority: "Low" }),
    issue(2, [], { priority: "High", targetDate: "2026-11-20" }),
    issue(3, [], {}),
    issue(4, ["dsh:needs-you"], { priority: "Low" }),
    issue(5, [], { priority: "High", targetDate: "2026-11-10" }),
    issue(6, [], { priority: "Urgent" }),
  ];
  assert.deepEqual(list.sort(DSH.byOrder).map(i => i.id), [4, 6, 5, 2, 1, 3]);
});

test("snooze: next working day skips the weekend; week is +7 days", () => {
  assert.equal(DSH.snoozeDate("2026-11-05", false), "2026-11-06"); // Thu -> Fri
  assert.equal(DSH.snoozeDate("2026-11-06", false), "2026-11-09"); // Fri -> Mon
  assert.equal(DSH.snoozeDate("2026-11-06", true), "2026-11-13");
});

const SIG = "— 🤖 Claude";
const cm = (id, body) => ({ id, body, created_at: `2026-11-05T10:0${id}:00Z` });

test("comments: the user's comment with no later signed reply is unanswered", () => {
  const thread = [cm(1, "Prep the SoW"), cm(2, "Done, draft in Outlook.\n\n— 🤖 Claude"), cm(3, "Also ask Alex")];
  assert.deepEqual(DSH.unanswered(thread, SIG).map(c => c.id), [3]);
});

test("comments: a signed reply answers every earlier comment", () => {
  const thread = [cm(1, "a"), cm(2, "b"), cm(3, "ok\n— 🤖 Claude  \n")];
  assert.deepEqual(DSH.unanswered(thread, SIG), []);
  assert.equal(DSH.isClaude(thread[2], SIG), true);
  assert.equal(DSH.isClaude(thread[0], SIG), false);
});

test("comments: order comes from created_at, not array order", () => {
  const thread = [cm(3, "later question"), cm(2, "x — 🤖 Claude"), cm(1, "first")];
  assert.deepEqual(DSH.unanswered(thread, SIG).map(c => c.id), [3]);
});

test("links: a created task the text does not mention is appended, a mentioned one is not", () => {
  const made = [{ id: 50, url: "u50" }, { id: 51, url: "u51" }];
  assert.equal(DSH.withLinks("Made #50.", made), "Made #50. [#51](u51)");
  assert.equal(DSH.withLinks("Made #500.", [made[0]]), "Made #500. [#50](u50)");
  // artifact-db ids are keys, linked in the page; a longer key that starts with this one is not a mention
  const key = [{ id: "task_a", url: "#task_a" }];
  assert.equal(DSH.withLinks("Made #task_a.", key), "Made #task_a.");
  assert.equal(DSH.withLinks("Made #task_ab.", key), "Made #task_ab. [#task_a](#task_a)");
});

test("snooze from a Cloud chat: only a real date after today", () => {
  assert.equal(DSH.snoozeUntil("2026-11-12", "2026-11-10"), "2026-11-12");
  assert.equal(DSH.snoozeUntil("2026-11-10", "2026-11-10"), null);
  assert.equal(DSH.snoozeUntil("Friday", "2026-11-10"), null);
  assert.equal(DSH.snoozeUntil("2026-02-30", "2026-01-10"), null);
});

const norm = s => s.replace(/\n/g, "");

test("markdown: escapes raw HTML", () => {
  assert.equal(DSH.md('<img src=x onerror="alert(1)">'), "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
});

test("markdown: inline code, bold, italic, strike, links", () => {
  assert.equal(DSH.md("**b** _i_ ~~s~~ `a<b` [ABC-1](https://x.io/a?b=1&c=2)"),
    '<p><strong>b</strong> <em>i</em> <del>s</del> <code>a&lt;b</code> <a href="https://x.io/a?b=1&amp;c=2" target="_blank" rel="noopener">ABC-1</a></p>');
});

test("markdown: only http(s) and mailto links become anchors", () => {
  assert.equal(DSH.md("[x](javascript:alert(1))"), "<p>[x](javascript:alert(1))</p>");
});

test("markdown: bare URLs autolink", () => {
  assert.equal(DSH.md("see https://x.io/p."), '<p>see <a href="https://x.io/p" target="_blank" rel="noopener">https://x.io/p</a>.</p>');
});

test("markdown: lists, nested lists and task lists", () => {
  assert.equal(norm(DSH.md("- a\n  - b\n- [x] done\n- [ ] open\n\n1. one\n2. two")),
    '<ul><li>a<ul><li>b</li></ul></li><li class="task"><input type="checkbox" disabled checked> done</li><li class="task"><input type="checkbox" disabled> open</li></ul><ol><li>one</li><li>two</li></ol>');
});

test("markdown: fenced code keeps its text escaped and unformatted", () => {
  assert.equal(norm(DSH.md("```js\nconst a = **1** < 2;\n```")), "<pre><code>const a = **1** &lt; 2;</code></pre>");
});

test("markdown: tables", () => {
  assert.equal(norm(DSH.md("| A | B |\n|---|:-:|\n| 1 | **2** |")),
    "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>");
});

test("markdown: headings, quotes, rules and paragraphs", () => {
  assert.equal(norm(DSH.md("### Head\n\n> quoted\n\n---\n\nline one\nline two")),
    "<h3>Head</h3><blockquote><p>quoted</p></blockquote><hr><p>line one<br>line two</p>");
});

test("markdown: #N links to the issue when a repo URL is given", () => {
  assert.equal(DSH.md("see #41, not a#2", "https://github.com/o/r"),
    '<p>see <a href="https://github.com/o/r/issues/41" target="_blank" rel="noopener">#41</a>, not a#2</p>');
  assert.equal(DSH.md("see #41"), "<p>see #41</p>");
});

test("markdown: a [text](#key) link opens a record on this page, in the same frame; nothing else after # does", () => {
  assert.equal(DSH.md("see [the task](#task_send-sow_20261110-0930)"), '<p>see <a href="#task_send-sow_20261110-0930">the task</a></p>');
  assert.equal(DSH.md("[x](#a\"onclick=b)"), "<p>[x](#a&quot;onclick=b)</p>");
});

test("visibility: a Start date with a time part still compares by day", () => {
  const i = issue(1, [], { startDate: "2026-11-06T00:00:00Z" });
  assert.equal(DSH.isVisible(i, "2026-11-05"), false);
  assert.equal(DSH.isVisible(i, "2026-11-06"), true);
});

test("markdown: a heading keeps a # that is part of a word", () => {
  assert.equal(DSH.md("## Fix C#"), "<h2>Fix C#</h2>");
  assert.equal(DSH.md("## Closed ##"), "<h2>Closed</h2>");
});

test("labels: removing one keeps the rest, real get_labels shape", () => {
  const real = { labels: [{ color: "ededed", name: "dsh:on" }, { name: "dsh:replied" }, { name: "Ops" }], method: "get_labels", totalCount: 3 };
  assert.deepEqual(DSH.withoutLabel(real, "dsh:replied"), ["dsh:on", "Ops"]);
});

test("labels: refuses to write when the label is not in what was read", () => {
  assert.equal(DSH.withoutLabel({ labels: [] }, "dsh:replied"), null);
  assert.equal(DSH.withoutLabel(undefined, "dsh:replied"), null);
});

test("heartbeat: stale once the last run is older than the threshold", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(DSH.isStale("2026-11-04T11:00:00Z", now, 26), false);
  assert.equal(DSH.isStale("2026-11-04T09:00:00Z", now, 26), true);
});

test("heartbeat: no recorded run counts as stale", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(DSH.isStale(undefined, now, 26), true);
  assert.equal(DSH.isStale("not a date", now, 26), true);
});

const turn = (role, content) => ({ role, content });
const bytes = turns => turns.reduce((n, t) => n + Buffer.byteLength(t.content), 0);

test("assistant: trimming keeps the rules turn first and drops the oldest turns", () => {
  const rules = turn("user", "RULES");
  const history = [turn("user", "a".repeat(40)), turn("assistant", "b".repeat(40)), turn("user", "c".repeat(40)), turn("assistant", "d".repeat(40)), turn("user", "last")];
  const out = DSH.trimTurns(rules, history, 100);
  assert.deepEqual(out.map(t => t.content[0]), ["R", "c", "d", "l"]);
  assert.ok(bytes(out) <= 100);
});

test("assistant: trimming counts UTF-8 bytes, so accented letters weigh double", () => {
  const rules = turn("user", "R");
  const history = [turn("user", "é".repeat(30)), turn("assistant", "ok"), turn("user", "déjà")];
  // 30 accented letters are 60 bytes: over a 50-byte budget, though only 30 characters.
  assert.deepEqual(DSH.trimTurns(rules, history, 50).map(t => t.content), ["R", "ok", "déjà"]);
});

test("assistant: trimming never drops the newest user turn", () => {
  const out = DSH.trimTurns(turn("user", "RULES"), [turn("assistant", "x"), turn("user", "y".repeat(500))], 100);
  assert.deepEqual(out.map(t => t.role), ["user", "user"]);
  assert.equal(out[1].content.length, 500);
});

const CTX = { stamp: "20261110-0930", section: "todo", known: ["dsh:mtg/weekly-sync", "Ops", "dsh:on"] };

test("new task: always dsh:task and dsh:on; only labels already in the tracker, no other dsh: label", () => {
  const t = DSH.newTask({ title: "Send the SoW", slug: "send-sow", brief: "The SoW must go out.", series: "weekly-sync", track: "Ops" }, CTX);
  assert.deepEqual(t.labels, ["dsh:task", "dsh:on", "dsh:mtg/weekly-sync", "Ops"]);
  const bad = DSH.newTask({ title: "x", slug: "x", brief: "x", series: "made-up", track: "dsh:delete" }, CTX);
  assert.deepEqual(bad.labels, ["dsh:task", "dsh:on"]);
});

test("agent task: ready-for-agent and the assignee, even though no card on the page carries that label", () => {
  const t = DSH.newTask({ slug: "agent", brief: "Update the README." }, { ...CTX, assignee: "agent-login" });
  assert.deepEqual(t.labels, ["dsh:task", "dsh:on", "ready-for-agent"]);
  assert.equal(t.assignee, "agent-login");
  assert.equal(DSH.newTask({ title: "x", slug: "x", brief: "x" }, CTX).assignee, undefined);
});

test("agent task: without a title, the first line of the text is the title, cut to 80 characters; the whole text is the brief", () => {
  const text = "  Review PR #12\nand write the outcome in a comment.  ";
  const t = DSH.newTask({ slug: "agent", brief: text }, { ...CTX, assignee: "u" });
  assert.equal(t.title, "Review PR #12");
  assert.equal(DSH.parseCard(t.body).brief, "Review PR #12\nand write the outcome in a comment.");
  const long = DSH.newTask({ slug: "agent", brief: "a".repeat(100) }, CTX).title;
  assert.equal(long, "a".repeat(79) + "…");
});

test("new task: Priority and Target date only when valid", () => {
  const t = DSH.newTask({ title: "x", slug: "x", brief: "x", priority: "high", target: "2026-11-14" }, CTX);
  assert.deepEqual([t.priority, t.targetDate], ["High", "2026-11-14"]);
  const bad = DSH.newTask({ title: "x", slug: "x", brief: "x", priority: "asap", target: "Friday" }, CTX);
  assert.deepEqual([bad.priority, bad.targetDate], [undefined, undefined]);
});

test("new task: a record with a brief, the linked card, its key and meta", () => {
  const t = DSH.newTask({ title: "Send the SoW", slug: "Send SoW!", brief: "The SoW must go out.", target: "2026-11-14", card: 41 }, CTX);
  const c = DSH.parseCard(t.body);
  assert.equal(c.brief, "The SoW must go out.\n\n→ #41");
  assert.equal(t.key, "task_send-sow_20261110-0930");
  assert.deepEqual(t.meta, { section: "todo", lead: "14.11" });
  // artifact-db: the card is a key, linked in the page
  const k = DSH.newTask({ title: "x", slug: "x", brief: "B", card: "mtg_w_20261110" }, { ...CTX, parseId: x => String(x), refMd: id => "[" + id + "](#" + id + ")" });
  assert.equal(k.body, "## Brief\nB\n\n→ [mtg_w_20261110](#mtg_w_20261110)");
  assert.equal(t.title, "Send the SoW");
});

test("new task: the key carries the time, so the same slug twice a day still differs; no ASCII gives a neutral slug", () => {
  const t = DSH.newTask({ title: "電話", slug: "電話", brief: "電話。" }, CTX);
  assert.equal(t.key, "task_new_20261110-0930");
  assert.equal(t.meta.lead, "—");
});

// The write rule (PRD "Write rule"). MCP defaults: no readOnlyHint is a write, no destructiveHint is destructive.
test("write rule: reads and tracker writes go through, tracker delete and other writes need a click", () => {
  const tracker = true, other = false;
  assert.equal(DSH.needsClick({ readOnlyHint: true }, tracker), false);
  assert.equal(DSH.needsClick({ readOnlyHint: true }, other), false);
  assert.equal(DSH.needsClick({ readOnlyHint: false, destructiveHint: false }, tracker), false);
  assert.equal(DSH.needsClick({ readOnlyHint: false, destructiveHint: true }, tracker), true);
  assert.equal(DSH.needsClick({ readOnlyHint: false, destructiveHint: false }, other), true);
  assert.equal(DSH.needsClick({ readOnlyHint: false, destructiveHint: true }, other), true);
});

test("write rule: a tool without annotations fails closed", () => {
  assert.equal(DSH.needsClick(undefined, true), true);
  assert.equal(DSH.needsClick({}, true), true);
  assert.equal(DSH.needsClick(undefined, false), true);
});

// ---- Cloud chat (#129)

test("cloud: the newest commit date picks the branch; branches without a date are skipped", () => {
  const heads = [{ name: "main", date: "2026-11-10T08:00:00Z" }, { name: "wip", date: "2026-11-11T21:30:00Z" }, { name: "old", date: "" }];
  assert.equal(DSH.lastActive(heads), "wip");
  assert.equal(DSH.lastActive([{ name: "x" }]), null);
  assert.equal(DSH.lastActive([]), null);
});

test("cloud: a commit's date comes from the committer, else the author", () => {
  assert.equal(DSH.commitDate({ commit: { committer: { date: "2026-11-11T10:00:00Z" }, author: { date: "2026-11-01T10:00:00Z" } } }), "2026-11-11T10:00:00Z");
  assert.equal(DSH.commitDate({ commit: { author: { date: "2026-11-01T10:00:00Z" } } }), "2026-11-01T10:00:00Z");
  assert.equal(DSH.commitDate(undefined), "");
});

const b64 = s => Buffer.from(s, "utf8").toString("base64");
test("cloud: a file read collects the embedded resource, not the download notice", () => {
  const r = { content: [{ type: "text", text: "successfully downloaded text file (SHA: abc)" }, { type: "resource", resource: { uri: "repo://x", text: "# Index\nline" } }] };
  assert.equal(DSH.fileText(r), "# Index\nline");
});

test("cloud: a base64 blob decodes as UTF-8, accented letters included", () => {
  const r = { content: [{ type: "text", text: "successfully downloaded" }, { type: "resource", resource: { blob: b64("Grüße, café") } }] };
  assert.equal(DSH.fileText(r), "Grüße, café");
});

test("cloud: without a resource block, every text block is kept", () => {
  assert.equal(DSH.fileText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }), "a\nb");
  assert.equal(DSH.fileText({ content: [] }), "");
  assert.equal(DSH.fileText(undefined), "");
});

test("cloud: tools — the page's own first, the tracker server's raw tools never, at most 16", () => {
  const own = ["create_task", "read_file"].map(name => ({ name }));
  const extra = [{ server: "github", tool: "create_or_update_file" }, { server: "github", tool: "push_files" },
    ...Array.from({ length: 20 }, (_, i) => ({ server: "Mail", tool: "t" + i }))];
  const tools = DSH.pickTools(own, extra, "github", 16);
  assert.equal(tools.length, 16);
  assert.deepEqual(tools.slice(0, 2).map(t => t.name), ["create_task", "read_file"]);
  assert.ok(!tools.some(t => t.server === "github"));
  assert.deepEqual(tools.slice(2).map(t => t.tool), Array.from({ length: 14 }, (_, i) => "t" + i));
});

test("cloud: a connector write needs the AI marker in one of its text fields", () => {
  const M = "(drafted by Claude)";
  assert.equal(DSH.hasMarker({ to: "a@b.c", body: { content: "Hi\n\n" + M } }, M), true);
  assert.equal(DSH.hasMarker({ to: "a@b.c", lines: ["x", "y " + M] }, M), true);
  assert.equal(DSH.hasMarker({ body: "Hi" }, M), false);
  // No marker configured fails closed.
  assert.equal(DSH.hasMarker({ body: "Hi" }, ""), false);
});

test("cloud: a stored conversation fits one db document, dropping its oldest turns", () => {
  const turns = [turn("user", "é".repeat(100)), turn("assistant", "b".repeat(100)), turn("user", "last")];
  const out = DSH.fitConversation(turns, 250);
  assert.deepEqual(out.map(t => t.content[0]), ["b", "l"]);
  assert.ok(Buffer.byteLength(JSON.stringify({ turns: out })) <= 250);
  assert.deepEqual(DSH.fitConversation(turns, 10).map(t => t.content), ["last"]);
});

test("cloud: a failed exchange's dangling user turn is replaced, so two user turns never follow each other", () => {
  assert.deepEqual(DSH.nextTurns([turn("user", "a"), turn("assistant", "b"), turn("user", "lost")], "new"),
    [turn("user", "a"), turn("assistant", "b"), turn("user", "new")]);
  assert.deepEqual(DSH.nextTurns([], "new"), [turn("user", "new")]);
});

const cmt = (m, body) => ({ id: m, created_at: "2026-11-05T10:0" + m + ":00Z", body });
test("cloud: the card view holds the card without its metadata line, then the thread in time order", () => {
  const p = DSH.cardView({ id: 7, title: "Prep", body: BODY }, [cmt(2, "ok\n\n— 🤖 Claude"), cmt(1, "Prep the SoW")], SIG);
  assert.ok(p.startsWith("The card #7: Prep\n\n## Brief"));
  assert.ok(p.indexOf("User, 2026-11-05T10:01:00Z:\nPrep the SoW") < p.indexOf("Claude, 2026-11-05T10:02:00Z:\nok"));
});

test("cloud: a long thread drops its oldest comments first and says so; the newest always stays", () => {
  const issue = { id: 7, title: "Prep", body: "b" };
  const thread = [cmt(1, "x".repeat(300)), cmt(2, "y".repeat(300)), cmt(3, "latest")];
  const p = DSH.cardView(issue, thread, SIG, 520);
  assert.ok(!p.includes("xxx") && p.includes("yyy") && p.includes("latest"));
  assert.ok(p.includes("(1 older comment left out)"));
  assert.ok(Buffer.byteLength(p) <= 520);
  assert.ok(DSH.cardView(issue, thread, SIG, 10).includes("latest"));
  assert.ok(DSH.cardView(issue, [], SIG).endsWith("(no comments)"));
});

test("fitBytes keeps short text and cuts long text to the byte limit", () => {
  assert.equal(DSH.fitBytes("abc", 10), "abc");
  const cut = DSH.fitBytes("é".repeat(1000), 100);
  assert.ok(new TextEncoder().encode(cut).length <= 100);
  assert.ok(cut.endsWith("…"));
  assert.equal(DSH.fitBytes("😀".repeat(50), 10), "😀…");
});

test("fitSchema sheds notes, then descriptions, and gives up on a shape too big", () => {
  const small = { type: "object", properties: { q: { type: "string", description: "Query." } } };
  assert.deepEqual(DSH.fitSchema(small, 4000), small);
  const big = { type: "object", title: "T", properties: {
    description: { type: "string", description: "x".repeat(3000), examples: ["y".repeat(2000)] },
    q: { type: "string", description: "z".repeat(3000) } } };
  const fit = DSH.fitSchema(big, 4000);
  assert.ok(new TextEncoder().encode(JSON.stringify(fit)).length <= 4000);
  assert.ok(fit.properties.description, "a property named description stays");
  assert.equal(fit.properties.q.type, "string");
  assert.equal(fit.properties.description.examples, undefined);
  const huge = { type: "object", properties: Object.fromEntries(Array.from({ length: 400 }, (_, i) => ["p" + i, { type: "string" }])) };
  assert.equal(DSH.fitSchema(huge, 4000), null);
});

test("theme switcher: a stored light or dark stays; nothing stored or anything else is auto", () => {
  assert.equal(DSH.themeChoice("light"), "light");
  assert.equal(DSH.themeChoice("dark"), "dark");
  for (const v of [null, undefined, "", "auto", "Dark", "sepia", "{}"]) assert.equal(DSH.themeChoice(v), "auto", String(v));
});

// ---- Theme contract (ADR 0006): the look lives only in theme.css; base.css names the tokens every Theme must define.
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
const required = () => {
  const block = read("./base.css").match(/\/\*\s*Required tokens[\s\S]*?\*\//);
  assert.ok(block, "base.css has no `Required tokens` comment");
  return [...new Set(block[0].match(/--[a-z0-9-]+/g))];
};
const NAMED = "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" ");
// Where a colour can sit as a value: CSS declarations, style attributes and strings, SVG paint attributes.
// `transparent` and `currentColor` are allowed: they carry no colour of their own.
const cssValues = s => [...s.matchAll(/[\w-]+\s*:\s*([^;{}"]+)/g)].map(m => m[1]);
function colourLiterals(text, css) {
  const s = noComments(text), found = [];
  for (const m of s.matchAll(/(?<![\w&])#[0-9a-fA-F]{3,8}\b/g)) found.push(m[0]);
  for (const m of s.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi)) found.push(m[0]);
  const values = css ? cssValues(s) : [
    ...[...s.matchAll(/style(?:\.cssText)?\s*=\s*["'`]([^"'`]*)/g)].flatMap(m => cssValues(m[1])),
    ...[...s.matchAll(/\.style\.(?!cssText)\w+\s*=\s*["'`]([^"'`]*)/g)].map(m => m[1]),
    ...[...s.matchAll(/(?:fill|stroke|color|bgcolor)\s*=\s*\\?["']([^"'\\]*)/g)].map(m => m[1]),
  ];
  for (const v of values) for (const w of v.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) || []) if (NAMED.includes(w)) found.push(w);
  return found;
}

test("theme contract: no colour literal in page.html, base.css or app.js", () => {
  for (const f of ["page.html", "base.css", "app.js"]) assert.deepEqual(colourLiterals(read("./" + f), f.endsWith(".css")), [], f);
});

test("theme contract: the colour check catches hex, colour functions and named colours, not comments", () => {
  assert.deepEqual(colourLiterals(".a { color: #0f6b74; background: rgba(0,0,0,.1); border: 1px solid teal } /* #132 teal */", true), ["#0f6b74", "rgba(", "teal"]);
  assert.deepEqual(colourLiterals(".a { color: currentColor; background: transparent; white-space: nowrap }", true), []);
  assert.deepEqual(colourLiterals('x.style.cssText = "color:red"; // #fff\nel.innerHTML = \'<path fill="white"/>\'', false), ["red", "white"]);
});

test("theme contract: every var() the page uses is a required token or set in base.css", () => {
  const req = new Set(required()), local = new Set([...noComments(read("./base.css")).matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  for (const f of ["page.html", "base.css", "app.js"]) {
    const used = [...noComments(read("./" + f)).matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]);
    assert.deepEqual(used.filter(v => !req.has(v) && !local.has(v)), [], f);
  }
});

// A Theme: a light block on `:root`, a dark block for the system preference unless light is forced, one for `data-theme="dark"`.
function themeBlocks(css) {
  const s = noComments(css), body = re => (s.match(re) || [])[1];
  return {
    light: body(/(?:^|[;}])\s*:root\s*\{([^}]*)\}/),
    "dark (system)": body(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/),
    "dark (data-theme)": body(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/),
  };
}
// Only the skill's own theme: a project's theme lives outside the plugin and is checked in that project.
for (const path of ["./theme.css"]) {
  test("theme contract: " + path + " defines every required token in light, and every colour (only colours and elevation) in both dark blocks", () => {
    const req = required(), colours = req.filter(t => t.startsWith("--color-"));
    for (const [name, block] of Object.entries(themeBlocks(read(path)))) {
      assert.ok(block !== undefined, path + ": no " + name + " block");
      const defined = [...block.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]), has = new Set(defined);
      if (name === "light") { assert.deepEqual(req.filter(t => !has.has(t)), [], path + " light misses"); continue; }
      assert.deepEqual(colours.filter(t => !has.has(t)), [], path + " " + name + " misses");
      assert.deepEqual(defined.filter(t => !/^--(color|elevation)-/.test(t)), [], path + " " + name + " holds more than colours and elevation");
    }
  });
  test("theme contract: " + path + " loads fonts from Google Fonts only", () => {
    const urls = [...noComments(read(path)).matchAll(/(?:@import\s+(?:url\()?|url\()\s*["']?([^"')\s;]+)/g)].map(m => m[1]);
    assert.deepEqual(urls.filter(u => !u.startsWith("https://fonts.googleapis.com/")), [], path);
  });
}

test("long tasks: marker split, continue input, deep link, folders (#130)", () => {
  assert.deepEqual(DSH.splitMark("Half done.\n[[continue]]\n"), { text: "Half done.", more: true });
  assert.deepEqual(DSH.splitMark("Done."), { text: "Done.", more: false });
  assert.equal(DSH.splitMark("a [[continue]] b").more, false);
  const inp = [{ role: "user", content: "x" }], next = DSH.continueInput(inp, "so far");
  assert.equal(next.length, 3); assert.equal(next[1].content, "so far"); assert.match(next[2].content, /\[\[continue\]\]/);
  const folder = "C:\\My Proj\\a&b", u = new URL(DSH.deepLink(folder, "Fix #1 & more?"));
  assert.equal(u.protocol, "claude:"); assert.equal(u.searchParams.get("folder"), folder); assert.equal(u.searchParams.get("q"), "Fix #1 & more?");
  assert.equal(DSH.deepLink("", "t"), "claude://code/new?q=t");
  assert.deepEqual(DSH.folderOptions("/a", ["/b", "/a", " ", "/c"]), ["/a", "/b", "/c"]);
  assert.deepEqual(DSH.rememberFolder(["/a", "/b", "/c"], "/c", 2), ["/c", "/a"]);
});

// ---- Relations (#169, ADR 0008)
const iss = (id, labels = [], extra = {}) => ({ id, state: "open", labels, ...extra });
// A `get`'s relations (tracker.js): what the storage mode read, in one shape.
const rel = (o = {}) => DSH.relOf({ rel: { parent: null, hasParent: false, total: 0, completed: 0, type: "", blockedBy: [], ...o } });

test("relations: a record read before its get has none; the count reads 9/18", () => {
  assert.deepEqual(DSH.relOf({ id: 1 }), { parent: null, hasParent: false, total: 0, completed: 0, type: "", blockedBy: [] });
  assert.equal(DSH.countLabel(rel({ completed: 9, total: 18 })), "9/18");
  assert.equal(DSH.countLabel(DSH.relOf(undefined)), "");
});

test("ui labels: the count buttons read English when the config sets no labels", () => {
  assert.deepEqual(DSH.uiLabels(undefined), { tasks: "Tasks", subtasks: "Subtasks" });
});

test("ui labels: the config's labels replace the English words; a word it leaves out stays English", () => {
  assert.deepEqual(DSH.uiLabels({ tasks: "Oppgaver", subtasks: "Deloppgaver" }), { tasks: "Oppgaver", subtasks: "Deloppgaver" });
  assert.deepEqual(DSH.uiLabels({ subtasks: "Deloppgaver" }), { tasks: "Tasks", subtasks: "Deloppgaver" });
});

test("relations: ✓ is allowed only when no subtask is open", () => {
  assert.equal(DSH.canDone(rel({ completed: 9, total: 18 })), false);
  assert.equal(DSH.canDone(rel({ completed: 3, total: 3 })), true);
  assert.equal(DSH.canDone(rel()), true);
});

test("relations: only open subtasks show, with or without dsh:on", () => {
  const subs = [iss(1, ["dsh:on"]), iss(2, [], { state: "closed" }), iss(3), iss(4, [], { state: "CLOSED" })];
  assert.deepEqual(DSH.openSubs(subs).map(i => i.id), [1, 3]);
});

test("relations: Blocked mark only while some blocker is open; never hides", () => {
  assert.equal(DSH.isBlocked(rel({ blockedBy: [{ id: 5, state: "open" }] })), true);
  assert.equal(DSH.isBlocked(rel({ blockedBy: [{ id: 5, state: "done" }] })), false);
  assert.equal(DSH.isBlocked(rel()), false);
  const blocked = iss(7, ["dsh:on"]);
  assert.deepEqual(DSH.topLevel([blocked], { 7: rel({ blockedBy: [{ id: 5, state: "open" }] }) }, new Set()).map(i => i.id), [7]);
});

test("tree: a level loads only when expanded, once; deeper levels stay unloaded", async () => {
  const calls = [];
  const tree = DSH.lazyTree(async n => { calls.push(n); return [{ id: n * 10 }]; });
  await tree.expand(1); await tree.expand(1);
  assert.deepEqual(calls, [1]);
  assert.deepEqual(calls, [1]);
  tree.reset(); await tree.expand(1);
  assert.deepEqual(calls, [1, 1]);
});

test("tree: a failed load is not cached, so the next click retries", async () => {
  let n = 0;
  const tree = DSH.lazyTree(async () => { if (n++ === 0) throw new Error("x"); return []; });
  await assert.rejects(tree.expand(1));
  assert.deepEqual(await tree.expand(1), []);
});

test("walk up: reaches the root through the parents", async () => {
  const parents = { 3: 2, 2: 1 };
  assert.deepEqual(await DSH.walkUp(3, async n => parents[n] ?? null), { root: 1, path: [3, 2, 1], cycle: false });
  assert.deepEqual(await DSH.walkUp(1, async () => null), { root: 1, path: [1], cycle: false });
});

test("walk up: a cycle ends the walk and is marked; a long chain stops at 8 levels", async () => {
  const loop = { 1: 2, 2: 3, 3: 1 };
  const w = await DSH.walkUp(1, async n => loop[n]);
  assert.equal(w.cycle, true);
  assert.deepEqual(w.path, [1, 2, 3]);
  let calls = 0;
  const deep = await DSH.walkUp(100, async n => { calls++; return n - 1; });
  assert.equal(deep.path.length, 8);
  assert.ok(calls <= 8);
});

test("lift: a walked root needs the user and keeps the path to open; it sorts like a needs-you card", () => {
  const m = DSH.liftMap([{ root: 1, path: [3, 2, 1], cycle: false }, { root: 9, path: [8, 9], cycle: true }]);
  assert.deepEqual([...m.get(1).path], [3, 2, 1]);
  assert.equal(m.get(9).cycle, true);
  const a = iss(5, ["dsh:on"], { field_values: [] }), b = iss(6, ["dsh:on"]); b._lifted = true;
  assert.deepEqual([a, b].sort(DSH.byOrder).map(i => i.id), [6, 5]);
});

test("series: tasks of a series on the page show under the meeting, not again in the task section", () => {
  const meet = iss(10, ["dsh:meeting", "dsh:mtg/weekly"]);
  const t1 = iss(11, ["dsh:task", "dsh:on", "dsh:mtg/weekly"]), t2 = iss(12, ["dsh:task", "dsh:on"]), t3 = iss(13, ["dsh:task", "dsh:on", "dsh:mtg/other"]);
  const onPage = DSH.seriesOnPage([meet, t1, t2, t3]);
  assert.deepEqual([...onPage], ["dsh:mtg/weekly"]);
  assert.deepEqual(DSH.topLevel([meet, t1, t2, t3], {}, onPage).map(i => i.id), [10, 12, 13]);
  // No occurrence on the page: the task is its own card again.
  assert.deepEqual(DSH.topLevel([t1], {}, DSH.seriesOnPage([t1])).map(i => i.id), [11]);
});

test("series: the count and list cover open tasks of that series under every occurrence", () => {
  const tasks = [iss(1, ["dsh:task", "dsh:mtg/w"]), iss(2, ["dsh:task", "dsh:mtg/w"], { state: "closed" }), iss(3, ["dsh:pr", "dsh:mtg/w"]), iss(4, ["dsh:task", "dsh:mtg/x"])];
  assert.deepEqual(DSH.seriesTasks(tasks, ["dsh:mtg/w"]).map(i => i.id), [1]);
  const meets = [iss(10, ["dsh:meeting", "dsh:mtg/w"]), iss(11, ["dsh:meeting", "dsh:mtg/w"])];
  meets.forEach(m => assert.equal(DSH.seriesTasks(tasks, DSH.seriesLabels(m)).length, 1));
  assert.equal(DSH.seriesTasks([iss(1, ["dsh:task", "dsh:mtg/w", "dsh:mtg/x"])], ["dsh:mtg/w", "dsh:mtg/x"]).length, 1);
});

test("subtasks are not top-level cards", () => {
  const sub = iss(2, ["dsh:task", "dsh:on"]), top = iss(1, ["dsh:task", "dsh:on"]);
  assert.deepEqual(DSH.topLevel([top, sub], { 2: rel({ hasParent: true, parent: 1 }) }, new Set()).map(i => i.id), [1]);
});

test("new task: parent, blockedBy and type pass through only when valid", () => {
  const t = DSH.newTask({ title: "x", slug: "x", brief: "b", parent: 131, blockedBy: [5, "7", 0, "z"], type: "story" }, { stamp: "s", section: "t" });
  assert.equal(t.parent, 131);
  assert.deepEqual(t.blockedBy, [5, 7]);
  assert.equal(t.type, "Story");
  const u = DSH.newTask({ title: "x", slug: "x", brief: "b", type: "Bug" }, { stamp: "s", section: "t" });
  assert.deepEqual([u.parent, u.blockedBy, u.type], [undefined, undefined, undefined]);
});

// ---- Task rows and Cloud context in a hierarchy (#169)
test("detail: description, subtasks, Prepare, prompts, Cloud, Local — the same order for a card and a row", () => {
  const c = DSH.parseCard(BODY);
  assert.deepEqual(DSH.detailParts(c, { total: 2, gistShown: false }).order, ["description", "subtasks", "prepare", "prompts", "cloud", "local"]);
  assert.deepEqual(DSH.detailParts(DSH.parseCard("## Brief\nOnly gist."), { total: 0 }).order, ["cloud", "local"]);
  assert.deepEqual(DSH.detailParts(DSH.parseCard("## Brief\nGist.\n\nMore."), { total: 1 }).order, ["description", "subtasks", "cloud", "local"]);
});

test("detail: a card's description is the brief without its gist; a row has no gist, so it shows the whole brief", () => {
  const c = DSH.parseCard("## Brief\nGist.\n\nMore text.");
  const card = DSH.detailParts(c, { gistShown: true }), row = DSH.detailParts(c, { gistShown: false });
  assert.deepEqual([card.gist, card.description], ["Gist.", "More text."]);
  assert.equal(row.description, "Gist.\n\nMore text.");
  // A one-paragraph brief gives a card nothing more to show, a row its text.
  assert.equal(DSH.detailParts(DSH.parseCard("Just one."), { gistShown: true }).order[0], "cloud");
  assert.equal(DSH.detailParts(DSH.parseCard("Just one."), { gistShown: false }).order[0], "description");
});

test("row: before its own read it is the list item; after, the body and labels of the get", () => {
  const item = { id: 7, title: "T", labels: ["dsh:task"] };
  assert.equal(DSH.rowIssue(item, undefined), item);
  assert.equal(DSH.rowIssue(item, Object.assign(new Error("x"), { code: "c" })), item);
  const r = DSH.rowIssue(item, { id: 7, body: "## Brief\nB", labels: [{ name: "dsh:task" }, { name: "Ops" }] });
  assert.deepEqual([r.id, r.title, r.body], [7, "T", "## Brief\nB"]);
  assert.deepEqual(DSH.labelNames(r), ["dsh:task", "Ops"]);
  assert.deepEqual(DSH.rowIssue(item, { body: "b" }).labels, ["dsh:task"]);
});

test("tree: no depth cap — the 30th level opens like the first", async () => {
  const tree = DSH.lazyTree(async n => [{ id: n + 1 }]);
  let n = 1; for (let i = 0; i < 30; i++) n = (await tree.expand(n))[0].id;
  assert.equal(n, 31);
});

test("cloud context: a parent lists its open children with type, labels and Blocked, and the done count; closed ones only count", () => {
  const kids = [iss(2, ["Ops", "dsh:on"], { title: "Two", rel: rel({ type: "Story" }) }), iss(3, [], { title: "Three", state: "closed" }), iss(4, [], { title: "Four" })];
  const relOf = i => i.id === 4 ? rel({ blockedBy: [{ id: 9, state: "open" }] }) : DSH.relOf(i);
  const t = DSH.hierarchyText(1, { rel: rel({ completed: 1, total: 3 }), kids, relOf });
  assert.equal(t, "Subtasks: 1 of 3 done. Open:\n- #2 Two [Story] (Ops)\n- #4 Four Blocked");
  assert.ok(!t.includes("Three"));
});

test("cloud context: a child gets its direct parent's brief and its open siblings by number and title; nobody else", () => {
  const parent = { id: 131, title: "Epic", rel: rel({ type: "Epic" }), body: "## Brief\nThe epic." };
  const sibs = [iss(10, [], { title: "Me" }), iss(11, [], { title: "Sib", body: "SECRET BODY" }), iss(12, [], { title: "Gone", state: "closed" })];
  const t = DSH.hierarchyText(10, { rel: rel({ hasParent: true }), parent, sibs });
  assert.equal(t, "Parent #131 [Epic]: Epic\n## Brief\nThe epic.\nSiblings (open): #11 Sib");
  assert.ok(!t.includes("SECRET") && !t.includes("dsh {") && !t.includes("Gone"));
  assert.equal(DSH.hierarchyText(5, { rel: rel() }), "");
});

test("cloud context: the card view carries the hierarchy between the brief and the thread", () => {
  const p = DSH.cardView({ id: 7, title: "T", body: "b" }, [cmt(1, "hi")], SIG, Infinity, "Parent #1: P");
  assert.ok(p.indexOf("Parent #1: P") > p.indexOf("\nb") && p.indexOf("Parent #1: P") < p.indexOf("Its comment thread"));
  assert.ok(!DSH.cardView({ id: 7, title: "T", body: "b" }, [], SIG).includes("hierarchy"));
});

test("cloud context: a long hierarchy is cut to its share of the byte budget, never the whole budget", () => {
  const big = "Parent #1: P\n" + "x".repeat(5000), issue = { id: 7, title: "T", body: "b" };
  const p = DSH.cardView(issue, [cmt(1, "hi")], SIG, 1200, big);
  assert.ok(new TextEncoder().encode(p).length <= 1200 && p.includes("hi") && p.includes("…"));
});

// ---- Poll pacing (#184): the page slows to 4× while its own GitHub calls in the last hour pass half of 5000.
const MIN = 60 * 1000, NOW = Date.UTC(2026, 10, 15, 12, 0);
const calls = (n, ago = MIN) => Array.from({ length: n }, () => NOW - ago);

test("poll pacing: at or under half the hourly limit the delay is the base", () => {
  assert.equal(DSH.pollDelay(60000, calls(2500), NOW, 0), 60000);
});

test("poll pacing: over half the hourly limit the delay is 4× the base", () => {
  assert.equal(DSH.pollDelay(60000, calls(2501), NOW, 0), 240000);
});

test("poll pacing: calls 60 minutes old or older do not count", () => {
  assert.equal(DSH.pollDelay(60000, [...calls(2000), ...calls(1000, 60 * MIN)], NOW, 0), 60000);
  assert.equal(DSH.pollDelay(60000, [...calls(2000), ...calls(1000, 60 * MIN - 1)], NOW, 0), 240000);
});

test("poll pacing: after a rate-limit error the delay is 4× until its hour ends, whatever the count", () => {
  assert.equal(DSH.pollDelay(60000, [], NOW, NOW + MIN), 240000);
  assert.equal(DSH.pollDelay(60000, [], NOW, NOW), 60000);
});

test("poll pacing: a GitHub rate-limit answer is recognised, thrown or returned as an error result", () => {
  assert.ok(DSH.isRateLimit({ message: "API rate limit exceeded for user ID 1." }));
  assert.ok(DSH.isRateLimit({ code: "rate_limited" }));
  assert.ok(DSH.isRateLimit({ isError: true, content: [{ type: "text", text: "403 You have exceeded a secondary rate limit." }] }));
  assert.ok(!DSH.isRateLimit({ isError: true, content: [{ type: "text", text: "404 Not Found" }] }));
  assert.ok(DSH.isRateLimit({ message: "HTTP 429 Too Many Requests" }));
  assert.ok(!DSH.isRateLimit({ message: "Issue #1429 not found" }));
  assert.ok(!DSH.isRateLimit({ content: [{ type: "text", text: "issue about rate limits" }] }));
  assert.ok(!DSH.isRateLimit(null));
});
