import { INSTANCES_PATH, TEMPLATES_PATH } from '../../shared/constants.js'
import type { CreateInstanceInput, ErrorResponse, InstanceDetail, InstanceErrorCode, InstanceSummary, TemplateCatalog } from '../../shared/types/workflow-instance.js'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const direction = (value: unknown) => value === 'horizontal' || value === 'vertical'
const issueCodes = new Set(['invalidLayout', 'invalidDirection', 'invalidSegments', 'invalidSegment', 'unknownStart', 'duplicateStart', 'emptyDefault', 'unorderedStart', 'unsafeStart'])

function layoutReport(value: unknown): boolean {
  if (!object(value) || !Array.isArray(value.layers) || !Array.isArray(value.issues)) return false
  const issue = (row: unknown) => object(row) && row.level === 'WARN' && strings(row.path) && issueCodes.has(String(row.code))
    && (row.startAt === undefined || typeof row.startAt === 'string')
    && (row.suggestion === undefined || typeof row.suggestion === 'string')
    && (row.segmentIndex === undefined || (Number.isInteger(row.segmentIndex) && (row.segmentIndex as number) >= 0))
  return value.issues.every(issue) && value.layers.every(row => object(row) && strings(row.path) && direction(row.direction)
    && strings(row.order) && Array.isArray(row.starts) && row.starts.every((start: unknown) => object(start) && typeof start.startAt === 'string' && direction(start.direction))
    && Array.isArray(row.issues) && row.issues.every(issue))
}

function summary(value: unknown): value is InstanceSummary {
  return object(value)
    && ['id', 'workspaceId', 'name', 'templateId', 'createdAt'].every(key => typeof value[key] === 'string')
    && !Number.isNaN(Date.parse(value.createdAt as string))
}

function detail(value: unknown): value is InstanceDetail {
  if (!summary(value)) return false
  const row = value as InstanceSummary & Record<string, unknown>
  if (row.revision !== undefined && (!Number.isInteger(row.revision) || (row.revision as number) < 0)) return false
  if ((row.drawerWidth !== undefined && (typeof row.drawerWidth !== 'number' || !Number.isFinite(row.drawerWidth) || row.drawerWidth <= 0))
    || !object(row.definition) || row.definition.type !== 'dag' || !Array.isArray(row.definition.dag)
    || !object(row.input) || !object(row.snapshot)) return false
  const snapshot = row.snapshot
  if (row.incompatible !== undefined && typeof row.incompatible !== 'string') return false
  if (row.executions !== undefined && (!object(row.executions) || Object.values(row.executions).some(item => !object(item)
    || !['chat', 'bash'].includes(String(item.kind)) || !['running', 'chat', 'succeeded', 'failed', 'unknown'].includes(String(item.status))))) return false
  return typeof snapshot.rootInstanceId === 'string'
    && ['instances', 'waitingPositions', 'skippedPositions', 'edges'].every(key => Array.isArray(snapshot[key]))
}

function catalog(value: unknown): value is TemplateCatalog {
  return object(value) && typeof value.directory === 'string' && Array.isArray(value.templates)
    && value.templates.every(row => object(row) && typeof row.id === 'string'
      && (row.error === undefined || typeof row.error === 'string')
      && (row.layout === undefined || layoutReport(row.layout)))
}

function failure(value: unknown): value is ErrorResponse {
  return object(value) && object(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
}

export class WorkflowInstanceApiError extends Error {
  constructor(readonly code: InstanceErrorCode | 'request-failed', message: string, readonly latest?: InstanceDetail) {
    super(message)
    this.name = 'WorkflowInstanceApiError'
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { cache: 'no-store', ...init })
  let value: unknown
  try { value = await response.json() } catch { value = undefined }
  if (!response.ok) {
    if (failure(value)) throw new WorkflowInstanceApiError(value.error.code as InstanceErrorCode, value.error.message, object(value) && detail(value.latest) ? value.latest : undefined)
    throw new WorkflowInstanceApiError('request-failed', `HTTP ${response.status}`)
  }
  return value
}

export async function listTemplates(): Promise<TemplateCatalog> {
  const value = await request(TEMPLATES_PATH)
  if (!catalog(value)) throw new Error('Unexpected workflow template catalog')
  return value
}

export async function listInstances(): Promise<InstanceSummary[]> {
  const value = await request(INSTANCES_PATH)
  if (!Array.isArray(value) || !value.every(summary)) throw new Error('Unexpected workflow instance list')
  return value.map(row => ({ id: row.id, workspaceId: row.workspaceId, name: row.name, templateId: row.templateId, createdAt: row.createdAt }))
}

export async function createInstance(input: CreateInstanceInput): Promise<InstanceDetail> {
  const value = await request(INSTANCES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!detail(value)) throw new Error('Unexpected workflow instance')
  return value
}

export async function getInstance(id: string): Promise<InstanceDetail> {
  const value = await request(`${INSTANCES_PATH}/${encodeURIComponent(id)}`)
  if (!detail(value)) throw new Error('Unexpected workflow instance')
  return value
}

export async function executeNode(id: string, nodeInstanceId: string): Promise<InstanceDetail> {
  const value = await request(`${INSTANCES_PATH}/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeInstanceId)}/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!detail(value)) throw new Error('Unexpected workflow instance')
  return value
}

export async function completeNode(id: string, nodeInstanceId: string): Promise<InstanceDetail> {
  const value = await request(`${INSTANCES_PATH}/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeInstanceId)}/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!detail(value)) throw new Error('Unexpected workflow instance')
  return value
}

export async function setDrawerWidth(id: string, width: number): Promise<InstanceDetail> {
  const value = await request(`${INSTANCES_PATH}/${encodeURIComponent(id)}/drawer-width`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ width }),
  })
  if (!detail(value)) throw new Error('Unexpected workflow instance')
  return value
}

export async function deleteInstance(id: string): Promise<void> {
  await request(`${INSTANCES_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
