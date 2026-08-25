/**
 * Xiaomi MiMo ASR provider. Recognition rides the vendor's OpenAI-compatible
 * chat-completions endpoint: the audio travels as one `input_audio` content
 * part and the recognized text comes back as ordinary message content.
 * @module @deepseek-ai/dsh-asr-mimo
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { AsrProvider } from '@deepseek-ai/dsh-asr';
import type { AsrRequest, AsrResult } from '@deepseek-ai/dsh-asr';
export type * from './types.ts';
export declare const name = "asr-mimo";
/** MiMo provider configuration. */
export interface Config {
    /** API base URL with `/v1`; `/chat/completions` is appended. */
    baseUrl?: string;
    /** Recognition model name. */
    model?: string;
    /** Environment-variable name holding the API key. */
    apiKeyEnv?: string;
}
export declare const Config: z<Config>;
/**
 * MiMo recognition over the vendor's OpenAI-compatible endpoint. Every
 * deployment-varying value is resolved once at construction; the credential is
 * resolved per call so a rotated key needs no restart.
 */
declare class MimoAsrProvider extends AsrProvider {
    static inject: string[];
    static Config: z<Config>;
    private readonly resolved;
    constructor(ctx: Context, config?: Config);
    transcribe(request: AsrRequest): Promise<AsrResult>;
}
export default MimoAsrProvider;
//# sourceMappingURL=index.d.ts.map