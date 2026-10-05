#!/usr/bin/env node
/* eslint-disable */
/**
 * sessions.mjs
 *
 * Deterministic extraction layer for the `session-review` skill. Forked from
 * Anthropic's `analyze-sessions.mjs` (session-report plugin, Apache-2.0) —
 * kept from upstream: the entry-parsing loop, subagent-sidecar discovery, and
 * `uuid` dedup across resume/compaction. Everything else here is new: this
 * script emits one compact JSON record per Claude Code *session* (one
 * `.jsonl` file under `~/.claude/projects/<mangled-project>/` = one session),
 * not the token/cost rollups the upstream script produces. Cost accounting is
 * explicitly out of scope (see design doc) — that's what `ccusage` and the
 * session-report plugin are for.
 *
 * The model never reads a raw transcript. It reads only what this script
 * emits, so every field here earns its place by being something a signal in
 * the skill's rubric actually reads (see "Record budget" in the design doc).
 *
 * Zero external dependencies — Node built-ins only (fs, os, path, readline).
 * No shelling out to git/gh/jq or anything else; this script only reads files
 * already on disk. (If a future change ever needs a child process on
 * Windows: strip \r from its stdout before treating it as LF-delimited —
 * jq and friends emit CRLF there even when the source file is LF.)
 *
 * Verified against Claude Code 2.1.215–2.1.259 transcripts only. The JSONL
 * schema is not documented/versioned upstream, so drift is expected — see
 * `unknown_entry_types` in the output rather than trusting silence.
 *
 * Run with --help for full flag documentation (the only place flags are
 * documented — see the design doc's Component 1).
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `sessions.mjs — extract per-session records from Claude Code transcripts

Usage:
  node sessions.mjs [options]

Options:
  --last N          Only the N most recently modified sessions (default: 15).
  --all             Process every session found instead of --last N.
  --project <dir>   Repo path whose transcripts to read. Resolved to its
                     mangled ~/.claude/projects/<mangled> directory using the
                     same transform Claude Code uses to name that folder
                     (each of \\ / : . replaced with -). Case-insensitive
                     fallback lookup is used if the exact-case match isn't
                     found on disk. Defaults to the current working directory.
  --per-session     Emit one JSON record per session (an array under
                     "sessions") instead of the default corpus-level
                     aggregate. This is what the session-review skill uses —
                     the aggregate mode exists mainly for a quick sanity
                     check of a whole project without wading through records.
  --full-curve      Keep the full per-turn context-token series in each
                     session's context.series instead of the ~10-point
                     summarized curve. Debugging aid for this script, not for
                     normal skill use — the summarized curve is what the
                     record-budget design calls for.
  --help, -h        Show this help and exit.

Output is always JSON on stdout. Diagnostic/progress text goes to stderr.

Notes on what this script can and cannot know (see the design doc's "Error
handling and honest limits"):
  - A field the transcript genuinely cannot supply is emitted as null, never
    guessed and never defaulted to 0/false/[] — e.g. an async subagent
    dispatch whose sidecar can't be found/parsed gets tokens: null.
  - "/clear" cannot be distinguished from a fresh session in the transcript
    (bridgeSessionId marks resume/hand-off, not /clear). One file is always
    treated as one session.
  - Worktree cleanup (was a leftover worktree actually abandoned, or just not
    yet merged?) is not decidable from a single transcript — cwd_mismatches
    and worktree.enter/exit are raw signal for the model to reason about, not
    a verdict.
  - Paths under node_modules/ are excluded from every memory-file (CLAUDE.md/
    AGENTS.md) count — vendored copies would otherwise dominate the numbers.
  - ~/.claude/projects keeps only a rolling window of session files. The
    output's corpus_span (oldest/newest session started) shows how far back
    the currently-retained window actually reaches — a corpus-wide zero for
    an infrequent signal (e.g. EnterWorktree calls) can mean "aged out of
    retention", not "never happened". Check corpus_span before treating a low
    count as a finding.
  - A resume can carry a subagent's whole physical sidecar folder
    (subagents/agent-<id>.jsonl + .meta.json) into a new session directory
    byte-identical, with no new dispatch behind it. This script dedupes that
    globally by agentId across the whole run, among sidecar-backed
    occurrences only (the oldest session with the actual folder keeps it), so
    it will not appear twice in cross-session aggregates — but this means
    per-session subagents[] can omit a dispatch that a raw directory listing
    would show as "present" in more than one session's subagents/ folder;
    that is expected, not a parsing gap. A bare dispatch-only echo (agentId
    known only from the parent transcript, no folder ever written for it —
    seen for an async dispatch whose sidecar had not yet been flushed when
    the conversation was resumed away from it) is never gated this way, so it
    can appear alongside the sidecar-backed record with only its structural
    fields known (tokens/turns/etc. stay null) rather than being suppressed.
`

function parseArgs(argv) {
  const out = {
    last: 15,
    all: false,
    project: null,
    perSession: false,
    fullCurve: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--help':
      case '-h':
        out.help = true
        break
      case '--all':
        out.all = true
        break
      case '--per-session':
        out.perSession = true
        break
      case '--full-curve':
        out.fullCurve = true
        break
      case '--last': {
        const v = argv[++i]
        const n = parseInt(v, 10)
        if (!v || Number.isNaN(n)) {
          throw new Error(`--last requires a number, got ${JSON.stringify(v)}`)
        }
        out.last = n
        break
      }
      case '--project': {
        const v = argv[++i]
        if (!v) throw new Error('--project requires a directory argument')
        out.project = v
        break
      }
      default:
        if (a.startsWith('--')) {
          throw new Error(`Unknown flag: ${a} (see --help)`)
        }
      // ignore stray positional args
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Project directory resolution
// ---------------------------------------------------------------------------

// Claude Code names a project's transcript directory by taking the absolute
// repo path and replacing each of \ / : . with a literal '-' (one dash per
// character, no collapsing). Verified empirically: "C:\Projects\Embla\
// norsk-lett" -> "C--Projects-Embla-norsk-lett" (colon and backslash each
// become a dash; the existing hyphen in "norsk-lett" is untouched).
function mangleProjectPath(absPath) {
  return absPath.replace(/[\\/:.]/g, '-')
}

function resolveProjectDir(projectArg) {
  const target = path.resolve(projectArg || process.cwd())
  const root = path.join(os.homedir(), '.claude', 'projects')
  const mangled = mangleProjectPath(target)
  const exact = path.join(root, mangled)
  if (fs.existsSync(exact)) return exact
  // The drive-letter case Claude Code recorded when the project directory
  // was first created may not match ours (observed both "C--..." and
  // "c--..." on disk for different projects) — fall back to a
  // case-insensitive scan of the projects root.
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return exact // caller will report "not found"
  }
  const found = entries.find(
    e => e.isDirectory() && e.name.toLowerCase() === mangled.toLowerCase(),
  )
  return found ? path.join(root, found.name) : exact
}

// ---------------------------------------------------------------------------
// Small generic helpers
// ---------------------------------------------------------------------------

function* walk(dir) {
  let ents
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile()) yield p
  }
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normPath(p) {
  if (typeof p !== 'string' || !p) return null
  return p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '')
}

function isAbsoluteish(p) {
  if (typeof p !== 'string') return false
  return /^[a-zA-Z]:\\/.test(p) || p.startsWith('\\\\') || p.startsWith('/')
}

// Paths that are legitimately outside any project cwd/worktree and so must
// never count as an isolation lapse: the OS temp scratchpad convention, and
// Claude Code's own config/plugin/skill tree under ~/.claude.
const EXEMPT_PREFIXES = [normPath(os.tmpdir()), normPath(path.join(os.homedir(), '.claude'))].filter(
  Boolean,
)

function isExemptPath(targetPath) {
  const t = normPath(targetPath)
  if (!t) return false
  return EXEMPT_PREFIXES.some(p => t === p || t.startsWith(p + '\\'))
}

function isUnderCwd(targetPath, cwd) {
  const t = normPath(targetPath)
  const c = normPath(cwd)
  if (!t || !c || !isAbsoluteish(targetPath)) return true // can't judge relative paths
  if (isExemptPath(targetPath)) return true // scratchpad / ~/.claude — expected, not a lapse
  return t === c || t.startsWith(c + '\\') || t.startsWith(c.replace(/\\/g, '/') + '/')
}

function isNodeModulesPath(p) {
  if (typeof p !== 'string') return false
  return /(^|[\\/])node_modules([\\/]|$)/i.test(p)
}

// Char length of a tool_result content block. Content is either a plain
// string, or an array of blocks ({type:'text',text}, {type:'image',...},
// etc.) — we only count text; images don't inflate context the same way and
// their base64 payload would otherwise dominate every ratio.
function charLen(content) {
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) {
    let n = 0
    for (const b of content) {
      if (b && typeof b.text === 'string') n += b.text.length
    }
    return n
  }
  return 0
}

// ~240-char single-line preview, matching upstream's promptPreview — the
// record-budget measurement found this bucket ("prompts") was already only
// 10.2% of corpus size at this length, so it's kept as-is rather than
// re-tuned.
function promptPreview(text, slashCmd) {
  if (slashCmd) return `/${slashCmd}`
  if (!text) return '(non-text)'
  const t = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > 240 ? t.slice(0, 237) + '…' : t
}

function capPrompt(text, n = 300) {
  if (typeof text !== 'string') return null
  const t = text.trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

// ~10 anchor points: evenly spaced indices, plus the peak index so the worst
// moment of a session is never smoothed away.
function downsampleSeries(series, targetN = 10) {
  if (series.length <= targetN) return series.slice()
  let peakIdx = 0
  for (let i = 1; i < series.length; i++) {
    if (series[i].tokens > series[peakIdx].tokens) peakIdx = i
  }
  const idxs = new Set([0, series.length - 1, peakIdx])
  for (let i = 0; i < targetN; i++) {
    idxs.add(Math.round((i * (series.length - 1)) / (targetN - 1)))
  }
  return [...idxs].sort((a, b) => a - b).map(i => series[i])
}

function bumpMap(map, key, by = 1) {
  map[key] = (map[key] || 0) + by
}

// ---------------------------------------------------------------------------
// MCP server/tool-name normalisation
// ---------------------------------------------------------------------------

// mcp__<server>__<tool>. Server slugs use single underscores so splitting on
// the literal '__' delimiter is safe (verified against real tool names like
// mcp__claude_ai_Microsoft_365__outlook_email_search). Ephemeral/UUID server
// slugs (seen for some first-party connectors, e.g.
// mcp__0226a80e-fb2f-4dcd-9609-ba4d4d3b1911__apply_sensitive_message_label)
// are meaningless to group by across sessions, so key on the tool-name
// suffix instead in that case.
function mcpKey(toolName) {
  if (!toolName.startsWith('mcp__')) return null
  const parts = toolName.split('__')
  if (parts.length < 3) return null
  const server = parts[1]
  const suffix = parts.slice(2).join('__')
  return UUID_RE.test(server) ? suffix : server
}

// Same UUID-server problem as mcpKey(), but for the general per-tool
// histogram, which needs tool-level granularity kept (unlike the dedicated
// mcp field, which intentionally collapses to server-level for named
// servers) — only the meaningless UUID segment is replaced.
function normalizeToolName(toolName) {
  if (!toolName.startsWith('mcp__')) return toolName
  const parts = toolName.split('__')
  if (parts.length < 3) return toolName
  const server = parts[1]
  if (!UUID_RE.test(server)) return toolName
  return `mcp__<uuid>__${parts.slice(2).join('__')}`
}

// ---------------------------------------------------------------------------
// Verification / git detection
// ---------------------------------------------------------------------------

const VERIFY_RE = new RegExp(
  [
    String.raw`\bnpm\s+(?:run\s+)?(?:test|build|lint|typecheck)\b`,
    String.raw`\bpnpm\s+(?:run\s+)?(?:test|build|lint|typecheck)\b`,
    String.raw`\byarn\s+(?:run\s+)?(?:test|build|lint|typecheck)\b`,
    String.raw`\bnpx\s+(?:jest|vitest|tsc|eslint)\b`,
    String.raw`\bpytest\b`,
    String.raw`\bjest\b`,
    String.raw`\bvitest\b`,
    String.raw`\bgo\s+(?:test|vet|build)\b`,
    String.raw`\bcargo\s+(?:test|build|clippy)\b`,
    String.raw`\bmvn\s+(?:test|verify|package)\b`,
    String.raw`\bdotnet\s+(?:test|build)\b`,
    String.raw`\bmake\s+(?:test|build|lint|check)\b`,
    String.raw`\brspec\b`,
    String.raw`\bphpunit\b`,
    String.raw`\beslint\b`,
    String.raw`\bruff\b`,
    String.raw`\bflake8\b`,
    String.raw`\bmypy\b`,
    String.raw`\btsc\b`,
  ].join('|'),
  'i',
)

const GIT_COMMIT_RE = /\bgit\s+(?:-\S+\s+\S+\s+)*commit\b/i
const GIT_PUSH_RE = /\bgit\s+(?:-\S+\s+\S+\s+)*push\b/i
const GH_PR_CREATE_RE = /\bgh\s+pr\s+create\b/i
const GH_PR_MERGE_RE = /\bgh\s+pr\s+merge\b/i
// Embla's own dev workflow (embla-core:pr-review, embla-core:deploy) runs on
// Bitbucket, not gh — Bitbucket has no dedicated create/merge tool name to
// pattern-match on, so both go through the generic mcp__bitbucket__bb_post
// REST wrapper (never bb_put, which is full-replace and used only for things
// like resolving comment threads) and are told apart by the API path shape:
// a path ending exactly in "/pullrequests" is a create, "/pullrequests/{id}/merge"
// is a merge. Anchored so "/pullrequests/{id}/comments" etc. never match either.
const BB_PR_CREATE_RE = /\/pullrequests\/?$/
const BB_PR_MERGE_RE = /\/pullrequests\/[^/]+\/merge\/?$/

// ---------------------------------------------------------------------------
// Session file discovery
// ---------------------------------------------------------------------------

function listMainSessionFiles(projectDir) {
  let ents
  try {
    ents = fs.readdirSync(projectDir, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const e of ents) {
    if (!e.isFile() || !e.name.endsWith('.jsonl')) continue
    const p = path.join(projectDir, e.name)
    let mtimeMs = 0
    try {
      mtimeMs = fs.statSync(p).mtimeMs
    } catch {
      /* skip stat failure, keep 0 so it sorts oldest */
    }
    out.push({ sessionId: path.basename(e.name, '.jsonl'), file: p, mtimeMs })
  }
  return out
}

