/**
 * Microphone capture: one recording session from permission grant to encoded
 * WAV. Kept apart from the control component because it owns browser-API
 * resources (a media stream, a recorder, an audio context) that must be
 * released on every exit path, including a failed decode.
 * @module @deepseek-ai/dsh-client-ui-voice-input/client/recorder
 */
import { encodeWav } from "./audio-encoder.js";
/** MIME candidates in preference order; the first supported one is used. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
/**
 * Whether this browser can capture microphone audio at all. Checked before a
 * permission prompt so an unsupported browser reports that rather than a
 * denial the user cannot act on.
 * @returns true when capture and recording APIs both exist.
 */
export function canRecord() {
    // Presence tests, not type tests: the DOM lib declares both members as
    // always present, but a pre-2018 browser omits mediaDevices entirely and an
    // insecure context omits getUserMedia from it.
    return typeof MediaRecorder !== 'undefined'
        && typeof navigator !== 'undefined'
        && 'mediaDevices' in navigator
        && 'getUserMedia' in navigator.mediaDevices;
}
/** Pick the first recorder MIME type this browser accepts. */
function pickMimeType() {
    if (typeof MediaRecorder.isTypeSupported !== 'function')
        return undefined;
    return MIME_CANDIDATES.find(candidate => MediaRecorder.isTypeSupported(candidate));
}
/**
 * Open the microphone and begin recording.
 *
 * Rejects nothing: a browser without the APIs and a refused permission prompt
 * both arrive as a `failed` outcome, because the control renders them the same
 * way — a message beside a button that returns to idle.
 * @returns The live recording, or the reason capture could not start.
 */
export async function startRecording() {
    if (!canRecord())
        return { kind: 'failed', failure: 'unsupported' };
    let stream;
    try {
        // 16 kHz mono matches what the encoder emits; a browser that ignores these
        // hints is handled by the encoder's own resample and channel selection.
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
        });
    }
    catch {
        // Permission denial, no device, and a device held by another application
        // are one case here: none of them yields audio, and the user's next step
        // is the same.
        return { kind: 'failed', failure: 'denied' };
    }
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType === undefined ? undefined : { mimeType });
    const chunks = [];
    recorder.ondataavailable = (event) => {
        if (event.data.size > 0)
            chunks.push(event.data);
    };
    const release = () => {
        for (const track of stream.getTracks())
            track.stop();
    };
    const stopped = new Promise((resolve) => {
        recorder.onstop = () => { resolve(); };
    });
    recorder.start();
    return {
        async stop() {
            if (recorder.state !== 'inactive')
                recorder.stop();
            await stopped;
            release();
            if (chunks.length === 0)
                return { kind: 'failed', failure: 'empty' };
            const blob = new Blob(chunks, mimeType === undefined ? {} : { type: mimeType });
            const audioContext = new AudioContext();
            try {
                const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
                // A recording of pure silence still decodes, so length is the only
                // "nothing was captured" signal available before transcription.
                if (decoded.length === 0)
                    return { kind: 'failed', failure: 'empty' };
                return { kind: 'audio', audioBase64: encodeWav(decoded) };
            }
            catch {
                // An undecodable container is indistinguishable from an empty capture
                // for the user's purposes: there is no audio to send either way.
                return { kind: 'failed', failure: 'empty' };
            }
            finally {
                void audioContext.close();
            }
        },
        cancel() {
            if (recorder.state !== 'inactive')
                recorder.stop();
            release();
        },
    };
}
//# sourceMappingURL=recorder.js.map