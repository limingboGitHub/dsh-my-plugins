/**
 * WAV encoding for recorded audio. Browsers record webm/opus while the ASR
 * provider accepts only wav and mp3, so a recording is decoded and re-encoded
 * as 16 kHz mono PCM16 before it leaves the browser.
 * @module @deepseek-ai/dsh-client-ui-voice-input/client/audio-encoder
 */
/** Sample rate the provider expects; resampling targets this rate. */
const TARGET_SAMPLE_RATE = 16000;
/** Mono: one channel is both what the provider expects and what speech needs. */
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
/** Canonical PCM WAV header length, in bytes. */
const HEADER_BYTES = 44;
/** WAV format tag for uncompressed PCM. */
const FORMAT_PCM = 1;
/**
 * Encode decoded audio as a base64 WAV data URL. The data-URL form lets the
 * provider read the container from the MIME type rather than a separate format
 * field.
 * @param audioBuffer - Decoded audio from a recorded blob.
 * @returns WAV audio as `data:audio/wav;base64,...`.
 */
export function encodeWav(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const samples = audioBuffer.sampleRate === TARGET_SAMPLE_RATE
        ? channelData
        : resample(channelData, audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
    const wavBytes = createWavFile(floatTo16BitPCM(samples), TARGET_SAMPLE_RATE);
    return `data:audio/wav;base64,${base64OfBytes(wavBytes)}`;
}
/**
 * Resample by linear interpolation. Speech recognition tolerates the artifacts
 * a higher-order filter would remove, and this keeps the encode allocation-free
 * beyond the output buffer.
 * @param samples - Source samples.
 * @param fromRate - Source sample rate.
 * @param toRate - Target sample rate.
 * @returns Samples at the target rate.
 */
function resample(samples, fromRate, toRate) {
    const ratio = fromRate / toRate;
    const result = new Float32Array(Math.round(samples.length / ratio));
    for (let i = 0; i < result.length; i++) {
        const srcIndex = i * ratio;
        const floor = Math.floor(srcIndex);
        const ceil = Math.min(floor + 1, samples.length - 1);
        const t = srcIndex - floor;
        // Typed-array reads are `number | undefined` under noUncheckedIndexedAccess;
        // both indices are bounded above, so the fallback never applies.
        result[i] = (samples[floor] ?? 0) * (1 - t) + (samples[ceil] ?? 0) * t;
    }
    return result;
}
/**
 * Convert float samples to 16-bit PCM. The asymmetric scaling matches the
 * two's-complement range, whose negative bound is one larger than its positive.
 * @param samples - Float samples, clamped to [-1, 1].
 * @returns PCM16 samples.
 */
function floatTo16BitPCM(samples) {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
        pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
}
/**
 * Assemble a canonical PCM WAV file.
 * @param pcm16 - PCM16 samples.
 * @param sampleRate - Sample rate the header declares.
 * @returns Complete WAV bytes.
 */
function createWavFile(pcm16, sampleRate) {
    const bytesPerSample = BITS_PER_SAMPLE / 8;
    const blockAlign = NUM_CHANNELS * bytesPerSample;
    const dataSize = pcm16.length * bytesPerSample;
    const buffer = new ArrayBuffer(HEADER_BYTES + dataSize);
    const view = new DataView(buffer);
    writeAscii(view, 0, 'RIFF');
    // RIFF size counts everything after this field, not the whole file.
    view.setUint32(4, HEADER_BYTES - 8 + dataSize, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, FORMAT_PCM, true);
    view.setUint16(22, NUM_CHANNELS, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, BITS_PER_SAMPLE, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(HEADER_BYTES + i * bytesPerSample, pcm16[i] ?? 0, true);
    }
    return new Uint8Array(buffer);
}
/** Chunk size for base64 conversion, small enough to stay under argument limits. */
const BASE64_CHUNK = 0x8000;
/**
 * Base64-encode bytes. Chunked because spreading a whole recording into
 * `String.fromCharCode` overflows the call-argument limit.
 * @param bytes - Bytes to encode.
 * @returns Base64 text.
 */
function base64OfBytes(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
    }
    return btoa(binary);
}
/**
 * Write ASCII characters at a byte offset.
 * @param view - Target view.
 * @param offset - Byte offset.
 * @param text - ASCII text.
 */
function writeAscii(view, offset, text) {
    for (let i = 0; i < text.length; i++) {
        view.setUint8(offset + i, text.charCodeAt(i));
    }
}
//# sourceMappingURL=audio-encoder.js.map