function findSubagentSidecars(sessionDir) {
  // agent-*.jsonl anywhere under <sessionId>/subagents/, including nested
  // subagents/workflows/<wf-id>/agent-*.jsonl paths.
  const map = new Map() // agentId -> {jsonlPath, metaPath}
  const subDir = path.join(sessionDir, 'subagents')
  if (!fs.existsSync(subDir)) return map
  for (const p of walk(subDir)) {
    const base = path.basename(p)
    const m = /^agent-(.+)\.jsonl$/.exec(base)
    if (!m) continue
    const agentId = m[1]
    const metaPath = p.replace(/\.jsonl$/, '.meta.json')
    map.set(agentId, {
      jsonlPath: p,
      metaPath: fs.existsSync(metaPath) ? metaPath : null,
      birthtimeMs: safeBirthtime(p),
    })
  }
  return map
}

function safeBirthtime(p) {
  try {
    return fs.statSync(p).birthtimeMs
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Known top-level entry types (schema-drift tracking)
// ---------------------------------------------------------------------------

const KNOWN_TOP_LEVEL_TYPES = new Set([
  'assistant',
  'user',
  'attachment',
  'system',
  'mode',
  'queue-operation',
  'bridge-session',
  'atis-latch',
  'ai-title',
  'custom-title',
  'agent-name',
  'permission-mode',
  'file-history-snapshot',
  'file-history-delta',
  'cost-state',
  'last-prompt',
  'worktree-state',
  'summary',
])

// ---------------------------------------------------------------------------
// Skill-listing parsing ("offered" skills)
// ---------------------------------------------------------------------------

// skill_listing content is a bullet list: "- name: description text...".
// Multi-line descriptions don't matter here — we only need the leading name.
function extractOfferedSkillNames(content) {
  if (typeof content !== 'string') return []
  const names = []
  const re = /^- ([A-Za-z0-9_.:/-]+):/gm
  let m
  while ((m = re.exec(content))) names.push(m[1])
  return names
}

// ===========================================================================
// Main-transcript parsing
// ===========================================================================

async function parseMainTranscript(filePath, seenUuids, seenPromptFingerprints, ctx) {
  const rec = {
    session_id: ctx.sessionId,
    file: filePath,
    cwd: null,
    git_branch: null,
    version: null,
    started: null,
    ended: null,
    duration_ms: null,
    title: null,
    cost_usd: null,
    prompts: [],
    context: { peak: null, series: [], compactions: [] },
    tools: {},
    tool_results: { count: 0, total_chars: 0, max_chars: 0 },
    mcp: {},
    subagents: [],
    skills: { invoked: new Set(), offered: new Set() },
    memory: { edits: [], nested_loaded: new Set() },
    worktree: { enter: [], exit: [], cwd_mismatches: 0 },
    verification: [],
    git: { commits: 0, pushes: 0, pr_created: 0, pr_merged: 0 },
  }

  let customTitle = null
  let aiTitle = null
  let agentName = null
  let costUsd = null

  const fileApiCalls = new Map() // dedup key -> {usage, ts}
  const contextRaw = [] // {ts, tokens} one per deduped api call, in order
  let firstTs = null
  let lastTs = null

  const toolUseIdToBashCmd = new Map()
  const toolUseIdToBitbucketPostPath = new Map() // toolUseId -> args.path for mcp__bitbucket__bb_post calls
  const toolUseIdToPath = new Map() // toolUseId -> {targetPath, cwd} for cwd-mismatch checks
  const toolUseIdToAgentDispatch = new Map() // toolUseId -> {description, prompt, subagentType, model}
  const agentDispatches = new Map() // agentId -> {...dispatch info, inline?}

  // For compaction trigger heuristic: remember whether a /compact command was
  // seen recently (reset on any other human prompt).
  let recentCompactCommand = false

  // Kept only long enough to resolve pre/post context size against
  // contextRaw by timestamp — no transcript prose is retained afterward.
  const compactionEvents = [] // {ts, trigger}

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }

    const t = e.type
    if (t && !KNOWN_TOP_LEVEL_TYPES.has(t)) {
      bumpMap(ctx.unknownEntryTypes, t)
    }

    // First-seen wins for these descriptive scalars, dedup-agnostic — even a
    // replayed line still truthfully describes the file's own recorded
    // metadata at that point.
    if (rec.cwd === null && typeof e.cwd === 'string') rec.cwd = e.cwd
    if (rec.git_branch === null && typeof e.gitBranch === 'string') rec.git_branch = e.gitBranch
    if (rec.version === null && typeof e.version === 'string') rec.version = e.version

    if (t === 'custom-title' && typeof e.customTitle === 'string') customTitle = e.customTitle
    if (t === 'ai-title' && typeof e.aiTitle === 'string') aiTitle = e.aiTitle
    if (t === 'agent-name' && typeof e.agentName === 'string') agentName = e.agentName
    if (t === 'cost-state' && typeof e.totalCostUSD === 'number') costUsd = e.totalCostUSD

    // global uuid dedup (resumed sessions replay history; forks inherit it)
    if (e.uuid) {
      if (seenUuids.has(e.uuid)) continue
      seenUuids.add(e.uuid)
    }

    const cwdNow = typeof e.cwd === 'string' ? e.cwd : rec.cwd

    if (e.timestamp) {
      const ts = Date.parse(e.timestamp)
      if (!isNaN(ts)) {
        if (firstTs === null) firstTs = ts
        lastTs = ts
      }
    }

    if (t === 'attachment' && e.attachment) {
      const at = e.attachment.type
      if (at === 'nested_memory' && typeof e.attachment.path === 'string') {
        const p = e.attachment.path
        if (!isNodeModulesPath(p)) {
          const dir = path.dirname(p)
          const isRoot = rec.cwd && normPath(dir) === normPath(rec.cwd)
          if (!isRoot) rec.memory.nested_loaded.add(e.attachment.displayPath || p)
        }
      } else if (at === 'invoked_skills' && Array.isArray(e.attachment.skills)) {
        for (const s of e.attachment.skills) {
          if (s && typeof s.name === 'string') rec.skills.invoked.add(s.name)
        }
      } else if (at === 'skill_listing' && typeof e.attachment.content === 'string') {
        for (const name of extractOfferedSkillNames(e.attachment.content)) {
          rec.skills.offered.add(name)
        }
      }
      continue
    }

    if (t === 'user') {
      handleUserEntry(e, cwdNow, rec, seenPromptFingerprints, {
        recordCompactCommand: v => {
          recentCompactCommand = v
        },
      })

      // Compaction event bookkeeping
      if (e.isCompactSummary && e.timestamp) {
        const ts = Date.parse(e.timestamp)
        compactionEvents.push({ ts, trigger: recentCompactCommand ? 'manual' : 'auto' })
      }

      // Link Agent/Task tool_result -> agentId for the subagent registry.
      const tur = e.toolUseResult
      if (tur && tur.agentId) {
        const c0 = Array.isArray(e.message?.content) ? e.message.content[0] : null
        const tuid = c0 && c0.tool_use_id
        const dispatch = tuid ? toolUseIdToAgentDispatch.get(tuid) : null
        agentDispatches.set(tur.agentId, {
          description: tur.description || (dispatch && dispatch.description) || null,
          prompt: tur.prompt || (dispatch && dispatch.prompt) || null,
          agentType: tur.agentType || (dispatch && dispatch.subagentType) || null,
          inline: tur.isAsync ? null : tur, // sync dispatches carry usage/toolStats inline
        })
      }

      // Bash tool_result: verification + git detection, tool_results tally.
      if (Array.isArray(e.message?.content)) {
        for (const c of e.message.content) {
          if (c && c.type === 'tool_result') {
            const len = charLen(c.content)
            rec.tool_results.count++
            rec.tool_results.total_chars += len
            if (len > rec.tool_results.max_chars) rec.tool_results.max_chars = len

            const isError = c.is_error === true
            const cmd = toolUseIdToBashCmd.get(c.tool_use_id)
            if (cmd !== undefined) {
              if (VERIFY_RE.test(cmd)) {
                rec.verification.push({
                  cmd: cmd.length > 200 ? cmd.slice(0, 199) + '…' : cmd,
                  passed: !isError,
                  ts: e.timestamp || null,
                })
              }
              // Per-field OR of structured gitOperation and regex-on-cmd,
              // never else-if between them: a real gitOperation object only
              // ever carries ONE of {commit}/{pr}, never {push} at all (verified
              // against this project's own corpus — 0 gitOperation objects with a
              // push key anywhere), so gating the regex fallback on "gitOp truthy"
              // silently drops every push (and would drop a merge bundled with a
              // commit-shaped gitOperation) whenever the same tool_result also
              // happens to carry an unrelated commit/pr gitOperation.
              const gitOp = tur && tur.gitOperation
              if ((gitOp && gitOp.commit) || (!isError && GIT_COMMIT_RE.test(cmd))) rec.git.commits++
              if ((gitOp && gitOp.push) || (!isError && GIT_PUSH_RE.test(cmd))) rec.git.pushes++
              if ((gitOp && gitOp.pr && gitOp.pr.action === 'created') || (!isError && GH_PR_CREATE_RE.test(cmd))) rec.git.pr_created++
              if ((gitOp && gitOp.pr && gitOp.pr.action === 'merged') || (!isError && GH_PR_MERGE_RE.test(cmd))) rec.git.pr_merged++
            }

            // Bitbucket PR create/merge: no structured gitOperation signal for
            // MCP calls, so this is pure path-regex on the bb_post args, gated
            // on success exactly like the gh regex fallback above.
            const bbPath = toolUseIdToBitbucketPostPath.get(c.tool_use_id)
            if (bbPath !== undefined && !isError) {
              if (BB_PR_CREATE_RE.test(bbPath)) rec.git.pr_created++
              if (BB_PR_MERGE_RE.test(bbPath)) rec.git.pr_merged++
            }

            // Path/cwd mismatch for any tool call we can resolve a path for.
            const pathInfo = toolUseIdToPath.get(c.tool_use_id)
            if (pathInfo && !isUnderCwd(pathInfo.targetPath, pathInfo.cwd)) {
              rec.worktree.cwd_mismatches++
            }
          }
        }
      }
      continue
    }

    if (t === 'assistant') {
      const msg = e.message || {}
      if (e.attributionSkill) rec.skills.invoked.add(e.attributionSkill)

      if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (!c || c.type !== 'tool_use') continue
          bumpMap(rec.tools, normalizeToolName(c.name))

          if (c.name === 'Skill' && c.input && c.input.skill) {
            rec.skills.invoked.add(String(c.input.skill))
          }
          if (c.name === 'Agent' || c.name === 'Task') {
            toolUseIdToAgentDispatch.set(c.id, {
              description: c.input?.description || null,
              prompt: c.input?.prompt || null,
              subagentType: c.input?.subagent_type || null,
            })
          }
          if (c.name === 'Bash' && c.input && typeof c.input.command === 'string') {
            toolUseIdToBashCmd.set(c.id, c.input.command)
          }
          if (c.name === 'mcp__bitbucket__bb_post' && c.input && typeof c.input.path === 'string') {
            toolUseIdToBitbucketPostPath.set(c.id, c.input.path)
          }
          if (c.name === 'EnterWorktree') {
            rec.worktree.enter.push(c.input?.name || c.input?.path || '(unspecified)')
          }
          if (c.name === 'ExitWorktree') {
            rec.worktree.exit.push(c.input?.action || '(unspecified)')
          }
          if (c.name === 'Edit' || c.name === 'Write') {
            const fp = c.input && c.input.file_path
            if (typeof fp === 'string') {
              recordMemoryEditIfApplicable(fp, rec, cwdNow)
            }
          }
          const mk = mcpKey(c.name)
          if (mk) bumpMap(rec.mcp, mk)

          // `.path` is only a filesystem path for native tools (Glob/Grep).
          // For MCP tools it means whatever that server defines — an API path
          // for mcp__bitbucket__bb_* ("/repositories/.../pullrequests"), for
          // instance — and comparing that against cwd produces a guaranteed,
          // meaningless mismatch. Confirmed by synthetic test: without this
          // guard every bb_post call scored as a cwd mismatch.
          const isMcpTool = c.name.startsWith('mcp__')
          const targetPath = c.input?.file_path || c.input?.notebook_path || (!isMcpTool ? c.input?.path : undefined)
          if (typeof targetPath === 'string') {
            toolUseIdToPath.set(c.id, { targetPath, cwd: cwdNow })
          }
        }
      }

      const usage = msg.usage
      if (!usage) continue
      const key =
        e.requestId ||
        (msg.id && msg.id.startsWith('msg_0') && msg.id.length > 10 ? msg.id : null) ||
        `${filePath}:${e.uuid || ''}`
      const prev = fileApiCalls.get(key)
      if (!prev || (usage.output_tokens || 0) >= (prev.usage.output_tokens || 0)) {
        fileApiCalls.set(key, { usage, ts: e.timestamp })
      }
      continue
    }
  }

  // Commit deduped API calls into the context series (chronological order is
  // already the Map's insertion order for a single-pass stream, but we sort
  // by ts defensively in case a later duplicate had an earlier timestamp).
  const calls = [...fileApiCalls.values()].sort((a, b) => {
    const ta = Date.parse(a.ts || 0)
    const tb = Date.parse(b.ts || 0)
    return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb)
  })
  for (const { usage, ts } of calls) {
    const total =
      (usage.input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0) +
      (usage.cache_read_input_tokens || 0)
    contextRaw.push({ ts: ts || null, tokens: total })
  }

  if (contextRaw.length > 0) {
    rec.context.peak = Math.max(...contextRaw.map(p => p.tokens))
    rec.context.series = ctx.fullCurve ? contextRaw : downsampleSeries(contextRaw)
  }

  for (const evt of compactionEvents) {
    let pre = null
    let post = null
    for (const p of contextRaw) {
      const pts = p.ts ? Date.parse(p.ts) : NaN
      if (!isNaN(pts) && pts <= evt.ts) pre = p.tokens
    }
    for (const p of contextRaw) {
      const pts = p.ts ? Date.parse(p.ts) : NaN
      if (!isNaN(pts) && pts > evt.ts) {
        post = p.tokens
        break
      }
    }
    rec.context.compactions.push({ trigger: evt.trigger, pre, post })
  }

  rec.started = firstTs !== null ? new Date(firstTs).toISOString() : null
  rec.ended = lastTs !== null ? new Date(lastTs).toISOString() : null
  rec.duration_ms = firstTs !== null && lastTs !== null ? lastTs - firstTs : null
  rec.title = customTitle || aiTitle || agentName || null
  rec.cost_usd = costUsd

  // Subagents: sidecar-first, dispatch-record fallback.
  const sidecars = findSubagentSidecars(ctx.sessionDir)
  const allAgentIds = new Set([...sidecars.keys(), ...agentDispatches.keys()])
  const orderedIds = [...allAgentIds].sort((a, b) => {
    const ba = sidecars.get(a)?.birthtimeMs ?? Infinity
    const bb = sidecars.get(b)?.birthtimeMs ?? Infinity
    return ba - bb
  })

  for (const agentId of orderedIds) {
    const sidecar = sidecars.get(agentId)
    const dispatch = agentDispatches.get(agentId) || null

    // Global cross-session dedup — sidecar-backed occurrences only. A resume
    // can carry a subagent's whole physical sidecar folder (agent-<id>.jsonl
    // + .meta.json, byte-identical) into a NEW session directory with no new
    // dispatch behind it; meta.json is read straight off disk, not gated by
    // uuid, so without this the same agentId shows up as a full structural
    // entry (is_fork, agent_type, description, spawn_depth all populated) in
    // more than one session's subagents[], double-counting it in any
    // cross-session aggregate (e.g. fork_dispatches).
    //
    // Gating is deliberately scoped to sidecar-backed occurrences: a bare
    // dispatch-only echo (agentId known only from the parent transcript's
    // tool_result, no folder on disk — observed for an async dispatch whose
    // sidecar had not yet been flushed to this session's directory when the
    // conversation was resumed away from it) carries none of that structural
    // data to double-count, and is already protected from replay duplication
    // by the ordinary uuid dedup above (a replayed dispatch tool_result
    // shares its uuid with the original and is skipped before it ever
    // reaches agentDispatches). Gating on those too would let an
    // uninformative echo in an earlier, sidecar-less session claim the
    // agentId and suppress the one later session that actually has the real
    // sidecar data — exactly backwards, and verified to happen in practice.
    if (sidecar) {
      if (ctx.seenAgentIds.has(agentId)) continue
      ctx.seenAgentIds.add(agentId)
    }

    // buildSubagentRecord folds invoked_skills/skill_listing/nested_memory/
    // memory-edit signal from the sidecar straight into `rec`'s unions as it
    // parses — in the SAME pass that builds the subagent's own aggregate, so
    // it shares one uuid-dedup pass rather than needing a second read gated
    // by the same seenUuids set (which would find nothing, since the first
    // pass already claims every uuid in the file).
    const sub = await buildSubagentRecord(agentId, sidecar, dispatch, seenUuids, ctx, rec)
    if (sub) rec.subagents.push(sub)
  }

  return finalizeRecord(rec)
}

