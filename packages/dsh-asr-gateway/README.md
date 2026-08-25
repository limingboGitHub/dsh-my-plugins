# @deepseek-ai/dsh-asr-gateway

English | [中文](README.zh.md)

Remote-only Host service exposing speech recognition to browser clients. `AsrGateway` registers the `asr` Remote namespace and publishes one generated direct Remote, `asr/transcribe`. The browser records audio and encodes it; recognition runs on the Host, because the provider API key must not reach a browser and the provider origin does not serve cross-origin browser requests.

The gateway holds no recognition logic of its own. It validates the payload, resolves the composed [`asr`](../asr/README.md) provider through `ctx.get('asr')`, and returns that provider's text and reported duration unchanged. Two rejections happen before any provider request: an empty payload, and one above 10 MB of base64 characters — the vendor limit, enforced here so an oversized recording never occupies a provider call. A deployment with no `asr` provider fails the call rather than returning empty text, because an empty result is otherwise indistinguishable from a recording that held no speech.

Public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and declares no same-process Cordis `Context` merge. Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only recognition gateway registers no prompt, tool, message, or provider request. Recognized text reaches a model only if the user submits the composer draft it was appended to.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No streaming** — one call carries one complete recording and returns one complete transcription. Incremental recognition would need a different Remote form than a request/response method.
- **No session log entry** — a transcription is a composer editing aid, not a model-visible input, so nothing is logged. Should recognized text ever bypass the draft and reach a model request directly, that path requires a session event.
- **Size limit is character-counted** — the 10 MB bound counts base64 characters rather than decoded bytes, so it rejects roughly 25% earlier than the decoded-byte equivalent.
