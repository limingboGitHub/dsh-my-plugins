/**
 * Voice input plugin, browser half: contributes a microphone control to the
 * composer tool row. Recording and audio encoding happen in the browser; the
 * provider API key and the provider request stay on the host, reached through
 * the `asr` Remote.
 * @module @deepseek-ai/dsh-client-ui-voice-input/client
 */
import { VoiceInputControl } from "./VoiceInputControl.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'voice';
/** Required services: the composer seat's slot registry, the ASR Remote, and locale. */
export const inject = ['slots', 'remote', 'remote.asr', 'locale', 'sessions'];
/**
 * Client plugin body: register the microphone control over the ASR Remote.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-voice-input: dictionaries');
    ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'voice',
        order: 30,
        locale: NS,
        inject: (sessionId) => ({
            // Failure strings stay English (error-surface policy: not localized).
            transcribe: async (audioBase64) => {
                const result = await ctx.remote.asr.transcribe(audioBase64, {
                    format: 'wav',
                    language: 'auto',
                });
                if (!result.ok)
                    return { error: `${result.error.message} (${result.error.code})` };
                return { text: result.value.text };
            },
            // The draft write path: the per-session input facade owns every draft
            // mutation, so the control never touches the textarea itself.
            appendDraft: (text) => {
                const actx = ctx.sessions.scope(sessionId);
                if (actx === undefined)
                    return;
                const conversation = actx.get('conversation');
                if (conversation === undefined)
                    return;
                const input = conversation.input.for(actx);
                const current = input.state.getSnapshot().draft;
                input.setDraft(current.length === 0 ? text : `${current} ${text}`);
            },
        }),
    }, VoiceInputControl));
}
//# sourceMappingURL=index.js.map