import type {} from './browser.js'
export type { BrowserNodeRegistry, NodeNavigation, NodeNavigationTarget } from './browser.js'
import type { ComponentType } from 'react'
import type { NodeData, NodeDefinition, NodeValue } from './index.js'

export interface NodeCardProps {
  data?: NodeData
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
  instanceId?: string
  nodeInstanceId?: string
  draft?: NodeData
  setDraft: (value: NodeData) => void
}

export interface ClientNode {
  kind: string
  Summary?: ComponentType<Pick<NodeCardProps, 'definition' | 'input' | 'output' | 'execution' | 'data' | 't'>>
  Panel?: ComponentType<NodeViewProps>
  handlers?: Record<string, (props: NodeViewProps) => void | Promise<void>>
}
