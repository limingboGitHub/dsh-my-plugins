//#region lib/types/invariant.js
/** Package-owned invariant companion. @module @deepseek-ai/dsh-asr/invariant */
const PACKAGE_NAME = "@deepseek-ai/dsh-asr";
/** Cordis companion plugin name. */
const name = "asr-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: this package is the Service Definition alone. It owns
* no events and no durable data, and the relationship worth auditing — a
* transcription matching the audio it was given — is the provider's.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns The installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
