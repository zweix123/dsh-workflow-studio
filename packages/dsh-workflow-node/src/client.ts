import type {} from './browser.js'
export type { BrowserNodeRegistry, NodeNavigation, NodeNavigationTarget } from './browser.js'
import type { ComponentType } from 'react'
import type { NodeData, NodeDefinition } from './index.js'

/** Read-only node details deliberately have no action or draft callbacks. */
export interface NodeDetailsProps {
  data?: NodeData
  label: string
  definition: NodeDefinition
  input: NodeData
  output?: NodeData
  execution?: { kind: string; status: string; error?: string; [key: string]: unknown }
  t: (key: string) => string
}
export interface NodeViewProps extends NodeDetailsProps {
  instanceId?: string
  nodeInstanceId?: string
  ready: boolean
  pending: boolean
  active: boolean
  error?: string
  action: (name: string, payload: unknown) => Promise<void>
  reportError: (error: unknown) => void
  request?: { handler: string; sequence: number }
}
export type NodeCardProps = NodeDetailsProps
export interface ClientNode {
  kind: string
  Summary?: ComponentType<NodeDetailsProps>
  Panel?: ComponentType<NodeDetailsProps>
  /** Mounted per node for the page lifetime; owns dialogs and temporary drafts. */
  interactions?: Record<string, ComponentType<NodeViewProps>>
  handlers?: Record<string, (props: NodeViewProps) => void | Promise<void>>
}
