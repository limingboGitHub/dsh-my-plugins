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

/** Pathname serving hourly/daily/weekly bucketed time series for the charts. */
const SERIES_ROUTE = '/api/token-usage-stats/series'

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
 * calendar boundaries (a person reading "today" means their own midnight, not
 * a rolling 24 hours). `all` has no bound.
 * @param range - one of `day`, `yesterday`, `day-before`, `week`, `month`, `all`.
 * @param now - the reference instant, in epoch milliseconds.
 * @returns the epoch-millisecond lower bound, or undefined for `all`.
 */
function rangeStart(range, now) {
  if (range === 'all') return undefined
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  if (range === 'day') return date.getTime()
  if (range === 'yesterday') {
    date.setDate(date.getDate() - 1)
    return date.getTime()
  }
  // Closeable "the day before yesterday" — local midnight two days back.
  if (range === 'day-before') {
    date.setDate(date.getDate() - 2)
    return date.getTime()
  }
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

/**
 * Last instant of the local day containing a bound computed by rangeStart.
 * Since every rangeStart result is a local midnight, this is its close.
 * @param ms - a local-midnight epoch millisecond.
 * @returns the instant 23:59:59.999 of that same local day.
 */
function dayEndMs(ms) {
  const d = new Date(ms)
  d.setDate(d.getDate() + 1)
  return d.getTime() - 1
}

/** The range names the HTTP route accepts. */
const RANGES = new Set(['day', 'yesterday', 'day-before', 'week', 'month', 'all'])

/**
 * Day-length named ranges have an inclusive window of that single local day;
 * week/month/all span from their start to now.
 */
const DAY_RANGES = new Set(['day', 'yesterday', 'day-before'])

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

/** Baseline of a local-time 24h day in epoch ms: the local midnight that starts the day containing `ts`. */
function dayStartMs(ts) {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Bucket the ledger into a time series under a named granularity. Each bucket
 * is local-calendar and carries the entry token total (billed tokens across
 * every bucket, the same figure the summary route reports). The returned
 * windows are contiguous and unordered; the browser sorts and labels them.
 * @param entries - every recorded model call.
 * @param grain - `hour` (per-day 0..23 buckets), `day` (one bucket per local day), or `month`.
 * @param maxBuckets - cap on returned windows, newest-first; the rest are dropped.
 * @returns `{ granularity, buckets }` with each bucket `{ key, ts, tokens, calls }`.
 */
function timeSeries(entries, granularity, maxBuckets) {
  const buckets = new Map()

  const startOf = (ts) => {
    const base = dayStartMs(ts)
    if (granularity === 'hour') {
      const hour = new Date(ts).getHours()
      return base + (hour * 3600 * 1000)
    }
    if (granularity === 'month') {
      const date = new Date(ts)
      return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
    }
    return base
  }

  for (const entry of entries) {
    const key = startOf(entry.ts ?? 0)
    const bucket = buckets.get(key)
    if (bucket === undefined) {
      buckets.set(key, { key, ts: key, tokens: entry.totalTokens ?? 0, calls: 1 })
    } else {
      bucket.tokens += entry.totalTokens ?? 0
      bucket.calls += 1
    }
  }

  const ordered = [...buckets.values()].sort((a, b) => b.ts - a.ts)
  const sliced = maxBuckets === undefined ? ordered : ordered.slice(0, maxBuckets)
  return { granularity, buckets: sliced }
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
    const paramsOf = (req) => new URL(req.url ?? '/', 'http://localhost').searchParams

    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: STATS_ROUTE,
      handler: (req, res) => {
        const params = paramsOf(req)
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
          // A single-day range ends at that day's local close; week/month/all
          // run from their start through now.
          to = DAY_RANGES.has(rangeParam) ? dayEndMs(from) : undefined
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

    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: SERIES_ROUTE,
      handler: (req, res) => {
        // Median daily bucket width 24h, 20 buckets ≈ 20 days of history; the
        // month grain slices the always-monotonic ledger to its newest 12
        // calendar months. Newest-first (ts desc) matches the summary mood.
        const params = paramsOf(req)
        const granularityParam = params.get('granularity') ?? 'day'
        if (granularityParam !== 'hour' && granularityParam !== 'day' && granularityParam !== 'month') {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: `unknown granularity: ${granularityParam}` }))
          return
        }
        const maxBucketsParam = params.get('limit')
        let maxBuckets = undefined
        if (maxBucketsParam !== null) {
          const parsed = Number(maxBucketsParam)
          if (!Number.isInteger(parsed) || parsed <= 0) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'limit must be a positive integer' }))
            return
          }
          maxBuckets = parsed
        }

        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify(timeSeries(entries, granularityParam, maxBuckets)))
      },
    }), 'token-usage-stats: series route')
  })
}
