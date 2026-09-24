import type { DagDefinition, ExecutionSnapshot, JsonObject } from '../../host/dag-engine/index.js'

export interface TemplateRow {
  id: string
  error?: string
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
  definition: DagDefinition
  input: JsonObject
  snapshot: ExecutionSnapshot
  drawerWidth?: number
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

export interface ErrorResponse {
  error: { code: InstanceErrorCode; message: string }
}
