/**
 * Host half of the token-usage-stats plugin.
 *
 * Appends one JSONL record per model call to a ledger file, and serves the
 * aggregated summary over HTTP so the browser half can read it. The browser
 * cannot reach a host cordis service directly (separate processes), and the
 * webserver's fallback only serves the frontend dist — so an explicit route
 * is the only way this data reaches the UI.
 *
 * Since v0.4.0 the ledger schema is versioned (`v: 2`) and each record also
 * carries the device that reported it (`deviceId`), the exact event timestamp
 * (`ts` from the durable event, not `Date.now()`), and timing facts derived
 * from the same event stream (`durationMs`, `firstTokenMs`,
 * `outputTokensPerSec`). When `remoteUrl` is configured, unsynced records are
 * pushed incrementally to that service and the read routes can proxy the
 * remote aggregate (`source=remote`), so several devices share one total while
 * each device keeps its own isolated rows on the server.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir, hostname } from 'node:os'
import { basename, dirname, join } from 'node:path'

/** Pathname serving the aggregated summary to the browser half. */
const STATS_ROUTE = '/api/token-usage-stats'

/** Pathname serving hourly/daily/monthly bucketed time series for the charts. */
const SERIES_ROUTE = '/api/token-usage-stats/series'

/** Pathname serving per-model daily/monthly time series for the trend chart. */
const SERIES_BY_MODEL_ROUTE = '/api/token-usage-stats/series-by-model'

/** Pathname serving device and sync metadata. */
const META_ROUTE = '/api/token-usage-stats/meta'

/** Pathname reading/writing the remotely synced configuration from the settings UI. */
const CONFIG_ROUTE = '/api/token-usage-stats/config'

/** Persisted UI configuration: remoteUrl/remoteToken edited from the settings page. */
const CONFIG_STATE_FILE = 'token-usage-config.json'

/** On-disk ledger line schema written by this version. */
const LEDGER_SCHEMA = 2

/** Remote service paths (the reference server implements these). */
const REMOTE_UPLOAD_PATH = '/api/v1/ledger/upload'
const REMOTE_SUMMARY_PATH = '/api/v1/ledger/summary'
const REMOTE_SERIES_PATH = '/api/v1/ledger/series'
const REMOTE_SERIES_BY_MODEL_PATH = '/api/v1/ledger/series-by-model'

/** Default interval between incremental sync attempts. */
const DEFAULT_SYNC_INTERVAL_MS = 60 * 1000

/** The ledger's default location: the DSH home directory, so the file follows
 * the installation rather than whichever directory DSH happened to start in.
 * @returns the absolute default ledger path.
 */
function defaultLedgerPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'token-usage-ledger.jsonl')
}

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
 * Aggregate ledger entries by provider and by model. Timing fields are
 * averaged over the entries that carry them; a range cut from legacy rows
 * without the fields simply omits the corresponding average.
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
  let reasoningTokens = 0
  let durationSum = 0
  let durationCount = 0
  let firstTokenSum = 0
  let firstTokenCount = 0
  let speedSum = 0
  let speedCount = 0

  for (const entry of entries) {
    totalTokens += entry.totalTokens ?? 0
    inputTokens += entry.inputTokens ?? 0
    outputTokens += entry.outputTokens ?? 0
    cacheReadTokens += entry.cacheReadTokens ?? 0
    cacheWriteTokens += entry.cacheWriteTokens ?? 0
    reasoningTokens += entry.reasoningTokens ?? 0
    if (typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)) {
      durationSum += entry.durationMs
      durationCount += 1
    }
    if (typeof entry.firstTokenMs === 'number' && Number.isFinite(entry.firstTokenMs)) {
      firstTokenSum += entry.firstTokenMs
      firstTokenCount += 1
    }
    if (typeof entry.outputTokensPerSec === 'number' && Number.isFinite(entry.outputTokensPerSec)) {
      speedSum += entry.outputTokensPerSec
      speedCount += 1
    }
    const provider = byProvider.get(entry.provider) ?? { calls: 0, totalTokens: 0, durationMs: 0, durationCount: 0, firstTokenMs: 0, firstTokenCount: 0, outputTokensPerSec: 0, speedCount: 0 }
    provider.calls += 1
    provider.totalTokens += entry.totalTokens
    if (typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)) {
      provider.durationMs += entry.durationMs
      provider.durationCount += 1
    }
    if (typeof entry.firstTokenMs === 'number' && Number.isFinite(entry.firstTokenMs)) {
      provider.firstTokenMs += entry.firstTokenMs
      provider.firstTokenCount += 1
    }
    if (typeof entry.outputTokensPerSec === 'number' && Number.isFinite(entry.outputTokensPerSec)) {
      provider.outputTokensPerSec += entry.outputTokensPerSec
      provider.speedCount += 1
    }
    byProvider.set(entry.provider, provider)

    const modelKey = `${entry.provider}/${entry.model}`
    const model = byModel.get(modelKey) ?? { calls: 0, totalTokens: 0, durationMs: 0, durationCount: 0, firstTokenMs: 0, firstTokenCount: 0, outputTokensPerSec: 0, speedCount: 0 }
    model.calls += 1
    model.totalTokens += entry.totalTokens
    if (typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)) {
      model.durationMs += entry.durationMs
      model.durationCount += 1
    }
    if (typeof entry.firstTokenMs === 'number' && Number.isFinite(entry.firstTokenMs)) {
      model.firstTokenMs += entry.firstTokenMs
      model.firstTokenCount += 1
    }
    if (typeof entry.outputTokensPerSec === 'number' && Number.isFinite(entry.outputTokensPerSec)) {
      model.outputTokensPerSec += entry.outputTokensPerSec
      model.speedCount += 1
    }
    byModel.set(modelKey, model)
  }

  const descending = (a, b) => b.totalTokens - a.totalTokens
  const avg = (sum, count) => (count === 0 ? undefined : Math.round((sum / count) * 10) / 10)
  // Timing averages per breakdown row divide by the rows that actually
  // reported the field, so legacy entries without timing do not dilute them.
  const withTiming = (stats) => ({
    ...stats,
    avgDurationMs: avg(stats.durationMs, stats.durationCount),
    avgFirstTokenMs: avg(stats.firstTokenMs, stats.firstTokenCount),
    avgOutputTokensPerSec: avg(stats.outputTokensPerSec, stats.speedCount),
  })
  return {
    totalCalls: entries.length,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    avgDurationMs: avg(durationSum, durationCount),
    avgFirstTokenMs: avg(firstTokenSum, firstTokenCount),
    avgOutputTokensPerSec: avg(speedSum, speedCount),
    deviceIds: [...new Set(entries.map(entry => entry.deviceId).filter(Boolean))],
    byProvider: [...byProvider].map(([provider, stats]) => ({ provider, ...withTiming(stats) })).sort(descending),
    byModel: [...byModel].map(([model, stats]) => ({ model, ...withTiming(stats) })).sort(descending),
  }
}

/** Inclusive lower timestamp bound for a named range, computed from local
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

/** Inclusive endpoint of a zero-based month: the last instant of `month - 1`. */
function monthEndMs(year, month) {
  // day 0 of the following month is the last day of `month`; hour 23:59 closes it.
  return new Date(year, month, 0, 23, 59, 59, 999).getTime()
}

/**
 * Parse a `YYYY-MM` month range into inclusive epoch bounds.
 * @param ym - a `YYYY-MM` string naming a local calendar month.
 * @returns `{ from, to }` inclusive bounds, or undefined when malformed.
 */
function monthRange(ym) {
  const match = /^(\d{4})-(\d{2})$/.exec(ym)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  if (year < 1000 || year > 9999 || month < 1 || month > 12) return undefined
  return { from: new Date(year, month - 1, 1).getTime(), to: monthEndMs(year, month) }
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

/** The named ranges the HTTP routes accept. */
const NAMED_RANGES = new Set(['day', 'yesterday', 'day-before', 'week', 'month', 'all'])

/** Day-length named ranges have an inclusive window of that single local day;
 * week/month/all span from their start to now. */
const DAY_RANGES = new Set(['day', 'yesterday', 'day-before'])

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

/** Load a small JSON state file, tolerating absence and corruption. */
function loadState(path) {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return undefined
  }
}

