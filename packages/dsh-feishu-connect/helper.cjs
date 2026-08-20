// dsh feishu-bridge helper: runs the lark SDK WebSocket long connection and
// prints one JSON line per event / lifecycle notification to stdout.
// Usage: node helper.js <appId> <appSecret>
'use strict'

// The SDK is required lazily: when the dependency is missing or broken the
// helper still reports a JSON error line instead of crashing with a raw module
// stack (which the parent's stdout drain would drop as a non-JSON line).
let lark
try {
  lark = require('@larksuiteoapi/node-sdk')
} catch (error) {
  process.stdout.write(JSON.stringify({
    type: 'error',
    fatal: true,
    message: 'lark sdk unavailable: ' + String((error && error.message) || error),
  }) + '\n')
  process.exit(1)
}

const appId = process.argv[2]
const appSecret = process.argv[3]

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

if (!appId || !appSecret) {
  emit({ type: 'error', message: 'helper needs appId and appSecret arguments' })
  process.exit(1)
}

const dispatcher = new lark.EventDispatcher({}).register({
  'im.message.receive_v1': (data) => {
    try {
      emit({ type: 'event', eventType: 'im.message.receive_v1', data })
    } catch (e) {
      emit({ type: 'error', message: 'emit failed: ' + String((e && e.message) || e) })
    }
    return {}
  },
})

const client = new lark.WSClient({
  appId,
  appSecret,
  loggerLevel: lark.LoggerLevel.error,
  onReady: () => emit({ type: 'ready' }),
  onReconnecting: () => emit({ type: 'reconnecting' }),
  onReconnected: () => emit({ type: 'ready' }),
  onError: (e) => emit({ type: 'error', message: String((e && e.message) || e) }),
})

emit({ type: 'starting' })

// Periodic connection-status lines so the parent can observe credential or
// connectivity retry loops that never reach onReady/onError.
setInterval(() => {
  try {
    emit({ type: 'status', status: client.getConnectionStatus() })
  } catch {
    /* best effort */
  }
}, 10000)

client.start({ eventDispatcher: dispatcher }).catch((e) => {
  emit({ type: 'error', message: 'start failed: ' + String((e && e.message) || e) })
  process.exit(1)
})

// Last-resort guard: never die with a raw stack trace the parent cannot parse.
process.on('uncaughtException', (error) => {
  try {
    emit({ type: 'error', fatal: true, message: 'uncaught: ' + String((error && error.message) || error) })
  } catch {
    /* stdout already broken; nothing more to report */
  }
})
