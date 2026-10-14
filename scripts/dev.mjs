import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const home = fileURLToPath(new URL('../.local/dsh-dev/', import.meta.url))
mkdirSync(home, { recursive: true })
const env = { ...process.env, DSH_HOME: home }
const version = spawnSync('dsh', ['--version'], { cwd: repo, env, encoding: 'utf8' })
if (version.error) throw version.error
if (version.status !== 0 || version.stdout.trim() !== '0.2.0-rc.1') throw new Error('开发宿主需要本机 dsh 0.2.0-rc.1')
function run(args) {
  const result = spawnSync('dsh', args, { cwd: repo, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(`开发宿主 DSH_HOME: ${home}`)
for (const directory of ['dsh-workflow-bundle', 'dsh-workflow-dev-templates']) {
  run(['plugin', '--profile', 'web', 'add', `${repo}packages/${directory}`, '--registry=https://registry.npmjs.org'])
}
if (process.argv[2] !== '--install-only') run(['--profile', 'web', '--port', '3081', ...process.argv.slice(2)])
