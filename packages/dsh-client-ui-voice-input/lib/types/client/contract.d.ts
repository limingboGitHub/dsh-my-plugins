/**
 * Injected business face of the composer voice seat.
 * @module @deepseek-ai/dsh-client-ui-voice-input/client/contract
 */
/** One transcription attempt: recognized text, or a user-visible failure line. */
export type VoiceTranscription = {
    text: string;
    error?: undefined;
} | {
    text?: undefined;
    error: string;
};
/** Callbacks the plugin apply supplies to the microphone control. */
export interface VoiceInputInjected {
    /**
     * Transcribe one recording through the host ASR Remote.
     * @param audioBase64 - WAV audio as a base64 data URL.
     * @returns The recognized text, or a failure line to show the user.
     */
    transcribe: (audioBase64: string) => Promise<VoiceTranscription>;
    /**
     * Append recognized text to the current session's composer draft,
     * separated from existing text by one space.
     * @param text - recognized text to append.
     */
    appendDraft: (text: string) => void;
}
//# sourceMappingURL=contract.d.ts.map