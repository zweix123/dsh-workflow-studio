import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { zh } from './zh.js'

export { zh } from './zh.js'
export { en } from './en.js'
export type WorkflowKey = keyof typeof zh
export type WorkflowTranslate = Translate<WorkflowKey>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-workflow-studio': WorkflowKey
  }
}
