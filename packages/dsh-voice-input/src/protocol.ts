/**
 * The wire contract shared by the host endpoint and the browser control.
 *
 * Both halves ship in this package, but they run in different processes and
 * cannot share types at runtime, so the path, the ceiling, and the payload
 * shapes are stated once here.
 * @module dsh-voice-input/protocol
 */

/** Path the transcription endpoint answers on. */
export const TRANSCRIBE_PATH = '/api/voice-input/transcribe'

/**
 * Largest base64 payload one call accepts, in characters.
 *
 * MiMo rejects an encoded audio string above 10 MB. The browser checks this
 * before spending a request and the host checks it again, because a direct
 * caller never runs the browser check.
 */
export const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024

/** Audio containers the provider accepts. */
export type AudioFormat = 'wav' | 'mp3'

/** Request body of a transcription call. */
export interface TranscribeRequest {
  /** Audio as a data URL or a bare base64 string. */
  audioBase64: string
  /** Container hint; required when `audioBase64` is not a data URL. */
  format?: AudioFormat
  /** Language hint; the provider decides the supported set. */
  language?: string
}

/** Response body of a transcription call. */
export type TranscribeResponse =
  | {
    ok: true
    /** Recognized text. */
    text: string
    /** Billed audio duration in seconds, when the provider reports one. */
    duration?: number
  }
  | {
    ok: false
    /** Human-readable failure description. */
    error: string
    /** Machine-readable failure code. */
    code: string
  }