function recordMemoryEditIfApplicable(filePath, rec, cwd) {
  if (isNodeModulesPath(filePath)) return
  const base = path.basename(filePath)
  if (!/^(CLAUDE|AGENTS)\.md$/i.test(base)) return
  const dir = path.dirname(filePath)
  const scope = cwd && normPath(dir) === normPath(cwd) ? 'root' : 'nested'
  rec.memory.edits.push({ path: filePath, scope })
}

function handleUserEntry(e, cwdNow, rec, seenPromptFingerprints, hooks) {
  if (e.isMeta || e.isCompactSummary) return
  const content = e.message && e.message.content
  let isToolResult = false
  let text = null
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    const first = content[0]
    if (first && first.type === 'tool_result') isToolResult = true
    else if (first && first.type === 'text') text = first.text || ''
  }
  if (isToolResult) return

  let slashCmd = null
  if (text) {
    if (
      text.startsWith('<task-notification') ||
      text.startsWith('<scheduled-wakeup') ||
      text.startsWith('<background-task')
    ) {
      return
    }
    const m = /<command-(?:name|message)>\/?([^<]+)<\/command-/.exec(text)
    if (m) {
      slashCmd = m[1].trim()
      hooks.recordCompactCommand(/^compact\b/i.test(slashCmd))
    } else {
      hooks.recordCompactCommand(false)
    }
    if (text.startsWith('[Request interrupted')) return
  }

  if (!e.isSidechain) {
    const preview = promptPreview(text, slashCmd)
    const ts = e.timestamp || null
    const fingerprint = `${preview}\u0001${ts}`
    if (seenPromptFingerprints.has(fingerprint)) return
    seenPromptFingerprints.add(fingerprint)
    rec.prompts.push({ ts, text: preview })
  }
}

