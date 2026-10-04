import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-app-boot'
import { randomUUID } from 'node:crypto'
import { nodeService, type ServerNode, type NodeRecord } from './index.js'

declare module '@deepseek-ai/cordis' { interface Context { workflowNodes: NodeRegistry } }

// FiberState.UNLOADING in the pinned Cordis 4.0.4 host API.
const HOST_UNLOADING = 5

type Contribution = { owner: Context; source: string; declaration: string; token: string; node: ServerNode; closing: boolean; calls: Set<Promise<void>> }

/** One registry per host profile. Only this owner publishes concrete-type services. */
export class NodeRegistry {
  private contributions = new Map<string, Set<Contribution>>()
  private listeners = new Set<() => void>()
  private published = new Set<string>()
  private readers = new Set<(kind: string) => NodeRecord[]>()
  constructor(private readonly ctx: Context) {}
  register(owner: Context, source: string, node: ServerNode, resources: { dispose?: () => void | Promise<void> } = {}): void {
    if (!node.kind.trim() || !source.trim()) throw new Error('Node kind and source must be nonempty')
    const entry = owner.fiber.entry
    const actual = entry && owner.get('pluginPackages')?.packageOf(entry.options.name, entry.parent.tree.ctx.baseUrl ?? owner.baseUrl ?? '')
    const runtimeName = owner.fiber.runtime?.name
    if ((actual?.name ?? runtimeName) && (actual?.name ?? runtimeName) !== source) throw new Error('Node source must match its host package identity')
    const declaration = entry ? `${entry.parent.tree.ctx.baseUrl}#${entry.id}` : `fiber:${owner.fiber.uid}`
    owner.effect(() => {
      const item: Contribution = { owner, source: actual?.name ?? source, declaration, token: randomUUID(), node, closing: false, calls: new Set() }
      let entries = this.contributions.get(node.kind)
      if (!entries) this.contributions.set(node.kind, entries = new Set())
      entries.add(item)
      this.changed(node.kind)
      return async () => {
        const owned = [...this.contributions.values()].flatMap(set => [...set]).filter(candidate => candidate.owner.fiber === owner.fiber)
        for (const candidate of owned) { candidate.closing = true; this.changed(candidate.node.kind) }
        await Promise.allSettled(owned.flatMap(candidate => [...candidate.calls]))
        try { await resources.dispose?.() } finally {
          entries!.delete(item)
          this.changed(node.kind)
        }
      }
    })
  }
  private effective(kind: string): Contribution | undefined {
    const entries = this.contributions.get(kind)
    if (entries?.size !== 1) return undefined
    const item = [...entries][0]!
    return item.closing || item.owner.fiber.state === HOST_UNLOADING || item.owner.fiber.uid === null ? undefined : item
  }
  get(kind: string): ServerNode | undefined { return this.effective(kind)?.node }
  services(kind: string): Context | undefined { return this.effective(kind)?.owner }
  has(kind: string): boolean { return Boolean(this.get(kind)) }
  identify(kind: string): { source: string; declaration: string; token: string } | undefined {
    const item = this.effective(kind)
    return item && { source: item.source, declaration: item.declaration, token: item.token }
  }
  diagnose(kind: string): { kind: string; status: 'available' | 'missing' | 'conflict' | 'unloading'; sources: string[]; declarations: string[] } {
    const entries = [...this.contributions.get(kind) ?? []]
    return { kind, status: entries.length > 1 ? 'conflict' : entries[0]?.closing ? 'unloading' : entries.length ? 'available' : 'missing', sources: entries.map(item => item.source), declarations: entries.map(item => item.declaration) }
  }
  /** Hold the implementation until business work AND its durable acceptance finish. */
  acquire(kind: string): (() => void) | undefined {
    const item = this.effective(kind)
    if (!item) return undefined
    let release!: () => void
    const call = new Promise<void>(resolve => { release = resolve })
    item.calls.add(call)
    return () => { item.calls.delete(call); release() }
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  readWith(owner: Context, reader: (kind: string) => NodeRecord[]): void {
    owner.effect(() => { this.readers.add(reader); return () => { this.readers.delete(reader) } })
  }
  records(kind: string): NodeRecord[] { return structuredClone([...this.readers].flatMap(reader => reader(kind))) }
  private changed(kind: string): void {
    const key = nodeService(kind)
    if (!this.published.has(kind)) {
      this.ctx.reflect.provide(key, undefined, () => this.has(kind))
      this.published.add(kind)
    }
    this.ctx.set(key, this.get(kind))
    this.ctx.reflect.notify([key])
    for (const listener of this.listeners) listener()
  }
}
export const name = 'dsh-workflow-node'
export function apply(ctx: Context): void { ctx.provide('workflowNodes', new NodeRegistry(ctx)) }
