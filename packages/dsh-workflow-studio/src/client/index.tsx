import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { PANEL_ID, PLUGIN_NAME } from '../shared/constants.js'
import { WorkflowStudioPanel } from './pages/workflow-studio/WorkflowStudioPanel.js'
import { en, zh } from './locales/index.js'
import { StudioClient } from './studio-client.js'

export const name = PLUGIN_NAME
export const inject = ['slots', 'locale', 'workflowNodeViews', 'layout']

function WorkflowIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="15" y="15" width="6" height="6" rx="1.5" />
    <path d="M6 9v9h9M9 6h9v9" />
  </svg>
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(PLUGIN_NAME, { zh, en }))
  const client = new StudioClient()
  ctx.effect(() => () => client.dispose())
  const t = ctx.locale.bind(PLUGIN_NAME)
  ctx.provide('workflowNavigation', { open: async (target, signal) => {
    const opened = await client.open(target, signal)
    if (opened && !signal.aborted) ctx.layout.selectPanel(PANEL_ID as Parameters<typeof ctx.layout.selectPanel>[0])
    return opened
  }, remove: id => client.remove(id) })
  ctx.slots.inject('main', function* () {
    yield ctx.slots.register({
      name: 'main', key: PANEL_ID,
      locale: PLUGIN_NAME,
    }, props => <WorkflowStudioPanel nodes={ctx.workflowNodeViews} {...props} client={client} />)
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('title'),
    }, WorkflowIcon))
  })
}
