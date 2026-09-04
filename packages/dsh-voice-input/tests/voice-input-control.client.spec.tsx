// @vitest-environment jsdom
/**
 * VoiceInputControl over a stubbed recorder: the button toggles recording,
 * recognized text reaches the draft exactly once, each capture failure returns
 * the control to idle with localized copy, a submission in flight blocks a new
 * recording while still allowing a running one to stop, and unmounting mid
 * recording releases the microphone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from './translate.ts'
import { zh } from '../src/client/locales.ts'
import type { VoiceInputInjected, VoiceTranscription } from '../src/client/contract.ts'
import { VoiceInputControl, type VoiceInputControlProps } from '../src/client/VoiceInputControl.tsx'
import * as recorder from '../src/client/recorder.ts'

afterEach(cleanup)
beforeEach(() => { vi.restoreAllMocks() })

// The control renders only its own `voice` namespace, so the namespace
// dictionary alone resolves every key this suite asserts.
const t: VoiceInputControlProps['t'] = makeTranslate(zh)

// Derived from the props share: ui-conversation owns InputState and does not
// export it, so the seat's own useInput hook is the authority here.
type InputState = Parameters<Parameters<VoiceInputControlProps['useInput']>[0]>[0]

/**
 * A composer state in the given submit phase. Every field is supplied so the
 * double stays valid when InputState grows a member.
 * @param phase - the submit phase under test.
 * @returns one complete input state.
 */
function inputState(phase: InputState['phase']): InputState {
  return { draft: '', imageIds: [], draftRev: 0, phase, occurrences: [], queue: [] }
}

/** A composer state with no submission in flight. */
const plainInput = inputState('plain')

/**
 * Full component props for one composer state.
 * @param input - the composer state under test.
 * @param face - the injected transcribe/appendDraft pair.
 * @returns props ready to render.
 */
function voiceProps(input: InputState, face: VoiceInputInjected): VoiceInputControlProps {
  return {
    // The framework session kit: the control reads only useInput, so the
    // spec supplies typed stubs for the rest and asserts nothing about them.
    sessionId: 'voice-test' as VoiceInputControlProps['sessionId'],
    useSession: (() => undefined) as unknown as VoiceInputControlProps['useSession'],
    useProjection: (() => undefined) as unknown as VoiceInputControlProps['useProjection'],
    useConversation: (() => undefined) as unknown as VoiceInputControlProps['useConversation'],
    useInput: selector => selector(input),
    inputActions: {} as VoiceInputControlProps['inputActions'],
    useSessions: (() => undefined) as unknown as VoiceInputControlProps['useSessions'],
    useSessionPendingInteraction: (() => undefined) as unknown as VoiceInputControlProps['useSessionPendingInteraction'],
    useWorkspaces: (() => undefined) as unknown as VoiceInputControlProps['useWorkspaces'],
    ...face,
    t,
  }
}

/** One controllable recording whose stop outcome the test decides. */
function fakeRecording(outcome: recorder.RecorderOutcome) {
  const cancel = vi.fn()
  return { stop: vi.fn(() => Promise.resolve(outcome)), cancel }
}

function setup(options: {
  outcome?: recorder.RecorderOutcome
  startFailure?: recorder.RecorderFailure
  transcription?: VoiceTranscription
  input?: InputState
} = {}) {
  const recording = fakeRecording(options.outcome ?? { kind: 'audio', audioBase64: 'data:audio/wav;base64,AAAA' })
  const start = vi.spyOn(recorder, 'startRecording').mockResolvedValue(
    options.startFailure === undefined ? recording : { kind: 'failed', failure: options.startFailure },
  )
  const transcribe = vi.fn(() => Promise.resolve(options.transcription ?? { text: 'recognized words' }))
  const appendDraft = vi.fn()
  const view = render(
    <VoiceInputControl {...voiceProps(options.input ?? plainInput, { transcribe, appendDraft })} />,
  )
  return { view, recording, start, transcribe, appendDraft }
}

const startButton = () => screen.getByRole('button', { name: '语音输入' })
const stopButton = () => screen.getByRole('button', { name: '停止录音' })

