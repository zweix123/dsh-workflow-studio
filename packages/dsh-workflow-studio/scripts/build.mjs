import { build } from 'esbuild'
import { readFile, rm } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
await rm('lib', { recursive: true, force: true })
await build({
  entryPoints: {
    index: 'src/index.ts',
    'host/dag-engine/index': 'src/host/dag-engine/index.ts',
  },
  outdir: 'lib',
  bundle: true, platform: 'node', format: 'esm', target: 'es2022', packages: 'external',
  define: { __PLUGIN_VERSION__: JSON.stringify(manifest.version) },
})
// dsh supplies React and evaluates the browser entry through its closure factory.
await build({
  entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js',
  bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis'],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports;\n} });' },
})
