/** Package-owned invariant companion. @module @deepseek-ai/dsh-asr-mimo/invariant */
const PACKAGE_NAME = '@deepseek-ai/dsh-asr-mimo';
/** Cordis companion plugin name. */
export const name = 'asr-mimo-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: every transcription is projected directly from one
 * vendor response, and this package keeps no state between calls — the
 * credential is resolved per request rather than cached.
 */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
//# sourceMappingURL=invariant.js.map