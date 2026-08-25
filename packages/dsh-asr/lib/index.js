import { Service } from "@deepseek-ai/cordis";
//#region lib/types/types.js
/**
* ASR capability types: request, result, and error shapes.
* @module @deepseek-ai/dsh-asr/types
*/
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
//#region lib/types/index.js
/**
* ASR (Automatic Speech Recognition) Service Definition. Providers register
* under `ctx.asr`, and consumers resolve one provider to transcribe audio
* into text. The capability seam separates abstract operations from
* provider-specific API clients.
* @module @deepseek-ai/dsh-asr
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
export { AsrError, AsrProvider, AsrProvider as default };
