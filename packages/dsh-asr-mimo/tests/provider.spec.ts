/**
 * MiMo provider request assembly and failure reporting: config decides the
 * endpoint, model, and credential name; the credential is resolved per call so
 * a rotated key takes effect without a restart; credentialed requests never
 * follow a redirect; and each vendor failure carries its own error code.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsrError } from 'dsh-asr'
import MimoAsrProvider, { Config } from '../src/index.ts'

const DEFAULT_ENDPOINT = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions'

/** One successful vendor response carrying recognized text. */
function vendorSaid(content: string, seconds?: number): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
    ...seconds === undefined ? {} : { usage: { seconds } },
  }), { status: 200 })
}

/**
 * Fetch double. The implementation declares its parameters so recorded calls
 * keep their argument types and request assertions need no cast.
 * @returns a fetch mock answering with one recognized transcription.
 */
function makeFetchMock() {
  return vi.fn((_url: string, _init: RequestInit) => Promise.resolve(vendorSaid('recognized text')))
}

type FetchMock = ReturnType<typeof makeFetchMock>

interface Bench {
  readonly provider: MimoAsrProvider
  readonly fetchMock: FetchMock
  readonly resolve: ReturnType<typeof vi.fn>
}

/** Absent credential, distinct from "argument omitted" at the bench call. */
const NO_CREDENTIAL = Symbol('no credential')

function bench(config: Config = {}, credential: { value: string } | typeof NO_CREDENTIAL = { value: 'k-secret' }): Bench {
  const ctx = new Context()
  const resolve = vi.fn(() => Promise.resolve(credential === NO_CREDENTIAL ? undefined : credential))
  ctx.provide('credentials', { resolve })
  // Config defaults are applied by the Loader in production; applying the
  // schema here keeps the spec on the same values a deployment sees.
  const provider = new MimoAsrProvider(ctx, new Config(config))
  const fetchMock = makeFetchMock()
  vi.stubGlobal('fetch', fetchMock)
  return { provider, fetchMock, resolve }
}

/** The single request the provider issued. */
function requestOf(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init }
}

