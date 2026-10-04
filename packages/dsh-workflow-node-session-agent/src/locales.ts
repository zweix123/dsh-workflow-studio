export const en = {
  navigationInstanceMissing: 'The instance no longer exists.',
  returnToInstance: 'Return to instance',
  findingInstance: 'Finding instance…',
  returningToInstance: 'Returning to instance…',
  retryNavigation: 'Retry',
  navigationFailed: 'Unable to load the associated instance. Please retry.',
  openSession: 'Open conversation',
  completeSessionAgent: 'Complete',
  executeNode: 'Execute',
}

export const zh = {
  navigationInstanceMissing: '实例已不存在。',
  returnToInstance: '返回实例',
  findingInstance: '正在查找实例…',
  returningToInstance: '正在返回实例…',
  retryNavigation: '重试',
  navigationFailed: '无法加载所属实例，请重试。',
  openSession: '打开对话',
  completeSessionAgent: '完成',
  executeNode: '执行',
}

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { '@dsh-workflow/node-session-agent': keyof typeof en } }
