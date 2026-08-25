/**
 * ASR Remote gateway. Browser clients cannot hold the provider API key and
 * cannot reach the provider origin directly, so transcription is a host
 * operation the browser calls through one Remote method.
 * @module dsh-asr-gateway
 */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pulls the `asr` Context merge so the composed provider is typed.
import type {} from 'dsh-asr'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type { AsrTranscribeOptions, AsrTranscriptionView } from './types.ts'

export type * from './types.ts'

/**
 * Largest base64 payload one call accepts, in characters. MiMo rejects an
 * encoded audio string above 10 MB, and rejecting here keeps an oversized
 * recording from occupying a provider request at all.
 */
const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024

/**
 * Remote-only service exposing speech recognition to browser clients.
 *
 * The Cordis service key and the wire namespace differ on purpose: `asr` is
 * held by the provider this gateway forwards to, so taking that key would
 * collide with it and make `ctx.get('asr')` resolve to the gateway itself. The
 * browser still calls `ctx.remote.asr.transcribe`.
 */
export class AsrGateway extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'asrGateway', { namespace: 'asr' })
  }

  /**
   * Transcribe one recording to text.
   *
   * The `asr` provider is optional composition: a deployment without one
   * fails the call rather than returning empty text, because a silent empty
   * result is indistinguishable from a recording that held no speech.
   * @param audioBase64 - Audio as a data URL or bare base64 string.
   * @param options - Format and language hints.
   * @returns The recognized text and its reported duration.
   */
  @Remote('transcribe')
  async transcribe(
    audioBase64: string,
    options?: AsrTranscribeOptions,
  ): Promise<AsrTranscriptionView> {
    if (audioBase64.length === 0) {
      throw new Error('asr transcribe requires audio data')
    }
    if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      throw new Error(
        `audio payload is ${audioBase64.length} base64 characters, above the ${MAX_AUDIO_BASE64_LENGTH} limit`,
      )
    }
    const asr = this.ctx.get('asr')
    if (asr === undefined) {
      throw new Error('no asr provider is composed')
    }
    const result = await asr.transcribe({
      audioBase64,
      ...options?.format === undefined ? {} : { format: options.format },
      ...options?.language === undefined ? {} : { language: options.language },
    })
    return {
      text: result.text,
      ...result.duration === undefined ? {} : { duration: result.duration },
    }
  }
}

export default AsrGateway
