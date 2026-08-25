window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-voice-input",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/audio-encoder.js
		/**
		* WAV encoding for recorded audio. Browsers record webm/opus while the ASR
		* provider accepts only wav and mp3, so a recording is decoded and re-encoded
		* as 16 kHz mono PCM16 before it leaves the browser.
		* @module @deepseek-ai/dsh-client-ui-voice-input/client/audio-encoder
		*/
		/** Sample rate the provider expects; resampling targets this rate. */
		const TARGET_SAMPLE_RATE = 16e3;
		/** Mono: one channel is both what the provider expects and what speech needs. */
		const NUM_CHANNELS = 1;
		const BITS_PER_SAMPLE = 16;
		/** Canonical PCM WAV header length, in bytes. */
		const HEADER_BYTES = 44;
		/** WAV format tag for uncompressed PCM. */
		const FORMAT_PCM = 1;
		/**
		* Encode decoded audio as a base64 WAV data URL. The data-URL form lets the
		* provider read the container from the MIME type rather than a separate format
		* field.
		* @param audioBuffer - Decoded audio from a recorded blob.
		* @returns WAV audio as `data:audio/wav;base64,...`.
		*/
		function encodeWav(audioBuffer) {
			const channelData = audioBuffer.getChannelData(0);
			return `data:audio/wav;base64,${base64OfBytes(createWavFile(floatTo16BitPCM(audioBuffer.sampleRate === TARGET_SAMPLE_RATE ? channelData : resample(channelData, audioBuffer.sampleRate, TARGET_SAMPLE_RATE)), TARGET_SAMPLE_RATE))}`;
		}
		/**
		* Resample by linear interpolation. Speech recognition tolerates the artifacts
		* a higher-order filter would remove, and this keeps the encode allocation-free
		* beyond the output buffer.
		* @param samples - Source samples.
		* @param fromRate - Source sample rate.
		* @param toRate - Target sample rate.
		* @returns Samples at the target rate.
		*/
		function resample(samples, fromRate, toRate) {
			const ratio = fromRate / toRate;
			const result = new Float32Array(Math.round(samples.length / ratio));
			for (let i = 0; i < result.length; i++) {
				const srcIndex = i * ratio;
				const floor = Math.floor(srcIndex);
				const ceil = Math.min(floor + 1, samples.length - 1);
				const t = srcIndex - floor;
				result[i] = (samples[floor] ?? 0) * (1 - t) + (samples[ceil] ?? 0) * t;
			}
			return result;
		}
		/**
		* Convert float samples to 16-bit PCM. The asymmetric scaling matches the
		* two's-complement range, whose negative bound is one larger than its positive.
		* @param samples - Float samples, clamped to [-1, 1].
		* @returns PCM16 samples.
		*/
		function floatTo16BitPCM(samples) {
			const pcm = new Int16Array(samples.length);
			for (let i = 0; i < samples.length; i++) {
				const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
				pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
			}
			return pcm;
		}
		/**
		* Assemble a canonical PCM WAV file.
		* @param pcm16 - PCM16 samples.
		* @param sampleRate - Sample rate the header declares.
		* @returns Complete WAV bytes.
		*/
		function createWavFile(pcm16, sampleRate) {
			const bytesPerSample = BITS_PER_SAMPLE / 8;
			const blockAlign = NUM_CHANNELS * bytesPerSample;
			const dataSize = pcm16.length * bytesPerSample;
			const buffer = new ArrayBuffer(HEADER_BYTES + dataSize);
			const view = new DataView(buffer);
			writeAscii(view, 0, "RIFF");
			view.setUint32(4, HEADER_BYTES - 8 + dataSize, true);
			writeAscii(view, 8, "WAVE");
			writeAscii(view, 12, "fmt ");
			view.setUint32(16, 16, true);
			view.setUint16(20, FORMAT_PCM, true);
			view.setUint16(22, NUM_CHANNELS, true);
			view.setUint32(24, sampleRate, true);
			view.setUint32(28, sampleRate * blockAlign, true);
			view.setUint16(32, blockAlign, true);
			view.setUint16(34, BITS_PER_SAMPLE, true);
			writeAscii(view, 36, "data");
			view.setUint32(40, dataSize, true);
			for (let i = 0; i < pcm16.length; i++) view.setInt16(HEADER_BYTES + i * bytesPerSample, pcm16[i] ?? 0, true);
			return new Uint8Array(buffer);
		}
		/** Chunk size for base64 conversion, small enough to stay under argument limits. */
		const BASE64_CHUNK = 32768;
		/**
		* Base64-encode bytes. Chunked because spreading a whole recording into
		* `String.fromCharCode` overflows the call-argument limit.
		* @param bytes - Bytes to encode.
		* @returns Base64 text.
		*/
		function base64OfBytes(bytes) {
			let binary = "";
			for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
			return btoa(binary);
		}
		/**
		* Write ASCII characters at a byte offset.
		* @param view - Target view.
		* @param offset - Byte offset.
		* @param text - ASCII text.
		*/
		function writeAscii(view, offset, text) {
			for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
		}
		//#endregion
		//#region lib/types/client/recorder.js
		/**
		* Microphone capture: one recording session from permission grant to encoded
		* WAV. Kept apart from the control component because it owns browser-API
		* resources (a media stream, a recorder, an audio context) that must be
		* released on every exit path, including a failed decode.
		* @module @deepseek-ai/dsh-client-ui-voice-input/client/recorder
		*/
		/** MIME candidates in preference order; the first supported one is used. */
		const MIME_CANDIDATES = [
			"audio/webm;codecs=opus",
			"audio/webm",
			"audio/ogg;codecs=opus"
		];
		/**
		* Whether this browser can capture microphone audio at all. Checked before a
		* permission prompt so an unsupported browser reports that rather than a
		* denial the user cannot act on.
		* @returns true when capture and recording APIs both exist.
		*/
		function canRecord() {
			return typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices;
		}
		/** Pick the first recorder MIME type this browser accepts. */
		function pickMimeType() {
			if (typeof MediaRecorder.isTypeSupported !== "function") return void 0;
			return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
		}
		/**
		* Open the microphone and begin recording.
		*
		* Rejects nothing: a browser without the APIs and a refused permission prompt
		* both arrive as a `failed` outcome, because the control renders them the same
		* way — a message beside a button that returns to idle.
		* @returns The live recording, or the reason capture could not start.
		*/
		async function startRecording() {
			if (!canRecord()) return {
				kind: "failed",
				failure: "unsupported"
			};
			let stream;
			try {
				stream = await navigator.mediaDevices.getUserMedia({ audio: {
					channelCount: 1,
					sampleRate: 16e3,
					echoCancellation: true,
					noiseSuppression: true
				} });
			} catch {
				return {
					kind: "failed",
					failure: "denied"
				};
			}
			const mimeType = pickMimeType();
			const recorder = new MediaRecorder(stream, mimeType === void 0 ? void 0 : { mimeType });
			const chunks = [];
			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) chunks.push(event.data);
			};
			const release = () => {
				for (const track of stream.getTracks()) track.stop();
			};
			const stopped = new Promise((resolve) => {
				recorder.onstop = () => {
					resolve();
				};
			});
			recorder.start();
			return {
				async stop() {
					if (recorder.state !== "inactive") recorder.stop();
					await stopped;
					release();
					if (chunks.length === 0) return {
						kind: "failed",
						failure: "empty"
					};
					const blob = new Blob(chunks, mimeType === void 0 ? {} : { type: mimeType });
					const audioContext = new AudioContext();
					try {
						const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
						if (decoded.length === 0) return {
							kind: "failed",
							failure: "empty"
						};
						return {
							kind: "audio",
							audioBase64: encodeWav(decoded)
						};
					} catch {
						return {
							kind: "failed",
							failure: "empty"
						};
					} finally {
						audioContext.close();
					}
				},
				cancel() {
					if (recorder.state !== "inactive") recorder.stop();
					release();
				}
			};
		}
		//#endregion
		//#region \0dsh-css:D:\PythonProjects\deepseek-harness\packages\client\ui-voice-input\src\client\VoiceInputControl.module.css.mjs
		const css = ".SUNH-G_wrap{align-items:center;gap:6px;min-width:0;display:inline-flex}.SUNH-G_button{border-radius:var(--dsw-radius-sm);width:24px;height:24px;color:var(--dsw-icon-secondary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:0;transition:background-color .15s,color .15s;display:inline-flex}.SUNH-G_button:hover:not(:disabled){background:var(--dsw-fill-hover);color:var(--dsw-icon-primary)}.SUNH-G_button:disabled{color:var(--dsw-icon-disabled);cursor:not-allowed}.SUNH-G_recording,.SUNH-G_recording:hover:not(:disabled){color:var(--dsw-text-danger)}.SUNH-G_recording:after{content:\"\";border-radius:var(--dsw-radius-sm);opacity:.12;background:currentColor;width:24px;height:24px;animation:1.6s ease-in-out infinite SUNH-G_breathe;position:absolute}@keyframes SUNH-G_breathe{0%,to{opacity:.08}50%{opacity:.2}}@media (prefers-reduced-motion:reduce){.SUNH-G_recording:after{animation:none}}.SUNH-G_error{max-width:180px;color:var(--dsw-text-danger);font-size:var(--dsw-font-size-xs);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}";
		const tagId = "@deepseek-ai/dsh-client-ui-voice-input/VoiceInputControl.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-voice-input";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var VoiceInputControl_module_css_default = {
			"breathe": "SUNH-G_breathe",
			"button": "SUNH-G_button",
			"error": "SUNH-G_error",
			"recording": "SUNH-G_recording",
			"wrap": "SUNH-G_wrap"
		};
		//#endregion
		//#region lib/types/client/VoiceInputControl.js
		/** Recorder failures map onto dictionary keys of the same vocabulary. */
		const FAILURE_KEY = {
			denied: "micDenied",
			unsupported: "unsupported",
			empty: "empty"
		};
		/**
		* Largest base64 payload the host gateway accepts, in characters. Checked here
		* too so an over-long recording fails without spending a round trip.
		*/
		const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024;
		/**
		* Microphone control for the composer tool row. Recording and WAV encoding
		* happen here; the transcription request and the draft write are injected, so
		* this component holds no ctx and no session lookup.
		*/
		function VoiceInputControl({ input, transcribe, appendDraft, t }) {
			const [phase, setPhase] = (0, react.useState)("idle");
			const [error, setError] = (0, react.useState)(null);
			const recordingRef = (0, react.useRef)(null);
			const aliveRef = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				aliveRef.current = true;
				return () => {
					aliveRef.current = false;
					recordingRef.current?.cancel();
					recordingRef.current = null;
				};
			}, []);
			const begin = (0, react.useCallback)(() => {
				setError(null);
				startRecording().then((started) => {
					if (!aliveRef.current) {
						if ("cancel" in started) started.cancel();
						return;
					}
					if ("kind" in started) {
						setError(t(FAILURE_KEY[started.failure]));
						return;
					}
					recordingRef.current = started;
					setPhase("recording");
				}).catch((reason) => {
					if (!aliveRef.current) return;
					setError(reason instanceof Error ? reason.message : String(reason));
				});
			}, [t]);
			const finish = (0, react.useCallback)(() => {
				const recording = recordingRef.current;
				if (recording === null) return;
				recordingRef.current = null;
				setPhase("transcribing");
				recording.stop().then(async (outcome) => {
					if (!aliveRef.current) return;
					if (outcome.kind === "failed") {
						setPhase("idle");
						setError(t(FAILURE_KEY[outcome.failure]));
						return;
					}
					if (outcome.audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
						setPhase("idle");
						setError(t("tooLarge"));
						return;
					}
					const result = await transcribe(outcome.audioBase64);
					if (!aliveRef.current) return;
					setPhase("idle");
					if (result.error !== void 0) {
						setError(result.error);
						return;
					}
					if (result.text.length === 0) {
						setError(t("empty"));
						return;
					}
					appendDraft(result.text);
				}).catch((reason) => {
					if (!aliveRef.current) return;
					setPhase("idle");
					setError(reason instanceof Error ? reason.message : String(reason));
				});
			}, [
				appendDraft,
				t,
				transcribe
			]);
			const busy = input.phase === "adjudicating" || input.phase === "submitting";
			const label = phase === "recording" ? t("stop") : phase === "transcribing" ? t("transcribing") : t("start");
			return (0, react_jsx_runtime.jsxs)("span", {
				className: VoiceInputControl_module_css_default.wrap,
				children: [(0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: phase === "recording" ? `${VoiceInputControl_module_css_default.button} ${VoiceInputControl_module_css_default.recording}` : VoiceInputControl_module_css_default.button,
					"aria-label": label,
					title: label,
					disabled: phase === "transcribing" || phase === "idle" && busy,
					onClick: phase === "recording" ? finish : begin,
					children: (0, react_jsx_runtime.jsx)(MicGlyph, { recording: phase === "recording" })
				}), error !== null && (0, react_jsx_runtime.jsx)("span", {
					className: VoiceInputControl_module_css_default.error,
					role: "status",
					title: error,
					children: error
				})]
			});
		}
		/** Microphone glyph, replaced by a stop square while recording. */
		function MicGlyph({ recording }) {
			if (recording) return (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 14 14",
				"aria-hidden": true,
				focusable: "false",
				children: (0, react_jsx_runtime.jsx)("rect", {
					x: "3.5",
					y: "3.5",
					width: "7",
					height: "7",
					rx: "1.5",
					fill: "currentColor"
				})
			});
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 14 14",
				"aria-hidden": true,
				focusable: "false",
				children: [(0, react_jsx_runtime.jsx)("path", {
					d: "M7 1.75a1.75 1.75 0 0 1 1.75 1.75v3a1.75 1.75 0 0 1-3.5 0v-3A1.75 1.75 0 0 1 7 1.75Z",
					fill: "currentColor"
				}), (0, react_jsx_runtime.jsx)("path", {
					d: "M3.5 6.25v.25a3.5 3.5 0 0 0 7 0v-.25M7 10v2.25M5.25 12.25h3.5",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinecap: "round"
				})]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/**
		* Voice input control copy.
		* @module @deepseek-ai/dsh-client-ui-voice-input/client/locales
		*/
		/** Chinese copy (the product default). */
		const zh = {
			start: "语音输入",
			stop: "停止录音",
			transcribing: "识别中",
			micDenied: "无法使用麦克风，请检查浏览器权限",
			unsupported: "当前浏览器不支持录音",
			empty: "没有识别到语音内容",
			tooLarge: "录音过长，请缩短后重试"
		};
		/** English copy. */
		const en = {
			start: "Voice input",
			stop: "Stop recording",
			transcribing: "Transcribing",
			micDenied: "Microphone unavailable; check browser permissions",
			unsupported: "This browser cannot record audio",
			empty: "No speech recognized",
			tooLarge: "Recording too long; try a shorter one"
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Voice input plugin, browser half: contributes a microphone control to the
		* composer tool row. Recording and audio encoding happen in the browser; the
		* provider API key and the provider request stay on the host, reached through
		* the `asr` Remote.
		* @module @deepseek-ai/dsh-client-ui-voice-input/client
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "voice";
		/** Required services: the composer seat's slot registry, the ASR Remote, and locale. */
		const inject = [
			"slots",
			"remote",
			"remote.asr",
			"locale",
			"sessions"
		];
		/**
		* Client plugin body: register the microphone control over the ASR Remote.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-voice-input: dictionaries");
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "voice",
				order: 30,
				locale: NS,
				inject: (sessionId) => ({
					transcribe: async (audioBase64) => {
						const result = await ctx.remote.asr.transcribe(audioBase64, {
							format: "wav",
							language: "auto"
						});
						if (!result.ok) return { error: `${result.error.message} (${result.error.code})` };
						return { text: result.value.text };
					},
					appendDraft: (text) => {
						const actx = ctx.sessions.scope(sessionId);
						if (actx === void 0) return;
						const conversation = actx.get("conversation");
						if (conversation === void 0) return;
						const input = conversation.input.for(actx);
						const current = input.state.getSnapshot().draft;
						input.setDraft(current.length === 0 ? text : `${current} ${text}`);
					}
				})
			}, VoiceInputControl));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map