# @deepseek-ai/dsh-asr

English | [中文](README.zh.md)

Service Definition for the ASR (Automatic Speech Recognition) capability. This package exports the abstract class `AsrProvider extends Service`, which registers under the service name `asr` and declares one abstract method, `transcribe(request: AsrRequest): Promise<AsrResult>`, that converts audio to text. It also exports the `AsrRequest` and `AsrResult` types and the `AsrError` class.

An `AsrRequest` carries `audioBase64` (either a data URL such as `data:audio/wav;base64,...` or a raw base64 string), an optional `format` hint (`'wav'` or `'mp3'`, required when `audioBase64` is not a data URL), and an optional `language` hint that defaults to automatic detection and is provider-specific. An `AsrResult` carries the recognized `text` and an optional `duration` in seconds when the provider reports it. `AsrError` carries a machine-readable `code` and an optional HTTP `statusCode` when the failure came from an API response.

This package contains no provider implementation, no network code, and no config. It is one role of a capability seam whose other roles are the provider ([`dsh-asr-mimo`](../asr-mimo/README.md)) and the consumer (`dsh-asr-gateway`, at [`packages/asr/asr-gateway`](../asr-gateway)).

## Model Experience

None, as this Service Definition registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No provider bundled** — loading this package alone installs only the abstract `asr` service; a deployment must also load a provider such as `dsh-asr-mimo` before any consumer can transcribe.
- **Minimal result metadata** — `AsrResult` exposes only the recognized text and an optional duration; providers that compute confidence scores, segment timestamps, or speaker attribution cannot surface them through this interface.
