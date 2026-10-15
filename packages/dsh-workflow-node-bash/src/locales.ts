export const en = {
  command: 'Command',
  rerunNode: 'Run again',
  retryDelivery: 'Retry delivery',
  logTruncated: 'Log truncated',
  commandOutput: 'Command log · stdout',
  commandError: 'Command log · stderr',
  executing: 'Executing…',
  resultUnknown: 'The previous result is unknown. Check before running again.',
  executeNode: 'Execute',
}

export const zh = {
  command: '命令',
  rerunNode: '重新执行',
  retryDelivery: '重试交付',
  logTruncated: '日志已截断',
  commandOutput: '命令日志 · stdout',
  commandError: '命令日志 · stderr',
  executing: '正在执行…',
  resultUnknown: '上次执行结果未知，请确认后决定是否再次执行。',
  executeNode: '执行',
}

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { '@dsh-workflow/node-bash': keyof typeof en } }
