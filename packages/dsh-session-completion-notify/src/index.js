/**
 * Host half of @lmber/dsh-session-completion-notify.
 *
 * This package is a pure Web client plugin: all behavior lives in the
 * browser half (`./client`). The host `apply` exists so the package is a
 * valid Cordis plugin entry when referenced from a `cordis.patch.yml` row.
 */

/** Plugin name shown in the Cordis loader and inspection surfaces. */
export const name = 'dsh-session-completion-notify'

/** Host plugin body - intentionally inert; the browser half does the work. */
export function apply() {}
