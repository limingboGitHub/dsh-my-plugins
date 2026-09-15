/**
 * Smoke test for the token-usage-stats host aggregation logic.
 *
 * Runs against the REAL home ledger when present, so the assertions double as
 * a compatibility check on live data. Pure functions are imported from the
 * plugin's lib/index.js (apply is not executed here).
 *
 * Run: `node tests/smoke.mjs`
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { timeSeries, seriesByModel, summarize, monthRange } from '../lib/index.js'

const ledgerPath = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, 'token-usage-ledger.jsonl')
  : join(homedir(), '.dsh', 'token-usage-ledger.jsonl')

let entries = []
// True when entries below are the deterministic synthetic corpus (no real home
// ledger): a few assertions pin exact synthetic numbers and only run then.
const synthetic = !existsSync(ledgerPath)
if (!synthetic) {
  for (const line of readFileSync(ledgerPath, 'utf-8').split('\n')) {
    if (line.trim() === '') continue
    try { entries.push(JSON.parse(line)) } catch { /* truncated tail */ }
  }
  console.log(`loaded ${entries.length} real entries from ${ledgerPath}`)
} else {
  // Synthesize a small deterministic corpus so the test runs anywhere.
  const day = 24 * 3600 * 1000
  const now = Date.now()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  globalThis.__syntheticBase = today.getTime()
  const base = globalThis.__syntheticBase
  entries = [
    { type: 'model-call', ts: base - 5 * day, provider: 'p', model: 'm1', inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 150, durationMs: 2000, firstTokenMs: 300, outputTokensPerSec: 29.4 },
    { type: 'model-call', ts: base - 5 * day, provider: 'p', model: 'm2', inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 200, durationMs: 4000, firstTokenMs: 500, outputTokensPerSec: 28.6 },
    // Tool-call-only reply whose first token lands 4ms before the message end
    // (like a provider buffering the tool call): its per-call speed is absurdy
    // high, and the aggregate must not let it dominate the day's reading.
    { type: 'model-call', ts: base - 5 * day, provider: 'p', model: 'm1', inputTokens: 100, outputTokens: 55, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 155, durationMs: 4956, firstTokenMs: 4952, outputTokensPerSec: 13750 },
    { type: 'model-call', ts: base - 3 * day, provider: 'p', model: 'm1', inputTokens: 100, outputTokens: 25, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 125, durationMs: 1000, firstTokenMs: 100, outputTokensPerSec: 27.8 },
    { type: 'model-call', ts: base, provider: 'q', model: 'm3', inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 15 },
  ]
  console.log(`no home ledger found; using ${entries.length} synthetic entries`)
}

