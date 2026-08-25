//#region lib/types/invariant.js
/** Package-owned invariant companion. @module @deepseek-ai/dsh-asr-gateway/invariant */
const PACKAGE_NAME = "@deepseek-ai/dsh-asr-gateway";
/** Cordis companion plugin name. */
const name = "asr-gateway-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the gateway owns no events and no durable data. It
* forwards one validated call to whichever `asr` provider is composed and
* returns that provider's result unchanged.
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
