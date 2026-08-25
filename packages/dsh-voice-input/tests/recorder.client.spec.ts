// @vitest-environment jsdom
/**
 * recorder.ts microphone capture: canRecord gates on the capture and
 * recording APIs, startRecording folds missing APIs and permission refusal
 * into failed outcomes without prompting, and a live recording releases its
 * media tracks on every exit — encoded audio, empty capture, decode failure,
 * or cancel. encodeWav is mocked so the spec covers orchestration, not WAV
 * bytes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canRecord, startRecording, type ActiveRecording } from '../src/client/recorder.ts'
import { encodeWav } from '../src/client/audio-encoder.ts'

vi.mock('../src/client/audio-encoder.ts', () => ({
  encodeWav: vi.fn(() => 'bW9ja2VkLXdhdg=='),
}))

/**
 * Controllable MediaRecorder stand-in. stop() flushes queued chunks through
 * ondataavailable and then fires onstop synchronously, because the real
 * stop() path awaits the promise resolved by that handler.
 */
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported: ((mimeType: string) => boolean) | undefined

  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  readonly stream: unknown
  readonly options: unknown
  private readonly pending: Blob[] = []

  constructor(stream: unknown, options?: unknown) {
    this.stream = stream
    this.options = options
    FakeMediaRecorder.instances.push(this)
  }

  start(): void {
    this.state = 'recording'
  }

  queueChunk(data: Blob): void {
    this.pending.push(data)
  }

  stop(): void {
    this.state = 'inactive'
    for (const data of this.pending) this.ondataavailable?.({ data })
    this.onstop?.()
  }
}

interface FakeEnvironment {
  getUserMedia: ReturnType<typeof vi.fn>
  trackStops: Array<ReturnType<typeof vi.fn>>
  decodeAudioData: ReturnType<typeof vi.fn>
  contextClose: ReturnType<typeof vi.fn>
}

/** Installs a working set of browser capture fakes; overrides replace single behaviors. */
function installEnvironment(overrides: {
  getUserMedia?: (constraints: unknown) => Promise<unknown>
  isTypeSupported?: (mimeType: string) => boolean
  decodeAudioData?: () => Promise<{ length: number }>
} = {}): FakeEnvironment {
  const trackStops = [vi.fn(), vi.fn()]
  const stream = { getTracks: () => trackStops.map(stop => ({ stop })) }
  const getUserMedia = vi.fn(overrides.getUserMedia ?? (() => Promise.resolve(stream)))
  const decodeAudioData = vi.fn(overrides.decodeAudioData ?? (() => Promise.resolve({ length: 16000 })))
  const contextClose = vi.fn(() => Promise.resolve())

  FakeMediaRecorder.instances = []
  FakeMediaRecorder.isTypeSupported = overrides.isTypeSupported
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('AudioContext', class {
    decodeAudioData = decodeAudioData
    close = contextClose
  })
  return { getUserMedia, trackStops, decodeAudioData, contextClose }
}

async function startActive(): Promise<ActiveRecording> {
  const result = await startRecording()
  if (!('stop' in result)) throw new Error('expected an active recording')
  return result
}

/** The recorder startRecording constructed; every caller has already started one. */
function onlyRecorder(): FakeMediaRecorder {
  const [constructed] = FakeMediaRecorder.instances
  if (constructed === undefined) throw new Error('no recorder was constructed')
  return constructed
}

beforeEach(() => {
  vi.mocked(encodeWav).mockClear()
  // jsdom implements Blob without arrayBuffer(). Without this the recorder's
  // decode step throws before reaching decodeAudioData, and every captured
  // recording would look like an undecodable one.
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      return Promise.resolve(new ArrayBuffer(this.size))
    }
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canRecord', () => {
  it('returns false when MediaRecorder is absent', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } })
    expect(canRecord()).toBe(false)
  })

  it('returns false when navigator.mediaDevices is absent', () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    vi.stubGlobal('navigator', {})
    expect(canRecord()).toBe(false)
  })

  it('returns false when getUserMedia is not a function', () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    vi.stubGlobal('navigator', { mediaDevices: {} })
    expect(canRecord()).toBe(false)
  })

  it('returns true when capture and recording APIs are present', () => {
    installEnvironment()
    expect(canRecord()).toBe(true)
  })
})

