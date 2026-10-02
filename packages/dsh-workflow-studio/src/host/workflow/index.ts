import { copy } from '../dag/data.js'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { compile, SubmissionError, type DagDefinition, type ExecutionSnapshot, type JsonObject, type SavedExecution } from '../dag/index.js'
import { NodeInputError, type NodeContext, type NodeFact, type NodePlan, type ServerNode } from '../../contract/node/index.js'
import type { InstanceDetail, NodeExecution } from '../../shared/types/workflow-instance.js'
import { WorkflowInstanceStore, type StoredInstance } from '../storage/workflow-instance-store.js'
import { executeWorkflowNode } from './dag.js'
import { workflowNode, validateWorkflowNodes } from './definition.js'
import { WorkflowInstanceError } from './errors.js'
import { serverNodes } from '../nodes/registry.js'

export { initializeWorkflow } from './dag.js'
export { validateWorkflowNodes, type WorkflowNode } from './definition.js'
export { WorkflowInstanceError } from './errors.js'

class NodePersistenceError extends Error {}

export class WorkflowEngine {
  private readonly active = new Set<string>()

  constructor(
    private readonly store: WorkflowInstanceStore,
    private readonly services: Context,
    private readonly nodes: ReadonlyMap<string, ServerNode> = serverNodes,
  ) {}

  isDeletionBlocked(id: string): boolean {
    const row = this.store.get(id)
    if (!row) return false
    return Object.entries(row.executions ?? {}).some(([nodeId, fact]) => this.nodes.get(fact.kind)?.blocksDeletion?.(fact, this.active.has(this.key(id, nodeId))) === true)
  }

  actionNode(id: string, nodeId: string, name: string, payload: unknown): Promise<InstanceDetail> {
    return this.store.serial(async () => {
      const row = this.requireInstance(id)
      this.assertCompatible(row)
      const ready = this.frontier(row).find(item => item.instanceId === nodeId)
      if (!ready) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      const key = this.key(id, nodeId)
      if (this.active.has(key)) throw new WorkflowInstanceError('node-running', 'Node is already running', this.detail(row))
      const node = this.nodes.get(workflowNode(ready.definition).node_kind)!
      const previous = row.executions?.[nodeId] as NodeFact | undefined
      const context = this.context(row, ready, previous)
      let plan: NodePlan
      try { plan = node.action(context, name, payload) }
      catch (error) {
        if (error instanceof NodeInputError) throw new WorkflowInstanceError('node-input-invalid', error.message, this.detail(row))
        throw new WorkflowInstanceError('node-kind-invalid', error instanceof Error ? error.message : String(error), this.detail(row))
      }
      return this.accept(row, nodeId, node.kind, plan)
    })
  }

  scheduleReady(id: string): void {
    const row = this.store.get(id)
    if (!row) return
    for (const item of this.frontier(row)) void this.store.serial(async () => {
      const latest = this.store.get(id)
      if (!latest || latest.executions?.[item.instanceId] || this.active.has(this.key(id, item.instanceId))) return
      const current = this.frontier(latest).find(candidate => candidate.instanceId === item.instanceId)
      if (!current) return
      const node = this.nodes.get(workflowNode(current.definition).node_kind)!
      const plan = node.ready(this.context(latest, current))
      if (plan) await this.accept(latest, item.instanceId, node.kind, plan)
    }).catch(() => {})
  }

  async recoverInstance(id: string): Promise<void> {
    const row = this.requireInstance(id)
    const executions = { ...row.executions }
    let changed = false
    for (const [nodeId, stored] of Object.entries(executions)) {
      const recovered = this.nodes.get(stored.kind)?.recover(stored as NodeFact)
      if (recovered && recovered !== stored) {
        if (recovered.kind !== stored.kind) throw new Error(`Node ${stored.kind} returned fact for ${recovered.kind}`)
        executions[nodeId] = recovered
        changed = true
      }
    }
    if (changed) await this.store.save({ ...row, executions })
  }

  detail(row: StoredInstance): InstanceDetail {
    let incompatible: string | undefined
    try { validateWorkflowNodes(row.definition as DagDefinition, this.nodes) }
    catch (error) { incompatible = error instanceof Error ? error.message : String(error) }
    const executions = Object.fromEntries(Object.entries(row.executions ?? {}).map(([nodeId, stored]) => {
      const node = this.nodes.get(stored.kind)
      const fact = stored
      const { business: _business, ...common } = fact
      return [nodeId, { ...node?.project(fact), ...common }]
    })) as Record<string, NodeExecution>
    return {
      id: row.id, workspaceId: row.workspaceId, name: row.name, templateId: row.templateId, createdAt: row.createdAt,
      revision: row.revision ?? 0, definition: row.definition as DagDefinition, input: row.input as JsonObject,
      snapshot: row.snapshot as unknown as ExecutionSnapshot,
      ...(Object.keys(executions).length ? { executions } : {}), ...(incompatible ? { incompatible } : {}),
      ...(row.drawerWidth === undefined ? {} : { drawerWidth: row.drawerWidth }),
    }
  }

