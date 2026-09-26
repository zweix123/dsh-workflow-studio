import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { z } from 'zod'
import type { DagDefinition, JsonObject } from '../dag/index.js'
import { WorkflowEngine, WorkflowInstanceError, initializeWorkflow, validateWorkflowNodes } from '../workflow/index.js'
import { WorkflowInstanceStore, workflowInstanceDomain } from '../storage/workflow-instance-store.js'
import { validateTemplateDirectory } from '../template-directory.js'
import type { CreateInstanceInput, InstanceDetail, InstanceSummary, TemplateCatalog, TemplateRow } from '../../shared/types/workflow-instance.js'
import { inspectLayout } from '../../shared/layout.js'

export { WorkflowInstanceError, workflowInstanceDomain }

type ScannedTemplate = TemplateRow & { definition?: DagDefinition }

export class WorkflowInstanceService {
  private constructor(
    private readonly store: WorkflowInstanceStore,
    private readonly templateRoot: string,
    private readonly workspaceRegistry: Context['workspaceRegistry'],
    private readonly engine: WorkflowEngine,
    private readonly templateDirectory: string,
  ) {}

  static async create(ctx: Context, templateRoot: string, templateDirectory = join(templateRoot, '<template-id>', 'workflow.yaml')): Promise<WorkflowInstanceService> {
    const store = new WorkflowInstanceStore(await ctx.storageDomain.open(workflowInstanceDomain))
    const engine = new WorkflowEngine(store, ctx.workspaceRegistry, ctx.shell, ctx.sandboxPolicy, ctx.sessionController)
    const service = new WorkflowInstanceService(store, templateRoot, ctx.workspaceRegistry, engine, templateDirectory)
    for (const [, row] of store.entries()) {
      try {
        validateWorkflowNodes(row.definition as DagDefinition)
        engine.scheduleAuto(row.id)
      } catch { /* Old instance definitions stay readable but cannot run. */ }
    }
    return service
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
    return [...this.store.entries()]
      .map(([, row]) => ({ id: row.id, workspaceId: row.workspaceId, name: row.name, templateId: row.templateId, createdAt: row.createdAt }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
  }

  getInstance(id: string): InstanceDetail {
    const row = this.store.get(id)
    if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
    return this.engine.detail(row)
  }

  createInstance(value: unknown): Promise<InstanceDetail> {
    const input = this.parseRequest(value)
    return this.store.serial(async () => {
      const detail = await this.create(input)
      this.engine.scheduleAuto(detail.id)
      return detail
    })
  }

  deleteInstance(id: string): Promise<void> {
    return this.store.serial(async () => {
      if (this.engine.isBashRunning(id)) {
        throw new WorkflowInstanceError('instance-running', 'A bash command is still running')
      }
      if (!await this.store.delete(id)) {
        throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
      }
    })
  }

  executeNode(id: string, nodeInstanceId: string, value: unknown): Promise<InstanceDetail> {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) {
      throw new WorkflowInstanceError('invalid-request', 'Execution request must be an empty object')
    }
    return this.engine.executeNode(id, nodeInstanceId)
  }

  completeNode(id: string, nodeInstanceId: string, value: unknown): Promise<InstanceDetail> {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) {
      throw new WorkflowInstanceError('invalid-request', 'Completion request must be an empty object')
    }
    return this.engine.completeNode(id, nodeInstanceId)
  }

  setDrawerWidth(id: string, value: unknown): Promise<InstanceDetail> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || !('width' in value)
      || typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 0) {
      throw new WorkflowInstanceError('invalid-request', 'Drawer width must be a positive number')
    }
    return this.store.serial(async () => {
      const row = this.store.get(id)
      if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
      return this.engine.detail(await this.store.save({ ...row, drawerWidth: value.width as number }))
    })
  }

  close(): Promise<void> {
    return this.store.close()
  }

  private async readTemplate(id: string): Promise<ScannedTemplate> {
    const result = await validateTemplateDirectory(join(this.templateRoot, id))
    if (!('definition' in result)) return { id, error: result.error }
    const layout = inspectLayout(result.definition)
    return { id, definition: result.definition, ...(layout.layers.length ? { layout } : {}) }
  }

  private async create(input: CreateInstanceInput): Promise<InstanceDetail> {
    if (!this.workspaceRegistry.get(WorkspaceId(input.workspaceId))) throw new WorkflowInstanceError('workspace-missing', 'Workspace not found')
    if ([...this.store.entries()].some(([, row]) => row.workspaceId === input.workspaceId && row.name === input.name)) {
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
    const row = {
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
    return this.engine.detail(await this.store.save(row))
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
}
