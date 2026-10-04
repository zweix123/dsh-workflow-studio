import type { Context } from '@deepseek-ai/cordis'
import type { ClientNode } from './client.js'
import type { NodeText } from './index.js'
import type {} from '@deepseek-ai/dsh-client-locale/client'

export interface NodeNavigationTarget { instanceId: string; nodeInstanceId: string }
export interface NodeNavigation { open(target: NodeNavigationTarget, signal: AbortSignal): Promise<boolean>; remove(instanceId: string): void }
type Entry = { source: string; node: ClientNode; generation: number; t: (key: string) => string }
declare module '@deepseek-ai/cordis' { interface Context { workflowNodeViews: BrowserNodeRegistry; workflowNavigation: NodeNavigation } }

/** Optional capabilities use the same contributor package identity as their host implementation. */
export class BrowserNodeRegistry {
  private entries = new Set<Entry>()
  private listeners = new Set<() => void>()
  private revision = 0
  constructor(private readonly translate: (namespace: string, key: string) => string = (_namespace, key) => key) {}
  register(owner: Context, source: string, node: ClientNode): void {
    // The host client Loader's entry name is its composed package/module id.
    const identity = owner.fiber.entry?.options.name ?? owner.fiber.runtime?.name
    if (identity && identity !== source) throw new Error('Node view source must match its host browser package identity')
    owner.effect(() => {
      const entry: Entry = { source, node, generation: ++this.revision, t: key => this.translate(source, key) }
      this.entries.add(entry); this.changed()
      return () => { this.entries.delete(entry); this.changed() }
    })
  }
  get(kind: string, source?: string): Entry | undefined {
    const entries = [...this.entries].filter(entry => entry.node.kind === kind && entry.source === source)
    return entries.length === 1 ? entries[0] : undefined
  }
  text(value: NodeText): string { return 'text' in value ? value.text : this.translate(value.namespace, value.key) }
  snapshot = (): number => this.revision
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private changed(): void { this.revision++; for (const listener of this.listeners) listener() }
}
export const name = 'dsh-workflow-node'
export const inject = ['locale']
export function apply(ctx: Context): void { ctx.provide('workflowNodeViews', new BrowserNodeRegistry((namespace, key) => ctx.locale.bind(namespace)(key))) }