// A skill_listing snapshot is effectively "every skill installed at the
// time", not something chosen for this session's task — measured across this
// corpus: 35-93 names per session (growing over time as more plugins were
// installed), median 55, on 150 of 170 sessions. Recording that whole catalog
// in full on every record repeats the same near-constant list ~170 times
// over for no marginal signal — exactly the "kept only because it was easy to
// extract" case the design doc's Record Budget section warns against, just
// in a field that section didn't name. Cap it the same way context.series
// and subagent prompts are capped: keep enough to spot an obviously relevant
// skill that was ignored, drop the rest with a count rather than guessing
// which entries matter.
const OFFERED_SKILLS_CAP = 20

function finalizeRecord(rec) {
  const invoked = [...rec.skills.invoked]
  const invokedSet = new Set(invoked)
  // "offered" means *merely* offered — a name that was also actually invoked
  // (by the main thread or a subagent) belongs only in `invoked`, not
  // duplicated here as if it had been ignored.
  let offered = [...rec.skills.offered].filter(name => !invokedSet.has(name))
  if (offered.length > OFFERED_SKILLS_CAP) {
    const overflow = offered.length - OFFERED_SKILLS_CAP
    offered = [...offered.slice(0, OFFERED_SKILLS_CAP), `…(+${overflow} more)`]
  }
  return {
    ...rec,
    skills: { invoked, offered },
    memory: {
      edits: rec.memory.edits,
      nested_loaded: [...rec.memory.nested_loaded],
    },
  }
}

