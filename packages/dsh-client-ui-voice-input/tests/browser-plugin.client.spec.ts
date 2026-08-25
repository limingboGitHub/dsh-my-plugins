// @vitest-environment jsdom
/**
 * ui-voice-input browser half on a real SlotRegistry: the plugin waits for the
 * conversation-declared `conversation.input.left` seat before occupying it with
 * the microphone control; the injected face folds RPC outcomes into recognized
 * text or a user-visible failure line, appends to the session draft through the
 * input facade, and teardown empties the seat (HMR safety).
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { VoiceInputControl } from '../src/client/VoiceInputControl.tsx'
import type { VoiceInputInjected } from '../src/client/contract.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

const SID = 's-voice' as SessionId

/** Declare the seat ui-conversation owns in production. */
function declareSeat(ctx: Context): void {
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.input.left': { kind: 'list', scope: 'session' } },
  } as never, () => null)
}

async function bench(options: { draft?: string; noSession?: boolean; noConversation?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  declareSeat(ctx)

  const transcribe = vi.fn((_audio: string, _options: unknown) =>
    Promise.resolve({ ok: true as const, value: { text: 'recognized words' } }))
  const asrRemote = { transcribe }
  ctx.provide('remote', { asr: asrRemote })
  ctx.provide('remote.asr', asrRemote)
  ctx.provide('locale', new LocaleRuntime(ctx))

  const setDraft = vi.fn()
  const input = {
    setDraft,
    state: { getSnapshot: () => ({ draft: options.draft ?? '' }) },
  }
  // The scoped context the plugin reaches for; `conversation` is resolved off
  // it exactly as production does.
  const scoped = { get: (name: string) => (options.noConversation === true || name !== 'conversation'
    ? undefined
    : { input: { for: () => input } }) }
  ctx.provide('sessions', {
    scope: (id: SessionId) => (options.noSession === true || id !== SID ? undefined : scoped),
  } as never)

  return { ctx, transcribe, setDraft }
}

/** The injected face of the single registered entry. */
function injectedFace(ctx: Context): VoiceInputInjected {
  const entry = ctx.slots.entries('conversation.input.left')[0]!
  return (entry.inject as unknown as (id: SessionId) => VoiceInputInjected)(SID)
}

describe('ui-voice-input browser apply', () => {
  it('declares every service it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.asr', 'locale', 'sessions'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('waits until conversation declares the composer tool row', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const asrRemote = { transcribe: vi.fn() }
    ctx.provide('remote', { asr: asrRemote })
    ctx.provide('remote.asr', asrRemote)
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('sessions', { scope: () => undefined } as never)

    await ctx.plugin({ inject: [...inject], apply }).await()
    expect(ctx.slots.entries('conversation.input.left')).toHaveLength(0)

    declareSeat(ctx)
    await Promise.resolve()
    expect(ctx.slots.entries('conversation.input.left')).toHaveLength(1)
  })

  it('registers the control and unregisters on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const entry = b.ctx.slots.entries('conversation.input.left')[0]!
    expect(entry.component).toBe(VoiceInputControl)

    await fiber.dispose()
    expect(b.ctx.slots.entries('conversation.input.left')).toHaveLength(0)
  })

  it('registers the voice dictionaries and releases them on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // jsdom names no language preference, so the fallback locale is active.
    expect(b.ctx.locale.bind('voice')('start')).toBe('Voice input')

    await fiber.dispose()
    // A missing key resolves to the key itself once the dictionaries are gone.
    expect(b.ctx.locale.bind('voice')('start')).toBe('start')
  })

  it('ships Chinese copy for every key it ships in English', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    b.ctx.locale.setLocale('zh')
    expect(b.ctx.locale.bind('voice')('start')).toBe('语音输入')
  })

  it('requests wav recognition and returns the recognized text', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    await expect(injectedFace(b.ctx).transcribe('data:audio/wav;base64,AAAA'))
      .resolves.toEqual({ text: 'recognized words' })
    expect(b.transcribe).toHaveBeenCalledWith('data:audio/wav;base64,AAAA', {
      format: 'wav', language: 'auto',
    })
  })

  it('folds an RPC failure into one user-visible line', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    b.transcribe.mockResolvedValueOnce({
      ok: false, error: { code: 'no-provider', message: 'no asr provider is composed', details: {} },
    } as never)

    await expect(injectedFace(b.ctx).transcribe('AAAA'))
      .resolves.toEqual({ error: 'no asr provider is composed (no-provider)' })
  })

  it('appends recognized text to an empty draft without a leading space', async () => {
    const b = await bench({ draft: '' })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    injectedFace(b.ctx).appendDraft('spoken')
    expect(b.setDraft).toHaveBeenCalledWith('spoken')
  })

  it('separates appended text from existing draft content', async () => {
    const b = await bench({ draft: 'typed' })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    injectedFace(b.ctx).appendDraft('spoken')
    expect(b.setDraft).toHaveBeenCalledWith('typed spoken')
  })

  it('drops the append when the session scope is gone', async () => {
    const b = await bench({ noSession: true })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(() => { injectedFace(b.ctx).appendDraft('spoken') }).not.toThrow()
    expect(b.setDraft).not.toHaveBeenCalled()
  })

  it('drops the append when conversation is not composed', async () => {
    const b = await bench({ noConversation: true })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(() => { injectedFace(b.ctx).appendDraft('spoken') }).not.toThrow()
    expect(b.setDraft).not.toHaveBeenCalled()
  })
})
