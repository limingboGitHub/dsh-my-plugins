/**
 * Voice input, host half: the MiMo ASR provider plus the HTTP endpoint the
 * browser control posts recordings to.
 *
 * Recognition is a host operation because the browser can hold neither the
 * provider API key nor a cross-origin request to the provider. The transport is
 * one plain HTTP route rather than a generated RPC method, which is what lets
 * this package build and publish on its own.
 * @module dsh-voice-input
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-host-webserver'
import MimoAsrProvider, { Config } from './mimo.ts'
import { AsrError } from './asr-types.ts'
import { TRANSCRIBE_PATH, MAX_AUDIO_BASE64_LENGTH } from './protocol.ts'
import type { TranscribeRequest, TranscribeResponse } from './protocol.ts'

export { AsrProvider } from './asr.ts'
export { default as MimoAsrProvider, Config } from './mimo.ts'
export { AsrError } from './asr-types.ts'
export type { AsrRequest, AsrResult } from './asr-types.ts'
export { TRANSCRIBE_PATH, MAX_AUDIO_BASE64_LENGTH } from './protocol.ts'
export type { TranscribeRequest, TranscribeResponse } from './protocol.ts'

export const name = 'voice-input'

export const inject = ['webServer', 'credentials']

/** Largest request body accepted, in bytes: the base64 ceiling plus JSON overhead. */
const MAX_BODY_BYTES = MAX_AUDIO_BASE64_LENGTH + 1024

/**
 * Read a JSON request body under a byte ceiling.
 *
 * The ceiling is enforced while reading rather than after, so an oversized
 * upload stops occupying memory as soon as it passes the limit.
 * @param req - the incoming request.
 * @returns the parsed body, or a reason it was rejected.
 */
async function readJsonBody(
  req: IncomingMessage,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: string }> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    total += buffer.length
    if (total > MAX_BODY_BYTES) return { ok: false, reason: 'request body too large' }
    chunks.push(buffer)
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    // The body is attacker-shaped input at a process boundary: a parse failure
    // is a client error to report, not a defect to throw.
    return { ok: false, reason: 'request body is not valid JSON' }
  }
}

/**
 * Whether the request came from this machine.
 *
 * `webServer` can be configured to bind `0.0.0.0`, and this route spends the
 * deployment's provider credential on whoever reaches it. Refusing non-local
 * peers keeps an all-interfaces bind from turning the key into a shared
 * resource.
 * @param req - the incoming request.
 * @returns true when the peer address is loopback.
 */
function isLocalRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  if (address === undefined) return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * Send one JSON response.
 * @param res - the server response.
 * @param status - HTTP status code.
 * @param body - the payload to serialize.
 */
function sendJson(res: ServerResponse, status: number, body: TranscribeResponse): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // The response is per-request and carries recognized speech.
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

/**
 * Validate a decoded request body.
 * @param value - the parsed JSON body.
 * @returns the typed request, or the reason it was rejected.
 */
function parseRequest(
  value: unknown,
): { ok: true; value: TranscribeRequest } | { ok: false; reason: string } {
  if (value === null || typeof value !== 'object') return { ok: false, reason: 'body must be an object' }
  const body = value as Record<string, unknown>
  const audioBase64 = body['audioBase64']
  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
    return { ok: false, reason: 'audioBase64 must be a non-empty string' }
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    return {
      ok: false,
      reason: `audio is ${audioBase64.length} base64 characters, above the ${MAX_AUDIO_BASE64_LENGTH} limit`,
    }
  }
  const format = body['format']
  if (format !== undefined && format !== 'wav' && format !== 'mp3') {
    return { ok: false, reason: "format must be 'wav' or 'mp3'" }
  }
  const language = body['language']
  if (language !== undefined && typeof language !== 'string') {
    return { ok: false, reason: 'language must be a string' }
  }
  return {
    ok: true,
    value: {
      audioBase64,
      ...format === undefined ? {} : { format },
      ...language === undefined ? {} : { language },
    },
  }
}

/**
 * Compose the provider and the transcription endpoint.
 * @param ctx - the host context.
 * @param config - MiMo provider configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(MimoAsrProvider, config)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TRANSCRIBE_PATH,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed', code: 'METHOD_NOT_ALLOWED' })
        return
      }
      if (!isLocalRequest(req)) {
        sendJson(res, 403, { ok: false, error: 'transcription is local-only', code: 'FORBIDDEN' })
        return
      }

      const body = await readJsonBody(req)
      if (!body.ok) {
        sendJson(res, 400, { ok: false, error: body.reason, code: 'BAD_REQUEST' })
        return
      }
      const parsed = parseRequest(body.value)
      if (!parsed.ok) {
        sendJson(res, 400, { ok: false, error: parsed.reason, code: 'BAD_REQUEST' })
        return
      }

      // Optional composition: a deployment can load this package's provider or
      // replace it, so the service is resolved per request rather than captured.
      const asr = ctx.get('asr')
      if (asr === undefined) {
        sendJson(res, 503, { ok: false, error: 'no asr provider is composed', code: 'NO_PROVIDER' })
        return
      }

      try {
        const result = await asr.transcribe(parsed.value)
        sendJson(res, 200, {
          ok: true,
          text: result.text,
          ...result.duration === undefined ? {} : { duration: result.duration },
        })
      } catch (error) {
        if (error instanceof AsrError) {
          sendJson(res, error.statusCode ?? 502, { ok: false, error: error.message, code: error.code })
          return
        }
        throw error
      }
    },
  }), 'voice-input: transcription endpoint')
}
