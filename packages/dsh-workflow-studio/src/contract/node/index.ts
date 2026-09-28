import type { Context } from '@deepseek-ai/cordis'

export type NodeValue = null | boolean | number | string | NodeValue[] | { [key: string]: NodeValue }
export type NodeData = { [key: string]: NodeValue }
export type NodeDefinition = { id: string; type: 'node'; node_kind?: NodeValue; input_schema?: NodeData; output_schema?: NodeData } & NodeData
export type NodeStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'unknown' | 'cancelled'

export interface NodeFact {
  kind: string
  status: NodeStatus
  business?: NodeValue
  output?: NodeData
  error?: string
}

export interface NodeContext {
  definition: NodeDefinition
  input: NodeData
  fact?: NodeFact
  workspaceId: string
  services: Context
  placeholder: () => NodeData
  save: (fact: NodeFact) => Promise<void>
}

export interface NodePlan {
  fact: NodeFact
  run?: () => Promise<NodeFact>
}

export interface ServerNode {
  kind: string
  requires: readonly (keyof Context)[]
  validate: (definition: NodeDefinition) => void
  ready: (context: NodeContext) => NodePlan | undefined
  action: (context: NodeContext, name: string, payload: unknown) => NodePlan
  recover: (fact: NodeFact) => NodeFact
  project: (fact: NodeFact) => NodeData
  blocksDeletion?: (fact: NodeFact, active: boolean) => boolean
}

export class NodeInputError extends Error {}

export function nodeRegistry<T extends { kind: string }>(nodes: readonly T[]): ReadonlyMap<string, T> {
  const registry = new Map<string, T>()
  for (const node of nodes) {
    if (typeof node.kind !== 'string' || !node.kind) throw new Error('Node kind must be a nonempty string')
    if (registry.has(node.kind)) throw new Error(`Duplicate node kind: ${node.kind}`)
    registry.set(node.kind, node)
  }
  return registry
}
