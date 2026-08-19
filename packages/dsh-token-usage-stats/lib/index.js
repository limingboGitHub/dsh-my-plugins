/**
 * Host half of the token-usage-stats plugin.
 *
 * Appends one JSONL record per model call to a ledger file, and serves the
 * aggregated summary over HTTP so the browser half can read it. The browser
 * cannot reach a host cordis service directly (separate processes), and the
 * webserver's fallback only serves the frontend dist — so an explicit route
 * is the only way this data reaches the UI.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Pathname serving the aggregated summary to the browser half. */
const STATS_ROUTE = '/api/token-usage-stats'

/**
 * Token counts in TokenUsage are disjoint (billed input is the sum of
 * uncached input plus both cache buckets), so the total is a plain sum.
 * reasoningTokens is already part of outputTokens and must not be added.
 * @param usage - the TokenUsage record from an assistant/message event.
 * @returns total billed tokens for the call.
 */
function totalOf(usage) {
  return usage.inputTokens
    + usage.outputTokens
    + (usage.cacheReadTokens ?? 0)
    + (usage.cacheWriteTokens ?? 0)
}

/**
 * Aggregate ledger entries by provider and by model.
 * @param entries - every recorded model call.
 * @returns totals plus per-provider and per-model breakdowns.
 */
function summarize(entries) {
  const byProvider = new Map()
  const byModel = new Map()
  let totalTokens = 0
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0

  for (const entry of entries) {
    totalTokens += entry.totalTokens ?? 0
    inputTokens += entry.inputTokens ?? 0
    outputTokens += entry.outputTokens ?? 0
    cacheReadTokens += entry.cacheReadTokens ?? 0
    cacheWriteTokens += entry.cacheWriteTokens ?? 0
    const provider = byProvider.get(entry.provider) ?? { calls: 0, totalTokens: 0 }
    provider.calls += 1
    provider.totalTokens += entry.totalTokens
    byProvider.set(entry.provider, provider)

    const modelKey = `${entry.provider}/${entry.model}`
    const model = byModel.get(modelKey) ?? { calls: 0, totalTokens: 0 }
    model.calls += 1
    model.totalTokens += entry.totalTokens
    byModel.set(modelKey, model)
  }

  const descending = (a, b) => b.totalTokens - a.totalTokens
  return {
    totalCalls: entries.length,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    byProvider: [...byProvider].map(([provider, stats]) => ({ provider, ...stats })).sort(descending),
    byModel: [...byModel].map(([model, stats]) => ({ model, ...stats })).sort(descending),
  }
}

/**
 * Inclusive lower timestamp bound for a named range, computed from local
 * calendar boundaries (a person reading "今日" means their own midnight, not
 * a rolling 24 hours). `all` has no bound.
 * @param range - one of `day`, `week`, `month`, `all`.
 * @param now - the reference instant, in epoch milliseconds.
 * @returns the epoch-millisecond lower bound, or undefined for `all`.
 */
function rangeStart(range, now) {
  if (range === 'all') return undefined
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  if (range === 'day') return date.getTime()
  if (range === 'week') {
    // ISO weeks start Monday; getDay() is 0 for Sunday.
    const weekday = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - weekday)
    return date.getTime()
  }
  if (range === 'month') {
    date.setDate(1)
    return date.getTime()
  }
  return undefined
}

/** The range names the HTTP route accepts. */
const RANGES = new Set(['day', 'week', 'month', 'all'])

/**
 * The ledger's default location: the DSH home directory, so the file follows
 * the installation rather than whichever directory DSH happened to start in.
 * @returns the absolute default ledger path.
 */
function defaultLedgerPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'token-usage-ledger.jsonl')
}

/** Read the ledger file back into memory, skipping any truncated trailing line. */
function loadLedger(ledgerPath) {
  if (!existsSync(ledgerPath)) return []
  const entries = []
  for (const line of readFileSync(ledgerPath, 'utf-8').split('\n')) {
    if (line.trim() === '') continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      // A partially-flushed final line: the next append rewrites past it.
    }
  }
  return entries
}

export function apply(ctx, config) {
  const ledgerPath = config?.ledgerPath ?? defaultLedgerPath()
  mkdirSync(dirname(ledgerPath), { recursive: true })
  const entries = loadLedger(ledgerPath)
  ctx.logger?.info?.(`token-usage-stats: loaded ${entries.length} records from ${ledgerPath}`)

  // Latest logged call config per session. `assistant/message` carries usage
  // but not the route that produced it; `request/header` carries the route.
  const configBySession = new Map()

  ctx.on('session/event', (session, event) => {
    if (event.type === 'request/header') {
      const config = event.data.header?.config
      if (config !== undefined) {
        configBySession.set(session.id, { provider: config.provider, model: config.model })
      }
      return
    }
    if (event.type !== 'assistant/message') return
    const usage = event.data.usage
    if (usage === undefined) return

    const route = configBySession.get(session.id)
    const ts = Date.now()
    const entry = {
      type: 'model-call',
      ts,
      iso: new Date(ts).toISOString(),
      sessionId: session.id,
      provider: route?.provider ?? 'unknown',
      model: route?.model ?? 'unknown',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      reasoningTokens: usage.reasoningTokens ?? 0,
      totalTokens: totalOf(usage),
    }

    entries.push(entry)
    try {
      appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, 'utf-8')
    } catch (error) {
      ctx.logger?.warn?.(error)
    }
  })

  // The browser half reads the summary from here.
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: STATS_ROUTE,
      handler: (req, res) => {
        // `req.url` is a path-relative target; the base only satisfies the parser.
        const params = new URL(req.url ?? '/', 'http://localhost').searchParams
        const rangeParam = params.get('range')
        const fromParam = params.get('from')
        const toParam = params.get('to')

        let from, to, label
        if (fromParam !== null || toParam !== null) {
          // Custom date range: from/to are YYYY-MM-DD in local time.
          // Parse as local midnight, not UTC.
          from = fromParam !== null ? new Date(fromParam + 'T00:00:00').getTime() : undefined
          to = toParam !== null ? new Date(toParam + 'T23:59:59.999').getTime() : undefined
          if ((from !== undefined && isNaN(from)) || (to !== undefined && isNaN(to))) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'invalid date format (expected YYYY-MM-DD)' }))
            return
          }
          label = 'custom'
        } else if (rangeParam !== null) {
          // Named range
          if (!RANGES.has(rangeParam)) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: `unknown range: ${rangeParam}` }))
            return
          }
          from = rangeStart(rangeParam, Date.now())
          to = undefined
          label = rangeParam
        } else {
          // Default to all
          from = undefined
          to = undefined
          label = 'all'
        }

        const scoped = entries.filter(entry => {
          if (from !== undefined && entry.ts < from) return false
          if (to !== undefined && entry.ts > to) return false
          return true
        })

        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify({ range: label, ...summarize(scoped) }))
      },
    }), 'token-usage-stats: summary route')
  })
}
