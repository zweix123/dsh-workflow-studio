import { copy } from '../dag/data.js'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { compile, SubmissionError, type DagDefinition, type ExecutionSnapshot, type JsonObject, type SavedExecution } from '../dag/index.js'
import { NodeInputError, type NodeContext, type NodeFact, type NodePlan, type NodeLookup } from 'dsh-workflow-node/contract'
import type { InstanceDetail, NodeExecution } from '../../shared/types/workflow-instance.js'
import { WorkflowInstanceStore, type StoredInstance } from '../storage/workflow-instance-store.js'
import { executeWorkflowNode } from './dag.js'
import { nodeDefinitionAt, workflowNode, validateWorkflowNodes } from './definition.js'
import { WorkflowInstanceError } from './errors.js'

export { initializeWorkflow } from './dag.js'
export { nodeDefinitionAt, validateWorkflowNodes, type WorkflowNode } from './definition.js'
export { WorkflowInstanceError } from './errors.js'

class NodePersistenceError extends Error {}

export class WorkflowEngine {
  private readonly active = new Set<string>()
  private readonly tasks = new Set<Promise<void>>()
  private closing = false

  async close(): Promise<void> { this.closing = true; await this.store.serial(async () => {}); await Promise.allSettled([...this.tasks]) }

  constructor(
    private readonly store: WorkflowInstanceStore,
    private readonly services: Context,
    private readonly nodes: NodeLookup = services.workflowNodes,
  ) {}

  isDeletionBlocked(id: string): boolean {
    const row = this.store.get(id)
    if (!row) return false
    if ([...this.active].some(key => key.startsWith(`${id}\u0000`))) return true
    return Object.entries(row.executions ?? {}).some(([nodeId, fact]) => this.nodes.get(fact.kind)?.blocksDeletion?.(fact, this.active.has(this.key(id, nodeId))) === true)
  }

  actionNode(id: string, nodeId: string, name: string, payload: unknown, token?: string): Promise<InstanceDetail> {
    return this.store.serial(async () => {
      const row = this.requireInstance(id)
      this.assertCompatible(row)
      const ready = this.frontier(row).find(item => item.instanceId === nodeId)
      if (!ready) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      const key = this.key(id, nodeId)
      if (this.active.has(key)) throw new WorkflowInstanceError('node-running', 'Node is already running', this.detail(row))
      const node = this.nodes.get(workflowNode(ready.definition).node_kind)!
      if (token && this.nodes.identify?.(node.kind)?.token !== token) throw new WorkflowInstanceError('node-kind-invalid', 'Node contribution has changed', this.detail(row))
      const previous = row.executions?.[nodeId] as NodeFact | undefined
      const context = this.context(row, ready, previous)
      const release = this.nodes.acquire?.(node.kind)
      if (this.nodes.acquire && !release) throw new WorkflowInstanceError('instance-incompatible', 'Node implementation is unloading', this.detail(row))
      let plan: NodePlan
      try { plan = node.action(context, name, payload) }
      catch (error) {
        release?.()
        if (error instanceof NodeInputError) throw new WorkflowInstanceError('node-input-invalid', error.message, this.detail(row))
        throw new WorkflowInstanceError('node-kind-invalid', error instanceof Error ? error.message : String(error), this.detail(row))
      }
      try { return await this.accept(row, nodeId, node.kind, plan, release) } catch (error) { release?.(); throw error }
    })
  }

  scheduleReady(id: string): void {
    const row = this.store.get(id)
    if (!row || this.closing) return
    try { this.assertCompatible(row) } catch { return }
    for (const item of this.frontier(row)) void this.store.serial(async () => {
      const latest = this.store.get(id)
      if (!latest || latest.executions?.[item.instanceId] || this.active.has(this.key(id, item.instanceId))) return
      try { this.assertCompatible(latest) } catch { return }
      const current = this.frontier(latest).find(candidate => candidate.instanceId === item.instanceId)
      if (!current) return
      const node = this.nodes.get(workflowNode(current.definition).node_kind)!
      const release = this.nodes.acquire?.(node.kind)
      if (this.nodes.acquire && !release) return
      try {
        const plan = node.ready(this.context(latest, current))
        if (plan) await this.accept(latest, item.instanceId, node.kind, plan, release)
        else release?.()
      } catch (error) { release?.(); throw error }
    }).catch(() => {})
  }

