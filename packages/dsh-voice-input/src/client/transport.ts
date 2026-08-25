/**
 * Browser side of the transcription call.
 *
 * The recording is posted to this package's host endpoint, which holds the
 * provider credential. Every failure — transport, HTTP status, malformed body —
 * arrives as a `VoiceTranscription` error rather than a rejection, because the
 * control renders them the same way.
 * @module dsh-voice-input/client/transport
 */

import { MAX_AUDIO_BASE64_LENGTH, TRANSCRIBE_PATH } from '../protocol.ts'
import type { AudioFormat, TranscribeResponse } from '../protocol.ts'
import type { VoiceTranscription } from './contract.ts'

/**
 * Post one recording for recognition.
 *
 * The size check runs before the request so an over-long recording fails
 * without spending a round trip; the host enforces the same ceiling for callers
 * that never run this path.
 * @param audioBase64 - Audio as a data URL or bare base64 string.
 * @param format - Container of the encoded audio.
 * @returns The recognized text, or a message describing why recognition failed.
 */
export async function transcribeOverHttp(
  audioBase64: string,
  format: AudioFormat = 'wav',
): Promise<VoiceTranscription> {
  if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    return { error: `audio is too long (${audioBase64.length} > ${MAX_AUDIO_BASE64_LENGTH})` }
  }

  let response: Response
  try {
    response = await fetch(TRANSCRIBE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, format }),
      // Same-origin only: the endpoint is served by the host this page came
      // from, so a redirect elsewhere would be carrying the audio off-origin.
      redirect: 'error',
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'transcription request failed' }
  }

  let body: TranscribeResponse
  try {
    body = await response.json() as TranscribeResponse
  } catch {
    // A non-JSON body means something other than the endpoint answered.
    return { error: `transcription failed (HTTP ${response.status})` }
  }

  if (!body.ok) return { error: `${body.error} (${body.code})` }
  return { text: body.text }
}