// ===========================================================================
// Subagent sidecar parsing
// ===========================================================================

const BLOCKED_PHRASES =
  /\b(permission denied|blocked by|i (?:cannot|can't|was unable to|could not) (?:complete|proceed|finish)|unable to complete|access denied)\b/i

async function buildSubagentRecord(agentId, sidecar, dispatch, seenUuids, ctx, sessionRec) {
  const base = {
    agent_type: null,
    is_fork: null,
    spawn_depth: null,
    parent_agent_id: null,
    description: dispatch?.description ?? null,
    prompt: capPrompt(dispatch?.prompt ?? null),
    turns: null,
    tokens: null,
    peak_context: null,
    // Unlike turns/tokens/peak_context, {} and [] are *valid, known* answers
    // for tools/skills (a subagent that genuinely made zero tool calls, or a
    // sidecar that parsed fine and found no Skill invocations) — so they
    // can't default here the way null-only fields do. Start both at null
    // (unknown) and only move to {}/[] in the branch below that actually
    // found a data source (sidecar or inline toolStats) to answer from. A
    // bare dispatch-only echo with neither ends up with tools/skills still
    // null, same as turns/tokens/peak_context/result_chars/blocked below —
    // never guessed as "zero".
    tools: null,
    skills: null,
    result_chars: null,
    blocked: null,
  }

  let meta = null
  if (sidecar && sidecar.metaPath) meta = readJsonSafe(sidecar.metaPath)

  if (meta) {
    base.agent_type = meta.agentType ?? base.agent_type ?? null
    // Not a guess: verified against all 517 real .meta.json sidecars on disk
    // in this corpus — isFork is written ONLY when true (43/43 samples with
    // the key are isFork:true; 0 have it explicitly false), so an absent key
    // reliably decodes to "not a fork", the same as a boolean flag that's
    // omitted rather than serialized false.
    base.is_fork = typeof meta.isFork === 'boolean' ? meta.isFork : false
    base.spawn_depth = typeof meta.spawnDepth === 'number' ? meta.spawnDepth : null
    base.parent_agent_id = meta.parentAgentId ?? null
    base.description = meta.description ?? base.description
  } else if (dispatch) {
    base.agent_type = dispatch.agentType ?? null
    // A dispatch found directly in the main transcript (this function is
    // only ever called from there) is by construction depth 1 — nested
    // dispatches only surface via their own sidecar's meta.json, which is
    // the branch above. We cannot know is_fork without meta.json, so it
    // stays null (unknown) rather than guessed.
    base.spawn_depth = 1
  }

  if (sidecar && sidecar.jsonlPath) {
    const parsed = await parseSubagentJsonl(sidecar.jsonlPath, seenUuids, ctx, sessionRec)
    if (parsed) {
      base.turns = parsed.turns
      base.tokens = parsed.tokens
      base.peak_context = parsed.peakContext
      base.tools = parsed.tools
      base.skills = parsed.skills
      base.result_chars = parsed.resultChars
      base.blocked = parsed.blocked
      if (parsed.firstPrompt && !dispatch?.prompt) {
        base.prompt = capPrompt(parsed.firstPrompt)
      }
      if (!meta) {
        // No meta.json but the sidecar itself parsed fine — is_fork is still
        // genuinely unknown (meta.json is the only source for it), leave null.
      }
      return base
    }
  }

  // No usable sidecar. Fall back to whatever the parent transcript's
  // toolUseResult told us directly. Async dispatches only ever report
  // {isAsync, status, agentId, description, resolvedModel, prompt} — no
  // usage data — so everything numeric stays null per the honest-limits
  // rule. Sync dispatches (no sidecar found, which is rare but possible)
  // carry usage/toolStats/content inline; use that coarser data instead of
  // guessing.
  const inline = dispatch?.inline
  if (inline) {
    const usage = inline.usage
    if (usage) {
      base.tokens = typeof inline.totalTokens === 'number' ? inline.totalTokens : null
      const iterations = Array.isArray(usage.iterations) ? usage.iterations : null
      if (iterations && iterations.length) {
        base.turns = iterations.length
        base.peak_context = Math.max(
          ...iterations.map(
            it =>
              (it.input_tokens || 0) +
              (it.cache_creation_input_tokens || 0) +
              (it.cache_read_input_tokens || 0),
          ),
        )
      }
    }
    if (inline.toolStats) {
      const ts = inline.toolStats
      // Coarse buckets only — the inline summary doesn't carry exact tool
      // names, unlike a parsed sidecar. Labelled lower-case to make clear
      // this is not the same granularity as a real tool-name histogram. Only
      // materialize the object now that we actually have something to put in
      // it — this IS a real (if coarse) answer, unlike the "no data at all"
      // case that leaves base.tools at its null default above.
      base.tools = {}
      if (ts.readCount) base.tools.read = ts.readCount
      if (ts.bashCount) base.tools.bash = ts.bashCount
      if (ts.editFileCount) base.tools.edit = ts.editFileCount
      if (ts.searchCount) base.tools.search = ts.searchCount
      if (ts.otherToolCount) base.tools.other = ts.otherToolCount
    }
    // NB: inline dispatch data (sync Agent/Task tool_result) never carries
    // which skills the subagent invoked — that's sidecar-exclusive (see the
    // design doc's "Subagent sidecars" section) — so base.skills has no
    // inline source and correctly stays at its null (unknown) default here.
    if (Array.isArray(inline.content)) {
      const textBlock = inline.content.find(c => c && c.type === 'text')
      if (textBlock && typeof textBlock.text === 'string') {
        base.result_chars = textBlock.text.length
        base.blocked = BLOCKED_PHRASES.test(textBlock.text.slice(0, 400))
      }
    }
  }

  return base
}

// Parses one subagent sidecar into its own aggregate fields AND, in the same
// single pass (sharing the one uuid-dedup check below), folds
// invoked_skills / skill_listing / literal Skill calls / nested_memory /
// CLAUDE.md-AGENTS.md edits into the session-level unions on `sessionRec`.
// This has to happen in the same pass as the per-subagent aggregation: a
// second pass gated by the same global `seenUuids` set would find nothing,
// since every uuid in this file is already claimed below. Deliberately does
// NOT fold attributionSkill (inherited from the parent, not evidence the
// subagent invoked anything — see design doc's sidecar section).
async function parseSubagentJsonl(jsonlPath, seenUuids, ctx, sessionRec) {
  let rl
  try {
    rl = readline.createInterface({
      input: fs.createReadStream(jsonlPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    })
  } catch {
    return null
  }

  const fileApiCalls = new Map()
  const tools = {}
  const skills = new Set()
  let firstPrompt = null
  let lastTextBlock = null
  let sawAnyLine = false

  for await (const line of rl) {
    if (!line) continue
    sawAnyLine = true
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }

    const t = e.type
    if (t && !KNOWN_TOP_LEVEL_TYPES.has(t)) bumpMap(ctx.unknownEntryTypes, t)

    if (e.uuid) {
      if (seenUuids.has(e.uuid)) continue
      seenUuids.add(e.uuid)
    }

    if (t === 'user' && firstPrompt === null) {
      const content = e.message && e.message.content
      if (typeof content === 'string') firstPrompt = content
    }

    if (t === 'attachment' && e.attachment) {
      const at = e.attachment.type
      if (at === 'invoked_skills' && Array.isArray(e.attachment.skills)) {
        for (const s of e.attachment.skills) {
          if (s && typeof s.name === 'string') {
            skills.add(s.name)
            sessionRec.skills.invoked.add(s.name)
          }
        }
      } else if (at === 'nested_memory' && typeof e.attachment.path === 'string') {
        const p = e.attachment.path
        if (!isNodeModulesPath(p)) {
          const dir = path.dirname(p)
          const isRoot = sessionRec.cwd && normPath(dir) === normPath(sessionRec.cwd)
          if (!isRoot) sessionRec.memory.nested_loaded.add(e.attachment.displayPath || p)
        }
      } else if (at === 'skill_listing' && typeof e.attachment.content === 'string') {
        for (const name of extractOfferedSkillNames(e.attachment.content)) {
          sessionRec.skills.offered.add(name)
        }
      }
      continue
    }

    if (t === 'assistant') {
      const msg = e.message || {}
      if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c && c.type === 'tool_use') {
            bumpMap(tools, c.name)
            if (c.name === 'Skill' && c.input && c.input.skill) {
              skills.add(String(c.input.skill))
              sessionRec.skills.invoked.add(String(c.input.skill))
            }
            if (
              (c.name === 'Edit' || c.name === 'Write') &&
              c.input &&
              typeof c.input.file_path === 'string'
            ) {
              recordMemoryEditIfApplicable(c.input.file_path, sessionRec, sessionRec.cwd)
            }
          }
          if (c && c.type === 'text' && typeof c.text === 'string') {
            lastTextBlock = c.text
          }
        }
      }
      const usage = msg.usage
      if (!usage) continue
      const key =
        e.requestId ||
        (msg.id && msg.id.startsWith('msg_0') && msg.id.length > 10 ? msg.id : null) ||
        `${jsonlPath}:${e.uuid || ''}`
      const prev = fileApiCalls.get(key)
      if (!prev || (usage.output_tokens || 0) >= (prev.usage.output_tokens || 0)) {
        fileApiCalls.set(key, { usage })
      }
    }
  }

  if (!sawAnyLine) return null

  let tokens = 0
  let peakContext = 0
  let hadCalls = false
  for (const { usage } of fileApiCalls.values()) {
    hadCalls = true
    const inTot =
      (usage.input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0) +
      (usage.cache_read_input_tokens || 0)
    tokens += inTot + (usage.output_tokens || 0)
    if (inTot > peakContext) peakContext = inTot
  }

  return {
    turns: fileApiCalls.size,
    tokens: hadCalls ? tokens : null,
    peakContext: hadCalls ? peakContext : null,
    tools,
    skills: [...skills],
    resultChars: lastTextBlock !== null ? lastTextBlock.length : null,
    // No final text block is ambiguous — it could mean the subagent was
    // genuinely blocked, or that its sidecar wasn't fully flushed before a
    // resume (a real scenario in this corpus). Null (unknown), not a guess.
    blocked: lastTextBlock !== null ? BLOCKED_PHRASES.test(lastTextBlock.slice(0, 400)) : null,
    firstPrompt,
  }
}

