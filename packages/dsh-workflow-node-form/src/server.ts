import { NodeInputError, type NodeData, type NodeDefinition, type NodeFact, type ServerNode } from 'dsh-workflow-node/contract'

import { formFields, matchesContract, object, validateValue } from './fields.js'

function validateSubmission(node: NodeDefinition, payload: unknown): NodeData {
  try {
    validateValue({ type: 'object', properties: formFields(node) }, payload, 'form')
  } catch (error) { throw new NodeInputError((error as Error).message) }
  return payload as NodeData
}

export const formNode: ServerNode = {
  kind: 'form',
  describe({ ready, fact }) { return { actions: [
    ...(ready ? [{ id: 'fill', label: { namespace: name, key: 'formOpen' }, target: { type: 'details' as const }, primary: true }] : []),
    ...(ready && fact?.status === 'succeeded' ? [{ id: 'retry', label: { namespace: name, key: 'formRetry' }, target: { type: 'server' as const } }] : []),
  ] } },
  validateFact(fact) { if (fact.status === 'succeeded' && (fact.business === null || typeof fact.business !== 'object' || Array.isArray(fact.business) || fact.business?.submitted !== true)) throw new Error('Invalid form business state') },

  requires: [],
  validate(node) {
    const fields = formFields(node)
    for (const [key, type] of Object.entries(node.input_schema ?? {})) if (!Object.hasOwn(fields, key) || !matchesContract(fields[key]!, type)) throw new Error(`Node ${node.id}: prefill input ${key} must match output_schema type`)
  },
  ready() { return undefined },
  action(context, name, payload) {
    if (context.fact?.status === 'succeeded') {
      if (name === 'retry' && object(payload) && !Object.keys(payload).length) return { fact: context.fact }
      throw new Error('Form has already been submitted')
    }
    if (name !== 'submit') throw new Error('Unsupported form action')
    const output = validateSubmission(context.definition, payload)
    return { fact: { kind: 'form', status: 'succeeded', output, business: { submitted: true } } as NodeFact }
  },
  recover(fact) { return fact },
  project() { return {} },
}

export const name = '@dsh-workflow/node-form'
export const inject = ["workflowNodes"]
export function apply(ctx: import('@deepseek-ai/cordis').Context): void { ctx.workflowNodes.register(ctx, name, formNode) }
