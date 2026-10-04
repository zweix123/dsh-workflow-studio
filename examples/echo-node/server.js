/** @type {import('dsh-workflow-node/contract').ServerNode} */
const echo = {
  kind: 'example_echo', requires: [],
  validate(definition) { if (typeof definition.message !== 'string') throw new Error('message must be a string') },
  ready() { return undefined },
  describe({ ready }) { return { actions: ready ? [{ id: 'start', label: { text: 'Echo' }, primary: true, target: { type: 'server' } }] : [] } },
  action(context, action, payload) {
    if (action !== 'start' || !payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) throw new Error('Invalid echo action')
    if (context.fact?.status === 'succeeded') return { fact: context.fact }
    return { fact: { kind: 'example_echo', status: 'succeeded', output: context.validateOutput({ message: context.definition.message }) } }
  },
  recover(fact) { return fact }, project() { return {} },
}
export const name = '@example/workflow-echo'
export const inject = ['workflowNodes']
export function apply(ctx) { ctx.workflowNodes.register(ctx, name, echo) }
