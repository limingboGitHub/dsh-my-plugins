import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/index.js
/**
* ASR Remote gateway. Browser clients cannot hold the provider API key and
* cannot reach the provider origin directly, so transcription is a host
* operation the browser calls through one Remote method.
* @module @deepseek-ai/dsh-asr-gateway
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/**
* Largest base64 payload one call accepts, in characters. MiMo rejects an
* encoded audio string above 10 MB, and rejecting here keeps an oversized
* recording from occupying a provider request at all.
*/
const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024;
/**
* Remote-only service exposing speech recognition to browser clients.
*
* The Cordis service key and the wire namespace differ on purpose: `asr` is
* held by the provider this gateway forwards to, so taking that key would
* collide with it and make `ctx.get('asr')` resolve to the gateway itself. The
* browser still calls `ctx.remote.asr.transcribe`.
*/
let AsrGateway = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _transcribe_decorators;
	return class AsrGateway extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_transcribe_decorators = [Remote("transcribe")];
			__esDecorate(this, null, _transcribe_decorators, {
				kind: "method",
				name: "transcribe",
				static: false,
				private: false,
				access: {
					has: (obj) => "transcribe" in obj,
					get: (obj) => obj.transcribe
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		constructor(ctx) {
			super(ctx, "asrGateway", { namespace: "asr" });
			__runInitializers(this, _instanceExtraInitializers);
		}
		/**
		* Transcribe one recording to text.
		*
		* The `asr` provider is optional composition: a deployment without one
		* fails the call rather than returning empty text, because a silent empty
		* result is indistinguishable from a recording that held no speech.
		* @param audioBase64 - Audio as a data URL or bare base64 string.
		* @param options - Format and language hints.
		* @returns The recognized text and its reported duration.
		*/
		async transcribe(audioBase64, options) {
			if (audioBase64.length === 0) throw new Error("asr transcribe requires audio data");
			if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) throw new Error(`audio payload is ${audioBase64.length} base64 characters, above the ${MAX_AUDIO_BASE64_LENGTH} limit`);
			const asr = this.ctx.get("asr");
			if (asr === void 0) throw new Error("no asr provider is composed");
			const result = await asr.transcribe({
				audioBase64,
				...options?.format === void 0 ? {} : { format: options.format },
				...options?.language === void 0 ? {} : { language: options.language }
			});
			return {
				text: result.text,
				...result.duration === void 0 ? {} : { duration: result.duration }
			};
		}
	};
})();
//#endregion
export { AsrGateway, AsrGateway as default };
