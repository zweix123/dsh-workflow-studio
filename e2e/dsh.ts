import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { appendFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { fileURLToPath } from 'node:url'
import { test as webTest, type Browser } from '@e2e-dev/web'
import assert from 'node:assert/strict'

const repo = fileURLToPath(new URL('../', import.meta.url))
const clean = (text: string) => stripVTControlCharacters(text).replace(/([?&]token=)[^\s&)]*/g, '$1[redacted]')

export class DshHost {
  readonly root = mkdtempSync(join(tmpdir(), 'dsh-workflow-e2e-'))
  readonly home = join(this.root, 'home')
  readonly workspace = join(this.root, 'workspace')
  readonly workspaceName = basename(this.workspace)
  readonly baseUrl = process.env.E2E_BASE_URL!
  private process?: ChildProcess
  private closed?: Promise<unknown>
  private loginUrl = ''
  private readonly log = join(repo, '.e2e', 'logs', `${basename(this.root)}.log`)

  constructor() {
    mkdirSync(this.home)
    mkdirSync(this.workspace)
    mkdirSync(join(repo, '.e2e', 'logs'), { recursive: true })
    writeFileSync(join(this.home, 'e2e.patch.yml'), `- id: ui-settings-models
  config:
    credentialOnboarding: false
- id: directory-picker
  disabled: true
- insert:
    - id: e2e-directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: e2e-ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
`)
  }

  private spawn(args: string[], onLine?: (line: string) => void) {
    const child = spawn('dsh', args, {
      cwd: this.workspace,
      env: { ...process.env, DSH_HOME: this.home },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const closed = once(child, 'close')
    for (const stream of [child.stdout!, child.stderr!]) {
      let buffer = ''
      stream.setEncoding('utf8')
      stream.on('data', (text: string) => {
        buffer += text
        const lines = buffer.split('\n')
        buffer = lines.pop()!
        for (const line of lines) {
          appendFileSync(this.log, `${clean(line)}\n`)
          onLine?.(stripVTControlCharacters(line))
        }
      })
      stream.on('end', () => { if (buffer) appendFileSync(this.log, clean(buffer)) })
    }
    return { child, closed }
  }

  async install() {
    // Only use the user-installed CLI of the version this plugin supports.
    const child = spawn('dsh', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let version = ''
    child.stdout!.on('data', text => { version += text })
    const [code] = await once(child, 'close')
    assert.equal(code, 0, 'dsh --version failed')
    assert.equal(version.trim(), '0.2.0-rc.1', 'E2E requires the installed dsh 0.2.0-rc.1')
    for (const directory of ['packages/dsh-workflow-bundle', 'packages/dsh-workflow-studio/tests/fixtures/form-structured']) {
      await this.addBundle(join(repo, directory))
    }
  }

  async addBundle(directory: string) {
    const { child, closed } = this.spawn(['plugin', '--profile', 'web', 'add', directory, '--registry=https://registry.npmjs.org'])
    this.process = child
    this.closed = closed
    const [code] = await closed as [number]
    assert.equal(code, 0, `Plugin registration failed; see ${this.log}`)
  }

  async start() {
    let resolveUrl!: (url: string) => void
    const url = new Promise<string>(resolve => { resolveUrl = resolve })
    const { child, closed } = this.spawn([
      '--profile', 'web', '--patch', join(this.home, 'e2e.patch.yml'),
      '--host', '127.0.0.1', '--port', new URL(this.baseUrl).port, '--no-open',
    ], line => {
      const match = line.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s)]+)/)
      if (match) resolveUrl(match[1])
    })
    this.process = child
    this.closed = closed
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      this.loginUrl = await Promise.race([
        url,
        closed.then(() => { throw new Error(`dsh exited before startup; see ${this.log}`) }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`dsh startup timed out; see ${this.log}`)), 60_000) }),
      ])
    } finally { clearTimeout(timer) }
  }

  async authenticate(browser: Browser) {
    // Exchange the current process's temporary launch URL outside browser traces.
    const response = await fetch(this.loginUrl, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    assert.equal(response.status, 303, 'dsh Web login did not redirect')
    const cookie = response.headers.getSetCookie()[0]?.split(';')[0]
    assert.ok(cookie, 'dsh Web login did not issue a cookie')
    const separator = cookie.indexOf('=')
    await browser.setCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: this.baseUrl, httpOnly: true, sameSite: 'Strict' }])
    await response.body?.cancel()
  }

  async stop() {
    const child = this.process
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    process.kill(-child.pid!, 'SIGTERM')
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid!, 'SIGKILL')
    }, 10_000)
    try { await this.closed } finally { clearTimeout(timer) }
  }

  async restart(browser: Browser) {
    await this.stop()
    await this.start()
    await this.authenticate(browser)
  }

  async dispose() {
    await this.stop()
    rmSync(this.root, { recursive: true, force: true })
  }
}

export const test = webTest.extend<{ dsh: DshHost }>({
  dsh: async ({ browser }, use) => {
    const host = new DshHost()
    try {
      await host.install()
      await host.start()
      await host.authenticate(browser)
      await use(host)
    } finally { await host.dispose() }
  },
})
