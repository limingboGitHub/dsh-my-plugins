import z from "@deepseek-ai/schemastery";
import { Context, Service } from "@deepseek-ai/cordis";
//#region src/asr-types.d.ts
/**
 * ASR capability types: request, result, and error shapes.
 * @module dsh-asr/types
 */
/** ASR transcription request. */
interface AsrRequest {
  /**
   * Base64-encoded audio data. Accepts either a data URL
   * (`data:audio/wav;base64,...`) or raw base64 string.
   */
  readonly audioBase64: string;
  /**
   * Audio format hint. When `audioBase64` is a data URL, the MIME type takes
   * precedence; otherwise this field is required.
   */
  readonly format?: 'wav' | 'mp3';
  /**
   * Language hint for recognition. Defaults to `auto` (automatic detection).
   * Provider-specific; not all providers support all languages.
   */
  readonly language?: string;
}
/** ASR transcription result. */
interface AsrResult {
  /** Recognized text content. */
  readonly text: string;
  /** Audio duration in seconds, when the provider reports it. */
  readonly duration?: number | undefined;
}
/** ASR provider error. */
declare class AsrError extends Error {
  readonly code: string;
  readonly statusCode?: number | undefined;
  /**
   * @param message - Human-readable error description.
   * @param code - Machine-readable error code.
   * @param statusCode - HTTP status code when the error came from an API response.
   */
  constructor(message: string, code: string, statusCode?: number | undefined);
}
//#endregion
//#region src/asr.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    asr: AsrProvider;
  }
}
/**
 * ASR provider abstract service. Implementations register under the `asr`
 * service name and supply a `transcribe` method that converts audio to text.
 */
declare abstract class AsrProvider extends Service {
  constructor(ctx: Context);
  /**
   * Transcribe audio content to text.
   * @param request - Audio data and recognition options.
   * @returns Recognized text and optional metadata.
   * @throws AsrError when recognition fails.
   */
  abstract transcribe(request: AsrRequest): Promise<AsrResult>;
}
//#endregion
//#region src/mimo.d.ts
/** MiMo provider configuration. */
interface Config {
  /** API base URL with `/v1`; `/chat/completions` is appended. */
  baseUrl?: string;
  /** Recognition model name. */
  model?: string;
  /** Environment-variable name holding the API key. */
  apiKeyEnv?: string;
}
declare const Config: z<Config>;
/**
 * MiMo recognition over the vendor's OpenAI-compatible endpoint. Every
 * deployment-varying value is resolved once at construction; the credential is
 * resolved per call so a rotated key needs no restart.
 */
declare class MimoAsrProvider extends AsrProvider {
  static inject: string[];
  static Config: z<Config>;
  private readonly resolved;
  constructor(ctx: Context, config?: Config);
  transcribe(request: AsrRequest): Promise<AsrResult>;
}
//#endregion
//#region src/protocol.d.ts
/**
 * The wire contract shared by the host endpoint and the browser control.
 *
 * Both halves ship in this package, but they run in different processes and
 * cannot share types at runtime, so the path, the ceiling, and the payload
 * shapes are stated once here.
 * @module dsh-voice-input/protocol
 */
/** Path the transcription endpoint answers on. */
declare const TRANSCRIBE_PATH = "/api/voice-input/transcribe";
/**
 * Largest base64 payload one call accepts, in characters.
 *
 * MiMo rejects an encoded audio string above 10 MB. The browser checks this
 * before spending a request and the host checks it again, because a direct
 * caller never runs the browser check.
 */
declare const MAX_AUDIO_BASE64_LENGTH: number;
/** Audio containers the provider accepts. */
type AudioFormat = 'wav' | 'mp3';
/** Request body of a transcription call. */
interface TranscribeRequest {
  /** Audio as a data URL or a bare base64 string. */
  audioBase64: string;
  /** Container hint; required when `audioBase64` is not a data URL. */
  format?: AudioFormat;
  /** Language hint; the provider decides the supported set. */
  language?: string;
}
/** Response body of a transcription call. */
type TranscribeResponse = {
  ok: true;
  /** Recognized text. */
  text: string;
  /** Billed audio duration in seconds, when the provider reports one. */
  duration?: number;
} | {
  ok: false;
  /** Human-readable failure description. */
  error: string;
  /** Machine-readable failure code. */
  code: string;
};
//#endregion
//#region src/index.d.ts
declare const name = "voice-input";
declare const inject: string[];
/**
 * Compose the provider and the transcription endpoint.
 * @param ctx - the host context.
 * @param config - MiMo provider configuration.
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { AsrError, AsrProvider, type AsrRequest, type AsrResult, Config, MAX_AUDIO_BASE64_LENGTH, MimoAsrProvider, TRANSCRIBE_PATH, type TranscribeRequest, type TranscribeResponse, apply, inject, name };