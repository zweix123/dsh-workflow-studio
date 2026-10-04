import type { DagDefinition, ExecutionSnapshot, JsonObject } from '../../host/dag/index.js'
import type { LayoutReport } from '../layout.js'

export interface TemplateRow {
  key: string
  source: string
  name?: string
  id: string
  error?: string
  layout?: LayoutReport
}

export interface TemplateCatalog {
  templates: TemplateRow[]
}

export interface TemplateDetail extends TemplateRow {
  definition: DagDefinition
}

export interface InstanceSummary {
  id: string
  workspaceId: string
  name: string
  templateId: string
  templateName?: string
  createdAt: string
}

export interface InstanceDetail extends InstanceSummary {
  revision?: number
  definition: DagDefinition
  input: JsonObject
  snapshot: ExecutionSnapshot
  drawerWidth?: number
  nodeViews?: Record<string, import('dsh-workflow-node/contract').NodePresentation & { source?: string; token?: string }>
  executions?: Record<string, NodeExecution>
  incompatible?: string
}

export interface NodeExecution {
  [key: string]: unknown
  kind: string
  status: 'running' | 'waiting' | 'succeeded' | 'failed' | 'unknown' | 'cancelled'
  output?: JsonObject
  error?: string
}

export interface CreateInstanceInput {
  workspaceId: string
  name: string
  templateId: string
}

export type InstanceErrorCode =
  | 'invalid-request'
  | 'invalid-name'
  | 'duplicate-name'
  | 'workspace-missing'
  | 'template-missing'
  | 'template-invalid'
  | 'initialization-failed'
  | 'instance-missing'
  | 'node-not-ready'
  | 'submission-failed'
  | 'instance-incompatible'
  | 'instance-running'
  | 'node-running'
  | 'node-kind-invalid'
  | 'node-input-invalid'

export interface ErrorResponse {
  error: { code: InstanceErrorCode; message: string }
}

export interface InstanceNavigationTarget {
  instanceId: string
  nodeInstanceId: string
}