  private key(id: string, nodeId: string) { return `${id}\u0000${nodeId}` }
  private requireInstance(id: string): StoredInstance {
    const row = this.store.get(id)
    if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
    return row
  }
  private assertCompatible(row: StoredInstance): void {
    try { validateWorkflowNodes(row.definition as DagDefinition, this.nodes) }
    catch (error) { throw new WorkflowInstanceError('instance-incompatible', `This instance uses an old node configuration; create a new instance. ${String(error)}`, this.detail(row)) }
  }
  private frontier(row: StoredInstance) {
    const program = compile(row.definition as DagDefinition)
    return (row.state ? program.restoreExecution(row.state as unknown as SavedExecution) : program.createExecution(row.input)).getFrontier()
  }
  private context(row: StoredInstance, ready: ReturnType<WorkflowEngine['frontier']>[number], fact?: NodeFact): NodeContext {
    const key = this.key(row.id, ready.instanceId)
    const node = this.nodes.get(workflowNode(ready.definition).node_kind)!
    for (const service of node.requires) if (this.services[service] == null) throw new Error(`Node ${node.kind} requires host service ${String(service)}`)
    return { definition: ready.definition, input: ready.input as JsonObject, fact, workspaceId: row.workspaceId, services: this.services,
      validateOutput: output => z.json().parse(copy(output, ready.definition.output_schema ?? {}, true, 'node-output', { instanceId: ready.instanceId })) as JsonObject,
      save: async next => { await this.store.serial(async () => {
        const latest = this.store.get(row.id)
        if (!latest || !this.active.has(key) || latest.executions?.[ready.instanceId]?.status !== 'running') return
        await this.store.save({ ...latest, executions: { ...latest.executions, [ready.instanceId]: next } })
      }).catch(error => { throw new NodePersistenceError(String(error)) }) },
    }
  }
  private async accept(row: StoredInstance, nodeId: string, kind: string, plan: NodePlan): Promise<InstanceDetail> {
    if (plan.fact.kind !== kind) throw new Error(`Node ${kind} returned fact for ${plan.fact.kind}`)
    const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: plan.fact } })
    if (plan.fact.status === 'succeeded') return this.submit(updated, nodeId, plan.fact)
    if (plan.run) {
      const key = this.key(row.id, nodeId)
      this.active.add(key)
      void this.run(row.id, nodeId, key, plan.run)
    }
    return this.detail(updated)
  }
  private async run(id: string, nodeId: string, key: string, work: () => Promise<NodeFact>): Promise<void> {
    try {
      let fact: NodeFact
      try { fact = await work() }
      catch (error) {
        if (error instanceof NodePersistenceError) return
        await this.store.serial(async () => {
          const row = this.store.get(id)
          const previous = row?.executions?.[nodeId]
          if (row && previous?.status === 'running') await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: { ...previous, status: 'failed', error: error instanceof Error ? error.message : String(error) } } })
        }).catch(() => {})
        return
      }
      await this.store.serial(async () => {
        const row = this.store.get(id)
        if (!row || row.executions?.[nodeId]?.status !== 'running') return
        const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: fact } })
        if (fact.status === 'succeeded') await this.submit(updated, nodeId, fact)
      }).catch(() => {})
    } finally { this.active.delete(key) }
  }
  private async submit(row: StoredInstance, nodeId: string, fact: NodeFact): Promise<InstanceDetail> {
    let result: ReturnType<typeof executeWorkflowNode>
    try { result = executeWorkflowNode(row.definition as DagDefinition, row.input as JsonObject, row.state as unknown as SavedExecution | undefined, nodeId, fact.output as JsonObject | undefined) }
    catch (error) {
      if (error instanceof SubmissionError) {
        await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: { ...fact, error: error.message } } })
        throw new WorkflowInstanceError('submission-failed', error.message, this.detail(this.requireInstance(row.id)))
      }
      throw error
    }
    if (!result) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
    const updated = await this.store.save({ ...row, state: z.json().parse(result.state), snapshot: z.json().parse(result.snapshot) })
    this.scheduleReady(row.id)
    return this.detail(updated)
  }
}
