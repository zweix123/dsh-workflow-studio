import type { PluginStatus } from '../../shared/types/plugin-status.js'
import type { WorkflowTranslate } from '../locales/index.js'

export function ConnectionCard({ data, t }: { data: PluginStatus; t: WorkflowTranslate }) {
  return <dl className="dsh-workflow-connection-details">
    <dt>{t('version')}</dt><dd>{data.version}</dd>
    <dt>{t('serverTime')}</dt><dd><time dateTime={data.serverTime}>{data.serverTime}</time></dd>
  </dl>
}