let failures = 0
const check = (name, condition, detail) => {
  if (condition) {
    console.log(`  ok: ${name}`)
  } else {
    failures += 1
    console.error(`FAIL: ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

console.log('\n-- timeSeries (day, limit 30) --')
{
  const result = timeSeries(entries, 'day', 30)
  check('returns exactly 30 contiguous day buckets', result.buckets.length === 30, `got ${result.buckets.length}`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  check('newest bucket is today', result.buckets[0].ts === today.getTime(), `got ${new Date(result.buckets[0].ts).toISOString()}`)
  const zeroDays = result.buckets.filter(b => b.tokens === 0 && b.calls === 0).length
  check('idle days are present as zero buckets', zeroDays >= 0 && result.buckets.every(b => Number.isInteger(b.tokens) && Number.isInteger(b.calls)), 'every bucket has integer tokens/calls')
  const contiguous = result.buckets.every((b, i, arr) => i === 0 || arr[i - 1].ts - b.ts === 24 * 3600 * 1000)
  check('buckets are contiguous (24h apart)', contiguous)
}

console.log('\n-- timeSeries (month, limit 14) --')
{
  const result = timeSeries(entries, 'month', 14)
  check('returns exactly 14 month buckets', result.buckets.length === 14, `got ${result.buckets.length}`)
  check('buckets are contiguous by month', result.buckets.every((b, i, arr) => {
    if (i === 0) return true
    const prev = new Date(arr[i - 1].ts)
    const cur = new Date(b.ts)
    return (prev.getFullYear() * 12 + prev.getMonth()) - (cur.getFullYear() * 12 + cur.getMonth()) === 1
  }))
}

console.log('\n-- timeSeries speed aggregates --')
{
  const result = timeSeries(entries, 'day', 30)
  check('every bucket carries avgTokensPerSec', result.buckets.every(b => 'avgTokensPerSec' in b), JSON.stringify(result.buckets.slice(0, 2)))
  const nonNull = result.buckets.filter(b => b.avgTokensPerSec !== null && b.avgTokensPerSec !== undefined)
  check('speed aggregates are positive numbers when present', nonNull.every(b => typeof b.avgTokensPerSec === 'number' && b.avgTokensPerSec > 0), JSON.stringify(nonNull.slice(0, 2)))
  // The day at base-5d (synthetic corpus only; real ledgers skip this bucket)
  // holds m1/m2 calls incl. the tool-call-only 4ms-decode row:
  // aggregate = total output / total decode over sampled calls.
  // decode spans: 1700 + 3500 + 4 = 5204ms; sampled tokens: 50 + 100 + 55 = 205
  // -> 205 / 5.204 = 39.4 tok/s.
  const fiveDaysAgo = synthetic
    ? result.buckets.find(b => b.ts === globalThis.__syntheticBase - 5 * 24 * 3600 * 1000)
    : undefined
  check('5-days-ago bucket holds the aggregate speed, not the 13750 outlier mean',
    fiveDaysAgo === undefined || Math.abs(fiveDaysAgo.avgTokensPerSec - 39.4) < 0.1,
    `got ${fiveDaysAgo?.avgTokensPerSec}, expected ~39.4`)
  const today = result.buckets[0]
  if (today.tokens > 0) {
    check('today average is a number or null', today.avgTokensPerSec === null || typeof today.avgTokensPerSec === 'number', JSON.stringify(today))
  }
}

console.log('\n-- timeSeries (no limit) --')
{
  const result = timeSeries(entries, 'day')
  check('spans from earliest recorded day through today', result.buckets[result.buckets.length - 1].ts <= result.buckets[0].ts)
  check('newest bucket is today', result.buckets[0].ts === (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })())
}

console.log('\n-- monthRange --')
{
  const feb = monthRange('2026-02')
  check('2026-02 parses', feb !== undefined)
  if (feb !== undefined) {
    const start = new Date(feb.from)
    const end = new Date(feb.to)
    check('month starts on the 1st', start.getFullYear() === 2026 && start.getMonth() === 1 && start.getDate() === 1)
    check('month ends 28 Feb 23:59:59.999', end.getFullYear() === 2026 && end.getMonth() === 1 && end.getDate() === 28 && end.getHours() === 23 && end.getMinutes() === 59)
  }
  check('rejects bad month', monthRange('2026-13') === undefined && monthRange('2026-1') === undefined && monthRange('abc') === undefined)
  const aug = monthRange('2026-08')
  check('2026-08 lands in August', aug !== undefined && new Date(aug.from).getMonth() === 7 && new Date(aug.to).getMonth() === 7)
}

console.log('\n-- summarize timing aggregates --')
{
  const summary = summarize(entries)
  check('reports totalCalls', summary.totalCalls === entries.length)
  const timed = entries.filter(e => typeof e.durationMs === 'number')
  if (timed.length > 0) {
    const expectedAvg = Math.round((timed.reduce((s, e) => s + e.durationMs, 0) / timed.length) * 10) / 10
    check('avgDurationMs matches', summary.avgDurationMs === expectedAvg, `got ${summary.avgDurationMs}, expected ${expectedAvg}`)
  }
  check('byProvider/byModel present', Array.isArray(summary.byProvider) && Array.isArray(summary.byModel))
  // Aggregate speed over decode-sampled calls: Σ outputTokens / Σ decode span
  // (decode = durationMs - firstTokenMs), identical to the DSH native fold.
  // The tool-call-only 4ms-decode row in the synthetic corpus cannot blow this
  // up the way an arithmetic mean of per-call speeds would.
  const samplable = entries.filter(e => typeof e.outputTokens === 'number' && e.outputTokens > 0
    && typeof e.durationMs === 'number' && Number.isFinite(e.durationMs)
    && typeof e.firstTokenMs === 'number' && Number.isFinite(e.firstTokenMs))
  const decodeMsTotal = samplable.reduce((s, e) => s + (e.durationMs - e.firstTokenMs), 0)
  const decodeTokensTotal = samplable.reduce((s, e) => s + e.outputTokens, 0)
  if (decodeTokensTotal > 0 && decodeMsTotal > 0) {
    const expectedSpeed = Math.round((decodeTokensTotal / decodeMsTotal) * 1000 * 10) / 10
    check('summary speed is the aggregate ratio', Math.abs(summary.avgOutputTokensPerSec - expectedSpeed) < 0.001,
      `got ${summary.avgOutputTokensPerSec}, expected ${expectedSpeed}`)
  }
  const m1 = summary.byModel.find(r => r.model === 'p/m1')
  if (m1 !== undefined) {
    const m1Rows = entries.filter(e => `${e.provider}/${e.model}` === 'p/m1')
    const m1Sample = m1Rows.filter(e => typeof e.outputTokens === 'number' && e.outputTokens > 0
      && typeof e.durationMs === 'number' && Number.isFinite(e.durationMs)
      && typeof e.firstTokenMs === 'number' && Number.isFinite(e.firstTokenMs))
    const m1Decode = m1Sample.reduce((s, e) => s + (e.durationMs - e.firstTokenMs), 0)
    const m1Tokens = m1Sample.reduce((s, e) => s + e.outputTokens, 0)
    if (m1Tokens > 0 && m1Decode > 0) {
      const expectedM1 = Math.round((m1Tokens / m1Decode) * 1000 * 10) / 10
      check('byModel speed is the aggregate ratio per model', Math.abs(m1.avgOutputTokensPerSec - expectedM1) < 0.001,
        `got ${m1.avgOutputTokensPerSec}, expected ${expectedM1}`)
    }
  }
  check('byModel rows carry timing aggregates', summary.byModel.every(row => 'avgOutputTokensPerSec' in row && 'avgFirstTokenMs' in row && 'avgDurationMs' in row), JSON.stringify(summary.byModel))
  check('byModel timing aggregates are numbers or undefined', summary.byModel.every(row => [row.avgOutputTokensPerSec, row.avgFirstTokenMs, row.avgDurationMs].every(v => v === undefined || (typeof v === 'number' && v >= 0))), JSON.stringify(summary.byModel))
  check('speed model has a number or undefined aggregate', summary.byModel.every(row => row.avgOutputTokensPerSec === undefined || typeof row.avgOutputTokensPerSec === 'number'))
}

console.log('\n-- seriesByModel --')
{
  const result = seriesByModel(entries, 'day', 14)
  check('series has one entry per model', result.series.length === new Set(entries.map(e => `${e.provider}/${e.model}`)).size, `got ${result.series.length}`)
  check('every series shares the same window', result.series.every(s => s.buckets.length === result.buckets.length))
  check('series sorted by totalTokens desc', result.series.every((s, i, arr) => i === 0 || arr[i - 1].totalTokens >= s.totalTokens))
  check('shared window is newest-first like timeSeries', result.buckets.length <= 1 || result.buckets[0].ts > result.buckets[1].ts, JSON.stringify(result.buckets.slice(0, 2)))
  check('bucket index aligns across shared window and every series', result.series.every(s => s.buckets.every((b, i) => b.key === (result.buckets[i]?.key ?? -1))), 'series index maps to the same date as the shared window')
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`))
process.exit(failures === 0 ? 0 : 1)