/**
 * dsh-supa — a SupA (super agent) layer for DeepSeek Harness.
 *
 * Concept: https://github.com/deepseek-ai/dsh-superagent-prototype
 *
 * Three properties, applied to every session in the profile:
 *   1. Never blocked  — no human gate on progress (approvals are decided,
 *      blocking questions are refused with a directive, a blocked turn wakes
 *      itself again).
 *   2. Owns all context — a workspace context ledger every session can read
 *      and extend, plus a live digest of the ledger and open todos in the
 *      system prompt.
 *   3. Decides child context — `supa_spawn` hands a child only the brief and
 *      the context the parent selects; the child can pull more with
 *      `supa_context_request`, and the parent answers with
 *      `supa_context_supply`.
 *
 * The plugin is deliberately dependency-free (node: builtins only) and
 * registers everything through public Cordis services: `tools`,
 * `systemPrompt`, `subagents`, `agents`, `approval`.
 */

import { spawn } from 'node:child_process'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export const name = 'supa'
export const inject = ['tools', 'systemPrompt']

const DEFAULTS = {
  enabled: true,
  /** 'all' | 'root' | 'preset' */
  mode: 'all',
  presets: [],
  /** Directory (relative to the session cwd) holding the shared ledger. */
  ledgerDir: '.dsh-supa',
  /**
   * Approval behaviour is inherited by default: the plugin answers nothing and
   * the harness policy decides. Only an explicit `true` makes SupA grant every
   * request itself, and that is a deliberate opt-in, never a shipped default.
   */
  autoApprove: false,
  /** Highest authority a root SupA holds without asking the human: 'workspace' | 'full'. */
  authority: 'workspace',
  /** Refuse `ask_user_question` with a "decide and record" directive. */
  denyBlockingQuestions: false,
  /** Wake a session whose turn ended `blocked`, up to maxBlockedNudges. */
  continueWhenBlocked: true,
  maxBlockedNudges: 3,
  nudgeWindowMs: 10 * 60 * 1000,
  /** Also wake a session when its todo list still has open items. */
  continueOnOpenTodos: false,
  maxTodoNudges: 6,
  /** Provider used for `supa_spawn` (registered by subagent-spawn-in-process). */
  spawnProvider: 'spawn',
  /** Optional agent preset for spawned children; empty inherits the parent. */
  childPreset: '',
  /** When a routed child stops on error/max-tokens/refusal, retry one tier weaker. */
  retryOnFailure: true,
  maxRouteRetries: 2,
  /** Same-tier attempts before a failing route is marked and its slot freed. */
  tierAttempts: 2,
  tierRetryDelayMs: 1200,
  /** How long a tier stays out of rotation after a failed attempt. */
  failureCooldownMs: 30 * 60 * 1000,
  /** External CLI tiers: executable override, run limit, result cap. */
  codexCommand: '',
  codexEphemeral: true,
  claudeCommand: '',
  geminiCommand: '',
  kimiCommand: '',
  qwenCommand: '',
  cursorCommand: '',
  opencodeCommand: '',
  aiderCommand: '',
  copilotCommand: '',
  gooseCommand: '',
  cliTimeoutMs: 900000,
  maxCliResultChars: 8000,
  maxPackBytes: 24000,
  maxFileBytes: 8000,
  maxFiles: 6,
  maxTranscriptMessages: 30,
  maxTranscriptChars: 700,
  promptDigestNotes: 8,
  /** Parent inbound queue: child reports coalesced into one wake within this window. */
  coalesceMs: 1200,
  /** Parent inbound queue: how many lanes the prompt line names. */
  inboxPromptLanes: 4,
}

const CHARTER = [
  '# SupA session charter',
  'You are a SupA (super agent) session. This charter overrides ordinary caution in three specific ways.',
  '',
  '1. Do not block on a human by default. Approval prompts are decided in-process. If a decision is genuinely yours to request — it is irreversible, materially risky, or the context truly does not settle it — ask with `ask_user_question`: give concrete options, mark your recommendation, and say what you will do if nobody answers. Asking is a last resort, not a first move: when an option is reversible, take it, record the assumption with `supa_context` (`kind: "assumption"`), and keep going.',
  '2. Own all context. The workspace ledger (`.dsh-supa/context.jsonl`) is shared by every session in this workspace: write decisions, findings and handoffs there, and search it before assuming you know the state. Anything you learn that another session would need belongs in the ledger, not only in this conversation.',
  '3. Decide what your children know. `supa_spawn` gives a child only the brief and the context you select; it sees nothing else of this conversation. Choose the smallest context that makes the child succeed, then let it pull more with `supa_context_request`. Do not paste the whole conversation by default.',
  '',
  'Route work by difficulty. Rate a task 1-10 (1 = a 4B model can do it, 10 = contradictory or missing information needing judgment) and pass `difficulty` to `supa_spawn`: the ladder picks the weakest tier that still covers the score, and degrades to the strongest available tier when nothing covers it. `supa_models list` shows the ladder and the routes the runtime actually advertises.',
  'Work style: act, do not ask. If a tool fails, change approach rather than waiting. End a turn only when the work is done, when you are waiting on a child that will wake you, or when the remaining choice is irreversible.',
].join('\n')

const CHILD_CHARTER = [
  '## Your charter as a SupA child',
  '- The context above is what your parent chose to give you. Nothing else from the parent conversation is visible to you.',
  '- If you need more, call `supa_context_request` with the exact question and why. Your parent may answer in a later message; do not sit idle waiting for it — keep working on what you can.',
  '- Do not ask a human. Decide, record assumptions with `supa_context`, and finish.',
  '- You have no peers. Do not try to reach a sibling session; your only channel upward is `supa_report`, which enqueues into your parent\'s inbound queue without interrupting it. Use it for progress and for the final result; do not expect an immediate answer.',
  '- End with a compact result: what you did, what you found, and what your parent should do next.',
].join('\n')

const TASK_CHARTER = [
  '## How to work',
  '- Do not ask a human; decide and record assumptions with `supa_context`.',
  '- Do not wait on a subagent you started: continue useful work, and its completion wakes you.',
  '- Report back only what your parent needs; keep the result short and concrete.',
].join('\n')

function mergeConfig(config) {
  const merged = { ...DEFAULTS }
  if (config && typeof config === 'object') {
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined && value !== null && key in merged) merged[key] = value
    }
  }
  return merged
}

function shortId(id) {
  return String(id ?? '').slice(0, 8)
}

function nowIso() {
  return new Date().toISOString()
}

function newRecordId() {
  return `n-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`
}

function isAbsolutePath(path) {
  return isAbsolute(path)
}

function leadingLine(text, max) {
  const first = String(text).split('\n')[0].trim()
  return first.length > max ? `${first.slice(0, max)}…` : first
}

function blocksToText(content, limit) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (block.type === 'image') parts.push('[image]')
    else if (block.type === 'file') parts.push(`[file ${block.attachment?.name ?? ''}]`)
  }
  const text = parts.join('\n').trim()
  return text.length > limit ? `${text.slice(0, limit)}… (+${text.length - limit} chars)` : text
}

function sessionCwd(ctx, session) {
  const workingDirectory = ctx.get ? ctx.get('workingDirectory') : undefined
  try {
    const dir = workingDirectory?.get?.(session)
    if (typeof dir === 'string' && dir) return dir
  } catch {
    // fall through to the header
  }
  const fromHeader = session?.header?.cwd
  if (typeof fromHeader === 'string' && fromHeader) return fromHeader
  return process.cwd()
}

function resolveInsideCwd(cwd, path) {
  return isAbsolutePath(path) ? resolve(path) : resolve(join(cwd, path))
}

function ledgerDirOf(cwd, cfg) {
  return resolveInsideCwd(cwd, cfg.ledgerDir || DEFAULTS.ledgerDir)
}

function ledgerFileOf(cwd, cfg) {
  return join(ledgerDirOf(cwd, cfg), 'context.jsonl')
}

function inboxFileOf(cwd, cfg, parentId) {
  const safe = String(parentId ?? 'unknown').replace(/[^A-Za-z0-9._-]/g, '_')
  return join(ledgerDirOf(cwd, cfg), 'inbox', `${safe}.jsonl`)
}

function drainedFileOf(file) {
  return file.replace(/\.jsonl$/, '.drained.jsonl')
}

function readJsonlSync(file) {
  let raw = ''
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const records = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const record = JSON.parse(trimmed)
      if (record && typeof record === 'object') records.push(record)
    } catch {
      // ignore a torn line
    }
  }
  return records
}

function drainedIdsOf(file) {
  return new Set(readJsonlSync(drainedFileOf(file)).map((record) => record.id))
}

function pendingReportsOf(file) {
  const drained = drainedIdsOf(file)
  return readJsonlSync(file).filter((record) => record.id && !drained.has(record.id))
}

function lanesOf(records) {
  return [...new Set(records.map((record) => record.lane ?? shortId(record.from)))].filter(Boolean)
}

// ------------------------------------------------------------------ model ladder

/**
 * Profile-level state: the model ladder, its failure marks and the Codex
 * catalog describe this machine, not one workspace, so they live beside the
 * profile and every workspace reads the same ladder. Only the ledger and the
 * child queues stay workspace-scoped.
 */
function stateDirOf() {
  const profile = process.env.DSH_PROFILE_DIR
  if (profile) return join(profile, 'supa')
  return join(homedir(), '.dsh', 'supa')
}

function modelsFileOf() {
  return join(stateDirOf(), 'models.json')
}

function failuresFileOf() {
  return join(stateDirOf(), 'failures.json')
}

