import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { compile, SubmissionError, type DagDefinition, type ExecutionSnapshot, type JsonObject, type SavedExecution } from '../dag/index.js'
import { isNoopBash, runBashNode } from '../nodes/bash.js'
import { runChatNode } from '../nodes/chat.js'
import type { InstanceDetail, NodeExecution } from '../../shared/types/workflow-instance.js'
import { WorkflowInstanceStore, type StoredInstance } from '../storage/workflow-instance-store.js'
import { executeWorkflowNode } from './dag.js'
import { workflowNode, validateWorkflowNodes } from './definition.js'
import { WorkflowInstanceError } from './errors.js'

export { initializeWorkflow } from './dag.js'
export { validateWorkflowNodes, type WorkflowNode } from './definition.js'
export { WorkflowInstanceError } from './errors.js'

function recoverExecution(fact: NodeExecution): NodeExecution {
  if (fact.kind === 'bash') return { ...fact, status: 'unknown', error: 'Previous command result is unknown; run it again only if safe.' }
  return fact.promptStarted
    ? { ...fact, status: 'chat', error: undefined }
    : { ...fact, status: 'unknown', error: 'Previous chat start is incomplete; execute to resume.' }
}

function completeChatExecution(fact: NodeExecution | undefined): NodeExecution | undefined {
  return fact?.sessionCreated ? { ...fact, status: 'succeeded', error: undefined } : undefined
}

function bashExecution(result: Awaited<ReturnType<typeof runBashNode>>): NodeExecution {
  return { kind: 'bash', status: result.ok ? 'succeeded' : 'failed', stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, error: result.error }
}

export class WorkflowEngine {
  private readonly active = new Set<string>()

  constructor(
    private readonly store: WorkflowInstanceStore,
    private readonly workspaceRegistry: Context['workspaceRegistry'],
    private readonly shell: Context['shell'],
    private readonly sandboxPolicy: Context['sandboxPolicy'],
    private readonly sessionController: Context['sessionController'],
  ) {}

  isBashRunning(id: string): boolean {
    return [...this.active].some(key => key.startsWith(`${id}\u0000`) && key.endsWith('\u0000bash'))
  }

