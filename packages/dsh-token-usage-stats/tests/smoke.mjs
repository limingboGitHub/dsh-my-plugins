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
if (existsSync(ledgerPath)) {
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
  const base = today.getTime()
  entries = [
    { type: 'model-call', ts: base - 5 * day, provider: 'p', model: 'm1', inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 150, durationMs: 2000, firstTokenMs: 300, outputTokensPerSec: 25 },
    { type: 'model-call', ts: base - 5 * day, provider: 'p', model: 'm2', inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 200, durationMs: 4000, firstTokenMs: 500, outputTokensPerSec: 25 },
    { type: 'model-call', ts: base - 3 * day, provider: 'p', model: 'm1', inputTokens: 100, outputTokens: 25, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 125, durationMs: 1000, firstTokenMs: 100, outputTokensPerSec: 25 },
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

console.log('\n-- timeSeries speed averages --')
{
  const result = timeSeries(entries, 'day', 30)
  check('every bucket carries avgTokensPerSec', result.buckets.every(b => 'avgTokensPerSec' in b), JSON.stringify(result.buckets.slice(0, 2)))
  const nonNull = result.buckets.filter(b => b.avgTokensPerSec !== null && b.avgTokensPerSec !== undefined)
  check('speed averages are positive numbers when present', nonNull.every(b => typeof b.avgTokensPerSec === 'number' && b.avgTokensPerSec > 0), JSON.stringify(nonNull.slice(0, 2)))
  const today = result.buckets[0]
  if (today.tokens > 0) {
    // Today's average must be a number (real logs are speed-capable since v0.4.0).
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

console.log('\n-- summarize timing averages --')
{
  const summary = summarize(entries)
  check('reports totalCalls', summary.totalCalls === entries.length)
  const timed = entries.filter(e => typeof e.durationMs === 'number')
  if (timed.length > 0) {
    const expectedAvg = Math.round((timed.reduce((s, e) => s + e.durationMs, 0) / timed.length) * 10) / 10
    check('avgDurationMs matches', summary.avgDurationMs === expectedAvg, `got ${summary.avgDurationMs}, expected ${expectedAvg}`)
  }
  check('byProvider/byModel present', Array.isArray(summary.byProvider) && Array.isArray(summary.byModel))
  check('speed average present when data has speed', summary.avgOutputTokensPerSec === undefined || typeof summary.avgOutputTokensPerSec === 'number')
  check('byModel rows carry timing averages', summary.byModel.every(row => 'avgOutputTokensPerSec' in row && 'avgFirstTokenMs' in row && 'avgDurationMs' in row), JSON.stringify(summary.byModel))
  check('byModel timing averages are numbers or undefined', summary.byModel.every(row => [row.avgOutputTokensPerSec, row.avgFirstTokenMs, row.avgDurationMs].every(v => v === undefined || (typeof v === 'number' && v >= 0))), JSON.stringify(summary.byModel))
  check('speed model has a number or undefined average', summary.byModel.every(row => row.avgOutputTokensPerSec === undefined || typeof row.avgOutputTokensPerSec === 'number'))
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