/** The JSON body of the single request. */
function bodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(requestOf(fetchMock).init.body as string) as Record<string, unknown>
}

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('MimoAsrProvider.transcribe', () => {
  it('posts to the default endpoint with the default model', async () => {
    const b = bench()
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).resolves.toEqual({
      text: 'recognized text', duration: undefined,
    })
    expect(requestOf(b.fetchMock).url).toBe(DEFAULT_ENDPOINT)
    expect(bodyOf(b.fetchMock).model).toBe('mimo-v2.5-asr')
  })

  it('honours a configured base URL, model, and credential name', async () => {
    const b = bench({
      baseUrl: 'https://asr.example.test/v2',
      model: 'other-asr',
      apiKeyEnv: 'OTHER_KEY',
    })
    await b.provider.transcribe({ audioBase64: 'AAAA' })
    expect(requestOf(b.fetchMock).url).toBe('https://asr.example.test/v2/chat/completions')
    expect(bodyOf(b.fetchMock).model).toBe('other-asr')
    expect(b.resolve).toHaveBeenCalledWith('OTHER_KEY')
  })

  it('does not double the separator when the base URL ends in slashes', async () => {
    const b = bench({ baseUrl: 'https://asr.example.test/v1//' })
    await b.provider.transcribe({ audioBase64: 'AAAA' })
    expect(requestOf(b.fetchMock).url).toBe('https://asr.example.test/v1/chat/completions')
  })

  it('never follows a redirect on a credentialed request', async () => {
    const b = bench()
    await b.provider.transcribe({ audioBase64: 'AAAA' })
    expect(requestOf(b.fetchMock).init.redirect).toBe('error')
  })

  it('sends the API key as a header and never in the body', async () => {
    const b = bench()
    await b.provider.transcribe({ audioBase64: 'AAAA' })
    const { init } = requestOf(b.fetchMock)
    expect((init.headers as Record<string, string>)['api-key']).toBe('k-secret')
    expect(init.body as string).not.toContain('k-secret')
  })

  it('resolves the credential per call so a rotated key takes effect', async () => {
    const ctx = new Context()
    const resolve = vi.fn()
      .mockResolvedValueOnce({ value: 'first' })
      .mockResolvedValueOnce({ value: 'second' })
    ctx.provide('credentials', { resolve })
    const provider = new MimoAsrProvider(ctx, new Config({}))
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    await provider.transcribe({ audioBase64: 'AAAA' })
    await provider.transcribe({ audioBase64: 'AAAA' })
    expect(resolve).toHaveBeenCalledTimes(2)
    const keyOf = (call: number) => {
      const recorded = fetchMock.mock.calls[call]
      if (recorded === undefined) throw new Error(`fetch call ${call} was never made`)
      return (recorded[1].headers as Record<string, string>)['api-key']
    }
    expect(keyOf(0)).toBe('first')
    expect(keyOf(1)).toBe('second')
  })

  it('wraps bare base64 in a data URL whose MIME matches the declared format', async () => {
    const wav = bench()
    await wav.provider.transcribe({ audioBase64: 'AAAA', format: 'wav' })
    expect(JSON.stringify(bodyOf(wav.fetchMock))).toContain('data:audio/wav;base64,AAAA')
    vi.unstubAllGlobals()

    const mp3 = bench()
    await mp3.provider.transcribe({ audioBase64: 'AAAA', format: 'mp3' })
    expect(JSON.stringify(bodyOf(mp3.fetchMock))).toContain('data:audio/mpeg;base64,AAAA')
    vi.unstubAllGlobals()

    // No declared format: wav is the container the browser half produces.
    const bare = bench()
    await bare.provider.transcribe({ audioBase64: 'AAAA' })
    expect(JSON.stringify(bodyOf(bare.fetchMock))).toContain('data:audio/wav;base64,AAAA')
  })

  it('passes an existing data URL through untouched', async () => {
    const b = bench()
    await b.provider.transcribe({ audioBase64: 'data:audio/mpeg;base64,ZZZZ', format: 'wav' })
    const body = JSON.stringify(bodyOf(b.fetchMock))
    expect(body).toContain('data:audio/mpeg;base64,ZZZZ')
    expect(body).not.toContain('data:audio/wav;base64,data:')
  })

  it('sends recognition options only when a language is requested', async () => {
    const with_ = bench()
    await with_.provider.transcribe({ audioBase64: 'AAAA', language: 'zh' })
    expect(bodyOf(with_.fetchMock).asr_options).toEqual({ language: 'zh' })
    vi.unstubAllGlobals()

    const without = bench()
    await without.provider.transcribe({ audioBase64: 'AAAA' })
    expect(bodyOf(without.fetchMock)).not.toHaveProperty('asr_options')
  })

  it('reports the duration the vendor billed', async () => {
    const b = bench()
    b.fetchMock.mockResolvedValueOnce(vendorSaid('x', 3.25))
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).resolves.toEqual({ text: 'x', duration: 3.25 })
  })

  it('trims surrounding whitespace from recognized text', async () => {
    const b = bench()
    b.fetchMock.mockResolvedValueOnce(vendorSaid('  padded  '))
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).resolves.toEqual({
      text: 'padded', duration: undefined,
    })
  })

  it('fails with MISSING_API_KEY when the credential is absent', async () => {
    const b = bench({}, NO_CREDENTIAL)
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).rejects.toThrow(AsrError)
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
    })
    expect(b.fetchMock).not.toHaveBeenCalled()
  })

  it('names the configured credential in the missing-key failure', async () => {
    const b = bench({ apiKeyEnv: 'OTHER_KEY' }, NO_CREDENTIAL)
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).rejects.toThrow(/OTHER_KEY/u)
  })

  it('reports an API failure with its status code and body', async () => {
    const b = bench()
    b.fetchMock.mockResolvedValueOnce(new Response('quota exhausted', { status: 429, statusText: 'Too Many Requests' }))
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).rejects.toMatchObject({
      code: 'API_ERROR', statusCode: 429,
    })
    b.fetchMock.mockResolvedValueOnce(new Response('quota exhausted', { status: 429, statusText: 'Too Many Requests' }))
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).rejects.toThrow(/429.*quota exhausted/u)
  })

  it('reports an API failure whose body cannot be read', async () => {
    const b = bench()
    const broken: Response = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.reject(new Error('stream broken')),
    } as Response
    b.fetchMock.mockResolvedValueOnce(broken)
    await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).rejects.toThrow(
      'MiMo API request failed: 500 Internal Server Error',
    )
  })

  it('fails with EMPTY_RESPONSE when no transcription came back', async () => {
    const b = bench()
    for (const payload of ['{}', '{"choices":[]}', '{"choices":[{}]}', '{"choices":[{"message":{}}]}']) {
      b.fetchMock.mockResolvedValueOnce(new Response(payload, { status: 200 }))
      await expect(b.provider.transcribe({ audioBase64: 'AAAA' })).rejects.toMatchObject({
        code: 'EMPTY_RESPONSE',
      })
    }
  })
})
