/**
 * Wire types for the ASR Remote surface. These cross the browser/host
 * boundary, so they stay JSON-serializable.
 * @module @deepseek-ai/dsh-asr-gateway/types
 */
/** Recognition options a browser client may pass with one transcription. */
export interface AsrTranscribeOptions {
    /**
     * Audio container of the submitted data. Omitted when the payload is a
     * data URL that already names its MIME type.
     */
    format?: 'wav' | 'mp3';
    /**
     * Language hint. `auto` detects the language; `zh` and `en` pin it.
     * Omitted means the provider's own default.
     */
    language?: 'auto' | 'zh' | 'en';
}
/** One completed transcription as the browser receives it. */
export interface AsrTranscriptionView {
    /** Recognized text, already trimmed by the provider. */
    text: string;
    /** Audio duration in seconds when the provider reported one. */
    duration?: number;
}
//# sourceMappingURL=types.d.ts.map