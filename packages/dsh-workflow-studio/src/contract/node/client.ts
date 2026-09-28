import type { ComponentType } from 'react'
import type { NodeData, NodeDefinition, NodeValue } from './index.js'

export interface NodeCardProps {
  label: string
  definition: NodeDefinition
  input: NodeData
  output?: NodeData
  execution?: { kind: string; status: string; error?: string; [key: string]: unknown }
  ready: boolean
  pending: boolean
  t: (key: string) => string
  action: (name: string, payload: unknown) => void
  inspect: () => void
}

export interface NodeViewProps extends Omit<NodeCardProps, 'inspect'> {
  openSession: (sessionId: string) => void
  draft?: NodeData
  setDraft: (value: NodeData) => void
}

export interface ClientNode {
  kind: string
  Card: ComponentType<NodeCardProps>
  Panel: ComponentType<NodeViewProps>
}
