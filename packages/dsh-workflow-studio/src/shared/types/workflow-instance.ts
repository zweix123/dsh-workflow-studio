import type { DagDefinition, ExecutionSnapshot, JsonObject } from '../../host/dag/index.js'
import type { LayoutReport } from '../layout.js'

export interface TemplateRow {
  id: string
  error?: string
  layout?: LayoutReport
}

export interface TemplateCatalog {
  directory: string
  templates: TemplateRow[]
}

export interface InstanceSummary {
  id: string
  workspaceId: string
  name: string
  templateId: string
  createdAt: string
}

export interface InstanceDetail extends InstanceSummary {
  revision?: number
  definition: DagDefinition
  input: JsonObject
  snapshot: ExecutionSnapshot
  drawerWidth?: number
  executions?: Record<string, NodeExecution>
  incompatible?: string
}

export interface NodeExecution {
  kind: string
  status: 'running' | 'waiting' | 'succeeded' | 'failed' | 'unknown' | 'cancelled'
  output?: JsonObject
  sessionId?: string
  requestId?: string
  sessionCreated?: boolean
  promptStarted?: boolean
  error?: string
  stdout?: string
  stderr?: string
  exitCode?: number | null
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
