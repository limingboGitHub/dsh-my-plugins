/**
 * ASR (Automatic Speech Recognition) Service Definition. Providers register
 * under `ctx.asr`, and consumers resolve one provider to transcribe audio
 * into text. The capability seam separates abstract operations from
 * provider-specific API clients.
 * @module dsh-voice-input/asr
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { AsrRequest, AsrResult } from './asr-types.ts'

export type { AsrRequest, AsrResult } from './asr-types.ts'
export { AsrError } from './asr-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    asr: AsrProvider
  }
}

/**
 * ASR provider abstract service. Implementations register under the `asr`
 * service name and supply a `transcribe` method that converts audio to text.
 */
export abstract class AsrProvider extends Service {
  constructor(ctx: Context) {
    super(ctx, 'asr')
  }

  /**
   * Transcribe audio content to text.
   * @param request - Audio data and recognition options.
   * @returns Recognized text and optional metadata.
   * @throws AsrError when recognition fails.
   */
  abstract transcribe(request: AsrRequest): Promise<AsrResult>
}

export default AsrProvider
