// Real-browser acceptance fixture. Uses only the public node contract.
export const name = '@example/workflow-browser-probe'
export const inject = ['workflowNodes']
export function apply(ctx) {
  ctx.workflowNodes.register(ctx, name, {
    kind: 'browser_probe', requires: [], validate() {}, ready() {},
    describe({ ready }) {
      return { actions: [
        ...(ready ? [{ id: 'run', label: { text: 'Run probe' }, primary: true, target: { type: 'server' } }] : []),
        { id: 'sync', label: { text: 'Fail synchronously' }, target: { type: 'client', handler: 'sync' } },
        { id: 'async', label: { text: 'Fail asynchronously' }, target: { type: 'client', handler: 'async' } },
      ] }
    },
    action(context, action) {
      if (action !== 'run') throw new Error('Unknown probe action')
      return { fact: { kind: 'browser_probe', status: 'succeeded', output: context.validateOutput({ message: 'probe saved' }) } }
    },
    recover(fact) { return fact }, project() { return {} },
  })
}
