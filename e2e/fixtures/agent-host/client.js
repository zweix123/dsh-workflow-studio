window.__ModuleLoader__.load({ id: '@dsh-workflow/agent-host-fixture', factory: require => {
  const React = require('react')
  return { name: '@dsh-workflow/agent-host-fixture', inject: ['workflowNodeViews', 'uiWorkspace'], apply(ctx) {
    ctx.workflowNodeViews.register(ctx, '@dsh-workflow/agent-host-fixture', { kind: 'host_probe', Panel: ({ execution }) => React.createElement('section', null,
      React.createElement('pre', { 'aria-label': '宿主验证结果' }, JSON.stringify(execution)),
      execution?.address && React.createElement('button', { onClick: () => ctx.uiWorkspace.openSession(execution.address) }, '打开子记录')) })
  } }
} })
