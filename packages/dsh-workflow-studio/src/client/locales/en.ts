import type { zh } from './zh.js'

export const en: Record<keyof typeof zh, string> = {
  title: 'Workflow Studio',
  subtitle: 'Workflow plugin loaded',
  description: 'Check the connection to the dsh backend to confirm the local plugin is installed correctly.',
  check: 'Check connection',
  checking: 'Connecting…',
  ready: 'Connected to backend',
  idle: 'Ready to check',
  failed: 'Connection failed. Make sure the backend plugin is loaded and try again.',
  version: 'Plugin version',
  serverTime: 'Server time',
  scope: 'This is the initial version. Workflow editing and execution will be added in future updates.',
}
