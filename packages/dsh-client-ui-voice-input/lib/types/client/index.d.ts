/**
 * Voice input plugin, browser half: contributes a microphone control to the
 * composer tool row. Recording and audio encoding happen in the browser; the
 * provider API key and the provider request stay on the host, reached through
 * the `asr` Remote.
 * @module @deepseek-ai/dsh-client-ui-voice-input/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type VoiceKey } from './locales.ts';
export type { VoiceInputInjected } from './contract.ts';
export type { VoiceKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Voice input control copy. */
        voice: VoiceKey;
    }
}
/** Required services: the composer seat's slot registry, the ASR Remote, and locale. */
export declare const inject: string[];
/**
 * Client plugin body: register the microphone control over the ASR Remote.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map