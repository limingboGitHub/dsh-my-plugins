/**
 * Integration smoke: loads the plugin's apply() inside a real cordis Context
 * (from the DSH profile install), drives a session event stream, and asserts
 * ledger rows, HTTP route responses, and the remote sync path end to end.
 *
 * Requires a DSH profile install to locate @deepseek-ai/cordis; on machines
 * without one the test skips. Also starts a throwaway reference server for the
 * sync assertions when the profile install exists.
 *
 * Run: `node tests/integration.mjs`
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const cordisPath = join(homedir(), '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'cordis', 'lib', 'index.js')

let failures = 0
const check = (name, condition, detail) => {
  if (condition) {
    console.log(`  ok: ${name}`)
  } else {
    failures += 1
    console.error(`FAIL: ${name}${detail === undefined ? '' : ` 鈥?${detail}`}`)
  }
}

/** Package root (this repo), resolved from the script location so cwd is irrelevant. */
const pkgRoot = join(import.meta.dirname, '..')

async function main() {
  let cordis
  try {
    cordis = await import(pathToFileURL(cordisPath).href)
  } catch (error) {
    console.log(`SKIP: cordis not found at ${cordisPath} (${error.message})`)
    return
  }
  const { Context, Service } = cordis

  const dir = mkdtempSync(join(tmpdir(), 'tus-integration-'))
  const ledgerPath = join(dir, 'token-usage-ledger.jsonl')

  /** Minimal webServer stand-in: record registrations, expose their handlers. */
  class FakeWebServer extends Service {
    constructor(ctx) {
      super(ctx, 'webServer')
      this.registrations = []
    }
    register(entry) {
      this.registrations.push(entry)
      return () => {
        const index = this.registrations.indexOf(entry)
        if (index >= 0) this.registrations.splice(index, 1)
      }
    }
  }

  const session = { id: 'session-int-1', header: { cwd: 'D:/work/repo' } }

  const emitCall = (ctx, event) => ctx.emit('session/event', session, event)

  const RES = () => {
    const res = { status: 0, headers: null, body: null }
    res.writeHead = (status, headers) => { res.status = status; res.headers = headers }
    res.end = (body) => { res.body = body }
    return res
  }

  const callRoute = async (webServer, path, query, method = 'GET', body) => {
    // cordis 3 defers `effect()` bodies; give pending registrations a tick.
    await new Promise(resolve => setTimeout(resolve, 20))
    const registration = webServer.registrations.find(r => r.path === path)
    if (registration === undefined) throw new Error(`no route ${path}`)
    const res = RES()
    const req = { url: `/${path.slice(1)}${query ?? ''}`, headers: {}, method }
    if (body !== undefined) {
      req.body = body
      req[Symbol.asyncIterator] = async function* () { yield this.body }
    }
    await registration.handler(req, res)
    return { status: res.status, json: JSON.parse(res.body ?? '{}') }
  }

  console.log('\n== local-only context ==')
  const ctx = new Context()
  await ctx.plugin(FakeWebServer)
  const plugin = await import(pathToFileURL(join(pkgRoot, 'lib', 'index.js')).href)
  await ctx.plugin({ apply: plugin.apply }, { ledgerPath })

  // Second model call with streamed usage.
  emitCall(ctx, { type: 'request/header', seq: 0, time: 10_000, data: { header: { config: { provider: 'p1', model: 'm1' } } } })
  emitCall(ctx, { type: 'assistant/chunk', seq: 1, time: 11_000, data: { turn: 1, step: 1, chunk: { type: 'text', text: 'hi' } } })
  emitCall(ctx, { type: 'assistant/chunk', seq: 2, time: 14_000, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { outputTokens: 50 } } } })
  emitCall(ctx, { type: 'assistant/message', seq: 3, time: 20_000, data: { turn: 1, step: 1, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } } })

  // Second call: no chunks before the message (usage on message only).
  emitCall(ctx, { type: 'request/header', seq: 4, time: 30_000, data: { header: { config: { provider: 'p1', model: 'm2' } } } })
  emitCall(ctx, { type: 'assistant/message', seq: 5, time: 35_000, data: { turn: 2, step: 1, usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 0 } } })

  const lines = readFileSync(ledgerPath, 'utf-8').trim().split('\n').map(line => JSON.parse(line))
  check('two ledger rows appended', lines.length === 2, `got ${lines.length}`)

  const first = lines[0]
  check('row 1 has schema version 2', first.v === 2)
  check('row 1 ts is the message event time', first.ts === 20_000)
  check('row 1 durationMs = message - header', first.durationMs === 10_000, `got ${first.durationMs}`)
  check('row 1 firstTokenMs = first chunk - header', first.firstTokenMs === 1_000, `got ${first.firstTokenMs}`)
  // First streamed token arrives as the text chunk at 11s; the usage chunk at
  // 14s only reports the count. 50 tokens over 9000ms (11s->20s) = 5.556/s.
  check('row 1 outputTokensPerSec correct', Math.abs(first.outputTokensPerSec - 5.6) < 0.1, `got ${first.outputTokensPerSec}`)
  check('row 1 route from request/header', first.provider === 'p1' && first.model === 'm1')
  check('row 1 workspace derived from header.cwd', first.workspacePath === 'D:/work/repo' && first.workspaceTitle === 'repo')
  check('row 1 deviceId present', typeof first.deviceId === 'string' && first.deviceId.startsWith('dev-'))

  const second = lines[1]
  check('row 2 has no timing fields without stream', second.durationMs === 5_000 && second.firstTokenMs === undefined && second.outputTokensPerSec === undefined, JSON.stringify({ d: second.durationMs, f: second.firstTokenMs, s: second.outputTokensPerSec }))
  check('row 2 cache read bucketed', second.cacheReadTokens === 5 && second.totalTokens === 65)

  const webServer = ctx.get('webServer')
  const summaryAll = await callRoute(webServer, '/api/token-usage-stats', '?range=all')
  check('summary route 200', summaryAll.status === 200)
  check('summary totals', summaryAll.json.totalCalls === 2 && summaryAll.json.totalTokens === (150 + 65), JSON.stringify(summaryAll.json))
  check('summary includes device id', Array.isArray(summaryAll.json.deviceIds) && summaryAll.json.deviceIds.length === 1)

  const summaryAugust = await callRoute(webServer, '/api/token-usage-stats', '?range=1970-01')
  check('YYYY-MM range filters to month', summaryAugust.json.totalCalls === 2 && summaryAugust.json.totalTokens === 215, `calls=${summaryAugust.json.totalCalls}`)

  const series = await callRoute(webServer, '/api/token-usage-stats/series', '?granularity=day&limit=30')
  check('series 30 contiguous buckets', series.json.buckets.length === 30, `got ${series.json.buckets.length}`)

  const byModel = await callRoute(webServer, '/api/token-usage-stats/series-by-model', '?granularity=day&limit=14')
  check('series-by-model has both models', byModel.json.series.length === 2, JSON.stringify(byModel.json.series?.map(s => s.model)))
  check('series-by-model zero-filled window', byModel.json.series.every(s => s.buckets.length === 14))

  const meta = await callRoute(webServer, '/api/token-usage-stats/meta', '')
  check('meta reports local sync disabled', meta.json.sync.enabled === false, JSON.stringify(meta.json.sync))
  check('meta entryCount matches ledger', meta.json.entryCount === 2)

  const configBefore = await callRoute(webServer, '/api/token-usage-stats/config', '')
  check('config GET shows remote unset', configBefore.json.remoteUrlSet === false && configBefore.json.remoteTokenSet === false, JSON.stringify(configBefore.json))
  const configPut = await callRoute(webServer, '/api/token-usage-stats/config', '', 'PUT', JSON.stringify({ remoteUrl: 'http://127.0.0.1:9999', remoteToken: 'secret' }))
  check('config PUT applies and reports set flags', configPut.json.remoteUrlSet === true && configPut.json.remoteTokenSet === true && configPut.json.remoteUrl === 'http://127.0.0.1:9999', JSON.stringify(configPut.json))
  const savedConfig = JSON.parse(readFileSync(join(dir, 'token-usage-config.json'), 'utf-8'))
  check('config persisted to disk', savedConfig.remoteUrl === 'http://127.0.0.1:9999' && savedConfig.remoteToken === 'secret', JSON.stringify(savedConfig))
  const configClear = await callRoute(webServer, '/api/token-usage-stats/config', '', 'PUT', JSON.stringify({ remoteUrl: '' }))
  check('config clears remoteUrl, keeps token', configClear.json.remoteUrlSet === false && configClear.json.remoteTokenSet === true, JSON.stringify(configClear.json))

  await ctx.fiber.dispose()
  console.log('  ok: context disposed without error')

  console.log('\n== remote sync context ==')
  // Throwaway reference server.
  const serverPort = 8901 + Math.floor(Math.random() * 200)
  const serverData = join(dir, 'server-data')
  const server = spawn(process.execPath, [join(pkgRoot, 'server', 'index.js')], {
    env: { ...process.env, PORT: String(serverPort), DSH_TS_DATA_DIR: serverData, DSH_TS_TOKEN: 'integration-token' },
    stdio: 'ignore',
  })
  await new Promise(resolve => setTimeout(resolve, 800))

  try {
    const ctx2 = new Context()
    await ctx2.plugin(FakeWebServer)
    await ctx2.plugin({ apply: plugin.apply }, {
      ledgerPath: join(dir, 'remote', 'sync-ledger.jsonl'), // isolated config dir: the local ctx edits its own config file
      remoteUrl: `http://127.0.0.1:${serverPort}`,
      remoteToken: 'integration-token',
      deviceId: 'dev-integration-a',
      deviceName: 'integration-host',
      syncIntervalMs: 100,
    })
    const session2 = { id: 'session-int-2', header: { cwd: 'D:/work/repo' } }
    emitCall(ctx2, { type: 'request/header', seq: 0, time: 100, data: { header: { config: { provider: 'p9', model: 'm9' } } } })
    emitCall(ctx2, { type: 'assistant/message', seq: 1, time: 200, data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 5 } } })

    await new Promise(resolve => setTimeout(resolve, 600))
    const devicesResponse = await fetch(`http://127.0.0.1:${serverPort}/api/v1/ledger/devices`, {
      headers: { authorization: 'Bearer integration-token' },
    })
    const devices = (await devicesResponse.json()).devices ?? []
    const mine = devices.find(d => d.deviceId === 'dev-integration-a')
    check('remote received pushed row', mine !== undefined && mine.entryCount === 1, JSON.stringify(devices))

    const syncState = JSON.parse(readFileSync(join(dir, 'remote', 'token-usage-sync.json'), 'utf-8'))
    check('sync watermark advanced to 1', syncState.pushedCount === 1, JSON.stringify(syncState))
    check('sync watermark stores remoteUrl/device', syncState.remoteUrl === `http://127.0.0.1:${serverPort}` && syncState.deviceId === 'dev-integration-a')

    const webServer2 = ctx2.get('webServer')
    const remoteSummary = await callRoute(webServer2, '/api/token-usage-stats', '?range=all&source=remote')
    check('remote summary proxied through plugin', remoteSummary.json.totalCalls === 1 && remoteSummary.json.totalTokens === 15, JSON.stringify(remoteSummary.json))

    // Second call on the SAME context: watermark should move past it too.
    emitCall(ctx2, { type: 'request/header', seq: 2, time: 400, data: { header: { config: { provider: 'p9', model: 'm9' } } } })
    emitCall(ctx2, { type: 'assistant/message', seq: 3, time: 500, data: { turn: 2, step: 1, usage: { inputTokens: 20, outputTokens: 10 } } })
    await new Promise(resolve => setTimeout(resolve, 600))
    const devices2 = (await (await fetch(`http://127.0.0.1:${serverPort}/api/v1/ledger/devices`, {
      headers: { authorization: 'Bearer integration-token' },
    })).json()).devices ?? []
    check('second push moved sync forward', (devices2.find(d => d.deviceId === 'dev-integration-a') ?? {}).entryCount === 2)

    await ctx2.fiber.dispose()
  } finally {
    server.kill()
  }

  rmSync(dir, { recursive: true, force: true })
  console.log('\n' + (failures === 0 ? 'ALL INTEGRATION CHECKS PASSED' : `${failures} CHECK(S) FAILED`))
  process.exit(failures === 0 ? 0 : 1)
}

await main()