describe('VoiceInputControl', () => {
  it('offers voice input while idle', () => {
    setup()
    expect(startButton().hasAttribute('disabled')).toBe(false)
  })

  it('records, transcribes, and appends the recognized text once', async () => {
    const b = setup()
    fireEvent.click(startButton())
    fireEvent.click(await screen.findByRole('button', { name: '停止录音' }))

    await waitFor(() => { expect(b.appendDraft).toHaveBeenCalledWith('recognized words') })
    expect(b.appendDraft).toHaveBeenCalledTimes(1)
    expect(b.transcribe).toHaveBeenCalledWith('data:audio/wav;base64,AAAA')
    expect(b.recording.stop).toHaveBeenCalledTimes(1)
    // Back to idle, ready for another recording.
    expect(startButton()).toBeTruthy()
  })

  it('reports an unsupported browser without starting a recording', async () => {
    const b = setup({ startFailure: 'unsupported' })
    fireEvent.click(startButton())
    expect(await screen.findByText('当前浏览器不支持录音')).toBeTruthy()
    expect(startButton()).toBeTruthy()
    expect(b.transcribe).not.toHaveBeenCalled()
  })

  it('reports a refused microphone', async () => {
    setup({ startFailure: 'denied' })
    fireEvent.click(startButton())
    expect(await screen.findByText('无法使用麦克风，请检查浏览器权限')).toBeTruthy()
  })

  it('reports a capture that produced no audio', async () => {
    const b = setup({ outcome: { kind: 'failed', failure: 'empty' } })
    fireEvent.click(startButton())
    fireEvent.click(await screen.findByRole('button', { name: '停止录音' }))
    expect(await screen.findByText('没有识别到语音内容')).toBeTruthy()
    expect(b.transcribe).not.toHaveBeenCalled()
  })

  it('reports empty recognition rather than appending nothing', async () => {
    const b = setup({ transcription: { text: '' } })
    fireEvent.click(startButton())
    fireEvent.click(await screen.findByRole('button', { name: '停止录音' }))
    expect(await screen.findByText('没有识别到语音内容')).toBeTruthy()
    expect(b.appendDraft).not.toHaveBeenCalled()
  })

  it('refuses an oversized recording before spending a round trip', async () => {
    const oversized = `data:audio/wav;base64,${'a'.repeat(10 * 1024 * 1024 + 1)}`
    const b = setup({ outcome: { kind: 'audio', audioBase64: oversized } })
    fireEvent.click(startButton())
    fireEvent.click(await screen.findByRole('button', { name: '停止录音' }))
    expect(await screen.findByText('录音过长，请缩短后重试')).toBeTruthy()
    expect(b.transcribe).not.toHaveBeenCalled()
  })

  it('surfaces a recognition failure line unlocalized', async () => {
    const b = setup({ transcription: { error: 'gone (session-not-found)' } })
    fireEvent.click(startButton())
    fireEvent.click(await screen.findByRole('button', { name: '停止录音' }))
    expect(await screen.findByText('gone (session-not-found)')).toBeTruthy()
    expect(b.appendDraft).not.toHaveBeenCalled()
  })

  it('surfaces a thrown transport failure', async () => {
    const b = setup()
    b.transcribe.mockRejectedValueOnce(new Error('network down'))
    fireEvent.click(startButton())
    fireEvent.click(await screen.findByRole('button', { name: '停止录音' }))
    expect(await screen.findByText('network down')).toBeTruthy()
    expect(startButton()).toBeTruthy()
  })

  it('blocks a new recording while a submission owns the draft', () => {
    const b = setup({ input: inputState('submitting') })
    expect(startButton().hasAttribute('disabled')).toBe(true)
    fireEvent.click(startButton())
    expect(b.start).not.toHaveBeenCalled()
  })

  it('still stops a recording that began before the submission', async () => {
    const b = setup()
    fireEvent.click(startButton())
    await screen.findByRole('button', { name: '停止录音' })

    b.view.rerender(<VoiceInputControl
      {...voiceProps(inputState('submitting'), { transcribe: b.transcribe, appendDraft: b.appendDraft })}
    />)
    expect(stopButton().hasAttribute('disabled')).toBe(false)
    fireEvent.click(stopButton())
    await waitFor(() => { expect(b.recording.stop).toHaveBeenCalledTimes(1) })
  })

  it('ignores a second click while transcribing', async () => {
    let settle!: (value: VoiceTranscription) => void
    const b = setup()
    b.transcribe.mockImplementationOnce(() => new Promise<VoiceTranscription>((done) => { settle = done }))
    fireEvent.click(startButton())
    fireEvent.click(await screen.findByRole('button', { name: '停止录音' }))

    const transcribing = await screen.findByRole('button', { name: '识别中' })
    expect(transcribing.hasAttribute('disabled')).toBe(true)
    fireEvent.click(transcribing)
    expect(b.transcribe).toHaveBeenCalledTimes(1)

    settle({ text: 'late words' })
    await waitFor(() => { expect(b.appendDraft).toHaveBeenCalledWith('late words') })
  })

  it('releases the microphone when unmounted mid recording', async () => {
    const b = setup()
    fireEvent.click(startButton())
    await screen.findByRole('button', { name: '停止录音' })
    b.view.unmount()
    expect(b.recording.cancel).toHaveBeenCalledTimes(1)
  })

  it('cancels a recording that starts after unmount', async () => {
    const recording = fakeRecording({ kind: 'audio', audioBase64: 'AAAA' })
    let begin!: (value: recorder.ActiveRecording) => void
    vi.spyOn(recorder, 'startRecording').mockReturnValue(
      new Promise<recorder.ActiveRecording>((done) => { begin = done }),
    )
    const view = render(<VoiceInputControl
      {...voiceProps(plainInput, { transcribe: vi.fn(), appendDraft: vi.fn() })}
    />)
    fireEvent.click(startButton())
    view.unmount()

    begin(recording)
    await waitFor(() => { expect(recording.cancel).toHaveBeenCalledTimes(1) })
  })

  it('drops a transcription that settles after unmount', async () => {
    let settle!: (value: VoiceTranscription) => void
    const b = setup()
    b.transcribe.mockImplementationOnce(() => new Promise<VoiceTranscription>((done) => { settle = done }))
    fireEvent.click(startButton())
    fireEvent.click(await screen.findByRole('button', { name: '停止录音' }))
    await screen.findByRole('button', { name: '识别中' })
    b.view.unmount()

    settle({ text: 'ignored' })
    await Promise.resolve()
    expect(b.appendDraft).not.toHaveBeenCalled()
  })
})
