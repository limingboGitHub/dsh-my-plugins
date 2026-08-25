/**
 * Translate stub for specs asserting localized copy.
 *
 * Mirrors the locale runtime's resolution order: the first dictionary owning
 * the key wins, an unknown key stays visible as itself, and `{name}`
 * placeholders interpolate from `params`.
 *
 * Carried here rather than imported from `@deepseek-ai/dsh-client-test-runtime`
 * because that package's published bundle imports
 * `@deepseek-ai/dsh-client-ui-renderer/src/...`, and `ui-renderer` publishes no
 * `src/` — its entry cannot load outside the source workspace.
 */

/**
 * Build a translate function over the given dictionaries.
 * @param dicts - dictionaries consulted in order.
 * @returns the translate function, assignable to a component's `t` seat.
 */
export function makeTranslate(
  ...dicts: readonly Record<string, string>[]
): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    let template = key
    for (const dict of dicts) {
      const hit = dict[key]
      if (hit !== undefined) {
        template = hit
        break
      }
    }
    if (params === undefined) return template
    return template.replace(
      /\{(\w+)\}/g,
      (match, name: string) => name in params ? String(params[name]) : match,
    )
  }
}
