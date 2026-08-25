import { readFile } from 'node:fs/promises'
import { dirname, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

/**
 * Build config for this package's two halves.
 *
 * The halves run in different processes and have different artifact contracts,
 * so neither can be derived from the other:
 *
 * - the host half is an ordinary ESM plugin the Loader imports, with its peers
 *   left unbundled;
 * - the browser half is fetched outside the page's module graph and handed to
 *   `window.__ModuleLoader__.load`, so it must be a CJS closure factory whose
 *   externals resolve through the injected `require`, and it must carry its own
 *   stylesheet because the plugin route serves exactly one JavaScript file.
 *
 * The main repository builds its client plugins from a shared preset. That
 * preset reads the workspace manifest set, so this package states the same two
 * artifact contracts locally instead.
 */

/** Package name; the id the module loader keys this bundle by. */
const ID = 'dsh-voice-input'

/**
 * Specifiers the page already loaded, which must stay `require` calls.
 *
 * Bundling any of these would either duplicate a runtime that carries shared
 * identity (React hooks, the Cordis service store) or inline a module the
 * loader is the only supplier of.
 */
const SHELL_PROVIDED = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-conversation/client',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-locale/client',
]

/**
 * Virtual id prefix keeping CSS Modules away from tsdown's own css pipeline.
 *
 * The suffix matters: tsdown's guard matches ids ending in `.css`, so the
 * virtual id must not end that way.
 */
const CSS_PREFIX = '\0voice-css:'
const CSS_SUFFIX = '.mjs'

/**
 * Compile one CSS Module into a self-injecting module.
 *
 * The emitted module appends a tagged `<style>` on first execution and exports
 * the hashed class map, so the component keeps importing class names normally
 * while the sheet travels inside the single served bundle.
 * @param file - absolute path of the stylesheet.
 * @returns the module source.
 */
async function cssModuleSource(file: string): Promise<string> {
  const { code, exports: cssExports } = transform({
    filename: file,
    code: await readFile(file),
    cssModules: { pattern: '[hash]_[local]' },
    minify: true,
  })
  const classMap: Record<string, string> = {}
  for (const [local, exported] of Object.entries(cssExports ?? {})) {
    classMap[local] = exported.name
  }
  return [
    `const css = ${JSON.stringify(code.toString())};`,
    `const tagId = ${JSON.stringify(`${ID}/style`)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

export default defineConfig([
  {
    name: ID,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    deps: {
      neverBundle: [
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-credentials',
        '@deepseek-ai/dsh-host-webserver',
        '@deepseek-ai/schemastery',
      ],
    },
  },
  {
    name: `${ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    // The loader hands the factory a synchronous `require`, which is CJS.
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    fixedExtension: false,
    // A banner-wrapped declaration file would not parse; the browser half's
    // types are not a published consumer surface.
    dts: false,
    sourcemap: true,
    // The host half above owns `clean`; a second clean would delete it.
    clean: false,
    deps: {
      neverBundle: SHELL_PROVIDED,
      // Everything the shell does not already provide must travel inside the
      // bundle: a `require` the module table cannot answer throws on the spot.
      alwaysBundle: (specifier: string) => !SHELL_PROVIDED.includes(specifier),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'production'),
    },
    plugins: [{
      name: 'voice-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const file = importer === undefined ? source : resolvePath(dirname(importer), source)
        return CSS_PREFIX + file + CSS_SUFFIX
      },
      async load(this: { addWatchFile(id: string): void }, virtualId: string) {
        if (!virtualId.startsWith(CSS_PREFIX)) return null
        const file = virtualId.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
        // The virtual id otherwise hides the physical sheet from the watch graph.
        this.addWatchFile(file)
        return cssModuleSource(file)
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
