// Match the conversation header in dsh 0.1.6-alpha.2 without importing its
// session runtime or private CSS classes. Page styles ship with the browser factory.
export const styles = `
.dsh-workflow-studio {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.dsh-workflow-studio-header {
  flex: none;
  box-sizing: border-box;
  min-height: 76px;
  padding: 10px 28px 0 20px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}
.dsh-workflow-studio-title-row {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 30px;
  padding-inline-start: max(0px, calc(var(--dsh-frame-leading-clearance, 0px) - 20px));
}
.dsh-workflow-studio h1 {
  min-width: 0;
  margin: 0;
  padding: 4px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}
.dsh-workflow-studio-tabs {
  display: flex;
  gap: 36px;
  margin-top: 10px;
  padding-left: 8px;
}
.dsh-workflow-studio-tabs button {
  position: relative;
  flex: none;
  margin: 0;
  padding: 0 0 9px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 16px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.dsh-workflow-studio-tabs button::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: transparent;
}
.dsh-workflow-studio-tabs button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-workflow-studio-tabs button:active {
  background: var(--dsw-alias-interactive-bg-active);
}
.dsh-workflow-studio-tabs button[aria-selected='true'] {
  color: var(--dsw-alias-state-business-primary);
}
.dsh-workflow-studio-tabs button[aria-selected='true']::after {
  background: var(--dsw-alias-state-business-primary);
}
.dsh-workflow-studio-tabs button:focus-visible,
.dsh-workflow-studio-panel:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}
.dsh-workflow-studio-panel {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
`
