declare const __REACT_FLOW_CSS__: string
const reactFlowCss = typeof __REACT_FLOW_CSS__ === 'undefined' ? '' : __REACT_FLOW_CSS__

// Match the conversation header in dsh 0.1.6-alpha.2 without importing its
// session runtime or private CSS classes. Page styles ship with the browser factory.
export const styles = `
${reactFlowCss}
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
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scrollbar-width: thin;
}
.dsh-workflow-studio-tab {
  position: relative;
  display: flex;
  align-items: center;
  flex: none;
  gap: 6px;
  min-height: 25px;
  padding-bottom: 4px;
}
.dsh-workflow-studio-tab button {
  margin: 0;
  padding: 0;
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
.dsh-workflow-studio-tab::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: transparent;
}
.dsh-workflow-studio-tab button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-workflow-studio-tab button:active {
  background: var(--dsw-alias-interactive-bg-active);
}
.dsh-workflow-studio-tab button[aria-selected='true'] {
  color: var(--dsw-alias-state-business-primary);
}
.dsh-workflow-studio-tab[data-selected='true']::after {
  background: var(--dsw-alias-state-business-primary);
}
.dsh-workflow-studio-tab .dsh-workflow-tab-close {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 400;
  line-height: 20px;
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
.dsh-workflow-instances {
  min-width: 0;
  min-height: 0;
}
.dsh-workflow-instance-overview {
  box-sizing: border-box;
  width: min(100%, 1320px);
  margin: 0 auto;
  padding: 28px 36px 96px;
  container-type: inline-size;
}
.dsh-workflow-overview-heading { margin-bottom: 28px; }
.dsh-workflow-overview-heading h2 {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}
.dsh-workflow-overview-heading p { margin: 6px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 18px; }
.dsh-workflow-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.dsh-workflow-workspace {
  min-width: 0;
  padding: 18px 18px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh-workflow-workspace > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 11px;
}
.dsh-workflow-workspace > header > div { min-width: 0; }
.dsh-workflow-workspace h3,
.dsh-workflow-detail h2,
.dsh-workflow-create h2 {
  margin: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-workflow-workspace > header p { margin: 5px 0 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dsh-workflow-add { flex: none; white-space: nowrap; }
.dsh-workflow-instance-row:hover,
.dsh-workflow-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-workflow-workspace ul { margin: 0; padding: 0; list-style: none; }
.dsh-workflow-instance-item { position: relative; }
.dsh-workflow-instance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 42px;
  gap: 12px;
  padding: 8px;
  border: 0;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-workflow-instance-row strong {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-workflow-instance-row span,
.dsh-workflow-empty,
.dsh-workflow-notice,
.dsh-workflow-detail p,
.dsh-workflow-create p {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-workflow-instance-row span { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-workflow-instance-more {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 23px;
  line-height: 20px;
  cursor: pointer;
  opacity: 0;
}
.dsh-workflow-instance-item:hover .dsh-workflow-instance-more,
.dsh-workflow-instance-item:focus-within .dsh-workflow-instance-more,
.dsh-workflow-instance-item[data-menu-open='true'] .dsh-workflow-instance-more { opacity: 1; }
.dsh-workflow-instance-item:hover .dsh-workflow-instance-row span,
.dsh-workflow-instance-item:focus-within .dsh-workflow-instance-row span { visibility: hidden; }
.dsh-workflow-instance-more:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-workflow-instance-menu {
  position: absolute;
  z-index: 10;
  top: 38px;
  right: 4px;
  min-width: 150px;
  padding: 5px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
}
.dsh-workflow-instance-menu button {
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-error);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.dsh-workflow-instance-menu button:hover { background: var(--dsw-alias-interactive-bg-hover); }
@media (hover: none) {
  .dsh-workflow-instance-more { opacity: 1; }
  .dsh-workflow-instance-row span { visibility: hidden; }
}
.dsh-workflow-empty { padding: 14px 8px; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-workflow-notice { padding: 8px 0; }
.dsh-workflow-create-overlay { position: fixed; z-index: 20; inset: 0; display: grid; place-items: center; padding: 24px; }
.dsh-workflow-create-mask { position: absolute; inset: 0; width: 100%; border: 0; background: color-mix(in srgb, black 40%, transparent); cursor: default; }
.dsh-workflow-create-dialog {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(700px, 100%);
  height: min(730px, calc(100vh - 48px));
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 32px;
  background: var(--dsw-alias-bg-base);
  box-shadow: var(--dsw-elevation-prominent);
}
.dsh-workflow-delete-dialog {
  position: relative;
  box-sizing: border-box;
  width: min(420px, 100%);
  padding: 24px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 20px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-prominent);
}
.dsh-workflow-delete-dialog h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
.dsh-workflow-delete-dialog p { margin: 6px 0; font-size: 13px; line-height: 20px; }
.dsh-workflow-delete-name { font-weight: 600; overflow-wrap: anywhere; }
.dsh-workflow-delete-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.dsh-workflow-delete-confirm { color: var(--dsw-alias-label-error); }
.dsh-workflow-create { display: flex; flex: 1; flex-direction: column; min-height: 0; padding: 28px 36px; }
.dsh-workflow-create-heading,
.dsh-workflow-detail-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 24px;
}
.dsh-workflow-create-heading > div,
.dsh-workflow-detail-header > div { flex: 1; min-width: 0; }
.dsh-workflow-create h2 { font-size: 19px; line-height: 26px; }
.dsh-workflow-create-heading p { margin-top: 6px; }
.dsh-workflow-create-close {
  flex: none;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 22px;
  line-height: 30px;
  cursor: pointer;
}
.dsh-workflow-create-close:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-workflow-create-fields { flex: 1; min-height: 0; overflow: auto; }
.dsh-workflow-create label {
  display: grid;
  gap: 7px;
  margin-top: 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}
.dsh-workflow-create input,
.dsh-workflow-create select {
  box-sizing: border-box;
  width: 100%;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-weight: 400;
}
.dsh-workflow-create input,
.dsh-workflow-create select { height: 36px; padding: 0 10px; }
.dsh-workflow-create input:focus,
.dsh-workflow-create select:focus { border-color: var(--dsw-alias-state-business-primary); }
.dsh-workflow-template-empty {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  font-size: 12px;
}
.dsh-workflow-template-empty code { overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); }
.dsh-workflow-error { margin-top: 12px !important; color: var(--dsw-alias-label-error) !important; }
.dsh-workflow-form-actions { display: flex; justify-content: flex-end; flex: none; margin-top: 20px; padding-top: 18px; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-workflow-button {
  min-height: 32px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dsh-workflow-button:disabled { cursor: default; opacity: .45; }
.dsh-workflow-button-primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
}
.dsh-workflow-button-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dsh-workflow-detail { display: flex; flex-direction: column; height: 100%; min-height: 0; container-type: inline-size; }
.dsh-workflow-detail-header { flex: none; margin: 0; padding: 16px 20px; border-bottom: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-workflow-run { display: flex; position: relative; flex: 1; min-height: 0; min-width: 0; }
.dsh-workflow-run-error { margin: 0; padding: 8px 20px; color: var(--dsw-alias-label-error); font-size: 12px; }
.dsh-workflow-run-note { margin: 0; padding: 8px 20px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsh-workflow-inspector { position: absolute; z-index: 5; top: 0; right: 0; bottom: 0; box-sizing: border-box; max-width: 100%; border-left: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-elevation-prominent); }
.dsh-workflow-inspector-resize { position: absolute; top: 0; bottom: 0; left: -5px; width: 10px; cursor: col-resize; touch-action: none; }
.dsh-workflow-inspector-resize:hover { background: var(--dsw-alias-state-business-primary); opacity: .35; }
.dsh-workflow-inspector header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px; border-bottom: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-workflow-inspector h3 { margin: 0; font-size: 14px; font-weight: 600; }
.dsh-workflow-inspector p { margin: 6px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsh-workflow-inspector button { border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 22px; cursor: pointer; }
.dsh-workflow-inspector button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-workflow-inspector-body { overflow: auto; padding: 16px 18px; font-size: 12px; }
.dsh-workflow-inspector-body button { padding: 6px 10px; margin: 0 8px 8px 0; border: 1px solid var(--dsw-alias-border-l2); font-size: 12px; }
.dsh-workflow-inspector-body button:disabled { opacity: .5; cursor: default; }
.dsh-workflow-inspector-body pre { overflow-wrap: anywhere; white-space: pre-wrap; font: inherit; }
.dsh-workflow-graph { flex: 1; min-height: 0; min-width: 0; background: var(--dsw-alias-bg-module-platform); }
.dsh-workflow-graph .react-flow { width: 100%; height: 100%; }
.dsh-workflow-graph .react-flow__node { cursor: default; }
.dsh-workflow-graph .react-flow__handle { width: 1px; height: 1px; border: 0; opacity: 0; pointer-events: none; }
.dsh-workflow-graph .react-flow__edge-path { stroke: var(--dsw-alias-label-secondary); stroke-width: 2; }
.dsh-workflow-graph .dsh-workflow-edge-active .react-flow__edge-path { stroke: var(--dsw-alias-state-business-primary); stroke-width: 2.2; }
.dsh-workflow-graph .dsh-workflow-edge-pending .react-flow__edge-path { stroke-dasharray: 5 4; }
.dsh-workflow-graph .dsh-workflow-edge-inactive .react-flow__edge-path { stroke: var(--dsw-alias-label-tertiary); stroke-dasharray: 3 5; }
.dsh-workflow-graph .react-flow__edge-text { fill: var(--dsw-alias-label-primary); font-size: 11px; }
.dsh-workflow-graph .react-flow__edge-textbg { fill: var(--dsw-alias-bg-layer-1); fill-opacity: .96; }
.dsh-workflow-graph .react-flow__controls { border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; overflow: hidden; box-shadow: none; }
.dsh-workflow-graph .react-flow__controls-button { background: var(--dsw-alias-bg-layer-1); border-bottom-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); fill: currentColor; }
.dsh-workflow-graph .react-flow__controls-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-workflow-graph .react-flow__controls-button svg { fill: currentColor; }
.dsh-workflow-graph .react-flow__node-dagGroup { border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); }
.dsh-workflow-graph .react-flow__node-aggregate { border: 0; background: transparent; }
.dsh-workflow-aggregate { display: grid; place-items: center; width: 60px; height: 22px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 11px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 10px; white-space: nowrap; }
.dsh-workflow-graph .dsh-workflow-edge-aggregation .react-flow__edge-path { stroke: var(--dsw-alias-label-secondary); stroke-dasharray: 3 3; }
.dsh-workflow-dag-group { width: 100%; height: 100%; box-sizing: border-box; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsh-workflow-dag-heading { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; }
.dsh-workflow-dag-heading .dsh-workflow-node-status { margin-left: auto; white-space: nowrap; }
.dsh-workflow-dag-heading button { border: 0; border-radius: 4px; padding: 3px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.dsh-workflow-dag-heading button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-workflow-dag-heading strong { color: var(--dsw-alias-label-primary); font-weight: 600; }
.dsh-workflow-node {
  box-sizing: border-box;
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: 16px 1fr auto;
  gap: 4px 8px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dsh-workflow-node strong { grid-column: 1 / -1; overflow: hidden; font-size: 13px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.dsh-workflow-node { cursor: default; }
.dsh-workflow-node-actions { display: flex; grid-column: 1 / -1; align-items: center; justify-content: space-between; gap: 4px; }
.dsh-workflow-node-actions button { border: 0; border-radius: 5px; padding: 2px 4px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; white-space: nowrap; cursor: pointer; }
.dsh-workflow-node-actions button:last-child { margin-left: auto; }
.dsh-workflow-node-actions button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-workflow-node-actions button:disabled { opacity: .5; cursor: default; }
.dsh-workflow-node-kind,
.dsh-workflow-node-status,
.dsh-workflow-node small { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 14px; }
.dsh-workflow-node-status { display: inline-flex; align-items: center; gap: 5px; }
.dsh-workflow-node-status { text-transform: capitalize; }
.dsh-workflow-node-status i { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
.dsh-workflow-node[data-status='ready'] .dsh-workflow-node-status i,
.dsh-workflow-node[data-status='running'] .dsh-workflow-node-status i,
.dsh-workflow-dag-group[data-status='running'] .dsh-workflow-node-status i { background: var(--dsw-alias-state-business-primary); }
.dsh-workflow-node[data-status='completed'] .dsh-workflow-node-status i,
.dsh-workflow-dag-group[data-status='completed'] .dsh-workflow-node-status i { background: var(--dsw-alias-state-success-primary); }
.dsh-workflow-node[data-status='waiting'] { border-style: dashed; }
.dsh-workflow-node[data-status='skipped'] { opacity: .55; }
.dsh-workflow-add:focus-visible,
.dsh-workflow-instance-row:focus-visible,
.dsh-workflow-instance-more:focus-visible,
.dsh-workflow-instance-menu button:focus-visible,
.dsh-workflow-delete-dialog button:focus-visible,
.dsh-workflow-button:focus-visible,
.dsh-workflow-create-close:focus-visible,
.dsh-workflow-create input:focus-visible,
.dsh-workflow-create select:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.dsh-workflow-node-actions button:focus-visible,
.dsh-workflow-dag-heading button:focus-visible,
.dsh-workflow-inspector-resize:focus-visible,
.dsh-workflow-inspector button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
@container (max-width: 760px) {
  .dsh-workflow-card-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .dsh-workflow-instance-overview { padding: 24px 18px 80px; }
}
@media (max-width: 520px) {
  .dsh-workflow-instance-overview { padding-inline: 14px; }
  .dsh-workflow-create-overlay { padding: 10px; }
  .dsh-workflow-create-dialog { height: calc(100vh - 20px); border-radius: 18px; }
  .dsh-workflow-create { padding: 21px 18px; }
}
`
