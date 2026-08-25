import z from "@deepseek-ai/schemastery";
import { Service } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
//#region src/asr-types.ts
/** ASR provider error. */
var AsrError = class extends Error {
	code;
	statusCode;
	/**
	* @param message - Human-readable error description.
	* @param code - Machine-readable error code.
	* @param statusCode - HTTP status code when the error came from an API response.
	*/
	constructor(message, code, statusCode) {
		super(message);
		this.code = code;
		this.statusCode = statusCode;
		this.name = "AsrError";
	}
};
//#endregion
//#region src/asr.ts
/**
* ASR (Automatic Speech Recognition) Service Definition. Providers register
* under `ctx.asr`, and consumers resolve one provider to transcribe audio
* into text. The capability seam separates abstract operations from
* provider-specific API clients.
* @module dsh-voice-input/asr
*/
/**
* ASR provider abstract service. Implementations register under the `asr`
* service name and supply a `transcribe` method that converts audio to text.
*/
var AsrProvider = class extends Service {
	constructor(ctx) {
		super(ctx, "asr");
	}
};
//#endregion
//#region src/mimo.ts
/** Vendor default endpoint: the OpenAI-compatible CN token-plan base, `/v1` included. */
const DEFAULT_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";
/** The vendor's only ASR model. */
const DEFAULT_MODEL = "mimo-v2.5-asr";
/** Environment variable holding the API key when the deployment names none. */
const DEFAULT_API_KEY_ENV = "MIMO_API_KEY";
/** Attribution header sent on every request. */
const USER_AGENT = "deepseek-harness/0.1.0";
const Config = z.object({
	baseUrl: z.string().default(DEFAULT_BASE_URL).description("API base URL including /v1"),
	model: z.string().default(DEFAULT_MODEL).description("Recognition model name"),
	apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV).description("Environment variable holding the API key")
});
/**
* Decide every deployment-varying value before any request runs, so a
* transcription never re-derives an endpoint or silently falls back.
* @param config - the validated plugin config.
* @returns the fully resolved request parameters.
*/
function resolveConfig(config) {
	return {
		endpoint: `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, "")}/chat/completions`,
		model: config.model ?? DEFAULT_MODEL,
		apiKeyRef: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
	};
}
/**
* Build the data URL the vendor accepts. A bare base64 payload needs its
* container named, and the vendor requires MIME and `format` to agree, so the
* MIME type is derived from the declared format rather than sent alongside it.
* @param request - the transcription request.
* @returns audio as a data URL.
*/
function audioDataUrl(request) {
	if (request.audioBase64.startsWith("data:")) return request.audioBase64;
	return `data:${request.format === "mp3" ? "audio/mpeg" : "audio/wav"};base64,${request.audioBase64}`;
}
/**
* MiMo recognition over the vendor's OpenAI-compatible endpoint. Every
* deployment-varying value is resolved once at construction; the credential is
* resolved per call so a rotated key needs no restart.
*/
var MimoAsrProvider = class extends AsrProvider {
	static inject = ["credentials"];
	static Config = Config;
	resolved;
	constructor(ctx, config = {}) {
		super(ctx);
		this.resolved = resolveConfig(config);
	}
	async transcribe(request) {
		const credential = await this.ctx.credentials.resolve(this.resolved.apiKeyRef);
		if (credential === void 0) throw new AsrError(`MiMo API key is not configured (${this.resolved.apiKeyRef})`, "MISSING_API_KEY");
		const response = await fetch(this.resolved.endpoint, {
			method: "POST",
			headers: {
				"api-key": credential.value,
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT
			},
			body: JSON.stringify({
				model: this.resolved.model,
				messages: [{
					role: "user",
					content: [{
						type: "input_audio",
						input_audio: { data: audioDataUrl(request) }
					}]
				}],
				...request.language === void 0 ? {} : { asr_options: { language: request.language } }
			}),
			redirect: "error"
		});
		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			throw new AsrError(`MiMo API request failed: ${response.status} ${response.statusText}${detail === "" ? "" : ` ${detail}`}`, "API_ERROR", response.status);
		}
		const result = await response.json();
		const text = result.choices?.[0]?.message?.content;
		if (text === void 0) throw new AsrError("MiMo API response carried no transcription", "EMPTY_RESPONSE");
		return {
			text: text.trim(),
			duration: result.usage?.seconds
		};
	}
};
//#endregion
//#region src/protocol.ts
/**
* The wire contract shared by the host endpoint and the browser control.
*
* Both halves ship in this package, but they run in different processes and
* cannot share types at runtime, so the path, the ceiling, and the payload
* shapes are stated once here.
* @module dsh-voice-input/protocol
*/
/** Path the transcription endpoint answers on. */
const TRANSCRIBE_PATH = "/api/voice-input/transcribe";
/**
* Largest base64 payload one call accepts, in characters.
*
* MiMo rejects an encoded audio string above 10 MB. The browser checks this
* before spending a request and the host checks it again, because a direct
* caller never runs the browser check.
*/
const MAX_AUDIO_BASE64_LENGTH = 10485760;
//#endregion
//#region src/index.ts
const name = "voice-input";
const inject = ["webServer", "credentials"];
/** Largest request body accepted, in bytes: the base64 ceiling plus JSON overhead. */
const MAX_BODY_BYTES = 10486784;
/**
* Read a JSON request body under a byte ceiling.
*
* The ceiling is enforced while reading rather than after, so an oversized
* upload stops occupying memory as soon as it passes the limit.
* @param req - the incoming request.
* @returns the parsed body, or a reason it was rejected.
*/
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		total += buffer.length;
		if (total > MAX_BODY_BYTES) return {
			ok: false,
			reason: "request body too large"
		};
		chunks.push(buffer);
	}
	try {
		return {
			ok: true,
			value: JSON.parse(Buffer.concat(chunks).toString("utf8"))
		};
	} catch {
		return {
			ok: false,
			reason: "request body is not valid JSON"
		};
	}
}
/**
* Whether the request came from this machine.
*
* `webServer` can be configured to bind `0.0.0.0`, and this route spends the
* deployment's provider credential on whoever reaches it. Refusing non-local
* peers keeps an all-interfaces bind from turning the key into a shared
* resource.
* @param req - the incoming request.
* @returns true when the peer address is loopback.
*/
function isLocalRequest(req) {
	const address = req.socket.remoteAddress;
	if (address === void 0) return false;
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
/**
* Send one JSON response.
* @param res - the server response.
* @param status - HTTP status code.
* @param body - the payload to serialize.
*/
function sendJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(payload),
		"Cache-Control": "no-store"
	});
	res.end(payload);
}
/**
* Validate a decoded request body.
* @param value - the parsed JSON body.
* @returns the typed request, or the reason it was rejected.
*/
function parseRequest(value) {
	if (value === null || typeof value !== "object") return {
		ok: false,
		reason: "body must be an object"
	};
	const body = value;
	const audioBase64 = body["audioBase64"];
	if (typeof audioBase64 !== "string" || audioBase64.length === 0) return {
		ok: false,
		reason: "audioBase64 must be a non-empty string"
	};
	if (audioBase64.length > 10485760) return {
		ok: false,
		reason: `audio is ${audioBase64.length} base64 characters, above the ${MAX_AUDIO_BASE64_LENGTH} limit`
	};
	const format = body["format"];
	if (format !== void 0 && format !== "wav" && format !== "mp3") return {
		ok: false,
		reason: "format must be 'wav' or 'mp3'"
	};
	const language = body["language"];
	if (language !== void 0 && typeof language !== "string") return {
		ok: false,
		reason: "language must be a string"
	};
	return {
		ok: true,
		value: {
			audioBase64,
			...format === void 0 ? {} : { format },
			...language === void 0 ? {} : { language }
		}
	};
}
/**
* Compose the provider and the transcription endpoint.
* @param ctx - the host context.
* @param config - MiMo provider configuration.
*/
function apply(ctx, config) {
	ctx.plugin(MimoAsrProvider, config);
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: TRANSCRIBE_PATH,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, {
					ok: false,
					error: "method not allowed",
					code: "METHOD_NOT_ALLOWED"
				});
				return;
			}
			if (!isLocalRequest(req)) {
				sendJson(res, 403, {
					ok: false,
					error: "transcription is local-only",
					code: "FORBIDDEN"
				});
				return;
			}
			const body = await readJsonBody(req);
			if (!body.ok) {
				sendJson(res, 400, {
					ok: false,
					error: body.reason,
					code: "BAD_REQUEST"
				});
				return;
			}
			const parsed = parseRequest(body.value);
			if (!parsed.ok) {
				sendJson(res, 400, {
					ok: false,
					error: parsed.reason,
					code: "BAD_REQUEST"
				});
				return;
			}
			const asr = ctx.get("asr");
			if (asr === void 0) {
				sendJson(res, 503, {
					ok: false,
					error: "no asr provider is composed",
					code: "NO_PROVIDER"
				});
				return;
			}
			try {
				const result = await asr.transcribe(parsed.value);
				sendJson(res, 200, {
					ok: true,
					text: result.text,
					...result.duration === void 0 ? {} : { duration: result.duration }
				});
			} catch (error) {
				if (error instanceof AsrError) {
					sendJson(res, error.statusCode ?? 502, {
						ok: false,
						error: error.message,
						code: error.code
					});
					return;
				}
				throw error;
			}
		}
	}), "voice-input: transcription endpoint");
}
//#endregion
export { AsrError, AsrProvider, Config, MAX_AUDIO_BASE64_LENGTH, MimoAsrProvider, TRANSCRIBE_PATH, apply, inject, name };
