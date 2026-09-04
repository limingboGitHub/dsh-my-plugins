/**
 * Reference remote aggregator for the token-usage-stats plugin.
 *
 * A zero-dependency Node http server: devices push their ledger rows to
 * `POST /api/v1/ledger/upload`; rows are stored per device in the data
 * directory as JSONL (`<deviceId>.jsonl`), and the read routes aggregate
 * across devices (or a single one via `devices=`). The plugin's client half
 * proxies its `source=remote` queries here. This server never mutates rows.
 *
 * Run: `node server/index.js` (see env vars below).
 *
 * The bucket/summary functions below are deliberately copied from the
 * plugin's `lib/index.js` so both sides produce identical numbers; keep the
 * two copies in sync when changing aggregation semantics.
 *
 * Environment:
 *   PORT            listen port (default 8787)
 *   DSH_TS_DATA_DIR data directory (default ./data next to this file)
 *   DSH_TS_TOKEN    optional bearer token; when set, every route requires
 *                   `Authorization: Bearer <token>`
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT ?? 8787)
const DATA_DIR = process.env.DSH_TS_DATA_DIR ?? join(__dirname, 'data')
const TOKEN = process.env.DSH_TS_TOKEN

mkdirSync(DATA_DIR, { recursive: true })

// --- pure aggregation logic (mirror of the plugin's lib/index.js) ---

/** The bucket start containing `ts` under a granularity, in epoch ms. */
function dayStartMs(ts) {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function monthStartMs(ts) {
  const date = new Date(ts)
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

function bucketStart(ts, granularity) {
  const base = dayStartMs(ts)
  if (granularity === 'hour') {
    return base + new Date(ts).getHours() * 3600 * 1000
  }
  if (granularity === 'month') return monthStartMs(ts)
  return base
}

function stepBucket(ts, delta, granularity) {
  const date = new Date(ts)
  if (granularity === 'month') date.setMonth(date.getMonth() + delta)
  else if (granularity === 'hour') date.setHours(date.getHours() + delta)
  else date.setDate(date.getDate() + delta)
  return date.getTime()
}

function rangeStart(range, now) {
  if (range === 'all') return undefined
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  if (range === 'day') return date.getTime()
  if (range === 'yesterday') {
    date.setDate(date.getDate() - 1)
    return date.getTime()
  }
  if (range === 'day-before') {
    date.setDate(date.getDate() - 2)
    return date.getTime()
  }
  if (range === 'week') {
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

function monthEndMs(year, month) {
  return new Date(year, month, 0, 23, 59, 59, 999).getTime()
}

function monthRange(ym) {
  const match = /^(\d{4})-(\d{2})$/.exec(ym)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  if (year < 1000 || year > 9999 || month < 1 || month > 12) return undefined
  return { from: new Date(year, month - 1, 1).getTime(), to: monthEndMs(year, month) }
}

function dayEndMs(ms) {
  const d = new Date(ms)
  d.setDate(d.getDate() + 1)
  return d.getTime() - 1
}

const NAMED_RANGES = new Set(['day', 'yesterday', 'day-before', 'week', 'month', 'all'])
const DAY_RANGES = new Set(['day', 'yesterday', 'day-before'])

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
  const avg = (sum, count) => (count === 0 ? undefined : Math.round((sum / count) * 10) / 10)
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
    byProvider: [...byProvider].map(([provider, stats]) => ({ provider, ...stats })).sort(descending),
    byModel: [...byModel].map(([model, stats]) => ({ model, ...stats })).sort(descending),
  }
}

function timeSeries(entries, granularity, maxBuckets) {
  const byKey = new Map()
  for (const entry of entries) {
    const ts = typeof entry.ts === 'number' ? entry.ts : 0
    const key = bucketStart(ts, granularity)
    const bucket = byKey.get(key)
    if (bucket === undefined) {
      byKey.set(key, { key, ts: key, tokens: entry.totalTokens ?? 0, calls: 1 })
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
    firstBucket = byKey.size === 0
      ? lastBucket
      : stepBucket(Math.min(...byKey.keys()), 0, granularity)
  }

  const buckets = []
  for (let ts = firstBucket; ts <= lastBucket; ts = stepBucket(ts, 1, granularity)) {
    const existing = byKey.get(ts)
    buckets.push(existing ?? { key: ts, ts, tokens: 0, calls: 0 })
  }
  buckets.reverse()
  return { granularity, buckets }
}

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
  return { granularity, buckets: windowKeys.map(key => ({ key, ts: key })).reverse(), series }
}

// --- storage ---

const deviceFile = (deviceId) => join(DATA_DIR, `${deviceId}.jsonl`)

/** Read every device's rows, optionally restricted to one device id. */
function readAll(deviceId) {
  const entries = []
  const wanted = deviceId === undefined ? null : deviceId
  for (const name of readdirSync(DATA_DIR)) {
    if (!name.endsWith('.jsonl')) continue
    if (wanted !== null && name !== `${wanted}.jsonl`) continue
    const path = join(DATA_DIR, name)
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      if (line.trim() === '') continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        // tolerate a truncated final line from a crash mid-append
      }
    }
  }
  return entries
}

