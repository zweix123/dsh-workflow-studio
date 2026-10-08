import type { E2EConfig } from 'e2e'
import { web } from '@e2e-dev/web'

if (!process.env.E2E_BASE_URL) throw new Error('Run E2E tests through npm run test:e2e')

export default {
  tests: 'e2e/**/*.e2e.ts',
  targets: [{
    name: 'chromium-zh',
    engine: web({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } }),
    app: { url: process.env.E2E_BASE_URL, identity: 'dsh-workflow-studio-e2e' },
  }],
  workers: 1,
  retries: 0,
  timeout: 180_000,
  cleanupTimeout: 30_000,
  assertionTimeout: 15_000,
  cache: 'off',
  // The JSON report retains steps; raw network traces would retain Web cookies.
  trace: 'off',
  video: 'off',
  reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
