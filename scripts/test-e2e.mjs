import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
if (args.some(arg => arg === '--trace' || arg.startsWith('--trace='))) {
  throw new Error('Network traces retain dsh Web cookies; use the step report instead')
}
const [major, minor, patch] = process.versions.node.split('.').map(Number)
if (!(major === 22 && (minor > 22 || minor === 22 && patch >= 3) || major === 24 && minor >= 8 || major > 24)) {
  throw new Error('E2E requires Node ^22.22.3 or >=24.8.0')
}

async function run(executable, args, options = {}) {
  const child = spawn(executable, args, { cwd: repo, stdio: 'inherit', ...options })
  const forward = signal => child.kill(signal)
  const interrupt = () => forward('SIGINT')
  const terminate = () => forward('SIGTERM')
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 1)))
    })
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}

// Check the installed tools before creating any temporary profile.
const paths = spawnSync('sh', ['-c', 'command -v node npm pnpm dsh'], { encoding: 'utf8' })
if (paths.status !== 0) throw new Error('E2E requires node, npm, pnpm, and dsh on PATH')
console.log(paths.stdout.trim())
for (const command of ['npm', 'pnpm', 'dsh']) {
  const version = spawnSync(command, ['--version'], { cwd: repo, encoding: 'utf8' })
  if (version.status !== 0) throw new Error(`${command} --version failed: ${version.error?.message ?? version.stderr.trim()}`)
  console.log(`${command}: ${version.stdout.trim()}`)
  if (command === 'dsh' && version.stdout.trim() !== '0.2.0-rc.1') throw new Error('E2E requires the installed dsh 0.2.0-rc.1')
}
if (await run('npm', ['run', 'build']) !== 0) process.exit(1)

const port = await new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const selected = server.address().port
    server.close(error => error ? reject(error) : resolve(selected))
  })
})
// Pass runtime and proxy settings, without copying model credentials into dsh.
const env = { E2E_BASE_URL: `http://127.0.0.1:${port}`, E2E_TELEMETRY_DISABLED: '1' }
for (const name of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'CI', 'PLAYWRIGHT_BROWSERS_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']) {
  if (process.env[name] !== undefined) env[name] = process.env[name]
}
process.exitCode = await run(process.execPath, ['node_modules/e2e/dist/cli/bin.js', 'run', ...args], {
  env,
})