/** Device listing with per-device counts. */
function listDevices() {
  const devices = new Map()
  for (const name of readdirSync(DATA_DIR)) {
    if (!name.endsWith('.jsonl')) continue
    const deviceId = name.slice(0, -'.jsonl'.length)
    let count = 0
    let firstTs = undefined
    let lastTs = undefined
    for (const line of readFileSync(join(DATA_DIR, name), 'utf-8').split('\n')) {
      if (line.trim() === '') continue
      try {
        const entry = JSON.parse(line)
        count += 1
        if (typeof entry.ts === 'number') {
          if (firstTs === undefined || entry.ts < firstTs) firstTs = entry.ts
          if (lastTs === undefined || entry.ts > lastTs) lastTs = entry.ts
        }
      } catch {
        // tolerate a truncated final line
      }
    }
    devices.set(deviceId, { deviceId, entryCount: count, firstTs, lastTs })
  }
  return [...devices.values()].sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0))
}

// --- http plumbing ---

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function authorized(req) {
  if (TOKEN === undefined) return true
  const headerValue = req.headers.authorization
  return typeof headerValue === 'string' && headerValue === `Bearer ${TOKEN}`
}

const server = createServer(async (req, res) => {
  if (!authorized(req)) {
    sendJson(res, 401, { error: 'unauthorized' })
    return
  }
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname

  if (req.method === 'POST' && path === '/api/v1/ledger/upload') {
    try {
      const body = JSON.parse(await readBody(req))
      const { deviceId, rows } = body
      if (typeof deviceId !== 'string' || deviceId.length === 0 || !Array.isArray(rows)) {
        sendJson(res, 400, { error: 'expected { deviceId, rows }' })
        return
      }
      if (/[^A-Za-z0-9._-]/.test(deviceId)) {
        sendJson(res, 400, { error: 'deviceId contains invalid characters' })
        return
      }
      const file = deviceFile(deviceId)
      mkdirSync(DATA_DIR, { recursive: true })
      const valid = rows.filter(row => row !== null && typeof row === 'object' && typeof row.ts === 'number')
      for (const row of valid) appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf-8')
      sendJson(res, 200, { accepted: valid.length, deviceId })
    } catch (error) {
      sendJson(res, 400, { error: `bad request: ${error instanceof Error ? error.message : String(error)}` })
    }
    return
  }

  if (req.method !== 'GET' || !path.startsWith('/api/v1/ledger/')) {
    sendJson(res, 404, { error: 'not found' })
    return
  }

  const params = url.searchParams
  const devicesParam = params.get('devices')
  const singleDevice = devicesParam !== null && devicesParam !== 'all' ? devicesParam : undefined

  const scopeByRange = () => {
    const rangeParam = params.get('range')
    const fromParam = params.get('from')
    const toParam = params.get('to')
    let from, to
    if (fromParam !== null || toParam !== null) {
      from = fromParam !== null ? new Date(`${fromParam}T00:00:00`).getTime() : undefined
      to = toParam !== null ? new Date(`${toParam}T23:59:59.999`).getTime() : undefined
      if ((from !== undefined && Number.isNaN(from)) || (to !== undefined && Number.isNaN(to))) return undefined
    } else if (rangeParam !== null) {
      if (/^\d{4}-\d{2}$/.test(rangeParam)) {
        const bounded = monthRange(rangeParam)
        if (bounded === undefined) return undefined
        from = bounded.from
        to = bounded.to
      } else if (NAMED_RANGES.has(rangeParam)) {
        from = rangeStart(rangeParam, Date.now())
        to = DAY_RANGES.has(rangeParam) ? dayEndMs(from) : undefined
      } else {
        return undefined
      }
    }
    return { from, to }
  }

  const scopedEntries = (entries) => {
    const bounds = scopeByRange()
    if (bounds === undefined) return undefined
    return entries.filter(entry => {
      if (bounds.from !== undefined && entry.ts < bounds.from) return false
      if (bounds.to !== undefined && entry.ts > bounds.to) return false
      return true
    })
  }

  if (path === '/api/v1/ledger/summary') {
    const scoped = scopedEntries(readAll(singleDevice))
    if (scoped === undefined) {
      sendJson(res, 400, { error: 'invalid range' })
      return
    }
    sendJson(res, 200, { ...summarize(scoped) })
    return
  }

  if (path === '/api/v1/ledger/series') {
    const granularityParam = params.get('granularity') ?? 'day'
    if (granularityParam !== 'hour' && granularityParam !== 'day' && granularityParam !== 'month') {
      sendJson(res, 400, { error: `unknown granularity: ${granularityParam}` })
      return
    }
    const limitParam = params.get('limit')
    let maxBuckets
    if (limitParam !== null) {
      const parsed = Number(limitParam)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        sendJson(res, 400, { error: 'limit must be a positive integer' })
        return
      }
      maxBuckets = parsed
    }
    sendJson(res, 200, timeSeries(readAll(singleDevice), granularityParam, maxBuckets))
    return
  }

  if (path === '/api/v1/ledger/series-by-model') {
    const granularityParam = params.get('granularity') ?? 'day'
    if (granularityParam !== 'hour' && granularityParam !== 'day' && granularityParam !== 'month') {
      sendJson(res, 400, { error: `unknown granularity: ${granularityParam}` })
      return
    }
    const limitParam = params.get('limit')
    let maxBuckets
    if (limitParam !== null) {
      const parsed = Number(limitParam)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        sendJson(res, 400, { error: 'limit must be a positive integer' })
        return
      }
      maxBuckets = parsed
    }
    sendJson(res, 200, seriesByModel(readAll(singleDevice), granularityParam, maxBuckets))
    return
  }

  if (path === '/api/v1/ledger/devices') {
    sendJson(res, 200, { devices: listDevices() })
    return
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => {
  console.log(`token-usage-stats aggregator listening on http://127.0.0.1:${PORT}`)
  console.log(`data dir: ${DATA_DIR}`)
  if (TOKEN === undefined) console.log('warning: DSH_TS_TOKEN is not set; every request is unauthenticated')
})