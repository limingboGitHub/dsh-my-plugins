/** Package-owned invariant companion. @module @deepseek-ai/dsh-client-ui-voice-input/invariant */
const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-voice-input';
/** Cordis companion plugin name. */
export const name = 'client-ui-voice-input-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: recognition correctness belongs to the composed `asr`
 * provider, and the control is a slot effect whose declaration, registration,
 * and teardown are exercised by this package.
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