  async recoverInstance(id: string): Promise<void> {
    const row = this.requireInstance(id)
    this.validate(row)
    const executions = { ...row.executions }
    let changed = false
    for (const [nodeId, stored] of Object.entries(executions)) {
      if (this.active.has(this.key(id, nodeId))) continue
      const recovered = this.nodes.get(stored.kind)?.recover(structuredClone(stored) as NodeFact)
      if (recovered && JSON.stringify(recovered) !== JSON.stringify(stored)) {
        if (recovered.kind !== stored.kind) throw new Error(`Node ${stored.kind} returned fact for ${recovered.kind}`)
        executions[nodeId] = recovered
        changed = true
      }
    }
    if (changed) await this.store.save({ ...row, executions })
    for (const item of this.frontier(this.requireInstance(id))) {
      const latest = this.requireInstance(id)
      const fact = latest.executions?.[item.instanceId]
      if (fact?.status === 'succeeded') await this.submit(latest, item.instanceId, fact)
    }
  }

  detail(row: StoredInstance): InstanceDetail {
    let incompatible: string | undefined
    try { this.validate(row) }
    catch (error) { incompatible = error instanceof Error ? error.message : String(error) }
    const executions = Object.fromEntries(Object.entries(row.executions ?? {}).map(([nodeId, stored]) => {
      const node = this.nodes.get(stored.kind)
      const fact = stored
      const { business: _business, ...common } = fact
      let data = {} as import('dsh-workflow-node/contract').NodeData
      try { data = node?.project(structuredClone(fact)) ?? data } catch { /* Public common facts remain readable. */ }
      return [nodeId, { ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}), ...common }]
    })) as Record<string, NodeExecution>
    const definitionSnapshot = row.definition as DagDefinition
    const nodeViews = Object.fromEntries((row.snapshot as unknown as ExecutionSnapshot).instances.filter(item => item.type === 'node').map(item => {
      const definition = nodeDefinitionAt(definitionSnapshot, item.definitionPath)
      const kind = String(definition?.node_kind)
      const node = this.nodes.get(kind)
      const identity = this.nodes.identify?.(kind)
      let presentation = { actions: [] } as import('dsh-workflow-node/contract').NodePresentation
      try { if (node && definition) presentation = node.describe?.(structuredClone({ definition, input: item.input as import('dsh-workflow-node/contract').NodeData, fact: row.executions?.[item.instanceId], ready: item.status === 'ready' })) ?? presentation } catch { /* Local presentation failure never hides public details. */ }
      return [item.instanceId, { ...presentation, ...identity }]
    }))
    return {
      nodeViews,
      id: row.id, workspaceId: row.workspaceId, name: row.name, templateId: row.templateId, createdAt: row.createdAt,
      revision: row.revision ?? 0, definition: row.definition as DagDefinition, input: row.input as JsonObject,
      snapshot: row.snapshot as unknown as ExecutionSnapshot,
      ...(Object.keys(executions).length ? { executions } : {}), ...(incompatible ? { incompatible } : {}),
      ...(row.drawerWidth === undefined ? {} : { drawerWidth: row.drawerWidth }),
    }
  }

  private validate(row: StoredInstance): void {
    validateWorkflowNodes(row.definition as DagDefinition, this.nodes)
    for (const fact of Object.values(row.executions ?? {})) this.nodes.get(fact.kind)?.validateFact?.(structuredClone(fact))
  }
  private key(id: string, nodeId: string) { return `${id}\u0000${nodeId}` }
  private requireInstance(id: string): StoredInstance {
    const row = this.store.get(id)
    if (!row) throw new WorkflowInstanceError('instance-missing', 'Workflow instance not found')
    return row
  }
  private assertCompatible(row: StoredInstance): void {
    try { if (this.closing) throw new Error('Studio is unloading'); this.validate(row) }
    catch (error) { throw new WorkflowInstanceError('instance-incompatible', `Instance execution is unavailable: ${String(error)}`, this.detail(row)) }
  }
  private frontier(row: StoredInstance) {
    const program = compile(row.definition as DagDefinition)
    return (row.state ? program.restoreExecution(row.state as unknown as SavedExecution) : program.createExecution(row.input)).getFrontier()
  }
  private context(row: StoredInstance, ready: ReturnType<WorkflowEngine['frontier']>[number], fact?: NodeFact): NodeContext {
    const key = this.key(row.id, ready.instanceId)
    const node = this.nodes.get(workflowNode(ready.definition).node_kind)!
    const owner = this.nodes.services?.(node.kind) ?? this.services
    const services = Object.create(null) as Context
    for (const service of node.requires) {
      const value = owner[service]
      if (value == null) throw new Error(`Node ${node.kind} requires host service ${String(service)}`)
      Object.defineProperty(services, service, { value, enumerable: true })
    }
    return { definition: ready.definition, input: ready.input as JsonObject, fact: fact && structuredClone(fact), workspaceId: row.workspaceId, services,
      validateOutput: output => z.json().parse(copy(output, ready.definition.output_schema ?? {}, true, 'node-output', { instanceId: ready.instanceId })) as JsonObject,
      save: async next => { if (next.kind !== node.kind) throw new Error('Mismatched node fact'); await this.store.serial(async () => {
        const latest = this.store.get(row.id)
        if (!latest || !this.active.has(key) || latest.executions?.[ready.instanceId]?.status !== 'running') return
        await this.store.save({ ...latest, executions: { ...latest.executions, [ready.instanceId]: next } })
      }).catch(error => { throw new NodePersistenceError(String(error)) }) },
    }
  }
  private async accept(row: StoredInstance, nodeId: string, kind: string, plan: NodePlan, release?: () => void): Promise<InstanceDetail> {
    if (plan.fact.kind !== kind) throw new Error(`Node ${kind} returned fact for ${plan.fact.kind}`)
    const fact = this.validateResult(row, nodeId, plan.fact)
    const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: fact } })
    if (fact.status === 'succeeded') { try { return await this.submit(updated, nodeId, fact) } finally { release?.() } }
    if (plan.run) {
      const key = this.key(row.id, nodeId)
      this.active.add(key)
      const task = this.run(row.id, nodeId, key, kind, plan.run).finally(() => { release?.(); this.tasks.delete(task) })
      this.tasks.add(task)
    }
    if (!plan.run) release?.()
    return this.detail(updated)
  }
  private async run(id: string, nodeId: string, key: string, kind: string, work: () => Promise<NodeFact>): Promise<void> {
    try {
      let fact: NodeFact
      try { fact = await work(); if (fact.kind !== kind) throw new Error('Mismatched node fact'); fact = this.validateResult(this.requireInstance(id), nodeId, fact) }
      catch (error) {
        if (error instanceof NodePersistenceError) { console.error('Node progress save failed:', String(error)); return }
        await this.store.serial(async () => {
          const row = this.store.get(id)
          const previous = row?.executions?.[nodeId]
          if (row && previous?.status === 'running') await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: { ...previous, status: 'failed', error: error instanceof Error ? error.message : String(error) } } })
        }).catch(error => { console.error('Node failure save failed:', String(error)) })
        return
      }
      await this.store.serial(async () => {
        const row = this.store.get(id)
        if (!row || row.executions?.[nodeId]?.status !== 'running') return
        const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: fact } })
        if (fact.status === 'succeeded') await this.submit(updated, nodeId, fact)
      }).catch(error => { console.error('Node result save or submission failed:', String(error)) })
    } finally { this.active.delete(key) }
  }
  private validateResult(row: StoredInstance, nodeId: string, fact: NodeFact): NodeFact {
    if (fact.status !== 'succeeded') return fact
    const ready = this.frontier(row).find(item => item.instanceId === nodeId)
    if (!ready) throw new Error('Node is no longer ready')
    const output = z.json().parse(copy(fact.output ?? {}, ready.definition.output_schema ?? {}, true, 'node-output', { instanceId: nodeId })) as JsonObject
    return { ...fact, output }
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
