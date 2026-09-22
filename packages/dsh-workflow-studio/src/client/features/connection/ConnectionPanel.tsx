import { ConnectionCard } from '../../components/ConnectionCard.js'
import { useConnectionStatus, type LoadStatus } from '../../hooks/useConnectionStatus.js'
import type { WorkflowTranslate } from '../../locales/index.js'

// Match the host's Plugins page and outline button, using its theme tokens.
// Keep selectors local; the plugin's browser factory ships styles with the panel.
const styles = `
.dsh-workflow-connection {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: 28px clamp(24px, 4vw, 48px) 48px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-workflow-connection-content {
  max-width: 960px;
  margin: 0 auto;
  container: dsh-workflow-connection / inline-size;
  overflow-wrap: anywhere;
}
[data-platform='darwin'] .dsh-workflow-connection header {
  padding-top: var(--dsh-frame-top-clearance, 0px);
}
.dsh-workflow-connection h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}
.dsh-workflow-connection-intro {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-secondary);
}
.dsh-workflow-connection-card {
  margin-top: 32px;
  padding: 20px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 12px;
}
.dsh-workflow-connection h2 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.dsh-workflow-connection-status {
  margin: 0 0 16px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-workflow-connection-status[data-phase='ready'] {
  color: var(--dsw-alias-state-success-primary);
}
.dsh-workflow-connection-status[data-phase='error'] {
  color: var(--dsw-alias-state-error-primary);
}
.dsh-workflow-connection-details {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 24px;
  margin: 0 0 20px;
}
.dsh-workflow-connection-details dt {
  color: var(--dsw-alias-label-secondary);
}
.dsh-workflow-connection-details dd {
  min-width: 0;
  margin: 0;
}
.dsh-workflow-connection button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 36px;
  max-width: 100%;
  padding: 6px 14px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 18px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
.dsh-workflow-connection button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-workflow-connection button:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active);
}
.dsh-workflow-connection button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.dsh-workflow-connection button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dsh-workflow-connection-scope {
  margin: 24px 0 0;
  color: var(--dsw-alias-label-tertiary);
}
@container dsh-workflow-connection (max-width: 400px) {
  .dsh-workflow-connection-card { padding: 16px; }
  .dsh-workflow-connection-details { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .dsh-workflow-connection-details dd + dt { margin-top: 8px; }
}
`

export function ConnectionPanel({ loadStatus, t }: { loadStatus: LoadStatus; t: WorkflowTranslate }) {
  const { state, check } = useConnectionStatus(loadStatus)
  return <section className="dsh-workflow-connection">
    <style>{styles}</style>
    <div className="dsh-workflow-connection-content">
      <header>
        <h1>{t('title')}</h1>
        <p className="dsh-workflow-connection-intro">{t('description')}</p>
      </header>
      <div className="dsh-workflow-connection-card">
        <h2>{t('subtitle')}</h2>
        <p role="status" aria-live="polite" className="dsh-workflow-connection-status" data-phase={state.phase}>
          {t(state.phase === 'ready' ? 'ready' : state.phase === 'loading' ? 'checking' : state.phase === 'error' ? 'failed' : 'idle')}
        </p>
        {state.phase === 'ready' && <ConnectionCard data={state.data} t={t} />}
        <button type="button" disabled={state.phase === 'loading'} onClick={() => void check()}>
          {t(state.phase === 'loading' ? 'checking' : 'check')}
        </button>
      </div>
      <p className="dsh-workflow-connection-scope">{t('scope')}</p>
    </div>
  </section>
}