  executeNode(id: string, nodeInstanceId: string): Promise<InstanceDetail> {
    return this.store.serial(async () => {
      const row = this.requireInstance(id)
      this.assertCompatible(row)
      const ready = this.frontier(row).find(item => item.instanceId === nodeInstanceId)
      if (!ready) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      const node = workflowNode(ready.definition)
      const previous = row.executions?.[nodeInstanceId]
      const key = `${id}\u0000${nodeInstanceId}\u0000${node.node_kind}`
      if (this.active.has(key)) throw new WorkflowInstanceError('node-running', 'Node is already running', this.detail(row))
      if (previous?.status === 'succeeded') return this.submit(row, nodeInstanceId)
      if (node.node_kind === 'chat' && previous?.sessionCreated && previous.status === 'chat') return this.detail(row)
      if (node.node_kind === 'bash' && isNoopBash(node.command)) {
        const fact = bashExecution(await runBashNode({ command: node.command, workspaceId: row.workspaceId, workspaceRegistry: this.workspaceRegistry, shell: this.shell, sandboxPolicy: this.sandboxPolicy }))
        const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: fact } })
        return this.submit(updated, nodeInstanceId)
      }
      const fact: NodeExecution = node.node_kind === 'chat'
        ? { kind: 'chat', status: 'running', sessionId: previous?.sessionId ?? randomUUID(), requestId: previous?.requestId ?? randomUUID(), sessionCreated: previous?.sessionCreated, promptStarted: previous?.promptStarted }
        : { kind: 'bash', status: 'running' }
      const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: fact } })
      this.active.add(key)
      const task = node.node_kind === 'bash'
        ? this.runBash(id, nodeInstanceId, node.command, row.workspaceId, key)
        : this.runChat(id, nodeInstanceId, node.prompt, fact, row.workspaceId, key)
      void task.catch(() => {})
      return this.detail(updated)
    })
  }

  completeNode(id: string, nodeInstanceId: string): Promise<InstanceDetail> {
    return this.store.serial(async () => {
      const row = this.requireInstance(id)
      this.assertCompatible(row)
      const ready = this.frontier(row).find(item => item.instanceId === nodeInstanceId)
      if (!ready) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      if (workflowNode(ready.definition).node_kind !== 'chat') throw new WorkflowInstanceError('node-kind-invalid', 'Only chat nodes can be completed manually')
      const completed = completeChatExecution(row.executions?.[nodeInstanceId])
      if (!completed) throw new WorkflowInstanceError('node-not-ready', 'Chat has not been created', this.detail(row))
      const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: completed } })
      return this.submit(updated, nodeInstanceId)
    })
  }

  scheduleAuto(id: string): void {
    const row = this.store.get(id)
    if (!row) return
    for (const item of this.frontier(row)) {
      if (workflowNode(item.definition).is_auto_start === true && !row.executions?.[item.instanceId]) {
        void this.executeNode(id, item.instanceId).catch(() => {})
      }
    }
  }

  detail(row: StoredInstance): InstanceDetail {
    let incompatible: string | undefined
    try { validateWorkflowNodes(row.definition as DagDefinition) }
    catch (error) { incompatible = error instanceof Error ? error.message : String(error) }
    const executions = Object.fromEntries(Object.entries(row.executions ?? {}).map(([nodeId, fact]) => {
      if (fact.status !== 'running' || this.active.has(`${row.id}\u0000${nodeId}\u0000${fact.kind}`)) return [nodeId, fact]
      return [nodeId, recoverExecution(fact)]
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

  private requireInstance(id: string): StoredInstance {
    const row = this.store.get(id)
    if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
    return row
  }

  private assertCompatible(row: StoredInstance): void {
    try { validateWorkflowNodes(row.definition as DagDefinition) }
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
        if (fact) await this.store.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: { ...fact, error: error.message } } })
        throw new WorkflowInstanceError('submission-failed', error.message, this.detail(this.requireInstance(row.id)))
      }
      throw error
    }
    if (!result) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
    const updated = await this.store.save({ ...row, state: z.json().parse(result.state), snapshot: z.json().parse(result.snapshot) })
    this.scheduleAuto(row.id)
    return this.detail(updated)
  }

  private async updateFact(id: string, nodeInstanceId: string, patch: Partial<NodeExecution>): Promise<StoredInstance | undefined> {
    return this.store.serial(async () => {
      const row = this.store.get(id)
      const previous = row?.executions?.[nodeInstanceId]
      if (!row || !previous || previous.status === 'succeeded') return row
      return this.store.save({ ...row, executions: { ...row.executions, [nodeInstanceId]: { ...previous, ...patch } } })
    })
  }

  private async runBash(id: string, nodeInstanceId: string, command: string, workspaceId: string, key: string): Promise<void> {
    try {
      const result = await runBashNode({ command, workspaceId, workspaceRegistry: this.workspaceRegistry, shell: this.shell, sandboxPolicy: this.sandboxPolicy })
      await this.updateFact(id, nodeInstanceId, bashExecution(result))
      if (result.ok) await this.store.serial(() => this.submit(this.requireInstance(id), nodeInstanceId))
    } catch (error) {
      if (!(error instanceof WorkflowInstanceError && error.code === 'submission-failed')) {
        await this.updateFact(id, nodeInstanceId, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      }
    } finally { this.active.delete(key) }
  }

  private async runChat(id: string, nodeInstanceId: string, prompt: string, fact: NodeExecution, workspaceId: string, key: string): Promise<void> {
    try {
      await runChatNode({
        prompt, workspaceId, sessionId: fact.sessionId!, requestId: fact.requestId!,
        progress: { sessionCreated: fact.sessionCreated, promptStarted: fact.promptStarted },
        sessionController: this.sessionController,
        onProgress: async stage => {
          await this.updateFact(id, nodeInstanceId, stage === 'session-created' ? { sessionCreated: true } : { promptStarted: true })
        },
      })
      await this.updateFact(id, nodeInstanceId, { status: 'chat', error: undefined })
    } catch (error) {
      await this.updateFact(id, nodeInstanceId, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
    } finally { this.active.delete(key) }
  }
}
