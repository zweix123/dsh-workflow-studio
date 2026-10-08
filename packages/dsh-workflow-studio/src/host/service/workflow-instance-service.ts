import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { z } from 'zod'
import type { DagDefinition, JsonObject } from '../dag/index.js'
import { WorkflowEngine, WorkflowInstanceError, initializeWorkflow, nodeDefinitionAt, validateWorkflowNodes } from '../workflow/index.js'
import { WorkflowInstanceStore, workflowInstanceDomain } from '../storage/workflow-instance-store.js'
import { TemplateRegistry } from './template-registry.js'
import type { CreateInstanceInput, InstanceDetail, InstanceSummary, TemplateCatalog, TemplateDetail } from '../../shared/types/workflow-instance.js'
import type { NodeLookup, NodeRecord } from 'dsh-workflow-node/contract'

export { WorkflowInstanceError, workflowInstanceDomain }


export class WorkflowInstanceService {
  private constructor(
    private readonly store: WorkflowInstanceStore,
    private readonly templates: TemplateRegistry,
    private readonly workspaceRegistry: Context['workspaceRegistry'],
    private readonly engine: WorkflowEngine,
    private readonly nodes: NodeLookup,
  ) {}

  static async create(ctx: Context, templates: TemplateRegistry, nodes: NodeLookup = ctx.workflowNodes): Promise<WorkflowInstanceService> {
    const store = new WorkflowInstanceStore(await ctx.storageDomain.open(workflowInstanceDomain))
    const engine = new WorkflowEngine(store, ctx, nodes)
    const service = new WorkflowInstanceService(store, templates, ctx.workspaceRegistry, engine, nodes)
    if (nodes.subscribe) ctx.effect(() => nodes.subscribe!(() => { void service.resume().catch(error => console.error('Node dependency recovery failed', error)) }))
    if (ctx.get('workflowNodes')) ctx.workflowNodes.readWith(ctx, kind => service.records(kind))
    for (const [, row] of store.entries()) {
      try {
        validateWorkflowNodes(row.definition as DagDefinition, nodes)
        await engine.recoverInstance(row.id)
        engine.scheduleReady(row.id)
      } catch { /* Old instance definitions stay readable but cannot run. */ }
    }
    return service
  }

  private async resume(): Promise<void> {
    await this.store.serial(async () => {
      for (const [, row] of this.store.entries()) {
        try { validateWorkflowNodes(row.definition as DagDefinition, this.nodes); await this.engine.recoverInstance(row.id); this.engine.scheduleReady(row.id) } catch { /* Retain unavailable facts for inspection. */ }
      }
    })
  }
  records(kind: string): NodeRecord[] {
    return [...this.store.entries()].flatMap(([, row]) => Object.entries(row.executions ?? {}).filter(([, fact]) => fact.kind === kind).map(([nodeInstanceId, fact]) => {
      const item = (row.snapshot as unknown as InstanceDetail['snapshot']).instances.find(item => item.instanceId === nodeInstanceId)
      const definition = nodeDefinitionAt(row.definition, item?.definitionPath ?? [])
      if (!definition) throw new Error(`Missing saved node definition for ${nodeInstanceId}`)
      return { instanceId: row.id, nodeInstanceId, workspaceId: row.workspaceId, definition, fact }
    }))
  }
  async listTemplates(): Promise<TemplateCatalog> { return this.templates.list() }

  async getTemplate(id: string): Promise<TemplateDetail> {
    const { templateDirectory: _directory, ...detail } = this.templates.get(id)
    return detail
  }

  listInstances(): InstanceSummary[] {
    return [...this.store.entries()]
      .map(([, row]) => ({ id: row.id, workspaceId: row.workspaceId, name: row.name, templateId: row.templateId, templateName: (row.definition as DagDefinition).name as string, createdAt: row.createdAt }))
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
      this.engine.scheduleReady(detail.id)
      return detail
    })
  }

  deleteInstance(id: string): Promise<void> {
    return this.store.serial(async () => {
      if (this.engine.isDeletionBlocked(id)) {
        throw new WorkflowInstanceError('instance-running', 'A node is still running')
      }
      if (!await this.store.delete(id)) {
        throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
      }
    })
  }

  actionNode(id: string, nodeInstanceId: string, action: string, value: unknown, token?: string): Promise<InstanceDetail> {
    return this.engine.actionNode(id, nodeInstanceId, action, value, token)
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

  async close(): Promise<void> {
    await this.engine.close()
    await this.store.close()
  }

  private async create(input: CreateInstanceInput): Promise<InstanceDetail> {
    if (!this.workspaceRegistry.get(WorkspaceId(input.workspaceId))) throw new WorkflowInstanceError('workspace-missing', 'Workspace not found')
    if ([...this.store.entries()].some(([, row]) => row.workspaceId === input.workspaceId && row.name === input.name)) {
      throw new WorkflowInstanceError('duplicate-name', 'An instance with this name already exists in the workspace')
    }
    const template = this.templates.get(input.templateId)
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
      templateDirectory: template.templateDirectory,
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