/** Persist a small JSON state file; the write is small and idempotent. */
function saveState(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

/** Baseline of a local-time 24h day in epoch ms: the local midnight that starts the day containing `ts`. */
function dayStartMs(ts) {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Inclusive local-month start for a timestamp: the first instant of its month. */
function monthStartMs(ts) {
  const date = new Date(ts)
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

/** The bucket start containing `ts` under a granularity, in epoch ms. */
function bucketStart(ts, granularity) {
  const base = dayStartMs(ts)
  if (granularity === 'hour') {
    return base + new Date(ts).getHours() * 3600 * 1000
  }
  if (granularity === 'month') return monthStartMs(ts)
  return base
}

/**
 * Step a bucket start by `delta` buckets under a granularity. Date arithmetic
 * keeps the result a true calendar boundary across DST transitions.
 */
function stepBucket(ts, delta, granularity) {
  const date = new Date(ts)
  if (granularity === 'month') date.setMonth(date.getMonth() + delta)
  else if (granularity === 'hour') date.setHours(date.getHours() + delta)
  else date.setDate(date.getDate() + delta)
  return date.getTime()
}

/**
 * Bucket the ledger into a CONTIGUOUS time series under a named granularity.
 * Windows with no recorded entry are present with `tokens: 0, calls: 0`, so
 * charts never "skip" an idle day. The series spans from the earliest recorded
 * bucket (or `maxBuckets` windows back from now when `maxBuckets` is given)
 * through the newest window, which is the current window: `day` ends today,
 * `month` ends this month, `hour` ends the current hour. Every bucket is
 * local-calendar. The returned windows are newest-first; the browser sorts and
 * labels them.
 * @param entries - every recorded model call.
 * @param grain - `hour`, `day`, or `month`.
 * @param maxBuckets - optional cap on returned windows, newest-first.
 * @returns `{ granularity, buckets }` with each bucket `{ key, ts, tokens, calls }`.
 */
function timeSeries(entries, granularity, maxBuckets) {
  const byKey = new Map()
  for (const entry of entries) {
    const ts = typeof entry.ts === 'number' ? entry.ts : 0
    const key = bucketStart(ts, granularity)
    const bucket = byKey.get(key)
    if (bucket === undefined) {
      byKey.set(key, {
        key,
        ts: key,
        tokens: entry.totalTokens ?? 0,
        calls: 1,
        speedSum: typeof entry.outputTokensPerSec === 'number' && Number.isFinite(entry.outputTokensPerSec) ? entry.outputTokensPerSec : 0,
        speedCount: typeof entry.outputTokensPerSec === 'number' && Number.isFinite(entry.outputTokensPerSec) ? 1 : 0,
      })
    } else {
      bucket.tokens += entry.totalTokens ?? 0
      bucket.calls += 1
      if (typeof entry.outputTokensPerSec === 'number' && Number.isFinite(entry.outputTokensPerSec)) {
        bucket.speedSum += entry.outputTokensPerSec
        bucket.speedCount += 1
      }
    }
  }

  const lastBucket = bucketStart(Date.now(), granularity)
  let firstBucket
  if (maxBuckets !== undefined && maxBuckets > 0) {
    firstBucket = stepBucket(lastBucket, -(maxBuckets - 1), granularity)
  } else {
    firstBucket = byKey.size === 0
      ? lastBucket
      : stepBucket(Math.min(...byKey.keys()), 0, granularity)
  }

  const buckets = []
  for (let ts = firstBucket; ts <= lastBucket; ts = stepBucket(ts, 1, granularity)) {
    const existing = byKey.get(ts)
    if (existing !== undefined) {
      // Average output speed of the calls inside this window; absent (null)
      // when no call in the window reported one.
      existing.avgTokensPerSec = existing.speedCount === 0
        ? null
        : Math.round((existing.speedSum / existing.speedCount) * 10) / 10
      delete existing.speedSum
      delete existing.speedCount
      buckets.push(existing)
    } else {
      buckets.push({ key: ts, ts, tokens: 0, calls: 0, avgTokensPerSec: null })
    }
  }
  buckets.reverse() // newest-first, matching the pre-continuity contract
  return { granularity, buckets }
}

/**
 * Per-model time series over one shared contiguous window. The window logic
 * mirrors {@link timeSeries}; every series shares the same bucket list so a
 * multi-model chart aligns its bars.
 * @param entries - every recorded model call.
 * @param granularity - `hour`, `day`, or `month`.
 * @param maxBuckets - optional cap on returned windows, newest-first.
 * @returns `{ granularity, buckets, series }` with one entry per model.
 */
function seriesByModel(entries, granularity, maxBuckets) {
  const byModel = new Map()
  for (const entry of entries) {
    const modelKey = `${entry.provider}/${entry.model}`
    let model = byModel.get(modelKey)
    if (model === undefined) {
      model = { model: modelKey, buckets: new Map() }
      byModel.set(modelKey, model)
    }
    const ts = typeof entry.ts === 'number' ? entry.ts : 0
    const key = bucketStart(ts, granularity)
    const bucket = model.buckets.get(key)
    if (bucket === undefined) {
      model.buckets.set(key, { tokens: entry.totalTokens ?? 0, calls: 1 })
    } else {
      bucket.tokens += entry.totalTokens ?? 0
      bucket.calls += 1
    }
  }

  const lastBucket = bucketStart(Date.now(), granularity)
  let firstBucket
  if (maxBuckets !== undefined && maxBuckets > 0) {
    firstBucket = stepBucket(lastBucket, -(maxBuckets - 1), granularity)
  } else {
    firstBucket = byModel.size === 0
      ? lastBucket
      : Math.min(...[...byModel.values()].map(model => Math.min(...model.buckets.keys())))
  }

  const windowKeys = []
  for (let ts = firstBucket; ts <= lastBucket; ts = stepBucket(ts, 1, granularity)) windowKeys.push(ts)

  const series = [...byModel.values()].map((model) => {
    const buckets = windowKeys.map((key) => {
      const entry = model.buckets.get(key)
      return entry === undefined ? { key, ts: key, tokens: 0, calls: 0 } : { key, ts: key, ...entry }
    })
    buckets.reverse()
    const totalTokens = buckets.reduce((sum, bucket) => sum + bucket.tokens, 0)
    return { model: model.model, totalTokens, buckets }
  })
  series.sort((a, b) => b.totalTokens - a.totalTokens)
  // The shared window and every series share ONE order (newest-first, like the
  // plain timeSeries), so charts map bucket index to the same date everywhere.
  return { granularity, buckets: windowKeys.map(key => ({ key, ts: key })).reverse(), series }
}

/** Resolve the device identity: config override, persisted file, or a fresh UUID. */
function ensureDevice(config) {
  const statePath = join(dirname(config.ledgerPath ?? defaultLedgerPath()), 'token-usage-device.json')
  const existing = loadState(statePath)
  const deviceId = config.deviceId ?? existing?.deviceId ?? `dev-${randomUUID()}`
  const deviceName = config.deviceName ?? existing?.deviceName ?? hostname()
  if (existing?.deviceId !== deviceId || existing?.deviceName !== deviceName) {
    saveState(statePath, { deviceId, deviceName })
  }
  return { deviceId, deviceName }
}

/** Load the persisted sync watermark, or seed a fresh one. */
function loadSyncWatermark(ledgerPath, remoteUrl, deviceId) {
  const existing = loadState(join(dirname(ledgerPath), 'token-usage-sync.json'))
  if (existing !== undefined
    && existing.remoteUrl === remoteUrl
    && existing.deviceId === deviceId
    && Number.isInteger(existing.pushedCount)
    && existing.pushedCount >= 0) {
    return existing
  }
  return { remoteUrl, deviceId, pushedCount: 0, lastSyncAt: undefined, lastError: undefined }
}

/** Build one ledger entry from an assistant/message event and per-session timing. */
function buildEntry(session, config, route, timing, usage) {
  const ts = timing?.messageTime ?? Date.now()
  const entry = {
    type: 'model-call',
    v: LEDGER_SCHEMA,
    ts,
    iso: new Date(ts).toISOString(),
    deviceId: config.deviceId,
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
  if (timing !== undefined) {
    if (typeof timing.durationMs === 'number' && Number.isFinite(timing.durationMs)) {
      entry.durationMs = Math.round(timing.durationMs * 10) / 10
    }
    if (typeof timing.firstTokenMs === 'number' && Number.isFinite(timing.firstTokenMs)) {
      entry.firstTokenMs = Math.round(timing.firstTokenMs * 10) / 10
    }
    if (typeof timing.outputTokensPerSec === 'number' && Number.isFinite(timing.outputTokensPerSec)) {
      entry.outputTokensPerSec = Math.round(timing.outputTokensPerSec * 10) / 10
    }
  }
  const cwd = session?.header?.cwd
  if (typeof cwd === 'string' && cwd.length > 0) {
    entry.workspacePath = cwd
    entry.workspaceTitle = basename(cwd)
  }
  return entry
}

/** Compute timing facts for one completed call from its step timeline. */
function stepTiming(step) {
  if (step === undefined || typeof step.headerTime !== 'number') return undefined
  const messageTime = step.messageTime
  const durationMs = messageTime - step.headerTime
  const firstTokenMs = typeof step.firstChunkTime === 'number'
    ? step.firstChunkTime - step.headerTime
    : undefined
  let outputTokensPerSec
  if (typeof firstTokenMs === 'number' && firstTokenMs >= 0 && step.outputTokens > 0) {
    const streamMs = messageTime - step.firstChunkTime
    if (streamMs > 0) outputTokensPerSec = (step.outputTokens / streamMs) * 1000
  }
  return { messageTime, durationMs, firstTokenMs, outputTokensPerSec }
}

export function apply(ctx, config = {}) {
  const ledgerPath = config?.ledgerPath ?? defaultLedgerPath()
  mkdirSync(dirname(ledgerPath), { recursive: true })
  const entries = loadLedger(ledgerPath)
  ctx.logger?.info?.(`token-usage-stats: loaded ${entries.length} records from ${ledgerPath}`)

  const device = ensureDevice(config)
  const configPath = join(dirname(ledgerPath), CONFIG_STATE_FILE)
  const normalizeRemoteUrl = (value) => typeof value === 'string' && value.length > 0
    ? value.replace(/\/+$/, '')
    : undefined
  const normalizeRemoteToken = (value) => typeof value === 'string' && value.length > 0
    ? value
    : undefined

  // Remote settings are mutable: a persisted UI value wins over the cordis
  // config, so the settings page can enable/change sync without a restart.
  const persistedConfig = loadState(configPath) ?? {}
  let remoteUrl = normalizeRemoteUrl(persistedConfig.remoteUrl ?? config.remoteUrl)
  let remoteToken = persistedConfig.remoteToken !== undefined
    ? normalizeRemoteToken(persistedConfig.remoteToken)
    : normalizeRemoteToken(config.remoteToken)
  const effectiveConfig = { ...config, deviceId: device.deviceId, deviceName: device.deviceName }

  let sync = loadSyncWatermark(ledgerPath, remoteUrl, device.deviceId)
  let inFlightSync = false
  let syncHandle = undefined

  const persistSync = () => saveState(join(dirname(ledgerPath), 'token-usage-sync.json'), sync)

  /** Push every entry after the watermark to the remote service, once. */
  const pushPending = async () => {
    if (remoteUrl === undefined || inFlightSync) return
    if (sync.pushedCount >= entries.length) return
    inFlightSync = true
    try {
      const rows = entries.slice(sync.pushedCount)
      const response = await fetch(`${remoteUrl}${REMOTE_UPLOAD_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(remoteToken === undefined ? {} : { authorization: `Bearer ${remoteToken}` }),
        },
        body: JSON.stringify({ deviceId: device.deviceId, deviceName: device.deviceName, rows }),
      })
      if (!response.ok) throw new Error(`remote sync HTTP ${response.status}`)
      sync = { ...sync, pushedCount: entries.length, lastSyncAt: Date.now(), lastError: undefined }
      persistSync()
    } catch (error) {
      sync = { ...sync, lastError: error instanceof Error ? error.message : String(error) }
      persistSync()
    } finally {
      inFlightSync = false
    }
  }

  const startSyncTimer = () => {
    if (syncHandle !== undefined || remoteUrl === undefined) return
    const intervalMs = config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS
    const handle = setInterval(() => { void pushPending() }, intervalMs)
    syncHandle = { clear: () => clearInterval(handle) }
  }
  const stopSyncTimer = () => {
    if (syncHandle !== undefined) {
      syncHandle.clear()
      syncHandle = undefined
    }
  }

  /** Apply a remote-config edit from the settings UI and persist it. */
  const applyRemoteConfig = ({ remoteUrl: nextUrl, remoteToken: nextToken }) => {
    const nextRemote = normalizeRemoteUrl(nextUrl ?? remoteUrl)
    const urlChanged = nextRemote !== remoteUrl
    remoteUrl = nextRemote
    if (nextToken !== undefined) remoteToken = normalizeRemoteToken(nextToken)
    saveState(configPath, { remoteUrl: remoteUrl ?? '', remoteToken: remoteToken ?? '' })
    if (urlChanged) {
      // The sync watermark is keyed by remoteUrl; changing it reseeds the
      // push cursor so a different destination starts from the full ledger.
      sync = loadSyncWatermark(ledgerPath, remoteUrl, device.deviceId)
      persistSync()
      stopSyncTimer()
      startSyncTimer()
    }
  }

  // Push on an interval so rows leave the machine even when no reader asks.
  // cordis provides no ctx.setInterval on the host; a plain global timer
  // registered through ctx.effect is disposed together with this fiber.
  ctx.effect(() => stopSyncTimer)
  startSyncTimer()

  // Latest logged call config and step timeline per session. `assistant/message`
  // carries usage but not the route that produced it; `request/header` carries
  // the route and its exact event time. A WeakMap keeps no session alive and
  // needs no explicit cleanup.
  const timelineBySession = new WeakMap()

  ctx.on('session/event', (session, event) => {
    let timeline = timelineBySession.get(session)
    if (timeline === undefined) {
      timeline = { route: undefined, step: undefined }
      timelineBySession.set(session, timeline)
    }

    if (event.type === 'request/header') {
      const callConfig = event.data.header?.config
      if (callConfig !== undefined) {
        timeline.route = { provider: callConfig.provider, model: callConfig.model }
        timeline.step = { headerTime: event.time, firstChunkTime: undefined, messageTime: undefined, outputTokens: 0 }
      }
      return
    }
    if (event.type === 'assistant/chunk') {
      const step = timeline.step
      if (step === undefined) return
      if (step.firstChunkTime === undefined) step.firstChunkTime = event.time
      const chunk = event.data.chunk
      if (chunk?.type === 'usage' && typeof chunk.usage?.outputTokens === 'number') {
        step.outputTokens = chunk.usage.outputTokens
      }
      return
    }
    if (event.type !== 'assistant/message') return
    const usage = event.data.usage
    if (usage === undefined) return

    const step = timeline.step
    if (step !== undefined) step.messageTime = event.time
    const timing = stepTiming(step)
    const entry = buildEntry(session, effectiveConfig, timeline.route, timing, usage)

    entries.push(entry)
    try {
      appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, 'utf-8')
    } catch (error) {
      ctx.logger?.warn?.(error)
    }
    // The step is complete; the next request/header opens a fresh timeline.
    timeline.step = undefined
  })

  // The browser half reads the summary from here.
  ctx.inject(['webServer'], (httpCtx) => {
    const paramsOf = (req) => new URL(req.url ?? '/', 'http://localhost').searchParams

    /** True when the caller asks for the remote aggregate view. */
    const wantsRemote = (params) => {
      const source = params.get('source') ?? 'local'
      return source === 'remote' || source === 'all'
    }

    /** Forward a read to the remote service, translating 4xx/5xx verbatim. */
    const proxyRemote = async (req, res, pathname, searchParams) => {
      if (remoteUrl === undefined) {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'remoteUrl is not configured' }))
        return
      }
      try {
        const query = searchParams.toString()
        const url = `${remoteUrl}${pathname}${query.length > 0 ? `?${query}` : ''}`
        const response = await fetch(url, {
          headers: {
            accept: 'application/json',
            ...(remoteToken === undefined ? {} : { authorization: `Bearer ${remoteToken}` }),
          },
        })
        const text = await response.text()
        res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(text)
      } catch (error) {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: `remote fetch failed: ${error instanceof Error ? error.message : String(error)}` }))
      }
    }

    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: STATS_ROUTE,
      handler: async (req, res) => {
        const params = paramsOf(req)
        if (wantsRemote(params)) return proxyRemote(req, res, REMOTE_SUMMARY_PATH, params)

        const rangeParam = params.get('range')
        const fromParam = params.get('from')
        const toParam = params.get('to')

        let from, to, label
        if (fromParam !== null || toParam !== null) {
          // Custom date range: from/to are YYYY-MM-DD in local time.
          // Parse as local midnight, not UTC.
          from = fromParam !== null ? new Date(`${fromParam}T00:00:00`).getTime() : undefined
          to = toParam !== null ? new Date(`${toParam}T23:59:59.999`).getTime() : undefined
          if ((from !== undefined && Number.isNaN(from)) || (to !== undefined && Number.isNaN(to))) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'invalid date format (expected YYYY-MM-DD)' }))
            return
          }
          label = 'custom'
        } else if (rangeParam !== null) {
          // A `YYYY-MM` value selects one local calendar month directly.
          if (/^\d{4}-\d{2}$/.test(rangeParam)) {
            const bounded = monthRange(rangeParam)
            if (bounded === undefined) {
              res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: `unknown range: ${rangeParam}` }))
              return
            }
            from = bounded.from
            to = bounded.to
            label = rangeParam
          } else {
            if (!NAMED_RANGES.has(rangeParam)) {
              res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: `unknown range: ${rangeParam}` }))
              return
            }
            from = rangeStart(rangeParam, Date.now())
            // A single-day range ends at that day's local close; week/month/all
            // run from their start through now.
            to = DAY_RANGES.has(rangeParam) ? dayEndMs(from) : undefined
            label = rangeParam
          }
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
      handler: async (req, res) => {
        const params = paramsOf(req)
        if (wantsRemote(params)) return proxyRemote(req, res, REMOTE_SERIES_PATH, params)

        const granularityParam = params.get('granularity') ?? 'day'
        if (granularityParam !== 'hour' && granularityParam !== 'day' && granularityParam !== 'month') {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: `unknown granularity: ${granularityParam}` }))
          return
        }
        const maxBucketsParam = params.get('limit')
        let maxBuckets
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

    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: SERIES_BY_MODEL_ROUTE,
      handler: async (req, res) => {
        const params = paramsOf(req)
        if (wantsRemote(params)) return proxyRemote(req, res, REMOTE_SERIES_BY_MODEL_PATH, params)

        const granularityParam = params.get('granularity') ?? 'day'
        if (granularityParam !== 'hour' && granularityParam !== 'day' && granularityParam !== 'month') {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: `unknown granularity: ${granularityParam}` }))
          return
        }
        const maxBucketsParam = params.get('limit')
        let maxBuckets
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
        res.end(JSON.stringify(seriesByModel(entries, granularityParam, maxBuckets)))
      },
    }), 'token-usage-stats: series-by-model route')

    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: META_ROUTE,
      handler: (req, res) => {
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify({
          schemaVersion: LEDGER_SCHEMA,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          ledgerPath,
          entryCount: entries.length,
          sync: {
            enabled: remoteUrl !== undefined,
            remoteUrl: remoteUrl ?? null,
            pushedCount: sync.pushedCount,
            pendingCount: Math.max(0, entries.length - sync.pushedCount),
            lastSyncAt: sync.lastSyncAt ?? null,
            lastError: sync.lastError ?? null,
          },
        }))
      },
    }), 'token-usage-stats: meta route')

    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: CONFIG_ROUTE,
      handler: async (req, res) => {
        if (req.method === 'GET') {
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify({
            remoteUrl: remoteUrl ?? '',
            remoteUrlSet: remoteUrl !== undefined,
            remoteTokenSet: remoteToken !== undefined,
            syncIntervalMs: config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
          }))
          return
        }
        if (req.method !== 'PUT') {
          res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'method not allowed' }))
          return
        }
        try {
          let body = ''
          for await (const chunk of req) body += chunk
          const parsed = JSON.parse(body)
          if (parsed === null || typeof parsed !== 'object') {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'expected a JSON object { remoteUrl?, remoteToken? }' }))
            return
          }
          const nextUrl = parsed.remoteUrl
          const nextToken = parsed.remoteToken
          if (nextUrl !== undefined && typeof nextUrl !== 'string') {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'remoteUrl must be a string' }))
            return
          }
          if (nextToken !== undefined && typeof nextToken !== 'string') {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'remoteToken must be a string' }))
            return
          }
          applyRemoteConfig({ remoteUrl: nextUrl, remoteToken: nextToken })
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify({
            remoteUrl: remoteUrl ?? '',
            remoteUrlSet: remoteUrl !== undefined,
            remoteTokenSet: remoteToken !== undefined,
            syncIntervalMs: config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
          }))
        } catch (error) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: `bad request: ${error instanceof Error ? error.message : String(error)}` }))
        }
      },
    }), 'token-usage-stats: config route')
  })
}

// Exported pure functions: used by the smoke test and kept available to
// embedding consumers; the reference server mirrors them for standalone use.
export { timeSeries, seriesByModel, summarize, monthRange }