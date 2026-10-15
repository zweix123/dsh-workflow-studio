import { randomUUID } from 'node:crypto'
import { copy } from '../dag/data.js'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { compile, SubmissionError, type DagDefinition, type ExecutionSnapshot, type JsonObject, type SavedExecution } from '../dag/index.js'
import { isIdentifier, hasValidActionIdentifiers, NodeInputError, NodePersistenceError, type NodeContext, type NodeFact, type NodePlan, type NodeLookup } from 'dsh-workflow-node/contract'
import type { InstanceDetail, NodeExecution } from '../../shared/types/workflow-instance.js'
import { WorkflowInstanceStore, type StoredInstance } from '../storage/workflow-instance-store.js'
import { executeWorkflowNode } from './dag.js'
import { nodeDefinitionAt, workflowNode, validateWorkflowNodes } from './definition.js'
import { WorkflowInstanceError } from './errors.js'

export { initializeWorkflow } from './dag.js'
export { nodeDefinitionAt, validateWorkflowNodes, type WorkflowNode } from './definition.js'
export { WorkflowInstanceError } from './errors.js'

export class WorkflowEngine {
  private readonly active = new Set<string>()
  private readonly tasks = new Set<Promise<void>>()
  private closing = false
  private readonly persistenceErrors = new Map<string, string>()

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
      if (!isIdentifier(name)) throw new WorkflowInstanceError('node-kind-invalid', 'Invalid node action identifier')
      const row = this.requireInstance(id)
      this.assertCompatible(row)
      const ready = this.frontier(row).find(item => item.instanceId === nodeId)
      if (!ready) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      const key = this.key(id, nodeId)
      if (this.active.has(key)) throw new WorkflowInstanceError('node-running', 'Node is already running', this.detail(row))
      const node = this.nodes.get(workflowNode(ready.definition).node_kind)!
      if (token && this.nodes.identify?.(node.kind)?.token !== token) throw new WorkflowInstanceError('node-kind-invalid', 'Node contribution has changed', this.detail(row))
      const previous = this.currentFact(row, nodeId)
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
    if (changed) await this.store.save({ ...row, executions: Object.fromEntries(Object.entries(executions).map(([id, fact]) => [id, this.record(row, id, fact)])) })
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
      const fact = this.currentFact(row, nodeId)!
      const { business: _business, ...common } = fact
      let data = {} as import('dsh-workflow-node/contract').NodeData
      try { data = node?.project(structuredClone(fact)) ?? data } catch { /* Public common facts remain readable. */ }
      return [nodeId, { ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}), ...common, ...(this.persistenceErrors.has(this.key(row.id, nodeId)) ? { persistenceError: this.persistenceErrors.get(this.key(row.id, nodeId)) } : {}) }]
    })) as Record<string, NodeExecution>
    const definitionSnapshot = row.definition as DagDefinition
    const nodeViews = Object.fromEntries((row.snapshot as unknown as ExecutionSnapshot).instances.filter(item => item.type === 'node').map(item => {
      const definition = nodeDefinitionAt(definitionSnapshot, item.definitionPath)
      const kind = String(definition?.node_kind)
      const node = this.nodes.get(kind)
      const identity = this.nodes.identify?.(kind)
      let presentation = { actions: [] } as import('dsh-workflow-node/contract').NodePresentation
      try { if (node && definition) presentation = node.describe?.(structuredClone({ definition, input: item.input as import('dsh-workflow-node/contract').NodeData, fact: this.currentFact(row, item.instanceId), ready: item.status === 'ready' })) ?? presentation } catch { /* Local presentation failure never hides public details. */ }
      return [item.instanceId, { ...presentation, actions: presentation.actions.filter(hasValidActionIdentifiers), ...identity }]
    }))
    return {
      nodeViews,
      dagRecords: Object.fromEntries(Object.entries(row.dagRecords ?? {}).map(([id, records]) => [id, records.map(({ submissionId: _submissionId, ...record }) => record)])),
      id: row.id, workspaceId: row.workspaceId, name: row.name, templateId: row.templateId, templateName: ((row.definition as DagDefinition).name ?? (row.definition as DagDefinition).id), createdAt: row.createdAt,
      revision: row.revision ?? 0, definition: row.definition as DagDefinition, input: row.input as JsonObject,
      snapshot: row.snapshot as unknown as ExecutionSnapshot,
      ...(Object.keys(executions).length ? { executions } : {}), ...(incompatible ? { incompatible } : {}),
      ...(row.drawerWidth === undefined ? {} : { drawerWidth: row.drawerWidth }),
    }
  }

  private currentFact(row: StoredInstance, nodeId: string): NodeFact | undefined {
    const fact = row.executions?.[nodeId]
    return fact?.status === 'running' && this.persistenceErrors.has(this.key(row.id, nodeId)) ? this.record(row, nodeId, this.nodes.get(fact.kind)?.recover(structuredClone(fact)) ?? fact) : fact
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
    return { definition: ready.definition, input: ready.input as JsonObject, fact: fact && structuredClone(fact), workspaceId: row.workspaceId, templateDirectory: row.templateDirectory, services,
      validateOutput: output => z.json().parse(copy(output, ready.definition.output_schema ?? {}, true, 'node-output', { instanceId: ready.instanceId })) as JsonObject,
      save: async next => { if (next.kind !== node.kind) throw new Error('Mismatched node fact'); await this.store.serial(async () => {
        const latest = this.store.get(row.id)
        if (!latest || !this.active.has(key) || latest.executions?.[ready.instanceId]?.status !== 'running') return
        await this.store.save({ ...latest, executions: { ...latest.executions, [ready.instanceId]: this.record(latest, ready.instanceId, next) } })
      }).catch(error => { this.persistenceErrors.set(key, String(error)); throw new NodePersistenceError(String(error)) }) },
    }
  }
  private async accept(row: StoredInstance, nodeId: string, kind: string, plan: NodePlan, release?: () => void): Promise<InstanceDetail> {
    if (plan.fact.kind !== kind) throw new Error(`Node ${kind} returned fact for ${plan.fact.kind}`)
    const fact = this.record(row, nodeId, this.validateResult(row, nodeId, plan.fact), plan.attempt)
    let updated: StoredInstance
    try { updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: fact } }) }
    catch (error) { throw new WorkflowInstanceError('persistence-failed', `Node start record could not be saved: ${String(error)}`, this.detail(row)) }
    this.persistenceErrors.delete(this.key(row.id, nodeId))
    if (plan.rejection) { release?.(); throw new WorkflowInstanceError('node-input-invalid', plan.rejection, this.detail(updated)) }
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
          if (row && previous?.status === 'running') await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: this.record(row, nodeId, { ...previous, status: 'failed', error: error instanceof Error ? error.message : String(error) }) } })
        }).catch(error => { this.persistenceErrors.set(key, String(error)); console.error('Node failure save failed:', String(error)) })
        return
      }
      await this.store.serial(async () => {
        const row = this.store.get(id)
        if (!row || row.executions?.[nodeId]?.status !== 'running') return
        const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: this.record(row, nodeId, fact) } })
        if (fact.status === 'succeeded') await this.submit(updated, nodeId, updated.executions![nodeId]!).catch(error => { console.error('Node submission failed:', String(error)) })
      }).catch(error => { this.persistenceErrors.set(key, String(error)); console.error('Node result save or submission failed:', String(error)) })
    } finally { this.active.delete(key) }
  }
  private record(row: StoredInstance, nodeId: string, fact: NodeFact, operation?: NodePlan['attempt']): NodeFact {
    const previous = row.executions?.[nodeId]
    const records = structuredClone(previous?.records ?? [])
    const latest = records.at(-1)
    if (operation) {
      if (latest?.status === 'running') { latest.status = 'unknown'; latest.finishedAt = new Date().toISOString() }
      const input = (row.snapshot as unknown as ExecutionSnapshot).instances.find(item => item.instanceId === nodeId)!.input as JsonObject
      records.push({ id: randomUUID(), operation, status: fact.status, startedAt: new Date().toISOString(), input: structuredClone(input) })
    }
    if (operation || latest && ['running', 'waiting'].includes(latest.status)) {
      const current = records.at(-1)!
      current.status = fact.status
      if (fact.output !== undefined) current.output = structuredClone(fact.output)
      if (fact.error !== undefined) current.error = fact.error
      const data = this.nodes.get(fact.kind)?.record?.(structuredClone(fact))
      if (data !== undefined) current.data = structuredClone(data)
      if (fact.status !== 'running' && !current.finishedAt) current.finishedAt = new Date().toISOString()
    }
    return { ...fact, ...(records.length ? { records } : {}) }
  }
  private validateResult(row: StoredInstance, nodeId: string, fact: NodeFact): NodeFact {
    if (fact.status !== 'succeeded') return fact
    const ready = this.frontier(row).find(item => item.instanceId === nodeId)
    if (!ready) throw new Error('Node is no longer ready')
    const output = z.json().parse(copy(fact.output ?? {}, ready.definition.output_schema ?? {}, true, 'node-output', { instanceId: nodeId })) as JsonObject
    return { ...fact, output }
  }
  private dagRecords(row: StoredInstance, nodeId: string, startedAt: string, error?: unknown): NonNullable<StoredInstance['dagRecords']> {
    const snapshot = row.snapshot as unknown as ExecutionSnapshot
    const records = structuredClone(row.dagRecords ?? {})
    const prior = Object.entries(records).filter(([, items]) => items.filter(item => item.submissionId === nodeId).at(-1)?.status === 'failed').map(([id]) => id)
    let owner: string | undefined
    if (error instanceof SubmissionError) {
      const location = error.location
      const instance = snapshot.instances.find(item => item.instanceId === location.instanceId)
      owner = instance?.type === 'dag' && error.phase !== 'group-aggregation' ? instance.instanceId : location.parentInstanceId
      // DAG-output errors name the DAG itself, including the root which has no parent.
      if (instance?.type === 'dag' && error.phase.startsWith('dag-output')) owner = instance.instanceId
    } else if (error !== undefined) owner = snapshot.instances.find(item => item.instanceId === nodeId)?.parentInstanceId ?? snapshot.rootInstanceId
    if (error !== undefined && !owner) owner = snapshot.rootInstanceId
    for (const dagId of new Set([...prior, ...(owner ? [owner] : [])])) {
      const dag = snapshot.instances.find(item => item.instanceId === dagId && item.type === 'dag')!
      const failed = dagId === owner
      const diagnostic = error instanceof SubmissionError ? {
        phase: error.phase, code: error.code, location: error.location,
        ...(error.dataPath ? { dataPath: error.dataPath } : {}), ...(error.sources ? { sources: error.sources } : {}),
        diagnostic: error.cause instanceof Error ? error.cause.stack ?? error.cause.message : String(error.cause ?? ''),
      } : { phase: 'graph-save', code: 'GRAPH_SAVE_FAILED', location: { instanceId: dagId }, diagnostic: String(error) }
      const record = { id: randomUUID(), submissionId: nodeId, operation: { namespace: 'dsh-workflow-studio', key: prior.includes(dagId) ? 'retryDelivery' : 'dagSubmission' },
        startedAt, finishedAt: new Date().toISOString(), input: dag.input as JsonObject, status: failed ? 'failed' as const : 'succeeded' as const,
        ...(failed ? { error: error instanceof Error ? error.message : String(error), data: z.json().parse(diagnostic) as JsonObject } : {}),
      }
      records[dagId] = [...records[dagId] ?? [], record]
    }
    return records
  }
  private async submit(row: StoredInstance, nodeId: string, fact: NodeFact): Promise<InstanceDetail> {
    const startedAt = new Date().toISOString()
    try {
      const result = executeWorkflowNode(row.definition as DagDefinition, row.input as JsonObject, row.state as unknown as SavedExecution | undefined, nodeId, fact.output as JsonObject | undefined)
      if (!result) throw new WorkflowInstanceError('node-not-ready', 'Node is no longer ready', this.detail(row))
      const { error: _error, ...accepted } = fact
      const updated = await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: accepted },
        state: z.json().parse(result.state), snapshot: z.json().parse(result.snapshot), dagRecords: this.dagRecords(row, nodeId, startedAt) })
      this.scheduleReady(row.id)
      return this.detail(updated)
    } catch (error) {
      if (error instanceof WorkflowInstanceError) throw error
      await this.store.save({ ...row, executions: { ...row.executions, [nodeId]: { ...fact, error: error instanceof Error ? error.message : String(error) } },
        dagRecords: this.dagRecords(row, nodeId, startedAt, error) }).catch(saveError => { this.persistenceErrors.set(this.key(row.id, nodeId), String(saveError)); throw saveError })
      if (error instanceof SubmissionError) throw new WorkflowInstanceError('submission-failed', error.message, this.detail(this.requireInstance(row.id)))
      throw error
    }
  }
}
