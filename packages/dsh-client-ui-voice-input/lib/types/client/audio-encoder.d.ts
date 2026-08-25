/**
 * WAV encoding for recorded audio. Browsers record webm/opus while the ASR
 * provider accepts only wav and mp3, so a recording is decoded and re-encoded
 * as 16 kHz mono PCM16 before it leaves the browser.
 * @module @deepseek-ai/dsh-client-ui-voice-input/client/audio-encoder
 */
/**
 * Encode decoded audio as a base64 WAV data URL. The data-URL form lets the
 * provider read the container from the MIME type rather than a separate format
 * field.
 * @param audioBuffer - Decoded audio from a recorded blob.
 * @returns WAV audio as `data:audio/wav;base64,...`.
 */
export declare function encodeWav(audioBuffer: AudioBuffer): string;
//# sourceMappingURL=audio-encoder.d.ts.map