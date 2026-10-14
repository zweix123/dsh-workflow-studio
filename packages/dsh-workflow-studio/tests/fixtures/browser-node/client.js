// The same browser factory format used by the node build. React comes from dsh.
window.__ModuleLoader__.load({ id: '@example/workflow-browser-probe', factory: require => {
  const React = require('react')
  const name = '@example/workflow-browser-probe'
  return { name, inject: ['workflowNodeViews'], apply(ctx) {
    const view = ctx.plugin({ name, apply(owner) {
      ctx.workflowNodeViews.register(owner, name, {
        kind: 'browser_probe',
        handlers: {
          sync() { throw new Error('probe synchronous error') },
          async async() { throw new Error('probe asynchronous error') },
        },
        Panel({ execution }) { return React.createElement('pre', null, JSON.stringify(execution ?? {})) },
      })
    } })
  } }
} })