/** Tier failures are runtime state, kept out of the user-owned ladder file. */
function readFailures(cwd, cfg) {
  try {
    const parsed = JSON.parse(readFileSync(failuresFileOf(cwd, cfg), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function failureActive(entry, cfg) {
  return Boolean(entry && Number(entry.at) && Date.now() - Number(entry.at) < cfg.failureCooldownMs)
}

/**
 * Failure marks are shared state: every writer queues behind the previous one,
 * so two children failing at the same moment cannot overwrite each other's mark.
 */
let failureWriteChain = Promise.resolve()

async function writeFailures(cwd, cfg, all) {
  const text = `${JSON.stringify(all, null, 2)}\n`
  failureWriteChain = failureWriteChain.then(
    () => writeTextAtomic(failuresFileOf(cwd, cfg), text),
    () => writeTextAtomic(failuresFileOf(cwd, cfg), text),
  )
  return failureWriteChain
}

async function recordFailure(cwd, cfg, keys, error, tier = null) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
  if (list.length === 0) return
  // Read inside the queue, not before it: otherwise two failures read the same
  // snapshot and the later write drops the earlier mark.
  const run = async () => {
    const all = readFailures(cwd, cfg)
    const at = Date.now()
    for (const key of list) {
      all[key] = { at, error: String(error ?? '').slice(0, 300), ...(tier ? { tier } : {}) }
    }
    await writeTextAtomic(failuresFileOf(cwd, cfg), `${JSON.stringify(all, null, 2)}\n`)
  }
  failureWriteChain = failureWriteChain.then(run, run)
  return failureWriteChain
}

/**
 * A failed tier stays in the ladder, red and disabled, and the user deletes it
 * if they want to. The one exception is a ladder where nothing is usable any
 * more: then the weakest slot is swapped for the built-in fallback, so the pool
 * can still route.
 */
async function dropTier(cwd, cfg, tierId) {
  if (!tierId) return
  const ladder = await readLadder(modelsFileOf())
  const tier = ladder.tiers.find((entry) => entry.id === tierId)
  if (!tier || tier.enabled === false) return
  tier.enabled = false
  await writeLadder(modelsFileOf(), ladder)
}

const FALLBACK_TIER = {
  label: 'DeepSeek Flash (high)',
  kind: 'llm',
  provider: 'deepseek-official',
  model: 'deepseek-flash',
  reasoningEffort: 'high',
}

async function ensureUsableRoute(cwd, cfg) {
  const ladder = await readLadder(modelsFileOf())
  if (ladder.tiers.length === 0) return null
  const failures = readFailures(cwd, cfg)
  // Only failed tiers trigger the fallback. A tier the user switched off by
  // hand is their decision, not a broken route.
  const allFailed = ladder.tiers.every((tier) => failureActive(failures[`route:${tierRoute(tier)}`], cfg))
  if (!allFailed) return null

  const bottom = ladder.tiers.reduce((weak, tier) => (tier.slot > weak.slot ? tier : weak), ladder.tiers[0])
  // The fallback is the last line: if it failed, the circuit opens instead of
  // replacing it with itself forever.
  if (bottom.id === 'fallback' || String(bottom.id).startsWith('fallback-')) return null
  const tiers = ladder.tiers.filter((tier) => tier.id !== bottom.id)
  const ids = new Set(tiers.map((tier) => tier.id))
  let id = 'fallback'
  let suffix = 1
  while (ids.has(id)) id = `fallback-${suffix++}`
  const fresh = normalizeTier({ ...FALLBACK_TIER, slot: bottom.slot, enabled: true }, 0)
  fresh.id = id
  tiers.push(fresh)
  tiers.sort((a, b) => a.slot - b.slot)
  await writeLadder(modelsFileOf(), { version: 1, tiers })
  return `every tier was down: T${bottom.slot} ${bottom.label} was replaced by the built-in ${FALLBACK_TIER.label}`
}

/** Probe one CLI tier with a single real call, reusing its driver. */
async function probeCliTier(cfg, tier, cwd) {
  const driver = CLI_DRIVERS[driverOf(tier)]
  if (!driver) return { ok: false, error: `unknown CLI driver "${driverOf(tier)}"` }
  const command = resolveOnPath(tier.command || driver.bin(cfg) || driverOf(tier))
  if (!command) return { ok: false, error: `${driverOf(tier)} CLI not found` }
  const workdir = cwd || process.cwd()
  const outFile = join(tmpdir(), `supa-probe-${randomUUID().slice(0, 8)}.txt`)
  const args = driver.args({
    cfg,
    model: tier.model,
    effort: tier.reasoningEffort,
    cwd: workdir,
    outFile,
    prompt: 'Reply with the single word: ok',
    authority: 'workspace',
  })
  const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
  try {
    const run = await runCodexCli(command, shell ? args.map(quoteForShell) : args, {
      input: driver.prompt === 'stdin' ? 'Reply with the single word: ok' : '',
      cwd: workdir,
      timeoutMs: Math.min(cfg.cliTimeoutMs, 120000),
      shell,
    })
    const text = `${run.stdout}`.trim()
    if (run.code === 0 && text) return { ok: true, answer: text.slice(0, 60) }
    const detail = [run.stderr, run.stdout]
      .map((stream) => String(stream ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .slice(-200)
    return { ok: false, error: `exit ${run.code}${detail ? `: ${detail}` : ''}` }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  } finally {
    try {
      unlinkSync(outFile)
    } catch {
      // already gone
    }
  }
}

/** A removed tier takes its failure marks with it, so it can be added back. */
async function forgetFailure(cwd, cfg, tier) {
  if (!tier) return
  const all = readFailures(cwd, cfg)
  const keys = [tier.id, `route:${tierRoute(tier)}`]
  if (!keys.some((key) => key in all)) return
  for (const key of keys) delete all[key]
  await mkdir(stateDirOf(), { recursive: true })
  await writeFailures(cwd, cfg, all)
}

/**
 * Locate the Codex CLI. An external tier runs `codex exec` as a child process
 * instead of a Harness agent session, so its context is the pack on stdin and
 * its result is the CLI's last message.
 */
function findCodex(cfg) {
  if (cfg.codexCommand) return cfg.codexCommand
  const home = homedir()
  const candidates = []
  // Codex keeps one build per directory under its own install root; the newest
  // build wins. This is the location the Codex CLI documents for automation.
  const binRoot = join(home, 'AppData', 'Local', 'OpenAI', 'Codex', 'bin')
  try {
    const builds = readdirSync(binRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(binRoot, entry.name, 'codex.exe'))
      .filter((candidate) => existsSync(candidate))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    candidates.push(...builds)
  } catch {
    // no Codex install root on this machine
  }
  candidates.push(
    join(home, '.codex', 'plugins', '.plugin-appserver', 'codex.exe'),
    join(home, '.cargo', 'bin', 'codex.exe'),
    join(home, '.local', 'bin', 'codex'),
  )
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return 'codex'
}

/**
 * Fresh installs start from one model at its four thinking levels: the same
 * model ranked by effort is the honest default, and it needs no configuration
 * to be useful. Anything else the user drags in replaces it.
 */
const DEFAULT_TIERS = [
  { label: 'DeepSeek Flash 4.1 (max)', provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max', slot: 1 },
  { label: 'DeepSeek Flash 4.1 (high)', provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high', slot: 2 },
  { label: 'DeepSeek Flash 4.1 (low)', provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low', slot: 3 },
  { label: 'DeepSeek Flash 4.1 (off)', provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'off', slot: 4 },
]

function sessionsFileOf() {
  return join(stateDirOf(), 'sessions.json')
}

function readEnabledSessions() {
  try {
    const raw = JSON.parse(readFileSync(sessionsFileOf(), 'utf8'))
    return Array.isArray(raw?.enabled) ? raw.enabled.map(String) : []
  } catch {
    return []
  }
}

async function writeEnabledSessions(list) {
  await mkdir(stateDirOf(), { recursive: true })
  await writeFile(sessionsFileOf(), `${JSON.stringify({ version: 1, enabled: list }, null, 2)}\n`, 'utf8')
}

function defaultLadder() {
  return { version: 1, tiers: DEFAULT_TIERS.map((tier, index) => normalizeTier(tier, index)) }
}

function normalizeTier(raw, index) {
  const tier = raw && typeof raw === 'object' ? raw : {}
  const provider = typeof tier.provider === 'string' ? tier.provider : ''
  const model = typeof tier.model === 'string' ? tier.model : ''
  const requestedSlot = Math.round(Number(tier.slot))
  const slot = Number.isFinite(requestedSlot) && requestedSlot >= 1 && requestedSlot <= 10
    ? requestedSlot
    : Math.min(10, Math.max(1, index + 1))
  return {
    id: typeof tier.id === 'string' && tier.id ? tier.id : `t${index + 1}`,
    label: typeof tier.label === 'string' && tier.label ? tier.label : `${provider || '?'}/${model || '?'}`,
    kind: tier.kind === 'codex' || tier.kind === 'cli' ? 'cli' : 'llm',
    driver: typeof tier.driver === 'string' && tier.driver
      ? tier.driver
      : (tier.kind === 'codex' ? 'codex' : ''),
    command: typeof tier.command === 'string' ? tier.command : '',
    provider,
    model,
    reasoningEffort: typeof tier.reasoningEffort === 'string' ? tier.reasoningEffort : '',
    // The slot is the tier: T1 is the strongest and covers a 10-point task.
    slot,
    ceiling: ceilingOf(slot),
    enabled: tier.enabled !== false,
  }
}

async function readLadder(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    // Only a missing file means "nothing configured yet". Any other read error
    // must not be turned into a fresh ladder.
    if (error?.code !== 'ENOENT') throw error
    const seeded = defaultLadder()
    try {
      await writeLadder(file, seeded)
    } catch {
      // a read-only state directory still gets the in-memory default
    }
    return seeded
  }

  try {
    const parsed = JSON.parse(raw)
    const rawTiers = Array.isArray(parsed?.tiers) ? parsed.tiers : []
    const seen = new Set()
    const tiers = rawTiers.map((entry, index) => {
      const tier = normalizeTier(entry, index)
      if (seen.has(tier.slot)) {
        // Two entries claiming one slot: move the later one to the first free.
        let free = 1
        while (seen.has(free) && free < 10) free += 1
        tier.slot = free
        tier.ceiling = ceilingOf(free)
      }
      seen.add(tier.slot)
      return tier
    }).sort((a, b) => a.slot - b.slot)
    return { version: 1, tiers }
  } catch {
    // A file we cannot parse is data, not an empty ladder: keep a copy before
    // seeding so nothing is lost and the user can repair it by hand.
    const quarantine = `${file}.corrupt-${Date.now()}`
    await writeFile(quarantine, raw, 'utf8').catch(() => {})
    const seeded = defaultLadder()
    await writeLadder(file, seeded).catch(() => {})
    return seeded
  }
}

/** One rule for "how strong is this slot", used everywhere. */
function ceilingOf(slot) {
  return Math.min(10, Math.max(1, 11 - slot))
}

async function writeLadder(file, ladder) {
  await writeTextAtomic(file, `${JSON.stringify(ladder, null, 2)}\n`)
}

/** Write through a temporary file so a crash cannot leave half a JSON file. */
async function writeTextAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

function tierRoute(tier) {
  if (tier.kind === 'cli' || tier.kind === 'codex') {
    const driver = tier.driver || 'codex'
    return `${driver}${tier.model ? ` ${tier.model}` : ''}${tier.reasoningEffort ? `@${tier.reasoningEffort}` : ''}`
  }
  return `${tier.provider}/${tier.model}${tier.reasoningEffort ? `@${tier.reasoningEffort}` : ''}`
}

/**
 * Position is the tier: T1 is the strongest and covers a 10-point task, T10
 * the weakest and covers a 1-point task. The ceiling is therefore derived from
 * the slot, never typed by the user.
 */
function renumber(tiers) {
  for (const tier of tiers) {
    tier.ceiling = ceilingOf(tier.slot)
  }
  return tiers
}

function renderTier(tier, index) {
  return `T${tier.slot}. ${tier.id} ${tier.label} — ${tierRoute(tier)} · covers up to ${tier.ceiling}${tier.enabled ? '' : ' · disabled'}`
}

/**
 * Read the Codex model catalog (`codex debug models`, which opens no session).
 * Every entry is returned, including the ones the CLI hides from its own list,
 * because a hidden model can still be pinnable and a SupA tier may name it.
 */
async function scanCodexModels(cfg, cwd) {
  const codex = findCodex(cfg)
  if (!existsSync(codex)) throw new Error(`codex CLI not found at ${codex}; set codexCommand or install Codex`)
  const result = await runCodexCli(codex, ['debug', 'models'], { timeoutMs: 60000 })
  if (result.code !== 0) throw new Error(`codex debug models exited ${result.code}: ${result.stderr.trim().slice(-300)}`)

  const parsed = JSON.parse(result.stdout)
  const models = (parsed.models ?? []).map((entry) => ({
    slug: entry.slug,
    name: entry.display_name ?? entry.slug,
    visibility: entry.visibility ?? '',
    defaultEffort: entry.default_reasoning_level ?? '',
    efforts: (entry.supported_reasoning_levels ?? []).map((level) => level.effort).filter(Boolean),
    contextWindow: entry.context_window ?? 0,
  }))

  const cacheFile = join(stateDirOf(), 'codex-models.json')
  let probes = {}
  try {
    probes = JSON.parse(readFileSync(cacheFile, 'utf8')).probes ?? {}
  } catch {
    // first scan
  }

  await mkdir(stateDirOf(), { recursive: true })
  await writeFile(cacheFile, `${JSON.stringify({ at: Date.now(), models, probes }, null, 2)}\n`, 'utf8')
  return { models, probes, cacheFile }
}

/**
 * Pin configurations, not models: one real call per (model, effort) pair, so a
 * tier that names `gpt-6-astra@ultra` is validated on that exact pair. Results
 * are cached under `model@effort`, and a cached success is reused unless the
 * caller forces a retest. Every call consumes that model's tokens/usage.
 */
async function pinCodexTargets(cfg, cwd, targets, options = {}) {
  const codex = findCodex(cfg)
  if (!existsSync(codex)) throw new Error(`codex CLI not found at ${codex}; set codexCommand or install Codex`)

  const cacheFile = join(stateDirOf(), 'codex-models.json')
  let cache = { at: 0, models: [], probes: {} }
  try {
    cache = JSON.parse(readFileSync(cacheFile, 'utf8'))
  } catch {
    throw new Error('no catalog cached; run `scan` first')
  }
  const models = Array.isArray(cache.models) ? cache.models : []
  const probes = cache.probes && typeof cache.probes === 'object' ? cache.probes : {}
  const verdicts = []

  for (const target of targets) {
    const model = models.find((entry) => entry.slug === target.model)
    if (!model) {
      verdicts.push({ model: target.model, effort: target.effort ?? '', ok: false, error: 'not in the cached catalog' })
      continue
    }
    const effort = target.effort || model.defaultEffort || 'low'
    const key = `${model.slug}@${effort}`
    if (!options.force && probes[key]?.ok) {
      verdicts.push({ model: model.slug, effort, ok: true, answer: probes[key].answer, cached: true })
      continue
    }
    try {
      const run = await runCodexCli(codex, [
        'exec', '--ephemeral', '--skip-git-repo-check', '-C', tmpdir(), '--color', 'never',
        '-m', model.slug, '-c', `model_reasoning_effort=${effort}`,
        '-s', 'read-only', '-',
      ], { input: 'Reply with the single word: ok', timeoutMs: Math.min(cfg.cliTimeoutMs, 120000) })
      const answer = run.stdout.trim().replace(/\s+/g, ' ').slice(0, 60)
      if (run.code === 0 && answer) {
        probes[key] = { ok: true, at: Date.now(), answer }
        verdicts.push({ model: model.slug, effort, ok: true, answer })
      } else {
        const detail = [run.stderr, run.stdout]
          .map((stream) => String(stream ?? '').trim())
          .filter(Boolean)
          .join(' ')
          .slice(-200)
        const error = `exit ${run.code}${detail ? `: ${detail}` : ''}`
        probes[key] = { ok: false, at: Date.now(), error }
        verdicts.push({ model: model.slug, effort, ok: false, error })
      }
    } catch (error) {
      const text = String(error?.message ?? error)
      probes[key] = { ok: false, at: Date.now(), error: text }
      verdicts.push({ model: model.slug, effort, ok: false, error: text })
    }
  }

  await writeFile(cacheFile, `${JSON.stringify({ at: cache.at ?? Date.now(), models, probes }, null, 2)}\n`, 'utf8')
  return { verdicts, probes }
}

/**
 * Resolve an executable the way a shell would: an explicit path is checked
 * directly, a bare name is looked up on PATH with the platform's extensions.
 */
/**
 * Quote one argument for a CLI started through a shell. Windows .cmd/.bat
 * wrappers need this: an unquoted `&` in a prompt ends the command and starts
 * another one.
 */
function quoteForShell(arg) {
  const value = String(arg)
  if (process.platform !== 'win32') return `'${value.replace(/'/g, `'\\''`)}'`
  if (value === '') return '""'
  if (!/[\s"&|<>^()]/.test(value)) return value
  // shortcut: cmd still expands %NAME% inside quotes; a prompt that names an
  // environment variable in percent signs is rare enough to leave alone.
  return `"${value.replace(/"/g, '\\"')}"`
}

function resolveOnPath(name) {  if (!name) return null
  if (name.includes('/') || name.includes('\\') || /^[A-Za-z]:/.test(name)) return existsSync(name) ? name : null
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  const separator = process.platform === 'win32' ? ';' : ':'
  for (const directory of String(process.env.PATH ?? '').split(separator)) {
    if (!directory) continue
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

/**
 * CLI drivers: every one of these has a non-interactive "run this prompt and
 * print the answer" mode, which is what a SupA child from an external tier
 * needs. `prompt: 'stdin'` avoids the Windows command-line length limit; the
 * others take the prompt as an argument.
 */
const CLI_DRIVERS = {
  codex: {
    label: 'OpenAI Codex CLI',
    bin: (cfg) => findCodex(cfg),
    prompt: 'stdin',
    args: ({ cfg, model, effort, cwd, outFile }) => {
      const args = ['exec']
      if (cfg.codexEphemeral) args.push('--ephemeral')
      args.push('--skip-git-repo-check', '-C', cwd, '--color', 'never', '-o', outFile)
      if (model) args.push('-m', model)
      if (effort) args.push('-c', `model_reasoning_effort=${effort}`)
      args.push('-s', 'workspace-write', '-')
      return args
    },
  },
  kimi: {
    label: 'Kimi Code CLI',
    bin: (cfg) => cfg.kimiCommand || 'kimi',
    prompt: 'arg',
    args: ({ model, prompt }) => [...(model ? ['-m', model] : []), '-p', prompt],
  },
  claude: {
    label: 'Claude Code',
    bin: (cfg) => cfg.claudeCommand || 'claude',
    prompt: 'stdin',
    args: ({ model, effort, authority }) => [
      '-p', '--output-format', 'text',
      ...(model ? ['--model', model] : []),
      // Claude Code names its levels low|medium|high|xhigh|max; a tier's own
      // effort passes through only when it is one of those.
      ...(['low', 'medium', 'high', 'xhigh', 'max'].includes(String(effort ?? ''))
        ? ['--effort', effort]
        : []),
      // A SupA never waits for a human: either skip the checks (full) or make
      // sure a permission prompt resolves to "no" instead of hanging stdout.
      ...(authority === 'full'
        ? ['--dangerously-skip-permissions']
        : ['--permission-prompts', 'none']),
    ],
  },
  gemini: {
    label: 'Gemini CLI',
    bin: (cfg) => cfg.geminiCommand || 'gemini',
    prompt: 'arg',
    args: ({ model, prompt, authority }) => [
      ...(model ? ['-m', model] : []),
      ...(authority === 'full' ? ['--yolo'] : []),
      '-p', prompt,
    ],
  },
  qwen: {
    label: 'Qwen Code',
    bin: (cfg) => cfg.qwenCommand || 'qwen',
    prompt: 'arg',
    args: ({ model, prompt, authority }) => [
      ...(model ? ['-m', model] : []),
      ...(authority === 'full' ? ['--yolo'] : []),
      '-p', prompt,
    ],
  },
  cursor: {
    label: 'Cursor Agent CLI',
    bin: (cfg) => cfg.cursorCommand || 'cursor-agent',
    prompt: 'arg',
    args: ({ model, prompt, authority }) => [
      '-p', prompt, '--output-format', 'text',
      ...(model ? ['--model', model] : []),
      ...(authority === 'full' ? ['--force'] : []),
    ],
  },
  opencode: {
    label: 'OpenCode',
    bin: (cfg) => cfg.opencodeCommand || 'opencode',
    prompt: 'arg',
    args: ({ model, prompt }) => ['run', prompt, ...(model ? ['-m', model] : [])],
  },
  aider: {
    label: 'Aider',
    bin: (cfg) => cfg.aiderCommand || 'aider',
    prompt: 'arg',
    args: ({ prompt }) => ['--message', prompt, '--yes', '--no-stream'],
  },
  copilot: {
    label: 'GitHub Copilot CLI',
    bin: (cfg) => cfg.copilotCommand || 'copilot',
    prompt: 'arg',
    args: ({ prompt }) => ['-p', prompt],
  },
  goose: {
    label: 'Goose',
    bin: (cfg) => cfg.gooseCommand || 'goose',
    prompt: 'arg',
    args: ({ prompt }) => ['run', '-t', prompt],
  },
}

function driverOf(tier) {
  if (tier.driver) return tier.driver
  if (tier.kind === 'codex') return 'codex'
  return 'codex'
}

function isCliTier(tier) {
  return Boolean(tier && (tier.kind === 'codex' || tier.kind === 'cli'))
}

function cliDriverFor(tier) {
  return CLI_DRIVERS[driverOf(tier)]
}

function cliCommandFor(tier, cfg) {
  const driver = cliDriverFor(tier)
  if (!driver) return null
  return tier.command || driver.bin(cfg) || driverOf(tier)
}

/** Run one CLI to completion, capture both streams, and honour a deadline. */
function runCodexCli(exe, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd: options.cwd, windowsHide: true, shell: options.shell === true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // already gone
      }
      finish(reject, new Error(`timed out after ${options.timeoutMs ?? 60000}ms`))
    }, options.timeoutMs ?? 60000)
    function finish(fn, value) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => finish(reject, error))
    child.on('close', (code) => finish(resolve, { code, stdout, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(options.input ?? '')
  })
}

async function readLedger(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return []
  }
  const records = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const record = JSON.parse(trimmed)
      if (record && typeof record === 'object') records.push(record)
    } catch {
      // ignore a torn line
    }
  }
  return records
}

async function appendLedger(file, record) {
  await mkdir(join(file, '..'), { recursive: true })
  await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8')
}

function renderRecord(record) {
  const tags = Array.isArray(record.tags) && record.tags.length ? ` [${record.tags.join(', ')}]` : ''
  return `[${record.id}] ${record.at} ${record.kind}${tags} ${shortId(record.session)}\n${record.text}`
}

const digestCache = new Map()

function ledgerDigest(file, limit) {
  let stat
  try {
    stat = statSync(file)
  } catch {
    return ''
  }
  const cached = digestCache.get(file)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.text

  let raw = ''
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return ''
  }
  const records = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const record = JSON.parse(trimmed)
      if (record && typeof record === 'object') records.push(record)
    } catch {
      // ignore
    }
  }
  const recent = records.slice(-Math.max(1, limit))
  const text = recent.length === 0
    ? ''
    : [
      `SupA ledger: ${records.length} entries at ${file}. Recent:`,
      ...recent.map((record) => `- [${record.id}] ${record.kind} ${shortId(record.session)}: ${leadingLine(record.text, 160)}`),
      'Read or search more with `supa_context`.',
    ].join('\n')
  digestCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, text })
  return text
}