// ---------------------------------------------------------------------------
// Corpus-level aggregate (default output; --per-session emits records instead)
// ---------------------------------------------------------------------------

function buildAggregate(records) {
  const agg = {
    sessions: records.length,
    context_peak_median: median(records.map(r => r.context.peak).filter(v => v != null)),
    sessions_with_memory_edit: records.filter(r => r.memory.edits.length > 0).length,
    sessions_with_nested_memory_loaded: records.filter(r => r.memory.nested_loaded.length > 0)
      .length,
    subagents_per_session_median: median(records.map(r => r.subagents.length)),
    fork_dispatches: records.reduce(
      (n, r) => n + r.subagents.filter(s => s.is_fork === true).length,
      0,
    ),
    worktree_enter_total: records.reduce((n, r) => n + r.worktree.enter.length, 0),
    verification_pass: records.reduce(
      (n, r) => n + r.verification.filter(v => v.passed).length,
      0,
    ),
    verification_fail: records.reduce(
      (n, r) => n + r.verification.filter(v => !v.passed).length,
      0,
    ),
    git: records.reduce(
      (acc, r) => {
        acc.commits += r.git.commits
        acc.pushes += r.git.pushes
        acc.pr_created += r.git.pr_created
        acc.pr_merged += r.git.pr_merged
        return acc
      },
      { commits: 0, pushes: 0, pr_created: 0, pr_merged: 0 },
    ),
    tool_totals: {},
    mcp_totals: {},
    skills_invoked_union: [...new Set(records.flatMap(r => r.skills.invoked))],
  }
  for (const r of records) {
    for (const [k, v] of Object.entries(r.tools)) bumpMap(agg.tool_totals, k, v)
    for (const [k, v] of Object.entries(r.mcp)) bumpMap(agg.mcp_totals, k, v)
  }
  return agg
}

