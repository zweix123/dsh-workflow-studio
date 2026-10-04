import type { DagDefinition, NodeDefinition } from '../dag/index.js'
import type { NodeLookup } from 'dsh-workflow-node/contract'

export type WorkflowNode = NodeDefinition & { node_kind: string }

export function validateWorkflowNodes(definition: DagDefinition, nodes: NodeLookup): void {
  function visit(dag: DagDefinition): void {
    for (const entry of dag.dag) {
      if (entry.type === 'dag') { visit(entry); continue }
      if (entry.type !== 'node') continue
      const kind = entry.node_kind
      if (typeof kind !== 'string' || !nodes.has(kind)) throw new Error(`Node ${entry.id}: unavailable node_kind ${String(kind)} ${JSON.stringify(nodes.diagnose?.(String(kind)) ?? {})}`)
      nodes.get(kind)!.validate(structuredClone(entry))
    }
  }
  visit(definition)
}

export function workflowNode(definition: NodeDefinition): WorkflowNode {
  return definition as WorkflowNode
}

export function nodeDefinitionAt(root: unknown, path: readonly (string | number)[]): import('dsh-workflow-node/contract').NodeDefinition | undefined {
  let current: unknown = root
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[key]
  }
  return current && typeof current === 'object' && (current as { type?: string }).type === 'node' ? current as import('dsh-workflow-node/contract').NodeDefinition : undefined
}