function openTodosOf(session) {
  let events
  try {
    events = session.snapshotEvents()
  } catch {
    return []
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'tool/call' || event.data?.name !== 'todo_write') continue
    try {
      const args = JSON.parse(event.data.arguments)
      const todos = Array.isArray(args?.todos) ? args.todos : []
      return todos.filter((todo) => todo && todo.status !== 'completed')
    } catch {
      return []
    }
  }
  return []
}

function transcriptLines(session, count, perMessage) {
  let events
  try {
    events = session.snapshotEvents()
  } catch {
    return []
  }
  const window = events.slice(-Math.max(count * 4, 60))
  const lines = []
  for (const event of window) {
    if (event?.type === 'user/message') {
      const text = blocksToText(event.data?.content, perMessage)
      if (text) lines.push(`user: ${text}`)
    } else if (event?.type === 'assistant/message') {
      const text = blocksToText(event.data?.message?.content, perMessage)
      if (text) lines.push(`assistant: ${text}`)
    }
  }
  return lines.slice(-Math.max(0, count))
}

function textBlocks(text) {
  return [{ type: 'text', text }]
}

export function apply(ctx, config) {
  const cfg = mergeConfig(config)
  if (!cfg.enabled) return

  const log = (...args) => {
    try {
      ctx.logger?.info?.('[supa]', ...args)
    } catch {
      // logging must never break a turn
    }
  }

  const isSupa = (agent) => {
    if (!agent) return false
    if (cfg.mode === 'root') return !agent.session?.header?.parentSession
    if (cfg.mode === 'session') {
      const id = agent.session?.id ? String(agent.session.id) : ''
      const parent = agent.session?.header?.parentSession
      const enabled = readEnabledSessions()
      if (id && enabled.includes(id)) return true
      return Boolean(parent) && enabled.includes(String(parent))
    }
    if (cfg.mode === 'preset') {
      const preset = agent.session?.header?.agentPreset
      return Array.isArray(cfg.presets) && cfg.presets.includes(preset)
    }
    return true
  }

  const timers = new Set()
  const nudgeState = new Map()
  const retryController = new AbortController()
  const retrySignal = retryController.signal

  ctx.effect(() => () => {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    retryController.abort()
  })

  const later = (fn, delay) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      try {
        fn()
      } catch (error) {
        log('deferred task failed', error?.message ?? error)
      }
    }, delay)
    timers.add(timer)
    return timer
  }

  // A message handed to `inject`/`followup` must be a complete user message:
  // the request derives `role` from it, and one without `role` poisons the
  // durable log so every later request fails at that message. This factory is
  // the only way a plugin-authored message may enter a session.
  const userMessage = (text, kind = 'supa') => ({
    role: 'user',
    content: textBlocks(text),
    source: { kind },
  })

  const safeFollowup = (agent, text) => {
    try {
      agent.followup(userMessage(text))
    } catch {
      agent.followup(userMessage(text, 'user'))
    }
  }

  const safeInject = (agent, text) => {
    for (const kind of ['supa', 'user']) {
      try {
        agent.inject(userMessage(text, kind))
        return true
      } catch {
        // try the next source kind
      }
    }
    return false
  }

  const woken = (sessionId) => {
    const entry = nudgeState.get(sessionId)
    if (!entry) return { count: 0 }
    if (Date.now() - entry.at > cfg.nudgeWindowMs) return { count: 0 }
    return entry
  }

  const wake = (session, text, cap) => {
    const agents = ctx.get?.('agents')
    const agent = agents?.get?.(session.id)
    if (!agent) return false
    const entry = woken(session.id)
    if (entry.count >= cap) return false
    nudgeState.set(session.id, { count: entry.count + 1, at: Date.now() })
    later(() => {
      if (agent.status === 'running') return
      safeFollowup(agent, text)
    }, 300)
    return true
  }

  // -------------------------------------------------------- parent inbound bus
  //
  // One queue per SupA session, one lane per child. A child report is stored
  // durably and injected into the parent's inbox without waking it; only an
  // idle parent gets a wake, and only one per coalescing window for the whole
  // batch. Children never talk to each other; the queue is the only edge up.

  const inboxWakes = new Map()

  const inboxFileFor = (session) => inboxFileOf(sessionCwd(ctx, session), cfg, session.id)

  const scheduleInboxWake = (parent, depth, lanes) => {
    if (inboxWakes.has(parent.id)) return
    const timer = setTimeout(() => {
      inboxWakes.delete(parent.id)
      timers.delete(timer)
      try {
        if (parent.status === 'running') return
        safeFollowup(parent, `Inbox: ${depth} queued child report(s) across ${lanes} lane(s). They are already in your context — call \`supa_inbox\` (action: drain) before your next decision, then continue.`)
      } catch {
        // a failed wake leaves the reports queued
      }
    }, Math.max(200, cfg.coalesceMs))
    timers.add(timer)
    inboxWakes.set(parent.id, timer)
  }

  // ---------------------------------------------------------------- checks

  const BLOCKED_NUDGE = [
    'Your turn ended blocked. You are SupA: do not wait for a human.',
    'Re-read the task, choose the best reversible option, record it with `supa_context` (kind: "assumption"), and continue.',
    'If the only remaining step is irreversible and materially risky, write the exact question to the ledger and state what you need — otherwise keep working.',
  ].join(' ')

  const TODO_NUDGE = [
    'Your turn ended, but your todo list still has open items. You are SupA: continue the open work now.',
    'Either finish the remaining items, or update `todo_write` so the list matches reality before you stop.',
  ].join(' ')

  const QUESTION_DENIAL = [
    '`ask_user_question` is disabled in this session (denyBlockingQuestions).',
    'Decide with the best available evidence: pick the reversible option, record the assumption with `supa_context` (kind: "assumption"), state it in your answer, and continue.',
    'If a human decision is genuinely required and irreversible, write the question to the ledger and describe exactly what you need.',
  ].join(' ')

  if (cfg.denyBlockingQuestions) {
    ctx.effect(() => ctx.tools.guard((execution) => {
      if (!execution || execution.name !== 'ask_user_question') return undefined
      if (!isSupa(execution.agent)) return undefined
      return QUESTION_DENIAL
    }))
  }

  // ------------------------------------------------------------- sessions
  //
  // Mode "session" makes SupA opt-in: the plugin is installed profile-wide but
  // a session becomes a SupA only after it is enabled here. Children inherit
  // from their parent, so a worker never has to be enabled by hand.

  if (cfg.mode === 'session') {
    ctx.effect(() => ctx.tools.guard((execution) => {
      const name = typeof execution?.name === 'string' ? execution.name : ''
      if (!name.startsWith('supa_') || name === 'supa_session') return undefined
      if (isSupa(execution.agent)) return undefined
      return 'SupA is not enabled in this session (mode "session"). Ask the user whether to enable it, then call `supa_session` with action "enable".'
    }))
  }

  ctx.tools.register({
    name: 'supa_session',
    description: 'Report or change whether THIS session runs as a SupA. In mode "session" the plugin is installed but inert until a session is enabled here; the switch is per session and persists. Children inherit their parent\'s state.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'enable', 'disable'], description: 'status reads the flag, enable/disable changes it for this session.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          session: { type: 'string' },
          mode: { type: 'string' },
          supa: { type: 'boolean' },
        },
      },
      render: (_args, value) => textBlocks(JSON.stringify(value, null, 2)),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_session requires a calling agent')
      const id = agent.session?.id ? String(agent.session.id) : ''
      if (!id) throw new Error('this session has no id')
      let enabled = readEnabledSessions()
      if (args.action === 'enable' && !enabled.includes(id)) enabled = [...enabled, id]
      if (args.action === 'disable') enabled = enabled.filter((entry) => entry !== id)
      if (args.action !== 'status') await writeEnabledSessions(enabled)
      return { session: id, mode: cfg.mode, supa: isSupa(agent) }
    },
  })

  // ------------------------------------------------------------- approvals
  //
  // Authority is delegated, never global: a session auto-grants up to its own
  // level. A child's request above its level is refused and parked in the
  // parent's queue, where the parent decides with `supa_authority`; a root's
  // own request above its level goes to the human through the answerers.

  const grants = new Map()

  const requestLevel = (request) => (
    /danger-full-access|full-access/i.test(String(request?.reason ?? '')) ? 'full' : 'workspace'
  )

  const grantFor = (agent) => {
    if (!agent) return cfg.authority
    const known = grants.get(String(agent.session?.id))
    if (known) return known
    const parentId = agent.session?.header?.parentSession
    if (parentId) return grants.get(String(parentId)) ?? cfg.authority
    return cfg.authority
  }

  const recordPermission = async (file, sessionId, kind, text) => {
    try {
      await appendLedger(file, {
        id: newRecordId(),
        at: nowIso(),
        session: String(sessionId ?? ''),
        kind,
        tags: ['permission'],
        text,
      })
    } catch {
      // an audit trail must never block the decision
    }
  }

  if (cfg.autoApprove === true) {
    ctx.on('approval/request', async (request, next) => {
      const agent = request?.agent
      if (!agent || !isSupa(agent)) return next()
      const session = agent.session
      const cwd = sessionCwd(ctx, session)
      const file = ledgerFileOf(cwd, cfg)
      const level = requestLevel(request)
      const grant = grantFor(agent)
      const parentId = session?.header?.parentSession
      const reason = request.reason ? `: ${request.reason}` : ''

      if (level === 'full' && grant !== 'full') {
        await recordPermission(file, session?.id, 'escalation', `Refused \`${request.toolName}\` (needs ${level}, session holds ${grant})${reason}`)
        if (!parentId) return next()

        const parent = ctx.get?.('agents')?.get?.(parentId)
        const inbox = parent ? inboxFileFor(parent.session) : inboxFileOf(cwd, cfg, parentId)
        const record = {
          id: newRecordId(),
          at: nowIso(),
          lane: shortId(session.id),
          from: String(session.id),
          kind: 'permission',
          text: `Child requested danger-full-access for \`${request.toolName}\`${reason}. Grant it with \`supa_authority\` (agent_id, level: "full") and tell the child to retry, or leave it refused.`,
        }
        try {
          await mkdir(join(inbox, '..'), { recursive: true })
          await appendFile(inbox, `${JSON.stringify(record)}\n`, 'utf8')
          if (parent) {
            safeInject(parent, `[lane ${record.lane}] permission: ${record.text}`)
            const pending = pendingReportsOf(inbox)
            scheduleInboxWake(parent, pending.length, lanesOf(pending).length)
          }
        } catch {
          // the refusal still stands
        }
        return 'rejected'
      }

      await recordPermission(file, session?.id, 'auto-approval', `Granted once for \`${request.toolName}\`${reason} (holds ${grant}).`)
      return 'allowed-once'
    }, true)
  }

  // ------------------------------------------------------- turn continuations

  ctx.on('session/event', (session, event) => {
    if (!session || !event) return
    if (event.type !== 'turn/end') return
    const agents = ctx.get?.('agents')
    const agent = agents?.get?.(session.id)
    if (!agent || !isSupa(agent)) return

    const reason = event.data?.reason?.kind
    if (reason === 'blocked' && cfg.continueWhenBlocked) {
      wake(session, BLOCKED_NUDGE, cfg.maxBlockedNudges)
      return
    }
    if (reason === 'completed' && cfg.continueOnOpenTodos) {
      const open = openTodosOf(session)
      if (open.length > 0) wake(session, TODO_NUDGE, cfg.maxTodoNudges)
    }
  })

  // ----------------------------------------------------------- system prompt

  const sectionOrder = (() => {
    try {
      return ctx.systemPrompt.getSectionOrder('TOOL_SUBAGENT') - 1
    } catch {
      return 900
    }
  })()
  const contextOrder = (() => {
    try {
      return ctx.systemPrompt.getContextOrder('SUBAGENT_DELEGATION') + 1
    } catch {
      return 901
    }
  })()

  ctx.systemPrompt.section({
    name: 'supa:charter',
    order: sectionOrder,
    text: (context) => (context?.agent && isSupa(context.agent) ? CHARTER : ''),
  })

  ctx.systemPrompt.context({
    name: 'supa:state',
    order: contextOrder,
    text: (context) => {
      const agent = context?.agent
      if (!agent || !isSupa(agent)) return ''
      const session = agent.session
      const cwd = sessionCwd(ctx, session)
      const file = ledgerFileOf(cwd, cfg)
      const lines = []
      const digest = ledgerDigest(file, cfg.promptDigestNotes)
      if (digest) lines.push(digest)
      const open = openTodosOf(session)
      if (open.length > 0) {
        lines.push(`Open todos: ${open.map((todo) => `[${todo.status}] ${leadingLine(todo.content ?? '', 90)}`).join('; ')}`)
      }
      const pending = pendingReportsOf(inboxFileOf(cwd, cfg, session.id))
      if (pending.length > 0) {
        const lanes = lanesOf(pending)
        lines.push(`Inbox: ${pending.length} pending child report(s) from ${lanes.length} lane(s) (${lanes.slice(0, cfg.inboxPromptLanes).join(', ')}). Drain with \`supa_inbox\`.`)
      }
      if (lines.length === 0) return 'SupA ledger is empty: record decisions and findings with `supa_context`.'
      return lines.join('\n')
    },
  })

  // ------------------------------------------------------------------ tools

  // ------------------------------------------------------------- model routing
  //
  // The user ranks model+thinking tiers from strongest to weakest and gives each
  // a difficulty ceiling (1-10). The SupA scores a task 1-10; the router takes
  // the weakest tier that still covers the score, falls back to the strongest
  // available tier when no tier covers it, and inherits the parent route when
  // the ladder is empty. Availability is the live `llm` service, not a guess.

  const routeCache = new Map()

  const tierAvailable = async (tier) => {
    if (isCliTier(tier)) {
      const command = cliCommandFor(tier, cfg)
      return Boolean(command && resolveOnPath(command))
    }
    if (!tier.provider || !tier.model) return false
    const key = `${tier.provider}/${tier.model}/${tier.reasoningEffort}`
    const hit = routeCache.get(key)
    if (hit && Date.now() - hit.at < 60000) return hit.ok
    let ok = true
    try {
      const llm = ctx.get?.('llm')
      if (llm?.resolveCallConfig) {
        const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(4000) : undefined
        await llm.resolveCallConfig({
          provider: tier.provider,
          model: tier.model,
          ...(tier.reasoningEffort ? { reasoningEffort: tier.reasoningEffort } : {}),
        }, signal)
      }
    } catch {
      ok = false
    }
    routeCache.set(key, { ok, at: Date.now() })
    return ok
  }

  const resolveRoute = async (ladder, difficulty, cwd) => {
    const tiers = ladder.tiers
    const availability = await Promise.all(tiers.map((tier) => tierAvailable(tier)))
    const failures = cwd ? readFailures(cwd, cfg) : {}
    const healthy = tiers
      .filter((tier, index) => availability[index] && tier.enabled && !failureActive(failures[tier.id], cfg))
      .sort((a, b) => a.slot - b.slot)
    const desired = Math.min(10, Math.max(1, 11 - difficulty))

    if (healthy.length === 0) {
      // Everything is cooling or disabled: use the strongest enabled tier
      // rather than falling back to the parent route, and say so.
      const fallback = tiers.filter((tier, index) => availability[index] && tier.enabled).sort((a, b) => a.slot - b.slot)
      if (fallback.length > 0) {
        return { tier: fallback[0], degraded: false, usable: fallback.length, total: tiers.length, chain: fallback, cooled: true, desired }
      }
      return { tier: null, degraded: false, usable: 0, total: tiers.length, chain: [], desired }
    }

    // Walk from the requested tier down to weaker slots; a hole (T1 empty)
    // simply skips to the next defined slot. Nothing weaker left means the
    // weakest available tier still gets the task.
    const atOrWeaker = healthy.filter((tier) => tier.slot >= desired)
    const pick = atOrWeaker[0] ?? healthy[healthy.length - 1]
    const chain = atOrWeaker.length > 0 ? atOrWeaker : healthy
    return { tier: pick, degraded: pick.slot !== desired, usable: healthy.length, total: tiers.length, chain, desired }
  }

  const routeOptions = (tier) => ({
    provider: tier.provider,
    model: tier.model,
    ...(tier.reasoningEffort ? { reasoningEffort: tier.reasoningEffort } : {}),
  })

  const modelsTool = {
    name: 'supa_models',
    description: [
      'Manage the model ladder SupA delegates with: an ordered list of tiers (provider + model + thinking effort), strongest first, each with a difficulty ceiling 1-10.',
      'Rate a task 1-10 (1 = a 4B model can do it, 10 = contradictory or missing information needing judgment), then `supa_spawn` with `difficulty` picks the weakest tier that still covers it.',
      'Actions: `list` (ladder plus routes the llm service advertises), `scan` (read every entry of `codex debug models`), `pin` (test model+effort configurations with real calls and cache which ones work), `add`, `remove`, `move`, `route` (dry-run the choice for a difficulty).',
      'A tier is either an `llm` route (provider/model/thinking) or an external `codex` CLI; the same ladder ranks both, and `supa_spawn` runs `codex exec` for a CLI tier.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'scan', 'pin', 'add', 'remove', 'move', 'route', 'clear'] },
        model: {
          type: 'string',
          description: 'For `pin`: test every effort this model supports. Omit to pin the ladder\'s codex tiers instead.',
        },
        force: {
          type: 'boolean',
          description: 'For `pin`: retest configurations that already passed instead of reusing the cache.',
        },
        id: { type: 'string', description: 'For `remove`/`move`: the tier id.' },
        label: { type: 'string', description: 'For `add`: display label, such as "Fable 5 (max thinking)".' },
        kind: {
          type: 'string',
          enum: ['llm', 'cli', 'codex'],
          description: 'For `add`: `llm` (Harness provider route, default) or `cli`/`codex` (external CLI run as a child process).',
        },
        driver: {
          type: 'string',
          enum: Object.keys(CLI_DRIVERS),
          description: 'For `add` with kind `cli`: which CLI to drive (codex, claude, gemini, kimi, qwen, cursor, opencode, aider, copilot, goose).',
        },
        command: {
          type: 'string',
          description: 'For `add` with kind `cli`: executable path or name overriding the driver default.',
        },
        provider: { type: 'string', description: 'For `add`: llm provider id.' },
        model: { type: 'string', description: 'For `add`: model id within that provider.' },
        reasoning_effort: { type: 'string', description: 'For `add`: thinking level, such as max or high. Omit for the route default.' },
        ceiling: { type: 'number', description: 'For `add`: highest difficulty (1-10) this tier is expected to handle.' },
        rank: { type: 'number', description: 'For `add`: 0-based position, 0 = strongest. Omit to append at the weakest end.' },
        to_index: { type: 'number', description: 'For `move`: 0-based destination.' },
        difficulty: { type: 'number', description: 'For `route`: the score to resolve.' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => textBlocks(String(value ?? '')),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_models requires a calling agent')
      const cwd = sessionCwd(ctx, agent.session)
      const file = modelsFileOf(cwd, cfg)

      if (args.action === 'list') {
        const ladder = await readLadder(file)
        const availability = await Promise.all(ladder.tiers.map((tier) => tierAvailable(tier)))
        const failures = readFailures(cwd, cfg)
        const lines = ladder.tiers.map((tier, index) => {
          const failed = failureActive(failures[tier.id], cfg) ? failures[tier.id] : null
          return `${renderTier(tier, index)}${availability[index] ? '' : ' · UNAVAILABLE'}${failed ? ` · COOLING DOWN: ${leadingLine(failed.error, 80)}` : ''}`
        })
        if (ladder.tiers.some((tier) => tier.kind === 'codex')) lines.push(`codex binary: ${findCodex(cfg)}`)
        try {
          const cached = JSON.parse(readFileSync(join(stateDirOf(), 'codex-models.json'), 'utf8'))
          const age = Math.max(0, Math.round((Date.now() - cached.at) / 60000))
          lines.push(`codex catalog: ${cached.models.length} models, cached ${age}m ago; run \`scan\` to refresh`)
        } catch {
          // no catalog cached yet
        }
        const rows = []
        try {
          const llm = ctx.get?.('llm')
          for (const provider of (llm?.listProviders?.() ?? []).slice(0, 8)) {
            let models = []
            try {
              models = (await llm.listModels?.(provider.id)) ?? []
            } catch {
              // provider without discovery
            }
            rows.push(`  ${provider.id}: ${models.map((entry) => entry.id).join(', ') || '(no models advertised)'}`)
          }
        } catch {
          // discovery is best-effort
        }
        return [
          `${file}`,
          lines.length ? lines.join('\n') : '(ladder is empty — add tiers with `add`)',
          rows.length ? `\nRoutes the llm service advertises:\n${rows.join('\n')}` : '',
          '\nDifficulty: 1 = trivial, 10 = contradictory or missing information needing judgment.',
        ].filter(Boolean).join('\n')
      }

      if (args.action === 'clear') {
        const all = readFailures(cwd, cfg)
        const ladder = await readLadder(modelsFileOf())
        const tier = args.id ? ladder.tiers.find((entry) => entry.id === args.id) : undefined
        const drop = new Set()
        if (args.id) {
          drop.add(args.id)
          if (tier) drop.add(`route:${tierRoute(tier)}`)
        }
        const next = args.id
          ? Object.fromEntries(Object.entries(all).filter(([key]) => !drop.has(key)))
          : {}
        await mkdir(stateDirOf(), { recursive: true })
        await writeFailures(cwd, cfg, next)
        if (tier && tier.enabled === false) {
          tier.enabled = true
          await writeLadder(modelsFileOf(), ladder)
        }
        return args.id ? `cleared ${args.id} and put it back in rotation` : 'cleared every tier failure mark'
      }

      if (args.action === 'scan') {
        const { models } = await scanCodexModels(cfg, cwd)
        const listed = models.filter((model) => model.visibility === 'list').length
        const lines = models.map((model) => `${model.slug} — ${model.name} · ${model.visibility || '?'} · default ${model.defaultEffort || '?'} · ${model.efforts.join('/') || 'no efforts'}`)
        return `${models.length} models from \`codex debug models\` (${listed} exposed by the CLI, ${models.length - listed} hidden):\n${lines.join('\n')}\n\nPin with \`pin\`: pass a model to test every effort it supports, or omit it to test the ladder's codex tiers.`
      }

      if (args.action === 'pin') {
        const { verdicts } = await pinNow(cwd, args.model, args.force === true)
        const usable = verdicts.filter((verdict) => verdict.ok).length
        const lines = verdicts.map((verdict) => `${verdict.ok ? 'OK  ' : 'FAIL'} ${verdict.model}@${verdict.effort}${verdict.ok ? `: ${verdict.answer}${verdict.cached ? ' (cached)' : ''}` : `: ${verdict.error}`}`)
        return `pinned ${verdicts.length} configuration(s), ${usable} usable (each was a real call):\n${lines.join('\n')}`
      }

      const ladder = await readLadder(file)

      if (args.action === 'add') {
        const used = new Set(ladder.tiers.map((entry) => entry.slot))
        if (used.size >= 10) throw new Error('all ten slots are taken; remove one first')
        let freeSlot = 1
        while (used.has(freeSlot)) freeSlot += 1
        const tier = normalizeTier({
          label: args.label,
          kind: args.kind,
          driver: args.driver,
          command: args.command,
          provider: args.provider,
          model: args.model,
          reasoningEffort: args.reasoning_effort,
          ceiling: args.ceiling,
          slot: args.rank === undefined ? freeSlot : Number(args.rank) + 1,
        }, freeSlot - 1)
        const knownBad = readFailures(cwd, cfg)[`route:${tierRoute(tier)}`]
        if (failureActive(knownBad, cfg)) {
          throw new Error(`that configuration is marked failed (${String(knownBad.error).slice(0, 100)}); fix it before adding it to the ladder`)
        }
        const taken = new Set(ladder.tiers.map((entry) => entry.id))
        if (taken.has(tier.id)) {
          let next = ladder.tiers.length + 1
          while (taken.has(`t${next}`)) next += 1
          tier.id = `t${next}`
        }
        ladder.tiers.push(tier)
        renumber(ladder.tiers)
        await writeLadder(file, ladder)
        return `added ${tier.id} to T${tier.slot}\n${ladder.tiers.map(renderTier).join('\n')}`
      }

      if (args.action === 'remove') {
        const before = ladder.tiers.length
        const removed = ladder.tiers.find((tier) => tier.id === args.id)
        ladder.tiers = ladder.tiers.filter((tier) => tier.id !== args.id)
        if (ladder.tiers.length === before) throw new Error(`no tier with id ${args.id}`)
        await forgetFailure(cwd, cfg, removed)
        renumber(ladder.tiers)
        await writeLadder(file, ladder)
        return `removed ${args.id}\n${ladder.tiers.map(renderTier).join('\n') || '(ladder is empty)'}`
      }

      if (args.action === 'move') {
        const tier = ladder.tiers.find((entry) => entry.id === args.id)
        if (!tier) throw new Error(`no tier with id ${args.id}`)
        const target = Math.min(10, Math.max(1, Math.round(Number(args.to_index)) || 1))
        const occupant = ladder.tiers.find((entry) => entry.id !== tier.id && entry.slot === target)
        if (occupant) occupant.slot = tier.slot
        tier.slot = target
        renumber(ladder.tiers)
        ladder.tiers.sort((a, b) => a.slot - b.slot)
        await writeLadder(file, ladder)
        return `moved ${tier.id} to T${tier.slot}\n${ladder.tiers.map(renderTier).join('\n')}`
      }

      const difficulty = Math.min(10, Math.max(1, Number(args.difficulty) || 5))
      const picked = await resolveRoute(ladder, difficulty, cwd)
      if (!picked.tier) {
        return `difficulty ${difficulty}: no usable tier (${picked.total} configured). A spawn would inherit your own route.`
      }
      const startIndex = picked.chain.findIndex((entry) => entry.id === picked.tier.id)
      const fallback = picked.chain.slice(startIndex + 1).map((entry) => `T${entry.slot} ${entry.label}`)
      return `difficulty ${difficulty} → T${picked.tier.slot} ${picked.tier.label} (${tierRoute(picked.tier)})`
        + (picked.degraded
          ? `\nT${picked.desired} is empty, disabled or failing; walked down to T${picked.tier.slot}.`
          : '')
        + (fallback.length ? `\nFallback chain on failure: ${fallback.join(' → ')}` : '\nNo weaker tier to fall back to.')
        + `\n${picked.usable}/${picked.total} tiers usable.`
    },
  }

  // ------------------------------------------------------------ settings API
  //
  // The settings page is a Client panel; these two routes are its only data
  // source. They edit the ladder of the default working directory, which is the
  // same file `supa_models` edits for a session rooted there.

  const workspaceList = () => {
    try {
      return (ctx.get?.('workspaceRegistry')?.list?.() ?? []).map((workspace) => ({
        id: String(workspace.id),
        title: workspace.title,
        path: workspace.path,
        updatedAt: workspace.updatedAt ?? '',
      }))
    } catch {
      return []
    }
  }

  const apiCwd = (requested) => {
    if (typeof requested === 'string' && requested) return requested
    const workspaces = workspaceList()
    if (workspaces.length > 0) {
      // The registry is in durable display order, not recency order: pick the
      // workspace that moved last, which is the one the user is working in.
      const [latest] = [...workspaces].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      return latest.path
    }
    try {
      const dir = ctx.get?.('workingDirectory')?.defaultDirectory
      if (typeof dir === 'string' && dir) return dir
    } catch {
      // fall through to the process directory
    }
    return process.cwd()
  }

  /**
   * Turn a pin request into (model, effort) pairs. With a model name, every
   * effort it supports; without one, the codex tiers already in the ladder.
   */
  const pinTargetsFor = async (cwd, requestedModel) => {
    const cacheFile = join(stateDirOf(), 'codex-models.json')
    let models = []
    try {
      models = JSON.parse(readFileSync(cacheFile, 'utf8')).models ?? []
    } catch {
      throw new Error('no catalog cached; run `scan` first')
    }
    if (requestedModel) {
      const model = models.find((entry) => entry.slug === requestedModel)
      if (!model) throw new Error(`unknown model ${requestedModel}; run scan`)
      return model.efforts.map((effort) => ({ model: model.slug, effort }))
    }
    const ladder = await readLadder(modelsFileOf(cwd, cfg))
    const targets = ladder.tiers
      .filter((tier) => isCliTier(tier) && driverOf(tier) === 'codex' && tier.model)
      .map((tier) => ({ model: tier.model, effort: tier.reasoningEffort }))
    if (targets.length === 0) throw new Error('the ladder has no CLI tier to pin; add a codex tier first, or pin a catalog model')
    return targets
  }

  const pinNow = async (cwd, requestedModel, force) => {
    const targets = await pinTargetsFor(cwd, requestedModel)
    return pinCodexTargets(cfg, cwd, targets, { force })
  }

  /**
   * The harness's own routes, as opposed to the Codex CLI's catalog. One row
   * per provider/model with the reasoning efforts that model actually accepts.
   */
  const collectLlmRoutes = async () => {
    const llm = ctx.get?.('llm')
    if (!llm?.listProviders) return []
    const routes = []
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined
    for (const provider of llm.listProviders()) {
      let models = []
      try {
        models = (await llm.listModels(provider.id)) ?? []
      } catch {
        continue
      }
      for (const model of models) {
        let efforts = []
        let defaultEffort = ''
        try {
          const info = await llm.resolveModelInfo(provider.id, model.id, signal)
          efforts = (info?.reasoning?.efforts ?? []).map((effort) => effort.id)
          defaultEffort = info?.reasoning?.defaultEffort ?? ''
        } catch {
          // a provider without published reasoning metadata
        }
        routes.push({ provider: provider.id, model: model.id, name: model.name ?? model.id, efforts, defaultEffort })
      }
    }
    return routes
  }

  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

  const settingsState = async (requested) => {
    const cwd = apiCwd(requested)
    const file = modelsFileOf(cwd, cfg)
    const ladder = await readLadder(file)
    const availability = await Promise.all(ladder.tiers.map((tier) => tierAvailable(tier)))
    let catalog = null
    try {
      catalog = JSON.parse(readFileSync(join(stateDirOf(), 'codex-models.json'), 'utf8'))
    } catch {
      // no catalog cached yet
    }
    const failures = readFailures(cwd, cfg)
    return {
      cwd,
      file,
      workspaces: workspaceList(),
      // Codex is an external CLI, so its catalog is cached from a scan; the
      // harness's own routes are read live from the llm service instead.
      llm: await collectLlmRoutes(),
      drivers: Object.keys(CLI_DRIVERS),
      catalog,
      config: {
        mode: cfg.mode,
        autoApprove: cfg.autoApprove === true,
        authority: cfg.authority,
        retryOnFailure: cfg.retryOnFailure,
        denyBlockingQuestions: cfg.denyBlockingQuestions,
        failureCooldownMs: cfg.failureCooldownMs,
      },
      tiers: ladder.tiers.map((tier, index) => ({
        ...tier,
        route: tierRoute(tier),
        available: Boolean(availability[index]),
        failure: failureActive(failures[`route:${tierRoute(tier)}`] ?? failures[tier.id], cfg)
          ? (failures[`route:${tierRoute(tier)}`] ?? failures[tier.id])
          : null,
      })),
      // Every failed route keeps its mark until it is cleared or a retry
      // succeeds; a failed tier stays in the ladder, disabled.
      failures: Object.entries(failures)
        .filter(([key, entry]) => key.startsWith('route:') && failureActive(entry, cfg))
        .map(([key, entry]) => ({
          key,
          route: key.slice('route:'.length),
          label: entry.tier?.label ?? key.slice('route:'.length),
          error: String(entry.error ?? ''),
          at: Number(entry.at) || 0,
        })),
      supaSessions: readEnabledSessions(),
    }
  }

  const settingsAction = async (body) => {
    const cwd = apiCwd(body?.cwd)
    const file = modelsFileOf(cwd, cfg)
    const ladder = await readLadder(file)
    const tierId = typeof body?.id === 'string' ? body.id : ''

    if (body?.action === 'config') {
      const changes = {}
      if (typeof body.autoApprove === 'boolean') changes.autoApprove = body.autoApprove
      if (['all', 'root', 'preset', 'session'].includes(body.mode)) changes.mode = body.mode
      if (body.authority === 'workspace' || body.authority === 'full') changes.authority = body.authority
      if (typeof body.denyBlockingQuestions === 'boolean') changes.denyBlockingQuestions = body.denyBlockingQuestions
      const minutes = Number(body.failureCooldownMinutes)
      if (Number.isFinite(minutes) && minutes >= 0) {
        changes.failureCooldownMs = Math.max(0, Math.round(minutes * 60000))
      }
      if (Object.keys(changes).length === 0) throw new Error('nothing to change')

      const entry = ctx.fiber?.entry
      const editor = ctx.get?.('configEditor')
      if (!entry || !editor) throw new Error('configuration editing is unavailable in this profile')
      // Saving re-applies this plugin row, which restarts it: answer first,
      // then write the patch so the response is not cut off by the restart.
      setTimeout(() => {
        editor.edit(entry, (current) => ({ ...current, ...changes })).catch(() => {})
      }, 150)
      return { ...(await settingsState(cwd)), pending: changes }
    }

    if (body?.action === 'session') {
      const id = String(body.id ?? '').trim()
      if (!id) throw new Error('a session id is required')
      const next = readEnabledSessions().filter((entry) => entry !== id)
      if (body.enabled !== false) next.push(id)
      await writeEnabledSessions(next)
      return settingsState(cwd)
    }

    if (body?.action === 'reset') {
      await writeLadder(file, defaultLadder())
      return settingsState(cwd)
    }

    if (body?.action === 'scan') {
      await scanCodexModels(cfg, cwd)
      return settingsState(cwd)
    }

    if (body?.action === 'pin') {
      const result = await pinNow(cwd, body.model, body.force === true)
      const next = await settingsState(cwd)
      return { ...next, pin: result.verdicts }
    }

    if (body?.action === 'retry') {
      const tier = ladder.tiers.find((entry) => entry.id === String(body.id))
      if (!tier) throw new Error(`no tier ${body.id}`)
      const verdict = isCliTier(tier)
        ? await probeCliTier(cfg, tier, cwd)
        : (await tierAvailable(tier))
          ? { ok: true }
          : { ok: false, error: 'the llm service does not resolve this route' }

      const all = readFailures(cwd, cfg)
      const key = `route:${tierRoute(tier)}`
      if (verdict.ok) {
        delete all[key]
        tier.enabled = true
      } else {
        all[key] = { at: Date.now(), error: String(verdict.error ?? '').slice(0, 300), tier }
        tier.enabled = false
      }
      await mkdir(stateDirOf(), { recursive: true })
      await writeFailures(cwd, cfg, all)
      await writeLadder(modelsFileOf(), ladder)
      return { ...(await settingsState(cwd)), retry: { ok: Boolean(verdict.ok), error: verdict.error ?? '' } }
    }

    if (body?.action === 'clear') {
      const all = readFailures(cwd, cfg)
      if (typeof body.key === 'string' && body.key) {
        delete all[body.key]
        await mkdir(stateDirOf(), { recursive: true })
        await writeFailures(cwd, cfg, all)
        return settingsState(cwd)
      }
      const ladder = await readLadder(modelsFileOf())
      const tier = body.id ? ladder.tiers.find((entry) => entry.id === String(body.id)) : undefined
      const drop = new Set()
      if (body.id) {
        drop.add(String(body.id))
        if (tier) drop.add(`route:${tierRoute(tier)}`)
      }
      const next = body.id
        ? Object.fromEntries(Object.entries(all).filter(([key]) => !drop.has(key)))
        : {}
      await mkdir(stateDirOf(), { recursive: true })
      await writeFailures(cwd, cfg, next)
      if (tier && tier.enabled === false) {
        tier.enabled = true
        await writeLadder(modelsFileOf(), ladder)
      }
      return settingsState(cwd)
    }

    if (body?.action === 'move') {
      const tier = ladder.tiers.find((entry) => entry.id === tierId)
      if (!tier) throw new Error(`no tier ${tierId}`)
      const target = Math.min(10, Math.max(1, Math.round(Number(body.to)) || 1))
      const occupant = ladder.tiers.find((entry) => entry.id !== tier.id && entry.slot === target)
      if (occupant) occupant.slot = tier.slot
      tier.slot = target
    } else if (body?.action === 'enable') {
      const tier = ladder.tiers.find((entry) => entry.id === tierId)
      if (!tier) throw new Error(`no tier ${tierId}`)
      tier.enabled = body.enabled !== false
    } else if (body?.action === 'remove') {
      const before = ladder.tiers.length
      const removed = ladder.tiers.find((entry) => entry.id === tierId)
      ladder.tiers = ladder.tiers.filter((entry) => entry.id !== tierId)
      if (ladder.tiers.length === before) throw new Error(`no tier ${tierId}`)
      await forgetFailure(cwd, cfg, removed)
    } else if (body?.action === 'add') {
      const used = new Set(ladder.tiers.map((entry) => entry.slot))
      if (used.size >= 10) throw new Error('all ten slots are taken; remove one first')
      let freeSlot = 1
      while (used.has(freeSlot)) freeSlot += 1
      const tier = normalizeTier({ ...(body.tier ?? {}), slot: Number(body.tier?.slot) || freeSlot }, freeSlot - 1)
      const knownBad = readFailures(cwd, cfg)[`route:${tierRoute(tier)}`]
      if (failureActive(knownBad, cfg)) {
        throw new Error(`that configuration is marked failed (${String(knownBad.error).slice(0, 100)}); fix it before adding it to the ladder`)
      }
      const taken = new Set(ladder.tiers.map((entry) => entry.id))
      if (taken.has(tier.id)) {
        let next = ladder.tiers.length + 1
        while (taken.has(`t${next}`)) next += 1
        tier.id = `t${next}`
      }
      ladder.tiers.push(tier)
    } else {
      throw new Error(`unknown action ${body?.action}`)
    }

    renumber(ladder.tiers)
    await writeLadder(file, ladder)
    return settingsState()
  }

  const webServer = ctx.get?.('webServer')
  if (webServer?.register) {
    ctx.effect(() => {
      const disposers = [
        webServer.register({
          kind: 'exact',
          path: '/supa/state',
          resource: async (request) => jsonResponse(await settingsState(new URL(request.url).searchParams.get('cwd'))),
        }),
        webServer.register({
          kind: 'exact',
          path: '/supa/action',
          // Resource routes answer GET/HEAD only, so the action route is a
          // handler route owning the whole exchange.
          handler: async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('allow', 'POST')
              res.end('POST only')
              return
            }
            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const body = raw ? JSON.parse(raw) : {}
              const data = await settingsAction(body)
              res.statusCode = 200
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify(data))
            } catch (error) {
              res.statusCode = 400
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: String(error?.message ?? error) }))
            }
          },
        }),
      ]
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            // already removed
          }
        }
      }
    })
  }

  const contextTool = {
    name: 'supa_context',
    description: [
      'Read and write the workspace SupA context ledger, shared by every session in this workspace.',
      'Use it to record decisions, findings, assumptions and handoffs, and to recall what other sessions learned.',
      'Actions: `write` (text, optional kind/tags), `read` (id), `search` (query, optional limit), `list` (optional limit), `digest`.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['write', 'read', 'search', 'list', 'digest'],
          description: 'What to do with the ledger.',
        },
        text: { type: 'string', description: 'For `write`: the note, decision or finding.' },
        kind: {
          type: 'string',
          enum: ['note', 'decision', 'finding', 'assumption', 'handoff', 'auto-approval'],
          description: 'For `write`: the record kind. Default `note`.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'For `write`: short tags for later search.',
        },
        id: { type: 'string', description: 'For `read`: exact record id.' },
        query: { type: 'string', description: 'For `search`: case-insensitive substring.' },
        limit: { type: 'number', description: 'Maximum records to return (default 10, max 50).' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => textBlocks(String(value ?? '')),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_context requires a calling agent')
      const session = agent.session
      const cwd = sessionCwd(ctx, session)
      const file = ledgerFileOf(cwd, cfg)
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50)

      if (args.action === 'write') {
        const text = String(args.text ?? '').trim()
        if (!text) throw new Error('supa_context write requires `text`')
        const record = {
          id: newRecordId(),
          at: nowIso(),
          session: String(session.id),
          kind: typeof args.kind === 'string' ? args.kind : 'note',
          tags: Array.isArray(args.tags) ? args.tags.slice(0, 8).map(String) : [],
          text,
        }
        await appendLedger(file, record)
        return `wrote ${record.id} (${record.kind}) to ${file}`
      }

      const records = await readLedger(file)
      if (args.action === 'digest') {
        const digest = ledgerDigest(file, Math.min(limit, 20))
        return digest || 'ledger is empty'
      }
      if (args.action === 'read') {
        const record = records.find((entry) => entry.id === args.id)
        if (!record) throw new Error(`no ledger record with id ${args.id}`)
        return renderRecord(record)
      }
      if (args.action === 'search') {
        const query = String(args.query ?? '').toLowerCase()
        if (!query) throw new Error('supa_context search requires `query`')
        const hits = records
          .filter((entry) => String(entry.text ?? '').toLowerCase().includes(query)
            || (entry.tags ?? []).some((tag) => String(tag).toLowerCase().includes(query))
            || String(entry.kind ?? '').toLowerCase().includes(query))
          .slice(-limit)
        return hits.length === 0 ? `no ledger record matches ${JSON.stringify(args.query)}` : hits.map(renderRecord).join('\n\n')
      }
      const recent = records.slice(-limit).reverse()
      return recent.length === 0 ? `ledger is empty (${file})` : recent.map(renderRecord).join('\n\n')
    },
  }

  const renderQueue = (records) => {
    const byLane = new Map()
    for (const record of records) {
      const lane = record.lane ?? shortId(record.from)
      if (!byLane.has(lane)) byLane.set(lane, [])
      byLane.get(lane).push(record)
    }
    return [...byLane.entries()]
      .map(([lane, items]) => `lane ${lane} (${items.length}):\n${items.map((item) => `  [${item.id}] ${item.kind}: ${item.text}`).join('\n')}`)
      .join('\n\n')
  }

  const reportTool = {
    name: 'supa_report',
    description: [
      'Enqueue a progress update or result into your parent SupA\'s inbound queue instead of interrupting it.',
      'The queue is durable and per-lane, so ordering within this child is preserved; the parent drains it with `supa_inbox`.',
      'Use this rather than expecting an immediate reply. A root session has no queue to report to.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The update or result your parent needs.' },
        kind: { type: 'string', enum: ['progress', 'result', 'blocked', 'question'], description: 'Queue record kind. Default `progress`.' },
      },
      required: ['text'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => textBlocks(String(value ?? '')),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_report requires a calling agent')
      const parentId = agent.session?.header?.parentSession
      if (!parentId) throw new Error('this session is a root SupA; it has no inbound queue to report to')
      const subagents = ctx.get?.('subagents')
      const parents = ctx.get?.('agents')
      const parent = parents?.get?.(parentId)
      const session = agent.session
      const parentSession = parent?.session
      const file = parentSession
        ? inboxFileFor(parentSession)
        : inboxFileOf(sessionCwd(ctx, session), cfg, parentId)

      const record = {
        id: newRecordId(),
        at: nowIso(),
        lane: shortId(session.id),
        from: String(session.id),
        kind: typeof args.kind === 'string' ? args.kind : 'progress',
        text: String(args.text ?? '').trim(),
      }
      if (!record.text) throw new Error('supa_report requires `text`')

      await mkdir(join(file, '..'), { recursive: true })
      await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8')

      if (parent) {
        const line = `[lane ${record.lane}] ${record.kind}: ${record.text}`
        if (!safeInject(parent, line)) {
          try {
            await subagents?.sendMessage?.(agent, parentId, textBlocks(line), { signal: exec.signal })
          } catch {
            // the durable queue entry is still there for the parent to drain
          }
        }
        const pending = pendingReportsOf(file)
        scheduleInboxWake(parent, pending.length, lanesOf(pending).length)
      }

      const depth = pendingReportsOf(file).length
      return `queued ${record.id} on lane ${record.lane} (parent queue depth ${depth})`
    },
  }

  const inboxTool = {
    name: 'supa_inbox',
    description: [
      'Read, drain or inspect this SupA session\'s inbound queue: the reports its children enqueued.',
      'Records are grouped per child lane and keep their order.',
      '`drain` marks everything currently pending as read; `peek` leaves it pending; `stats` returns only counts.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['peek', 'drain', 'stats'], description: 'What to do with the queue.' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'For `drain`: only these record ids, so you can keep the useful ones pending. Omit to drain everything.',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => textBlocks(String(value ?? '')),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_inbox requires a calling agent')
      const session = agent.session
      const file = inboxFileFor(session)
      const pending = pendingReportsOf(file)
      const lanes = lanesOf(pending)

      if (args.action === 'stats' || pending.length === 0) {
        return pending.length === 0
          ? `inbox is empty (${file})`
          : `depth ${pending.length} across ${lanes.length} lane(s): ${file}`
      }
      if (args.action === 'peek') return renderQueue(pending)

      const wanted = Array.isArray(args.ids) ? new Set(args.ids.map(String)) : undefined
      const selected = wanted ? pending.filter((record) => wanted.has(record.id)) : pending
      if (selected.length === 0) return `no pending record matches those ids (depth ${pending.length})`

      const at = nowIso()
      const drained = drainedFileOf(file)
      await mkdir(join(drained, '..'), { recursive: true })
      for (const record of selected) {
        await appendFile(drained, `${JSON.stringify({ id: record.id, drainedAt: at })}\n`, 'utf8')
      }
      return `${renderQueue(selected)}\n\ndrained ${selected.length} record(s), ${pending.length - selected.length} left pending`
    },
  }

  const spawnTool = {
    name: 'supa_spawn',
    description: [
      'Start a SupA child whose context you decide.',
      'You pass a brief plus an explicit context selection: ledger notes by id or tag, files, and optionally the last N messages of this conversation.',
      'The child sees nothing else of this conversation. It can pull more with `supa_context_request`, and you answer with `supa_context_supply`.',
      'Choose the smallest context that makes the child succeed; do not dump the whole conversation.',
      'Returns the child session id immediately; its completion wakes this session.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'The complete task for the child. It cannot see this conversation.' },
        label: { type: 'string', description: 'A short display label (3-5 words).' },
        acceptance: { type: 'string', description: 'What counts as done, and what to report back.' },
        notes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ledger ids (`n-...`) or tags to hand to the child.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to hand over, relative to the working directory.',
        },
        transcript_messages: {
          type: 'number',
          description: 'Also hand over the last N user/assistant messages of this conversation (0 = none).',
        },
        include_ledger: {
          type: 'boolean',
          description: 'Also hand over the recent ledger digest. Default false.',
        },
        extra: { type: 'string', description: 'Any additional context text to include verbatim.' },
        cwd: { type: 'string', description: 'Child working directory. Omit to inherit the current one.' },
        authority: {
          type: 'string',
          enum: ['workspace', 'full'],
          description: 'Authority ceiling for the child. Clamped to your own level; default inherits yours.',
        },
        difficulty: {
          type: 'number',
          description: 'Your difficulty score for this task, 1-10. Picks the weakest ladder tier that still covers it; omit to inherit your own route.',
        },
        route: {
          type: 'string',
          description: 'Explicit ladder tier id from `supa_models list`, bypassing the difficulty ranking.',
        },
      },
      required: ['brief'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['activation', 'cli'] },
          subagentId: { type: 'string' },
          cliId: { type: 'string' },
          packBytes: { type: 'number' },
          sections: { type: 'string' },
          model: { type: 'string' },
        },
      },
      render: (_args, value) => textBlocks(
        `${value?.kind === 'cli' ? `started ${value?.cliId}` : `started SupA child ${value?.subagentId}`}`
        + ` on ${value?.model ?? 'inherited route'} with a ${value?.packBytes ?? 0}-byte context pack (${value?.sections ?? ''})`,
      ),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_spawn requires a calling agent')
      const subagents = ctx.get?.('subagents')
      if (!subagents) throw new Error('the subagents service is unavailable; supa_spawn cannot start a child')

      const session = agent.session
      const cwd = sessionCwd(ctx, session)
      const file = ledgerFileOf(cwd, cfg)
      const sections = []
      const parts = []
      const label = String(args.label ?? '').trim() || 'SupA child'

      // Difficulty routing: the SupA scores the task, the ladder picks the
      // weakest tier that still covers it. The usable chain is kept so a failed
      // attempt can walk one step weaker instead of failing the assignment.
      let agentOptions
      let routed = 'inherit'
      let choseTier = null
      let routeChain = []
      if (args.difficulty !== undefined || args.route) {
        const ladder = await readLadder(modelsFileOf(cwd, cfg))
        let tier = null
        if (args.route) {
          tier = ladder.tiers.find((entry) => entry.id === args.route) ?? null
          if (!tier) throw new Error(`no ladder tier with id ${args.route}; run supa_models list`)
          if (tier.enabled === false) throw new Error(`tier ${args.route} ("${tier.label}") is switched off; enable it first or route by difficulty`)
          routeChain = [tier]
        } else {
          const picked = await resolveRoute(ladder, Math.min(10, Math.max(1, Number(args.difficulty) || 5)), cwd)
          tier = picked.tier
          routeChain = picked.chain
        }
        if (tier) {
          agentOptions = routeOptions(tier)
          choseTier = tier
          routed = tier.label
        }
      }

      parts.push(`# SupA assignment: ${label}`)
      parts.push('## Brief\n' + String(args.brief))
      if (args.acceptance) parts.push('## Acceptance\n' + String(args.acceptance))

      const chosen = ['brief']
      if (args.acceptance) chosen.push('acceptance')

      // Selected ledger notes
      const wanted = Array.isArray(args.notes) ? args.notes.map(String) : []
      if (wanted.length > 0) {
        const records = await readLedger(file)
        const picked = []
        for (const key of wanted) {
          const byId = records.find((entry) => entry.id === key)
          if (byId) {
            picked.push(byId)
            continue
          }
          picked.push(...records.filter((entry) => (entry.tags ?? []).map(String).includes(key)))
        }
        const unique = [...new Map(picked.map((entry) => [entry.id, entry])).values()].slice(-20)
        if (unique.length > 0) {
          parts.push(`## Ledger context your parent selected\n${unique.map(renderRecord).join('\n\n')}`)
          chosen.push(`${unique.length} ledger records`)
        }
      }

      if (args.include_ledger) {
        const digest = ledgerDigest(file, 12)
        if (digest) {
          parts.push(`## Recent ledger digest\n${digest}`)
          chosen.push('ledger digest')
        }
      }

      // Selected files
      const files = Array.isArray(args.files) ? args.files.map(String).slice(0, cfg.maxFiles) : []
      if (files.length > 0) {
        const rendered = []
        for (const rel of files) {
          const abs = resolveInsideCwd(cwd, rel)
          try {
            const raw = await readFile(abs, 'utf8')
            const clipped = raw.length > cfg.maxFileBytes ? `${raw.slice(0, cfg.maxFileBytes)}\n… (truncated, ${raw.length} bytes total)` : raw
            rendered.push(`--- ${rel} ---\n${clipped}`)
          } catch (error) {
            rendered.push(`--- ${rel} ---\n(unreadable: ${error?.message ?? error})`)
          }
        }
        parts.push(`## Files your parent selected\n${rendered.join('\n\n')}`)
        chosen.push(`${files.length} files`)
      }

      // Selected slice of this conversation
      const transcriptCount = Math.max(0, Math.min(Number(args.transcript_messages) || 0, 200))
      if (transcriptCount > 0) {
        const lines = transcriptLines(session, transcriptCount, cfg.maxTranscriptChars)
        if (lines.length > 0) {
          parts.push(`## Last ${lines.length} messages of your parent's conversation\n${lines.join('\n\n')}`)
          chosen.push(`${lines.length} messages`)
        }
      }

      if (args.extra) {
        parts.push(`## Additional context\n${String(args.extra)}`)
        chosen.push('extra')
      }

      parts.push(CHILD_CHARTER)
      parts.push(TASK_CHARTER)

      let pack = parts.join('\n\n')
      if (pack.length > cfg.maxPackBytes) {
        pack = `${pack.slice(0, cfg.maxPackBytes)}\n\n… (context pack truncated at ${cfg.maxPackBytes} characters)`
      }

      const baseRequest = {
        prompt: textBlocks(pack),
        parent: agent,
      }
      if (args.cwd) baseRequest.cwd = String(args.cwd)
      if (cfg.childPreset) baseRequest.agentPreset = cfg.childPreset
      const maxDepth = subagents.resolveMaxDepth?.()
      if (typeof maxDepth === 'number') baseRequest.maxDepth = maxDepth

      const parentGrant = grantFor(agent)
      const authority = args.authority === 'full' && parentGrant === 'full' ? 'full' : 'workspace'

      const enqueueParentNote = (text, kind = 'retry') => {
        try {
          const inbox = inboxFileFor(agent.session)
          const lane = kind === 'retry' ? 'router' : 'cli'
          const record = { id: newRecordId(), at: nowIso(), lane, from: '', kind, text }
          mkdir(join(inbox, '..'), { recursive: true })
            .then(() => appendFile(inbox, `${JSON.stringify(record)}\n`, 'utf8'))
            .then(() => {
              safeInject(agent, `[${lane}] ${kind}: ${text}`)
              const pending = pendingReportsOf(inbox)
              scheduleInboxWake(agent, pending.length, lanesOf(pending).length)
            })
            .catch(() => {})
        } catch {
          // a lost note must not break the work
        }
      }

      const tierTries = new Map()

      const onFailure = (tier, attempt, stop) => {
        const key = tier?.id ?? '__inherited__'
        const tries = (tierTries.get(key) ?? 0) + 1
        tierTries.set(key, tries)

        // One wobble should not retire a model: retry the same tier first.
        if (tier && tries < cfg.tierAttempts) {
          enqueueParentNote(`T${tier.slot} ${tier.label} stopped with ${stop}; retrying the same tier (${tries + 1}/${cfg.tierAttempts})`, 'retry')
          later(() => {
            launch(tier, attempt).catch((error) => {
              enqueueParentNote(`retry of ${tier.label} could not start: ${error?.message ?? error}`, 'retry')
            })
          }, cfg.tierRetryDelayMs)
          return
        }

        // Out of same-tier attempts: the route is a fact about the model, so
        // mark it and free the slot.
        if (tier?.id) {
          recordFailure(cwd, cfg, [`route:${tierRoute(tier)}`], stop, tier).catch(() => {})
          const isFallback = tier.id === 'fallback' || String(tier.id).startsWith('fallback-')
          if (isFallback) {
            // The last line failed too. Fail loudly and leave the state alone:
            // the user decides whether to retry now or start a new session.
            dropTier(cwd, cfg, tier.id).catch(() => {})
            enqueueParentNote('the built-in DeepSeek fallback failed as well: every route in the ladder is down, so this assignment cannot be retried until a provider recovers', 'retry')
            return
          }
          dropTier(cwd, cfg, tier.id)
            .then(() => ensureUsableRoute(cwd, cfg))
            .then((note) => {
              if (note) enqueueParentNote(note, 'retry')
            })
            .catch(() => {})
        }
        if (!cfg.retryOnFailure) return
        const index = tier ? routeChain.findIndex((entry) => entry.id === tier.id) : -1
        const next = index >= 0 ? routeChain[index + 1] : undefined
        if (!next || attempt >= cfg.maxRouteRetries) {
          enqueueParentNote(`tier ${tier?.label ?? 'inherited'} stopped with ${stop}; no weaker tier left after ${attempt} retries`, 'retry')
          return
        }
        enqueueParentNote(`tier ${tier.label} stopped with ${stop} after ${tries} attempt(s); retrying on ${next.label}`, 'retry')
        launch(next, attempt + 1).catch((error) => {
          enqueueParentNote(`retry on ${next.label} could not start: ${error?.message ?? error}`, 'retry')
        })
      }

      const launchCli = async (tier, attempt) => {
        const driverName = driverOf(tier)
        const driver = cliDriverFor(tier)
        if (!driver) throw new Error(`unknown CLI driver "${driverName}"; known: ${Object.keys(CLI_DRIVERS).join(', ')}`)
        const cliId = `${driverName}-${randomUUID().slice(0, 8)}`
        const outFile = join(tmpdir(), `supa-${cliId}.txt`)
        const command = resolveOnPath(cliCommandFor(tier, cfg))
        if (!command) throw new Error(`${driverName} CLI not found; set command on the tier or install it`)
        const args = driver.args({
          cfg,
          model: tier.model,
          effort: tier.reasoningEffort,
          cwd,
          outFile,
          prompt: pack,
          authority,
        })

        // A Windows npm shim is a .cmd, which spawn cannot execute directly.
        const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
        const child = spawn(command, shell ? args.map(quoteForShell) : args, {
          cwd,
          windowsHide: true,
          shell,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-4000) })
        child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000) })
        const timer = setTimeout(() => {
          try {
            child.kill()
          } catch {
            // already gone
          }
        }, cfg.cliTimeoutMs)
        child.stdin.on('error', () => {})
        child.stdin.end(driver.prompt === 'stdin' ? pack : '')

        let settled = false
        const result = new Promise((resolve, reject) => {
          const finish = (fn, value) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            try {
              unlinkSync(outFile)
            } catch {
              // temp file already gone
            }
            fn(value)
          }
          child.on('error', (error) => finish(reject, new Error(`${driverName} could not start: ${error.message}`)))
          child.on('close', (code) => {
            let text = ''
            try {
              text = readFileSync(outFile, 'utf8')
            } catch {
              // fall back to the stream
            }
            if (!text.trim()) text = stdout.trim() || stderr.trim()
            if (code === 0 && text.trim()) return finish(resolve, text.trim())
            const detail = [stderr, stdout]
              .map((stream) => String(stream ?? '').trim())
              .filter(Boolean)
              .join(' ')
              .slice(-400)
            finish(reject, new Error(`${driverName} exited ${code}${detail ? `: ${detail}` : ''}`))
          })
        })

        result.then((text) => {
          const clipped = text.length > cfg.maxCliResultChars
            ? `${text.slice(0, cfg.maxCliResultChars)}\n… (${text.length} chars total)`
            : text
          enqueueParentNote(`${driverName} ${tier.label} finished:\n${clipped}`, 'result')
        }, (error) => {
          onFailure(tier, attempt, `cli: ${error?.message ?? error}`)
        })

        return { kind: 'cli', cliId }
      }

      const launch = async (tier, attempt, first = false) => {
        if (isCliTier(tier)) return launchCli(tier, attempt)

        const request = { ...baseRequest }
        if (tier) request.agentOptions = routeOptions(tier)
        const activation = await subagents.startActivation({
          provider: cfg.spawnProvider || 'spawn',
          label: first ? label : `${label} (retry ${attempt})`,
          request,
          signal: first ? exec.signal : retrySignal,
          delivery: 'parent',
        })
        grants.set(String(activation.childId), authority)
        const settled = activation.result
        if (settled && typeof settled.then === 'function') {
          settled.then((result) => {
            const stop = result?.stopReason
            if (stop === 'completed' || stop === 'aborted') return
            onFailure(tier, attempt, String(stop ?? 'unknown'))
          }, () => {
            onFailure(tier, attempt, 'error')
          })
        }
        return { kind: 'session', ...activation }
      }

      const activation = await launch(choseTier, 0, true)

      sections.push(`context: ${chosen.join(', ')}`)
      return {
        kind: activation.kind === 'cli' ? 'cli' : 'activation',
        subagentId: activation.childId ? String(activation.childId) : '',
        cliId: activation.cliId ?? '',
        packBytes: pack.length,
        sections: chosen.join(' + '),
        model: routed,
      }
    },
  }

  const requestTool = {
    name: 'supa_context_request',
    description: [
      'Ask your parent SupA for context you were not given.',
      'State the exact question and what you will do with the answer. The request is delivered as a message to your parent; it may answer in a later message.',
      'Do not idle waiting for it: keep working on what you can already do.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The precise context you need.' },
        needed_for: { type: 'string', description: 'What you will do with it, so the parent can judge relevance.' },
      },
      required: ['question'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => textBlocks(String(value ?? '')),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_context_request requires a calling agent')
      const subagents = ctx.get?.('subagents')
      if (!subagents) throw new Error('the subagents service is unavailable')
      const parentId = agent.session?.header?.parentSession
      if (!parentId) throw new Error('this session has no parent SupA; you own your context')

      const text = [
        'Context request from your SupA child.',
        `Question: ${String(args.question)}`,
        args.needed_for ? `Needed for: ${String(args.needed_for)}` : '',
        'Answer with `supa_context_supply` if it changes what the child can do.',
      ].filter(Boolean).join('\n')

      const messageId = await subagents.sendMessage(agent, parentId, textBlocks(text), { signal: exec.signal })
      return `sent context request to parent (${shortId(parentId)}, message ${String(messageId).slice(0, 8)})`
    },
  }

  const supplyTool = {
    name: 'supa_context_supply',
    description: [
      'Send context to a SupA child you started, for example in answer to `supa_context_request`.',
      'The message is delivered to the child as a user message and wakes it if idle.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The child session id returned by `supa_spawn`.' },
        text: { type: 'string', description: 'The context to hand over.' },
      },
      required: ['agent_id', 'text'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => textBlocks(String(value ?? '')),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_context_supply requires a calling agent')
      const subagents = ctx.get?.('subagents')
      if (!subagents) throw new Error('the subagents service is unavailable')
      const messageId = await subagents.sendMessage(agent, String(args.agent_id), textBlocks(String(args.text)), { signal: exec.signal })
      return `delivered context to ${shortId(args.agent_id)} (message ${String(messageId).slice(0, 8)})`
    },
  }

  const authorityTool = {
    name: 'supa_authority',
    description: [
      'Set the authority a direct SupA child may use for the rest of its session: `workspace` (default) or `full`.',
      'A request above a child\'s authority is refused and parked in your queue as a `permission` record; raise the level here, then tell the child to retry.',
      'Authority never flows upward: this cannot exceed your own level. Your own over-level request goes to the human through the normal approval prompt.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Direct child session id.' },
        level: { type: 'string', enum: ['workspace', 'full'], description: 'Authority the child may use.' },
      },
      required: ['agent_id', 'level'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => textBlocks(String(value ?? '')),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_authority requires a calling agent')
      const child = String(args.agent_id)
      const kids = await ctx.get?.('subagents')?.listChildren?.(agent.session.id)
      if (!Array.isArray(kids) || !kids.some((entry) => String(entry.id) === child)) {
        throw new Error(`${shortId(child)} is not a direct child of this session`)
      }
      const parentGrant = grantFor(agent)
      const wanted = args.level === 'full' ? 'full' : 'workspace'
      const effective = wanted === 'full' && parentGrant !== 'full' ? 'workspace' : wanted
      grants.set(child, effective)
      const file = ledgerFileOf(sessionCwd(ctx, agent.session), cfg)
      await recordPermission(file, agent.session.id, 'decision', `Authored ${effective} authority for ${shortId(child)} (holds ${parentGrant}).`)
      if (effective !== wanted) {
        return `authority for ${shortId(child)} set to ${effective}: you hold ${parentGrant}, so "full" must be requested from the human.`
      }
      return `authority for ${shortId(child)} set to ${effective}`
    },
  }

  const statusTool = {
    name: 'supa_status',
    description: 'Report this session\'s SupA state: mode, ledger path and size, open todos, and live children.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          supa: { type: 'boolean' },
          mode: { type: 'string' },
          session: { type: 'string' },
          ledger: { type: 'string' },
          ledgerEntries: { type: 'number' },
          openTodos: { type: 'number' },
          children: { type: 'string' },
          autoApprove: { type: 'boolean' },
          continueWhenBlocked: { type: 'boolean' },
        },
      },
      render: (_args, value) => textBlocks(JSON.stringify(value, null, 2)),
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('supa_status requires a calling agent')
      const session = agent.session
      const cwd = sessionCwd(ctx, session)
      const file = ledgerFileOf(cwd, cfg)
      const records = await readLedger(file)
      let children = 'unavailable'
      try {
        const list = await ctx.get?.('subagents')?.listChildren?.(session.id)
        children = Array.isArray(list) && list.length > 0
          ? list.map((entry) => `${shortId(entry.id)} ${entry.mode ?? ''} ${entry.label ?? ''}`.trim()).join('; ')
          : 'none'
      } catch {
        // leave as unavailable
      }
      return {
        supa: isSupa(agent),
        mode: cfg.mode,
        session: String(session.id),
        ledger: file,
        ledgerEntries: records.length,
        openTodos: openTodosOf(session).length,
        children,
        autoApprove: cfg.autoApprove === true,
        continueWhenBlocked: cfg.continueWhenBlocked === true,
      }
    },
  }

  ctx.effect(() => {
    const disposers = [contextTool, reportTool, inboxTool, modelsTool, spawnTool, requestTool, supplyTool, authorityTool, statusTool]
      .map((definition) => ctx.tools.register(definition))
    return () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          // already unregistered
        }
      }
    }
  })

  log(`active (mode=${cfg.mode}, ledger=${cfg.ledgerDir}, autoApprove=${cfg.autoApprove})`)
}

