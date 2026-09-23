import { INSTANCES_PATH, TEMPLATES_PATH } from '../../shared/constants.js'
import type { CreateInstanceInput, ErrorResponse, InstanceDetail, InstanceErrorCode, InstanceSummary, TemplateCatalog } from '../../shared/types/workflow-instance.js'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

function summary(value: unknown): value is InstanceSummary {
  return object(value)
    && ['id', 'workspaceId', 'name', 'templateId', 'createdAt'].every(key => typeof value[key] === 'string')
    && !Number.isNaN(Date.parse(value.createdAt as string))
}

function detail(value: unknown): value is InstanceDetail {
  if (!summary(value)) return false
  const row = value as InstanceSummary & Record<string, unknown>
  if (!object(row.definition) || row.definition.type !== 'dag' || !Array.isArray(row.definition.dag)
    || !object(row.input) || !object(row.snapshot)) return false
  const snapshot = row.snapshot
  return typeof snapshot.rootInstanceId === 'string'
    && ['instances', 'waitingPositions', 'skippedPositions', 'edges'].every(key => Array.isArray(snapshot[key]))
}

function catalog(value: unknown): value is TemplateCatalog {
  return object(value) && typeof value.directory === 'string' && Array.isArray(value.templates)
    && value.templates.every(row => object(row) && typeof row.id === 'string'
      && (row.error === undefined || typeof row.error === 'string'))
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

export async function deleteInstance(id: string): Promise<void> {
  await request(`${INSTANCES_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
