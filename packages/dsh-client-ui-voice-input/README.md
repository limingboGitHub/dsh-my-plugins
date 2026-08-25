# @deepseek-ai/dsh-client-ui-voice-input

English | [中文](README.zh.md)

Voice input for the composer: a microphone control in the `conversation.input.left` tool row that records speech, has it transcribed, and appends the recognized text to the current session's draft.

The work is split across the process line. The browser half captures audio through `getUserMedia` and `MediaRecorder`, decodes the recorded container with `AudioContext.decodeAudioData`, and re-encodes it as 16 kHz mono 16-bit WAV — the provider accepts only wav and mp3, while browsers record webm/opus. Recognition itself runs on the Host through the `asr` Remote, so the provider API key never reaches the browser. The control writes nothing directly: text reaches the textarea through the per-session input facade's `setDraft`, appended after existing content with one separating space.

The control moves through three states — idle, recording, transcribing — and the button both starts and stops recording. Starting is refused while a submission is in flight, since that transaction owns the draft; a recording already running still stops, because stopping releases the microphone. Unmounting mid-recording cancels the capture, so a session switch cannot leave the microphone open.

An unavailable microphone API, a refused permission prompt, and a capture that produced no decodable audio each return the control to idle with a localized message beside the button. Recognition failures surface the Remote's own English error line, per the error-surface policy.

## Model Experience

None directly, as this package registers no prompt, tool, or message. Recognized text lands in the composer draft, where the user edits or discards it; it reaches a model only through an ordinary submission the user performs.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No streaming or interim results** — the full recording is sent after the user stops, so there is no live partial transcript. Interim display would need a streaming Remote form.
- **Encoding is main-thread work** — decode and WAV encoding run on the main thread, so a long recording can block rendering briefly. Moving the encode into a worker is deferred until a real recording length makes it visible.
- **Fixed request hints** — the Remote call sends `format: 'wav'` and `language: 'auto'`; neither is user-selectable, and there is no UI for choosing a recognition language.
- **Append-only insertion** — text always appends at the end of the draft rather than at the caret, and there is no undo specific to a transcription beyond the textarea's own history.
- **Silence is reported, not detected** — an empty recognition result is shown as an empty-audio message, since the provider cannot distinguish a silent recording from speech it failed to recognize.
