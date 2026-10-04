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
        Panel(props) {
          if (props.draft?.crash) throw new Error('probe render error')
          return React.createElement('div', null,
            React.createElement('label', null, 'Probe draft', React.createElement('input', {
              'aria-label': 'Probe draft', value: props.draft?.text ?? '',
              onChange: event => props.setDraft({ text: event.target.value }),
            })),
            React.createElement('button', { onClick: () => props.setDraft({ crash: true }) }, 'Crash probe panel'),
            React.createElement('button', { onClick: () => view.dispose() }, 'Unload optional UI'),
          )
        },
      })
    } })
  } }
} })
