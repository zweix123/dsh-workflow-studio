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
    ...(ready && fact?.status !== 'succeeded' ? [{ id: 'fill', label: { namespace: name, key: 'formOpen' }, target: { type: 'client' as const, handler: 'fill' }, position: 1 as const, icon: 'edit' as const }] : []),
    ...(ready && fact?.status === 'succeeded' ? [{ id: 'retry', position: 1 as const, icon: 'retry' as const, label: { namespace: name, key: 'formRetry' }, target: { type: 'server' as const } }] : []),
  ] } },
  validateFact(fact) { if (fact.status === 'succeeded' && (fact.business === null || typeof fact.business !== 'object' || Array.isArray(fact.business) || fact.business?.submitted !== true)) throw new Error('Invalid form business state') },

  requires: [],
  validate(node) {
    const fields = formFields(node)
    for (const [key, type] of Object.entries(node.input_schema ?? {})) if (!Object.hasOwn(fields, key) || !matchesContract(fields[key]!, type)) throw new Error(`Node ${node.id}: prefill input ${key} must match output_schema type`)
  },
  ready() { return undefined },
  action(context, action, payload) {
    if (context.fact?.status === 'succeeded') {
      if (action === 'retry' && object(payload) && !Object.keys(payload).length) return { fact: context.fact }
      throw new Error('Form has already been submitted')
    }
    if (action !== 'submit') throw new Error('Unsupported form action')
    const attempt = { namespace: name, key: 'formSubmit' }
    try {
      const output = validateSubmission(context.definition, payload)
      return { attempt, fact: { kind: 'form', status: 'succeeded', output, business: { submitted: true, submission: output } } as NodeFact }
    } catch (error) {
      if (!(error instanceof NodeInputError)) throw error
      return { attempt, rejection: error.message, fact: { kind: 'form', status: 'failed', error: error.message, business: { submission: payload as import('dsh-workflow-node/contract').NodeValue } } }
    }
  },
  recover(fact) { return fact },
  project() { return {} },
  record(fact) { return (fact.business ?? {}) as NodeData },
}

export const name = '@dsh-workflow/node-form'
export const inject = ["workflowNodes"]
export function apply(ctx: import('@deepseek-ai/cordis').Context): void { ctx.workflowNodes.register(ctx, name, formNode) }
