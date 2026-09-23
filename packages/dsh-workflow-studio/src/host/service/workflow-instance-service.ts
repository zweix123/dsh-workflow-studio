import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { z } from 'zod'
import { SubmissionError, type DagDefinition, type ExecutionSnapshot, type JsonObject, type SavedExecution } from '../dag-engine/index.js'
import { executeWorkflowNode, initializeWorkflow } from '../runtime/index.js'
import { validateTemplateDirectory } from '../template-directory.js'
import type { CreateInstanceInput, InstanceDetail, InstanceErrorCode, InstanceSummary, TemplateCatalog, TemplateRow } from '../../shared/types/workflow-instance.js'

const instanceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  templateId: z.string(),
  createdAt: z.iso.datetime(),
  definition: z.json(),
  input: z.json(),
  snapshot: z.json(),
  state: z.json().optional(),
}).strict()

export const workflowInstanceDomain = defineDomain({
  name: 'dsh_workflow_studio',
  version: 1,
  tables: { instances: domainTable<string, z.infer<typeof instanceSchema>>(instanceSchema) },
})

type StoredInstance = z.infer<typeof instanceSchema>
type ScannedTemplate = TemplateRow & { definition?: DagDefinition }

const errorStatuses: Record<InstanceErrorCode, number> = {
  'invalid-request': 400,
  'invalid-name': 400,
  'duplicate-name': 409,
  'workspace-missing': 404,
  'template-missing': 404,
  'template-invalid': 422,
  'initialization-failed': 422,
  'instance-missing': 404,
  'node-not-ready': 409,
  'submission-failed': 422,
}

export class WorkflowInstanceError extends Error {
  readonly status: number

  constructor(readonly code: InstanceErrorCode, message: string, readonly latest?: InstanceDetail) {
    super(message)
    this.name = 'WorkflowInstanceError'
    this.status = errorStatuses[code]
  }
}

export class WorkflowInstanceService {
  private tail: Promise<unknown> = Promise.resolve()

  private constructor(
    private readonly domain: Domain<typeof workflowInstanceDomain>,
    private readonly templateRoot: string,
    private readonly workspaceRegistry: Context['workspaceRegistry'],
    private readonly templateDirectory: string,
  ) {}

  static async create(ctx: Context, templateRoot: string, templateDirectory = join(templateRoot, '<template-id>', 'workflow.yaml')): Promise<WorkflowInstanceService> {
    return new WorkflowInstanceService(await ctx.storageDomain.open(workflowInstanceDomain), templateRoot, ctx.workspaceRegistry, templateDirectory)
  }

  async listTemplates(): Promise<TemplateCatalog> {
    let entries: Dirent[]
    try {
      entries = await readdir(this.templateRoot, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') entries = []
      else throw error
    }
    const directories = entries.filter(entry => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name, 'en'))
    return {
      directory: this.templateDirectory,
      templates: (await Promise.all(directories.map(entry => this.readTemplate(entry.name))))
        .map(({ definition: _definition, ...row }) => row),
    }
  }

  listInstances(): InstanceSummary[] {
    return [...this.domain.table('instances').entries()]
      .map(([, row]) => ({ id: row.id, workspaceId: row.workspaceId, name: row.name, templateId: row.templateId, createdAt: row.createdAt }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
  }

  getInstance(id: string): InstanceDetail {
    const row = this.domain.table('instances').get(id)
    if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
    return this.detail(row)
  }

  createInstance(value: unknown): Promise<InstanceDetail> {
    const input = this.parseRequest(value)
    const result = this.tail.then(() => this.create(input))
    this.tail = result.catch(() => {})
    return result
  }

  deleteInstance(id: string): Promise<void> {
    const result = this.tail.then(async () => {
      if (!await this.domain.table('instances').delete(id)) {
        throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
      }
    })
    this.tail = result.catch(() => {})
    return result
  }

  executeNode(id: string, nodeInstanceId: string, value: unknown): Promise<InstanceDetail> {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) {
      throw new WorkflowInstanceError('invalid-request', 'Execution request must be an empty object')
    }
    const result = this.tail.then(async () => {
      const table = this.domain.table('instances')
      const row = table.get(id)
      if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
      let result: ReturnType<typeof executeWorkflowNode>
      try {
        result = executeWorkflowNode(row.definition as DagDefinition, row.input as JsonObject, row.state as unknown as SavedExecution | undefined, nodeInstanceId)
      } catch (error) {
        if (error instanceof SubmissionError) throw new WorkflowInstanceError('submission-failed', error.message)
        throw error
      }
      if (!result) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      const updated: StoredInstance = { ...row, state: z.json().parse(result.state), snapshot: z.json().parse(result.snapshot) }
      await table.put(id, updated)
      return this.detail(updated)
    })
    this.tail = result.catch(() => {})
    return result
  }

  close(): Promise<void> {
    return this.domain.close()
  }

  private async readTemplate(id: string): Promise<ScannedTemplate> {
    return { id, ...await validateTemplateDirectory(join(this.templateRoot, id)) }
  }

  private async create(input: CreateInstanceInput): Promise<InstanceDetail> {
    if (!this.contextWorkspace(input.workspaceId)) throw new WorkflowInstanceError('workspace-missing', 'Workspace not found')
    const table = this.domain.table('instances')
    if ([...table.entries()].some(([, row]) => row.workspaceId === input.workspaceId && row.name === input.name)) {
      throw new WorkflowInstanceError('duplicate-name', 'An instance with this name already exists in the workspace')
    }
    const entries = await readdir(this.templateRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    if (!entries.some(entry => entry.isDirectory() && entry.name === input.templateId)) {
      throw new WorkflowInstanceError('template-missing', 'Workflow template not found')
    }
    const template = await this.readTemplate(input.templateId)
    if (!template.definition) throw new WorkflowInstanceError('template-invalid', template.error ?? 'Workflow template is invalid')
    let initialized: ReturnType<typeof initializeWorkflow>
    try {
      initialized = initializeWorkflow(template.definition)
    } catch (error) {
      throw new WorkflowInstanceError('initialization-failed', error instanceof Error ? error.message : String(error))
    }
    const row: StoredInstance = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      templateId: input.templateId,
      createdAt: new Date().toISOString(),
      definition: template.definition,
      input: initialized.input,
      snapshot: z.json().parse(initialized.snapshot),
      state: z.json().parse(initialized.state),
    }
    await table.put(row.id, row)
    return this.detail(row)
  }

  private contextWorkspace(id: string): boolean {
    return Boolean(this.workspaceRegistry.get(WorkspaceId(id)))
  }

  private parseRequest(value: unknown): CreateInstanceInput {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new WorkflowInstanceError('invalid-request', 'Request body must be an object')
    }
    const input = value as Record<string, unknown>
    if (typeof input.workspaceId !== 'string' || !input.workspaceId
      || typeof input.name !== 'string' || typeof input.templateId !== 'string' || !input.templateId
      || Object.keys(input).some(key => !['workspaceId', 'name', 'templateId'].includes(key))) {
      throw new WorkflowInstanceError('invalid-request', 'Request fields are invalid')
    }
    const name = input.name.trim()
    if (!name) throw new WorkflowInstanceError('invalid-name', 'Instance name must not be blank')
    return { workspaceId: input.workspaceId, name, templateId: input.templateId }
  }

  private detail(row: StoredInstance): InstanceDetail {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      templateId: row.templateId,
      createdAt: row.createdAt,
      definition: row.definition as DagDefinition,
      input: row.input as JsonObject,
      snapshot: row.snapshot as unknown as ExecutionSnapshot,
    }
  }
}
