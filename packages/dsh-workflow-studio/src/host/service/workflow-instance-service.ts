import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { z } from 'zod'
import { compile, SubmissionError, type DagDefinition, type ExecutionSnapshot, type JsonObject, type SavedExecution } from '../dag-engine/index.js'
import { executeWorkflowNode, initializeWorkflow } from '../runtime/index.js'
import { businessNode, validateBusinessNodes } from '../business-nodes.js'
import { validateTemplateDirectory } from '../template-directory.js'
import type { CreateInstanceInput, InstanceDetail, InstanceErrorCode, InstanceSummary, NodeExecution, TemplateCatalog, TemplateRow } from '../../shared/types/workflow-instance.js'

const executionSchema = z.object({
  kind: z.enum(['chat', 'bash']),
  status: z.enum(['running', 'chat', 'succeeded', 'failed', 'unknown']),
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  sessionCreated: z.boolean().optional(),
  promptStarted: z.boolean().optional(),
  error: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  exitCode: z.number().nullable().optional(),
}).strict()

const instanceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  templateId: z.string(),
  createdAt: z.iso.datetime(),
  revision: z.number().int().nonnegative().optional(),
  definition: z.json(),
  input: z.json(),
  snapshot: z.json(),
  state: z.json().optional(),
  drawerWidth: z.number().positive().finite().optional(),
  executions: z.record(z.string(), executionSchema).optional(),
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
  'instance-incompatible': 409,
  'instance-running': 409,
  'node-running': 409,
  'node-kind-invalid': 409,
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
  private readonly active = new Set<string>()

  private constructor(
    private readonly domain: Domain<typeof workflowInstanceDomain>,
    private readonly templateRoot: string,
    private readonly workspaceRegistry: Context['workspaceRegistry'],
    private readonly shell: Context['shell'],
    private readonly sandboxPolicy: Context['sandboxPolicy'],
    private readonly sessionController: Context['sessionController'],
    private readonly templateDirectory: string,
  ) {}

  static async create(ctx: Context, templateRoot: string, templateDirectory = join(templateRoot, '<template-id>', 'workflow.yaml')): Promise<WorkflowInstanceService> {
    const service = new WorkflowInstanceService(await ctx.storageDomain.open(workflowInstanceDomain), templateRoot, ctx.workspaceRegistry, ctx.shell, ctx.sandboxPolicy, ctx.sessionController, templateDirectory)
    for (const [, row] of service.domain.table('instances').entries()) {
      try {
        validateBusinessNodes(row.definition as DagDefinition)
        service.scheduleAuto(row.id)
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
    return this.serial(async () => {
      const detail = await this.create(input)
      this.scheduleAuto(detail.id)
      return detail
    })
  }

  deleteInstance(id: string): Promise<void> {
    return this.serial(async () => {
      if ([...this.active].some(key => key.startsWith(`${id}\u0000`) && key.endsWith('\u0000bash'))) {
        throw new WorkflowInstanceError('instance-running', 'A bash command is still running')
      }
      if (!await this.domain.table('instances').delete(id)) {
        throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
      }
    })
  }

  executeNode(id: string, nodeInstanceId: string, value: unknown): Promise<InstanceDetail> {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) {
      throw new WorkflowInstanceError('invalid-request', 'Execution request must be an empty object')
    }
    return this.serial(async () => {
      const table = this.domain.table('instances')
      const row = table.get(id)
      if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
      this.assertCompatible(row)
      const ready = this.frontier(row).find(item => item.instanceId === nodeInstanceId)
      if (!ready) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      const node = businessNode(ready.definition)
      const previous = row.executions?.[nodeInstanceId]
      const key = `${id}\u0000${nodeInstanceId}\u0000${node.node_kind}`
      if (this.active.has(key)) throw new WorkflowInstanceError('node-running', 'Node is already running', this.detail(row))
      if (previous?.status === 'succeeded') return this.submit(row, nodeInstanceId)
      if (node.node_kind === 'chat' && previous?.sessionCreated && previous.status === 'chat') return this.detail(row)
      if (node.node_kind === 'bash' && !node.command.trim()) {
        const updated = await this.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: { kind: 'bash', status: 'succeeded', stdout: '', stderr: '', exitCode: 0 } } })
        return this.submit(updated, nodeInstanceId)
      }
      const fact: NodeExecution = node.node_kind === 'chat'
        ? { kind: 'chat', status: 'running', sessionId: previous?.sessionId ?? randomUUID(), requestId: previous?.requestId ?? randomUUID(), sessionCreated: previous?.sessionCreated, promptStarted: previous?.promptStarted }
        : { kind: 'bash', status: 'running' }
      const updated = await this.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: fact } })
      this.active.add(key)
      const task = node.node_kind === 'bash'
        ? this.runBash(id, nodeInstanceId, node.command, row.workspaceId, key)
        : this.runChat(id, nodeInstanceId, node.prompt, fact, key)
      void task.catch(() => {})
      return this.detail(updated)
    })
  }

  completeNode(id: string, nodeInstanceId: string, value: unknown): Promise<InstanceDetail> {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) {
      throw new WorkflowInstanceError('invalid-request', 'Completion request must be an empty object')
    }
    return this.serial(async () => {
      const row = this.requireInstance(id)
      this.assertCompatible(row)
      const ready = this.frontier(row).find(item => item.instanceId === nodeInstanceId)
      if (!ready) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      if (businessNode(ready.definition).node_kind !== 'chat') throw new WorkflowInstanceError('node-kind-invalid', 'Only chat nodes can be completed manually')
      const fact = row.executions?.[nodeInstanceId]
      if (!fact?.sessionCreated) throw new WorkflowInstanceError('node-not-ready', 'Chat has not been created', this.detail(row))
      const updated = await this.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: { ...fact, status: 'succeeded', error: undefined } } })
      return this.submit(updated, nodeInstanceId)
    })
  }

  setDrawerWidth(id: string, value: unknown): Promise<InstanceDetail> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || !('width' in value)
      || typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 0) {
      throw new WorkflowInstanceError('invalid-request', 'Drawer width must be a positive number')
    }
    const result = this.tail.then(async () => {
      const table = this.domain.table('instances')
      const row = table.get(id)
      if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
      const updated = await this.save({ ...row, drawerWidth: value.width as number })
      return this.detail(updated)
    })
    this.tail = result.catch(() => {})
    return result
  }

  close(): Promise<void> {
    return this.tail.then(() => this.domain.close())
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work)
    this.tail = result.catch(() => {})
    return result
  }

  private async save(row: StoredInstance): Promise<StoredInstance> {
    const table = this.domain.table('instances')
    const updated = { ...row, revision: (table.get(row.id)?.revision ?? 0) + 1 }
    await table.put(row.id, updated)
    return updated
  }

  private requireInstance(id: string): StoredInstance {
    const row = this.domain.table('instances').get(id)
    if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
    return row
  }

  private assertCompatible(row: StoredInstance): void {
    try { validateBusinessNodes(row.definition as DagDefinition) }
    catch (error) { throw new WorkflowInstanceError('instance-incompatible', `This instance uses an old node configuration; create a new instance. ${String(error)}`, this.detail(row)) }
  }

  private frontier(row: StoredInstance) {
    const program = compile(row.definition as DagDefinition)
    return (row.state ? program.restoreExecution(row.state as unknown as SavedExecution) : program.createExecution(row.input)).getFrontier()
  }

  private async submit(row: StoredInstance, nodeInstanceId: string): Promise<InstanceDetail> {
    let result: ReturnType<typeof executeWorkflowNode>
    try {
      result = executeWorkflowNode(row.definition as DagDefinition, row.input as JsonObject, row.state as unknown as SavedExecution | undefined, nodeInstanceId)
    } catch (error) {
      if (error instanceof SubmissionError) {
        const fact = row.executions?.[nodeInstanceId]
        if (fact) await this.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: { ...fact, error: error.message } } })
        throw new WorkflowInstanceError('submission-failed', error.message, this.detail(this.requireInstance(row.id)))
      }
      throw error
    }
    if (!result) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
    const updated = await this.save({ ...row, state: z.json().parse(result.state), snapshot: z.json().parse(result.snapshot) })
    this.scheduleAuto(row.id)
    return this.detail(updated)
  }

  private scheduleAuto(id: string): void {
    const row = this.domain.table('instances').get(id)
    if (!row) return
    for (const item of this.frontier(row)) {
      if (businessNode(item.definition).is_auto_start === true && !row.executions?.[item.instanceId]) {
        void this.executeNode(id, item.instanceId, {}).catch(() => {})
      }
    }
  }

  private async updateFact(id: string, nodeInstanceId: string, patch: Partial<NodeExecution>): Promise<StoredInstance | undefined> {
    return this.serial(async () => {
      const row = this.domain.table('instances').get(id)
      const previous = row?.executions?.[nodeInstanceId]
      if (!row || !previous || previous.status === 'succeeded') return row
      return this.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: { ...previous, ...patch } } })
    })
  }

  private async runBash(id: string, nodeInstanceId: string, command: string, workspaceId: string, key: string): Promise<void> {
    try {
      if (!command.trim()) {
        await this.updateFact(id, nodeInstanceId, { status: 'succeeded', stdout: '', stderr: '', exitCode: 0 })
      } else {
        const workspace = this.workspaceRegistry.get(WorkspaceId(workspaceId))
        if (!workspace) throw new Error('Workspace no longer exists')
        const policy = { ...this.sandboxPolicy.resolve(), workspaceRoot: workspace.path }
        if (!this.shell.sandboxMode || policy.mode === 'danger-full-access') throw new Error('Sandbox execution is unavailable')
        const spec = this.shell.resolve({ command, workdir: workspace.path, sandboxPolicy: policy })
        if (!spec.sandboxPolicy || spec.sandboxPolicy.mode === 'danger-full-access') throw new Error('Sandbox execution is unavailable')
        const outcome = await this.shell.run(spec)
        const result = { stdout: outcome.stdout.text, stderr: outcome.stderr.text, exitCode: outcome.exitCode }
        if (outcome.exitCode !== 0 || outcome.signal || outcome.timedOut || outcome.aborted || outcome.sandbox?.denied || outcome.sandbox?.runnerFailed || !outcome.sandbox || outcome.sandbox.mode === 'danger-full-access') {
          const reason = outcome.sandbox?.denied ? 'Sandbox denied the command' : outcome.sandbox?.runnerFailed ? 'Sandbox runner failed'
            : !outcome.sandbox || outcome.sandbox.mode === 'danger-full-access' ? 'Sandbox execution was unavailable'
              : outcome.timedOut ? 'Command timed out' : outcome.aborted ? 'Command was interrupted' : `Command exited with code ${outcome.exitCode}`
          await this.updateFact(id, nodeInstanceId, { ...result, status: 'failed', error: reason })
          return
        }
        await this.updateFact(id, nodeInstanceId, { ...result, status: 'succeeded', error: undefined })
      }
      await this.serial(() => this.submit(this.requireInstance(id), nodeInstanceId))
    } catch (error) {
      if (!(error instanceof WorkflowInstanceError && error.code === 'submission-failed')) {
        await this.updateFact(id, nodeInstanceId, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      }
    } finally { this.active.delete(key) }
  }

  private async runChat(id: string, nodeInstanceId: string, prompt: string, fact: NodeExecution, key: string): Promise<void> {
    try {
      const sessionId = SessionId(fact.sessionId!)
      if (!fact.sessionCreated) {
        const row = this.requireInstance(id)
        await this.sessionController.create({ sessionId, workspaceId: WorkspaceId(row.workspaceId) })
        await this.updateFact(id, nodeInstanceId, { sessionCreated: true })
      }
      if (prompt.trim() && !fact.promptStarted) {
        await this.sessionController.prompt({ sessionId, requestId: fact.requestId as SessionRequestId, mode: 'queue', content: [{ type: 'text', text: prompt }] }, new AbortController().signal)
        await this.updateFact(id, nodeInstanceId, { promptStarted: true })
      }
      await this.updateFact(id, nodeInstanceId, { status: 'chat', error: undefined })
    } catch (error) {
      await this.updateFact(id, nodeInstanceId, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
    } finally { this.active.delete(key) }
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
    return this.detail(await this.save(row))
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
    let incompatible: string | undefined
    try { validateBusinessNodes(row.definition as DagDefinition) }
    catch (error) { incompatible = error instanceof Error ? error.message : String(error) }
    const executions = Object.fromEntries(Object.entries(row.executions ?? {}).map(([nodeId, fact]) => {
      if (fact.status !== 'running' || this.active.has(`${row.id}\u0000${nodeId}\u0000${fact.kind}`)) return [nodeId, fact]
      return [nodeId, fact.kind === 'bash'
        ? { ...fact, status: 'unknown', error: 'Previous command result is unknown; run it again only if safe.' }
        : { ...fact, status: fact.promptStarted ? 'chat' : 'unknown', error: fact.promptStarted ? undefined : 'Previous chat start is incomplete; execute to resume.' }]
    })) as Record<string, NodeExecution>
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      templateId: row.templateId,
      createdAt: row.createdAt,
      revision: row.revision ?? 0,
      definition: row.definition as DagDefinition,
      input: row.input as JsonObject,
      snapshot: row.snapshot as unknown as ExecutionSnapshot,
      ...(Object.keys(executions).length ? { executions } : {}),
      ...(incompatible ? { incompatible } : {}),
      ...(row.drawerWidth === undefined ? {} : { drawerWidth: row.drawerWidth }),
    }
  }
}
