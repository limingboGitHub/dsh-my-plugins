/**
 * Voice input plugin, browser half: contributes a microphone control to the
 * composer tool row. Recording and audio encoding happen in the browser; the
 * provider API key and the provider request stay on the host, reached through
 * the package's HTTP transcription endpoint.
 * @module dsh-client-ui-voice-input/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the session controller service merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the slot registry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
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

/** Required services: the slot registry, locale, and the session scope resolver. */
export const inject = ['slots', 'locale', 'sessions']

/**
 * Client plugin body: register the microphone control over the composer
 * input tool row. Session-scoped draft writes resolve live through the
 * conversation service facade, so a transcription landing after a session
 * switch still reaches its own session's composer.
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
      // mutation, so the control never touches the editor itself. Resolved
      // per call so the current draft is read live at append time.
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