describe('startRecording', () => {
  it('fails unsupported without requesting the microphone when APIs are missing', async () => {
    const env = installEnvironment()
    vi.stubGlobal('MediaRecorder', undefined)
    await expect(startRecording()).resolves.toEqual({ kind: 'failed', failure: 'unsupported' })
    expect(env.getUserMedia).not.toHaveBeenCalled()
  })

  it('fails denied when getUserMedia rejects', async () => {
    installEnvironment({ getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) })
    await expect(startRecording()).resolves.toEqual({ kind: 'failed', failure: 'denied' })
  })

  it('requests mono 16 kHz audio capture', async () => {
    const env = installEnvironment()
    await startActive()
    /* oxlint-disable typescript/no-unsafe-assignment */
    expect(env.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ channelCount: 1, sampleRate: 16000 }),
      }),
    )
    /* oxlint-enable typescript/no-unsafe-assignment */
  })

  it('constructs the recorder with audio/webm;codecs=opus when supported', async () => {
    installEnvironment({ isTypeSupported: mimeType => mimeType === 'audio/webm;codecs=opus' })
    await startActive()
    expect(onlyRecorder().options).toEqual({ mimeType: 'audio/webm;codecs=opus' })
  })

  it('constructs the recorder without a mimeType when every candidate is rejected', async () => {
    installEnvironment({ isTypeSupported: () => false })
    await startActive()
    expect(onlyRecorder().options).toBeUndefined()
  })

  it('constructs the recorder without a mimeType when isTypeSupported is missing', async () => {
    installEnvironment()
    await startActive()
    expect(onlyRecorder().options).toBeUndefined()
  })
})

describe('ActiveRecording.stop', () => {
  it('encodes captured chunks and releases every media track', async () => {
    const env = installEnvironment()
    const recording = await startActive()
    onlyRecorder().queueChunk(new Blob(['chunk']))
    await expect(recording.stop()).resolves.toEqual({ kind: 'audio', audioBase64: 'bW9ja2VkLXdhdg==' })
    for (const trackStop of env.trackStops) expect(trackStop).toHaveBeenCalledTimes(1)
  })

  it('fails empty when nothing was captured', async () => {
    installEnvironment()
    const recording = await startActive()
    await expect(recording.stop()).resolves.toEqual({ kind: 'failed', failure: 'empty' })
  })

  it('fails empty when decoding rejects, still closing the context and releasing tracks', async () => {
    const env = installEnvironment({ decodeAudioData: () => Promise.reject(new Error('undecodable')) })
    const recording = await startActive()
    onlyRecorder().queueChunk(new Blob(['chunk']))
    await expect(recording.stop()).resolves.toEqual({ kind: 'failed', failure: 'empty' })
    expect(env.contextClose).toHaveBeenCalledTimes(1)
    for (const trackStop of env.trackStops) expect(trackStop).toHaveBeenCalledTimes(1)
  })

  it('fails empty when the decoded buffer has length zero', async () => {
    installEnvironment({ decodeAudioData: () => Promise.resolve({ length: 0 }) })
    const recording = await startActive()
    onlyRecorder().queueChunk(new Blob(['chunk']))
    await expect(recording.stop()).resolves.toEqual({ kind: 'failed', failure: 'empty' })
  })

  it('ignores zero-size data events', async () => {
    installEnvironment()
    const recording = await startActive()
    onlyRecorder().queueChunk(new Blob([]))
    await expect(recording.stop()).resolves.toEqual({ kind: 'failed', failure: 'empty' })
    expect(vi.mocked(encodeWav)).not.toHaveBeenCalled()
  })

  it('resolves when the recorder is already inactive', async () => {
    installEnvironment()
    const recording = await startActive()
    const fake = onlyRecorder()
    // An externally ended recorder has already delivered its data and onstop.
    fake.ondataavailable?.({ data: new Blob(['chunk']) })
    fake.state = 'inactive'
    fake.onstop?.()
    await expect(recording.stop()).resolves.toEqual({ kind: 'audio', audioBase64: 'bW9ja2VkLXdhdg==' })
  })
})

describe('ActiveRecording.cancel', () => {
  it('stops the recorder and releases every track without encoding', async () => {
    const env = installEnvironment()
    const recording = await startActive()
    recording.cancel()
    expect(onlyRecorder().state).toBe('inactive')
    for (const trackStop of env.trackStops) expect(trackStop).toHaveBeenCalledTimes(1)
    expect(vi.mocked(encodeWav)).not.toHaveBeenCalled()
  })
})
