/**
 * Microphone capture: one recording session from permission grant to encoded
 * WAV. Kept apart from the control component because it owns browser-API
 * resources (a media stream, a recorder, an audio context) that must be
 * released on every exit path, including a failed decode.
 * @module @deepseek-ai/dsh-client-ui-voice-input/client/recorder
 */
/** Why a recording produced no audio to transcribe. */
export type RecorderFailure = 'denied' | 'unsupported' | 'empty';
/** A recording that produced audio, or the reason it did not. */
export type RecorderOutcome = {
    readonly kind: 'audio';
    readonly audioBase64: string;
} | {
    readonly kind: 'failed';
    readonly failure: RecorderFailure;
};
/**
 * Whether this browser can capture microphone audio at all. Checked before a
 * permission prompt so an unsupported browser reports that rather than a
 * denial the user cannot act on.
 * @returns true when capture and recording APIs both exist.
 */
export declare function canRecord(): boolean;
/**
 * One live recording. `stop()` resolves with the encoded audio, so the caller
 * awaits a single value instead of coordinating recorder callbacks.
 */
export interface ActiveRecording {
    /** Finish recording and encode what was captured. */
    stop(): Promise<RecorderOutcome>;
    /** Abandon recording and release the microphone without encoding. */
    cancel(): void;
}
/**
 * Open the microphone and begin recording.
 *
 * Rejects nothing: a browser without the APIs and a refused permission prompt
 * both arrive as a `failed` outcome, because the control renders them the same
 * way — a message beside a button that returns to idle.
 * @returns The live recording, or the reason capture could not start.
 */
export declare function startRecording(): Promise<ActiveRecording | {
    readonly kind: 'failed';
    readonly failure: RecorderFailure;
}>;
//# sourceMappingURL=recorder.d.ts.map