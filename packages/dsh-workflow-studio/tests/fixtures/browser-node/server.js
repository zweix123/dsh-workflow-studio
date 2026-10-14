// Real-browser acceptance fixture. Uses only the public node contract.
export const name = '@example/workflow-browser-probe'
export const inject = ['workflowNodes']
export function apply(ctx) {
  ctx.workflowNodes.register(ctx, name, {
    kind: 'browser_probe', requires: [], validate() {}, ready() {},
    describe({ ready }) {
      return { actions: [
        ...(ready ? [{ id: 'run', label: { text: 'Run probe' }, position: 1, icon: 'execute', target: { type: 'server' } }] : []),
        { id: 'sync', position: 3, icon: 'conversation', label: { text: 'Fail synchronously' }, target: { type: 'client', handler: 'sync' } },
      ] }
    },
    action(context, action) {
      if (action !== 'run') throw new Error('Unknown probe action')
      return { fact: { kind: 'browser_probe', status: 'succeeded', output: context.validateOutput({ message: 'probe saved' }) } }
    },
    recover(fact) { return fact }, project() { return {} },
  })
}
