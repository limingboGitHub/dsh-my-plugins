/**
 * ASR capability types: request, result, and error shapes.
 * @module dsh-asr/types
 */

/** ASR transcription request. */
export interface AsrRequest {
  /**
   * Base64-encoded audio data. Accepts either a data URL
   * (`data:audio/wav;base64,...`) or raw base64 string.
   */
  readonly audioBase64: string
  /**
   * Audio format hint. When `audioBase64` is a data URL, the MIME type takes
   * precedence; otherwise this field is required.
   */
  readonly format?: 'wav' | 'mp3'
  /**
   * Language hint for recognition. Defaults to `auto` (automatic detection).
   * Provider-specific; not all providers support all languages.
   */
  readonly language?: string
}

/** ASR transcription result. */
export interface AsrResult {
  /** Recognized text content. */
  readonly text: string
  /** Audio duration in seconds, when the provider reports it. */
  readonly duration?: number | undefined
}

/** ASR provider error. */
export class AsrError extends Error {
  /**
   * @param message - Human-readable error description.
   * @param code - Machine-readable error code.
   * @param statusCode - HTTP status code when the error came from an API response.
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'AsrError'
  }
}
