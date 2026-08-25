/**
 * ASR Remote gateway. Browser clients cannot hold the provider API key and
 * cannot reach the provider origin directly, so transcription is a host
 * operation the browser calls through one Remote method.
 * @module @deepseek-ai/dsh-asr-gateway
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { AsrTranscribeOptions, AsrTranscriptionView } from './types.ts';
export type * from './types.ts';
/**
 * Remote-only service exposing speech recognition to browser clients.
 *
 * The Cordis service key and the wire namespace differ on purpose: `asr` is
 * held by the provider this gateway forwards to, so taking that key would
 * collide with it and make `ctx.get('asr')` resolve to the gateway itself. The
 * browser still calls `ctx.remote.asr.transcribe`.
 */
export declare class AsrGateway extends TypertRemoteService {
    constructor(ctx: Context);
    /**
     * Transcribe one recording to text.
     *
     * The `asr` provider is optional composition: a deployment without one
     * fails the call rather than returning empty text, because a silent empty
     * result is indistinguishable from a recording that held no speech.
     * @param audioBase64 - Audio as a data URL or bare base64 string.
     * @param options - Format and language hints.
     * @returns The recognized text and its reported duration.
     */
    transcribe(audioBase64: string, options?: AsrTranscribeOptions): Promise<AsrTranscriptionView>;
}
export default AsrGateway;
//# sourceMappingURL=index.d.ts.map