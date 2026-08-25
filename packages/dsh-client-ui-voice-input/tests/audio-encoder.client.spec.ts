// @vitest-environment jsdom
/**
 * encodeWav resamples decoded audio to 16 kHz mono PCM16 and wraps it in a
 * canonical 44-byte PCM WAV header, returned as a base64 data URL. Channel 0
 * alone is encoded, float samples clamp to [-1, 1], and an empty buffer
 * yields a header-only file.
 */
import { describe, expect, it } from 'vitest'
import { encodeWav } from '../src/client/audio-encoder.ts'

/**
 * Minimal AudioBuffer stand-in; jsdom has no Web Audio API.
 * @param sampleRate - Declared sample rate.
 * @param channels - Channel data arrays; index 0 is what encodeWav reads.
 * @returns An object structurally sufficient for encodeWav.
 */
function fakeAudioBuffer(sampleRate: number, channels: Float32Array[]): AudioBuffer {
  return {
    sampleRate,
    length: channels[0]?.length ?? 0,
    getChannelData: (channel: number) => channels[channel]!,
  } as unknown as AudioBuffer
}

const DATA_URL_PREFIX = 'data:audio/wav;base64,'

/**
 * Decode a WAV data URL back into bytes with a DataView over them.
 * @param dataUrl - Value returned by encodeWav.
 * @returns The raw bytes and a little-endian view for reading header fields.
 */
function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; view: DataView } {
  const base64 = dataUrl.slice(DATA_URL_PREFIX.length)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { bytes, view: new DataView(bytes.buffer) }
}

/** Read four ASCII bytes from a view. */
function asciiAt(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

describe('encodeWav', () => {
  it('returns a data:audio/wav;base64, prefixed string', () => {
    const result = encodeWav(fakeAudioBuffer(16000, [new Float32Array([0])]))
    expect(result.startsWith(DATA_URL_PREFIX)).toBe(true)
  })

  it('writes the canonical PCM WAV header for 16000 Hz input', () => {
    const samples = new Float32Array(100)
    const { view } = decodeDataUrl(encodeWav(fakeAudioBuffer(16000, [samples])))

    expect(asciiAt(view, 0)).toBe('RIFF')
    expect(asciiAt(view, 8)).toBe('WAVE')
    expect(asciiAt(view, 12)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(28, true)).toBe(32000)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(asciiAt(view, 36)).toBe('data')
    expect(view.getUint32(40, true)).toBe(samples.length * 2)
  })

  it('sizes the file and the RIFF field from the sample count', () => {
    const samples = new Float32Array(37)
    const { bytes, view } = decodeDataUrl(encodeWav(fakeAudioBuffer(16000, [samples])))

    const dataSize = samples.length * 2
    expect(bytes.length).toBe(44 + dataSize)
    expect(view.getUint32(4, true)).toBe(36 + dataSize)
  })

  it('halves the sample count when resampling from 32000 Hz', () => {
    const source = new Float32Array(200)
    const { view } = decodeDataUrl(encodeWav(fakeAudioBuffer(32000, [source])))
    expect(view.getUint32(40, true)).toBe(100 * 2)
  })

  it('keeps one third of the samples when resampling from 48000 Hz', () => {
    const source = new Float32Array(300)
    const { view } = decodeDataUrl(encodeWav(fakeAudioBuffer(48000, [source])))
    expect(view.getUint32(40, true)).toBe(100 * 2)
  })

  it('encodes 1, -1, and 0 to the full PCM16 range endpoints and zero', () => {
    const samples = new Float32Array([1, -1, 0])
    const { view } = decodeDataUrl(encodeWav(fakeAudioBuffer(16000, [samples])))

    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
    expect(view.getInt16(48, true)).toBe(0)
  })

  it('clamps out-of-range samples to the PCM16 endpoints', () => {
    const samples = new Float32Array([2, -2])
    const { view } = decodeDataUrl(encodeWav(fakeAudioBuffer(16000, [samples])))

    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
  })

  it('encodes only channel 0', () => {
    const buffer = fakeAudioBuffer(16000, [
      new Float32Array([1]),
      new Float32Array([-1]),
    ])
    const { view } = decodeDataUrl(encodeWav(buffer))
    expect(view.getInt16(44, true)).toBe(32767)
  })

  it('produces a 44-byte header-only file for an empty sample array', () => {
    const { bytes, view } = decodeDataUrl(
      encodeWav(fakeAudioBuffer(16000, [new Float32Array(0)])),
    )
    expect(bytes.length).toBe(44)
    expect(view.getUint32(40, true)).toBe(0)
  })
})
