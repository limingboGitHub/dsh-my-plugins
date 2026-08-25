/**
 * Voice input plugin, browser half: contributes a microphone control to the
 * composer tool row. Recording and audio encoding happen in the browser; the
 * provider API key and the provider request stay on the host, reached through
 * the `asr` Remote.
 * @module dsh-client-ui-voice-input/client
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the composer tool row).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { VoiceInputControl } from './VoiceInputControl.tsx'
import { transcribeOverHttp } from './transport.ts'
import { en, zh, type VoiceKey } from './locales.ts'

export type { VoiceInputInjected } from './contract.ts'
export type { VoiceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Voice input control copy. */
    voice: VoiceKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'voice'

/** Required services: the composer seat's slot registry, locale, and sessions. */
export const inject = ['slots', 'locale', 'sessions']

/**
 * Client plugin body: register the microphone control over the ASR Remote.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-voice-input: dictionaries')

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'voice',
    order: 30,
    locale: NS,
    inject: (sessionId: SessionId) => ({
      // Failure strings stay English (error-surface policy: not localized).
      transcribe: async (audioBase64: string) => transcribeOverHttp(audioBase64),
      // The draft write path: the per-session input facade owns every draft
      // mutation, so the control never touches the textarea itself.
      appendDraft: (text: string) => {
        const actx = ctx.sessions.scope(sessionId)
        if (actx === undefined) return
        const conversation = actx.get('conversation')
        if (conversation === undefined) return
        const input = conversation.input.for(actx)
        const current = input.state.getSnapshot().draft
        input.setDraft(current.length === 0 ? text : `${current} ${text}`)
      },
    }),
  }, VoiceInputControl))
}