function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${HELP}`)
    process.exit(1)
  }
  if (opts.help) {
    process.stdout.write(HELP)
    return
  }

  const projectDir = resolveProjectDir(opts.project)
  if (!fs.existsSync(projectDir)) {
    process.stderr.write(
      `No transcripts directory found at ${projectDir}\n` +
        `(resolved from ${opts.project || process.cwd()}). Nothing to analyze.\n`,
    )
    process.stdout.write(
      JSON.stringify(
        { root: projectDir, generated_at: new Date().toISOString(), error: 'project_dir_not_found', sessions: [] },
        null,
        2,
      ) + '\n',
    )
    return
  }

  let files = listMainSessionFiles(projectDir)
  files.sort((a, b) => a.mtimeMs - b.mtimeMs) // ascending: oldest first
  if (!opts.all) {
    files = files.slice(Math.max(0, files.length - opts.last))
  }

  const unknownEntryTypes = {}
  const seenUuids = new Set()
  // Cross-session dedup for subagent sidecars: a resume can carry a whole
  // agent-<id>.jsonl/.meta.json folder into a later session directory
  // byte-identical, with no new dispatch behind it. uuid dedup doesn't catch
  // this (meta.json is read straight off disk). Shared across every session
  // processed in this run so the first (oldest, since files are processed
  // oldest-first below) session to see a given agentId claims it structurally
  // and later carried-over copies contribute nothing further.
  const seenAgentIds = new Set()
  const seenPromptFingerprints = new Set()
  const versionsSeen = new Set()
  const records = []

  let n = 0
  for (const f of files) {
    const sessionDir = path.join(projectDir, f.sessionId)
    const ctx = {
      sessionId: f.sessionId,
      sessionDir,
      unknownEntryTypes,
      seenAgentIds,
      fullCurve: opts.fullCurve,
    }
    const rec = await parseMainTranscript(f.file, seenUuids, seenPromptFingerprints, ctx)
    if (rec.version) versionsSeen.add(rec.version)
    records.push(rec)
    n++
    if (n % 25 === 0) {
      process.stderr.write(`\r  processed ${n}/${files.length} sessions…`)
    }
  }
  if (files.length) process.stderr.write(`\r  processed ${n}/${files.length} sessions.\n`)

  for (const v of versionsSeen) {
    if (!isKnownGoodVersion(v)) {
      process.stderr.write(
        `Warning: session recorded Claude Code version ${v}, outside the verified ` +
          `range (2.1.215-2.1.259). Extraction may be affected by schema drift.\n`,
      )
    }
  }

  // Most-recent-first for the human/model reading the output top-down.
  records.reverse()

  // ~/.claude/projects keeps only a rolling window of session files (observed
  // ~30 days on this machine — oldest file present during validation was 31
  // days old). A corpus-wide zero for an infrequent signal (EnterWorktree
  // calls, a memory-edit rate that reads lower than a prior run even though
  // more sessions now exist) can mean "aged out of retention", not "never
  // happened" — this script has no way to tell those apart from the files on
  // disk, so it surfaces the window instead of guessing. Report honestly:
  // corpus_span is the retained window, not the project's full history.
  const startedTimes = records.map(r => r.started).filter(Boolean).sort()
  const corpusSpan = {
    oldest_session_started: startedTimes.length ? startedTimes[0] : null,
    newest_session_started: startedTimes.length ? startedTimes[startedTimes.length - 1] : null,
  }
  if (corpusSpan.oldest_session_started) {
    process.stderr.write(
      `Note: ~/.claude/projects retains only a rolling window of session files. ` +
        `The oldest session in this run started ${corpusSpan.oldest_session_started}. ` +
        `Corpus-wide totals (fork counts, worktree calls, memory-edit rate, etc.) ` +
        `reflect only what is currently on disk, not the project's full history — a ` +
        `low or zero count for an infrequent signal may mean "aged out of retention", ` +
        `not "never happened".\n`,
    )
  }

  const envelope = {
    root: projectDir,
    generated_at: new Date().toISOString(),
    sessions_scanned: records.length,
    corpus_span: corpusSpan,
    unknown_entry_types: unknownEntryTypes,
  }

  if (opts.perSession) {
    envelope.sessions = records
  } else {
    envelope.aggregate = buildAggregate(records)
  }

  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n')
}

function isKnownGoodVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v)
  if (!m) return false
  const [maj, min, patch] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (maj !== 2 || min !== 1) return false
  return patch >= 215 && patch <= 259
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
