import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
const root = 'packages/dsh-workflow-template'
await build({ entryPoints: [`${root}/src/index.ts`], outfile: `${root}/lib/index.js`, bundle: true, platform: 'node', format: 'esm', target: 'es2022', packages: 'external' })
execFileSync('node_modules/.bin/tsc', ['--emitDeclarationOnly', '--declaration', '--skipLibCheck', '--strict', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--rootDir', 'packages', '--outDir', `${root}/lib/types`, `${root}/src/index.ts`], { stdio: 'inherit' })
