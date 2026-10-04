import type { NodeRegistry } from './server.js'
declare module '@deepseek-ai/cordis' { interface Context { workflowNodes: NodeRegistry } }
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
  validateOutput: (output: unknown) => NodeData
  save: (fact: NodeFact) => Promise<void>
}

export interface NodePlan {
  fact: NodeFact
  run?: () => Promise<NodeFact>
}

export type NodeText = { text: string } | { key: string; namespace: string }
export interface NodeAction {
  id: string
  label: NodeText
  target: { type: 'server' } | { type: 'details' } | { type: 'client'; handler: string }
  primary?: boolean
  disabled?: boolean
}
export interface NodePresentation { actions: NodeAction[]; data?: NodeData }
export interface NodeDisplayContext { definition: NodeDefinition; input: NodeData; fact?: NodeFact; ready: boolean }
export interface NodeRecord { instanceId: string; nodeInstanceId: string; workspaceId: string; definition: NodeDefinition; fact: NodeFact }

export const nodeService = (kind: string): string => `workflowNode:${kind}`

export interface ServerNode {
  kind: string
  describe?: (context: NodeDisplayContext) => NodePresentation
  validateFact?: (fact: NodeFact) => void
  requires: readonly (keyof Context)[]
  validate: (definition: NodeDefinition) => void
  ready: (context: NodeContext) => NodePlan | undefined
  action: (context: NodeContext, name: string, payload: unknown) => NodePlan
  recover: (fact: NodeFact) => NodeFact
  project: (fact: NodeFact) => NodeData
  blocksDeletion?: (fact: NodeFact, active: boolean) => boolean
}

export class NodeInputError extends Error {}

export interface NodeLookup {
  get(kind: string): ServerNode | undefined
  has(kind: string): boolean
  identify?(kind: string): { source: string; token: string } | undefined
  diagnose?(kind: string): { status: string; sources: string[] }
  services?(kind: string): Context | undefined
  acquire?(kind: string): (() => void) | undefined
  subscribe?(listener: () => void): () => void
}
