/**
 * AsrGateway forwarding and admission: an empty or oversized payload and an
 * uncomposed provider are refused before any provider call, format and
 * language hints pass through only when supplied, and a reported duration
 * survives while an absent one stays absent.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { AsrRequest, AsrResult } from 'dsh-asr'
import { AsrGateway } from '../src/index.ts'

/** Base64 length the gateway refuses above. */
const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024

function bench(result: AsrResult = { text: 'hello' }) {
  const ctx = new Context()
  const transcribe = vi.fn((_request: AsrRequest) => Promise.resolve(result))
  ctx.provide('asr', { transcribe })
  const gateway = new AsrGateway(ctx)
  return { ctx, gateway, transcribe }
}

describe('AsrGateway.transcribe', () => {
  it('forwards audio and returns the provider text', async () => {
    const b = bench({ text: '  spoken words  ' })
    await expect(b.gateway.transcribe('AAAA')).resolves.toEqual({ text: '  spoken words  ' })
    expect(b.transcribe).toHaveBeenCalledWith({ audioBase64: 'AAAA' })
  })

  it('passes format and language only when supplied', async () => {
    const b = bench()
    await b.gateway.transcribe('AAAA', { format: 'mp3', language: 'zh' })
    expect(b.transcribe).toHaveBeenLastCalledWith({
      audioBase64: 'AAAA', format: 'mp3', language: 'zh',
    })

    await b.gateway.transcribe('AAAA', { format: 'wav' })
    expect(b.transcribe).toHaveBeenLastCalledWith({ audioBase64: 'AAAA', format: 'wav' })

    await b.gateway.transcribe('AAAA', {})
    expect(b.transcribe).toHaveBeenLastCalledWith({ audioBase64: 'AAAA' })
  })

  it('reports a duration only when the provider gives one', async () => {
    await expect(bench({ text: 'x', duration: 2.5 }).gateway.transcribe('AAAA'))
      .resolves.toEqual({ text: 'x', duration: 2.5 })
    await expect(bench({ text: 'x' }).gateway.transcribe('AAAA'))
      .resolves.toEqual({ text: 'x' })
    await expect(bench({ text: 'x', duration: 0 }).gateway.transcribe('AAAA'))
      .resolves.toEqual({ text: 'x', duration: 0 })
  })

  it('refuses an empty payload without calling the provider', async () => {
    const b = bench()
    await expect(b.gateway.transcribe('')).rejects.toThrow('asr transcribe requires audio data')
    expect(b.transcribe).not.toHaveBeenCalled()
  })

  it('accepts the largest payload and refuses one character more', async () => {
    const b = bench()
    await expect(b.gateway.transcribe('a'.repeat(MAX_AUDIO_BASE64_LENGTH))).resolves.toEqual({ text: 'hello' })

    const oversized = 'a'.repeat(MAX_AUDIO_BASE64_LENGTH + 1)
    await expect(b.gateway.transcribe(oversized)).rejects.toThrow(
      `audio payload is ${oversized.length} base64 characters, above the ${MAX_AUDIO_BASE64_LENGTH} limit`,
    )
    expect(b.transcribe).toHaveBeenCalledTimes(1)
  })

  it('fails when no provider is composed rather than returning empty text', async () => {
    const ctx = new Context()
    await expect(new AsrGateway(ctx).transcribe('AAAA')).rejects.toThrow('no asr provider is composed')
  })

  it('propagates a provider failure unchanged', async () => {
    const ctx = new Context()
    ctx.provide('asr', { transcribe: () => Promise.reject(new Error('vendor exploded')) })
    await expect(new AsrGateway(ctx).transcribe('AAAA')).rejects.toThrow('vendor exploded')
  })
})
