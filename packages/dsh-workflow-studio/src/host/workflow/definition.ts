import type { DagDefinition, NodeDefinition } from '../dag/index.js'
import { bashFields, validateBashNode } from '../nodes/bash.js'
import { chatFields, validateChatNode } from '../nodes/chat.js'

export type WorkflowNode = NodeDefinition & { is_auto_start?: boolean } & (
  | { node_kind: 'chat'; prompt: string }
  | { node_kind: 'bash'; command: string }
)

const fields = { chat: chatFields, bash: bashFields } as const

export function validateWorkflowNodes(definition: DagDefinition): void {
  const owner = new Map<string, string>()
  for (const [kind, names] of Object.entries(fields)) for (const name of names) {
    const previous = owner.get(name)
    if (previous) throw new Error(`Node field ${name} is declared by both ${previous} and ${kind}`)
    owner.set(name, kind)
  }
  function visit(dag: DagDefinition): void {
    for (const entry of dag.dag) {
      if (entry.type === 'dag') { visit(entry); continue }
      if (entry.type !== 'node') continue
      const kind = entry.node_kind
      if (kind !== 'chat' && kind !== 'bash') throw new Error(`Node ${entry.id}: node_kind must be chat or bash`)
      if (kind === 'chat') validateChatNode(entry)
      else validateBashNode(entry)
      if (entry.is_auto_start !== undefined && typeof entry.is_auto_start !== 'boolean') {
        throw new Error(`Node ${entry.id}: is_auto_start must be a boolean`)
      }
      for (const name of owner.keys()) if (owner.get(name) !== kind && Object.hasOwn(entry, name)) {
        throw new Error(`Node ${entry.id}: ${name} belongs to ${owner.get(name)}`)
      }
    }
  }
  visit(definition)
}

export function workflowNode(definition: NodeDefinition): WorkflowNode {
  return definition as WorkflowNode
}
