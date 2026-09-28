import type { DagDefinition, NodeDefinition } from '../dag/index.js'
import type { ServerNode } from '../../contract/node/index.js'
import { serverNodes } from '../nodes/registry.js'

export type WorkflowNode = NodeDefinition & { node_kind: string }

export function validateWorkflowNodes(definition: DagDefinition, nodes: ReadonlyMap<string, ServerNode> = serverNodes): void {
  function visit(dag: DagDefinition): void {
    for (const entry of dag.dag) {
      if (entry.type === 'dag') { visit(entry); continue }
      if (entry.type !== 'node') continue
      const kind = entry.node_kind
      if (typeof kind !== 'string' || !nodes.has(kind)) throw new Error(`Node ${entry.id}: unknown node_kind ${String(kind)}`)
      nodes.get(kind)!.validate(entry)
    }
  }
  visit(definition)
}

export function workflowNode(definition: NodeDefinition): WorkflowNode {
  return definition as WorkflowNode
}
