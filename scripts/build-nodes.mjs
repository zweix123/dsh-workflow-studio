import { build } from 'esbuild'
import { readFile, mkdir, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

for (const directory of ['dsh-workflow-node', 'dsh-workflow-node-bash', 'dsh-workflow-node-session-agent', 'dsh-workflow-node-form']) {
  const root = `packages/${directory}`
  const manifest = JSON.parse(await readFile(`${root}/package.json`, 'utf8'))
  await rm(`${root}/lib`, { recursive: true, force: true }); await mkdir(`${root}/lib`, { recursive: true })
  const registry = directory === 'dsh-workflow-node'
  const entries = registry ? { server: `${root}/src/server.ts`, contract: `${root}/src/index.ts`, 'text-template': `${root}/src/text-template.ts`, ui: `${root}/src/client.ts` } : { server: `${root}/src/server.ts` }
  await build({ entryPoints: entries, outdir: `${root}/lib`, bundle: true, platform: 'node', format: 'esm', target: 'es2022', packages: 'external' })
  await build({ entryPoints: [registry ? `${root}/src/browser.ts` : `${root}/src/client.tsx`], outfile: `${root}/lib/client.js`, bundle: true, platform: 'browser', format: 'cjs', jsx: 'automatic', target: 'es2022', external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis'], define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` }, footer: { js: 'return module.exports;\n} });' } })
  execFileSync('node_modules/.bin/tsc', ['--emitDeclarationOnly', '--declaration', '--skipLibCheck', '--strict', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--jsx', 'react-jsx', '--rootDir', 'packages', '--outDir', `${root}/lib/types`, ...Object.values(entries), registry ? `${root}/src/browser.ts` : `${root}/src/client.tsx`], { stdio: 'inherit' })
}
