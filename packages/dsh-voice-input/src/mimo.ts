/**
 * Xiaomi MiMo ASR provider. Recognition rides the vendor's OpenAI-compatible
 * chat-completions endpoint: the audio travels as one `input_audio` content
 * part and the recognized text comes back as ordinary message content.
 * @module dsh-voice-input/mimo
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AsrProvider, AsrError } from './asr.ts'
import type { AsrRequest, AsrResult } from './asr.ts'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { MimoResponse } from './mimo-types.ts'

export type * from './mimo-types.ts'

export const name = 'asr-mimo'

/** Vendor default endpoint: the OpenAI-compatible CN token-plan base, `/v1` included. */
const DEFAULT_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'

/** The vendor's only ASR model. */
const DEFAULT_MODEL = 'mimo-v2.5-asr'

/** Environment variable holding the API key when the deployment names none. */
const DEFAULT_API_KEY_ENV = 'MIMO_API_KEY'

/** Attribution header sent on every request. */
const USER_AGENT = 'deepseek-harness/0.1.0'

/** MiMo provider configuration. */
export interface Config {
  /** API base URL with `/v1`; `/chat/completions` is appended. */
  baseUrl?: string
  /** Recognition model name. */
  model?: string
  /** Environment-variable name holding the API key. */
  apiKeyEnv?: string
}

export const Config: z<Config> = z.object({
  baseUrl: z.string().default(DEFAULT_BASE_URL).description('API base URL including /v1'),
  model: z.string().default(DEFAULT_MODEL).description('Recognition model name'),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV).description('Environment variable holding the API key'),
})

/** Config after defaulting — every deployment choice decided exactly once. */
interface ResolvedConfig {
  readonly endpoint: string
  readonly model: string
  readonly apiKeyRef: CredentialRef
}

/**
 * Decide every deployment-varying value before any request runs, so a
 * transcription never re-derives an endpoint or silently falls back.
 * @param config - the validated plugin config.
 * @returns the fully resolved request parameters.
 */
function resolveConfig(config: Config): ResolvedConfig {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  return {
    // A trailing slash on the configured base would produce a `//` path.
    endpoint: `${baseUrl.replace(/\/+$/u, '')}/chat/completions`,
    model: config.model ?? DEFAULT_MODEL,
    apiKeyRef: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
  }
}

/**
 * Build the data URL the vendor accepts. A bare base64 payload needs its
 * container named, and the vendor requires MIME and `format` to agree, so the
 * MIME type is derived from the declared format rather than sent alongside it.
 * @param request - the transcription request.
 * @returns audio as a data URL.
 */
function audioDataUrl(request: AsrRequest): string {
  if (request.audioBase64.startsWith('data:')) return request.audioBase64
  const mimeType = request.format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
  return `data:${mimeType};base64,${request.audioBase64}`
}

/**
 * MiMo recognition over the vendor's OpenAI-compatible endpoint. Every
 * deployment-varying value is resolved once at construction; the credential is
 * resolved per call so a rotated key needs no restart.
 */
class MimoAsrProvider extends AsrProvider {
  static inject = ['credentials']

  static Config = Config

  private readonly resolved: ResolvedConfig

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.resolved = resolveConfig(config)
  }

  async transcribe(request: AsrRequest): Promise<AsrResult> {
    // Resolved per call: a rotated key reaches the next transcription without
    // a restart (the credentials seam's contract).
    const credential = await this.ctx.credentials.resolve(this.resolved.apiKeyRef)
    if (credential === undefined) {
      throw new AsrError(
        `MiMo API key is not configured (${this.resolved.apiKeyRef})`,
        'MISSING_API_KEY',
      )
    }

    const response = await fetch(this.resolved.endpoint, {
      method: 'POST',
      headers: {
        'api-key': credential.value,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        model: this.resolved.model,
        messages: [{
          role: 'user',
          content: [{ type: 'input_audio', input_audio: { data: audioDataUrl(request) } }],
        }],
        ...request.language === undefined ? {} : { asr_options: { language: request.language } },
      }),
      // Never follow a redirect on a credentialed request: the target would
      // receive the API key and the audio.
      redirect: 'error',
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new AsrError(
        `MiMo API request failed: ${response.status} ${response.statusText}${detail === '' ? '' : ` ${detail}`}`,
        'API_ERROR',
        response.status,
      )
    }

    const result = await response.json() as MimoResponse
    const text = result.choices?.[0]?.message?.content
    if (text === undefined) {
      throw new AsrError('MiMo API response carried no transcription', 'EMPTY_RESPONSE')
    }

    return { text: text.trim(), duration: result.usage?.seconds }
  }
}

export default MimoAsrProvider
