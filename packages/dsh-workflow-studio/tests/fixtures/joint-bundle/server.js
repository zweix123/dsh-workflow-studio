// Acceptance fixture: only the independent public node contract is used.
export const name = '@example/workflow-joint'
export const inject = ['workflowNodes']
export const node = {
  kind: 'joint_echo', requires: [],
  validate(definition) { if (typeof definition.message !== 'string') throw new Error('message must be a string') },
  ready() {},
  describe({ ready }) { return { actions: ready ? [{ id: 'echo', label: { text: 'Echo joint' }, primary: true, target: { type: 'server' } }] : [] } },
  action(context, action, payload) {
    if (action !== 'echo' || !payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) throw new Error('Invalid echo action')
    return { fact: { kind: 'joint_echo', status: 'succeeded', output: context.validateOutput({ message: context.definition.message }) } }
  },
  recover(fact) { return fact }, project() { return {} },
}
export function apply(ctx) { ctx.workflowNodes.register(ctx, name, node) }
