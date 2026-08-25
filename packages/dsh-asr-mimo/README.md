# @deepseek-ai/dsh-asr-mimo

English | [ä¸­æ–‡](README.zh.md)

Xiaomi MiMo provider for the [`dsh-asr`](../asr/README.md) capability. Recognition rides the vendor's OpenAI-compatible chat-completions endpoint: the audio travels as one `input_audio` content part and the recognized text comes back as ordinary message content. The provider injects the `credentials` service and registers under the `asr` service name by extending `AsrProvider`.

The `Config` fields are all optional and overridable from cordis.yml: `baseUrl` (the API base URL including `/v1`, default `https://token-plan-cn.xiaomimimo.com/v1`), `model` (the recognition model name, default `mimo-v2.5-asr`), and `apiKeyEnv` (the environment variable holding the API key, default `MIMO_API_KEY`). Every deployment-varying value is resolved once in the constructor through a `resolveConfig` step, so a transcription never re-derives an endpoint. The credential is resolved per call through `ctx.credentials.resolve(...)`, so a rotated key reaches the next transcription without a restart and is never cached across calls.

Requests send `redirect: 'error'`, so a redirect can never deliver the API key and the audio to another origin. Audio is sent as a data URL; when given bare base64, the MIME type is derived from the declared format (`mp3` maps to `audio/mpeg`, everything else to `audio/wav`) because the vendor requires MIME and format to agree. When the request carries a `language`, it is forwarded as `asr_options.language`. Failures are thrown as `AsrError` with the codes `MISSING_API_KEY` (no credential configured), `API_ERROR` (carrying the HTTP status code), and `EMPTY_RESPONSE` (the response carried no transcription). On success the result carries the trimmed recognized text and, when the vendor reports it, the billed audio duration in seconds.

## Model Experience

None, as this provider registers no prompt, tool, message, or provider request of its own; it only answers consumer transcriptions.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **wav and mp3 containers only** â€?the vendor accepts only wav and mp3; callers must transcode any other container before calling `transcribe`.
- **No streaming recognition** â€?each `transcribe` call sends the complete audio and waits for the complete result; there is no incremental or partial transcription path.
- **Duration may be absent** â€?the vendor reports duration only through a `usage.seconds` field that may be missing, so `AsrResult.duration` is not guaranteed even for a successful transcription.
- **Unvalidated language hint** â€?`language` is passed through to the vendor without validation against the languages the vendor actually supports; an unsupported value surfaces only as a vendor-side error or degraded recognition.
