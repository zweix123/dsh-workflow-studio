import type { Viewport } from '@xyflow/react'
import type { InstanceDetail, TemplateDetail, InstanceNavigationTarget } from '../shared/types/workflow-instance.js'
import { getInstance, WorkflowInstanceApiError } from './apis/workflow-instances.js'

export type CanvasReadingState = { viewport?: Viewport }

type Snapshot = {
  activeTab: string
  opened: InstanceDetail[]
  openedTemplates: TemplateDetail[]
  selection?: InstanceNavigationTarget & { request: number }
}

/** One plugin client lifetime; reading state never enters durable business storage. */
export class StudioClient {
  private snapshot: Snapshot = { activeTab: 'instances', opened: [], openedTemplates: [] }
  private listeners = new Set<() => void>()
  private views = new Map<string, CanvasReadingState>()
  canvas(tabId: string): CanvasReadingState {
    let view = this.views.get(tabId)
    if (!view) { view = {}; this.views.set(tabId, view) }
    return view
  }
  releaseCanvas(tabId: string) { this.views.delete(tabId) }
  private navigation = 0
  private disposed = false
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  set(update: (current: Snapshot) => Snapshot) {
    if (this.disposed) return
    this.snapshot = update(this.snapshot)
    for (const listener of this.listeners) listener()
  }
  private mergeDetail(existing: InstanceDetail | undefined, detail: InstanceDetail): InstanceDetail {
    if (existing && (existing.revision ?? 0) > (detail.revision ?? 0)) return existing
    return { ...detail, drawerWidth: existing?.drawerWidth ?? detail.drawerWidth }
  }
  updateDetail(detail: InstanceDetail) {
    this.set(current => ({ ...current, opened: current.opened.map(item => item.id === detail.id ? this.mergeDetail(item, detail) : item) }))
  }
  remove(instanceId: string) {
    this.navigation++
    this.releaseCanvas(`instance-${instanceId}`)
    this.set(current => ({ ...current, opened: current.opened.filter(item => item.id !== instanceId),
      activeTab: current.activeTab === `instance-${instanceId}` ? 'instances' : current.activeTab,
      selection: current.selection?.instanceId === instanceId ? undefined : current.selection }))
  }
  async open(target: InstanceNavigationTarget, signal: AbortSignal): Promise<boolean> {
    const request = ++this.navigation
    const valid = () => !this.disposed && !signal.aborted && request === this.navigation
    try {
      const detail = await getInstance(target.instanceId)
      if (!valid()) return false
      this.set(current => {
        const existing = current.opened.find(item => item.id === detail.id)
        const latest = this.mergeDetail(existing, detail)
        return { ...current, opened: existing ? current.opened.map(item => item.id === detail.id ? latest : item) : [...current.opened, latest],
          activeTab: `instance-${detail.id}`, selection: { ...target, request } }
      })
      return true
    } catch (error) {
      if (!valid()) return false
      if (error instanceof WorkflowInstanceApiError && error.code === 'instance-missing') this.remove(target.instanceId)
      throw error
    }
  }
  dispose() { this.disposed = true; this.navigation++; this.listeners.clear(); this.views.clear(); this.snapshot = { activeTab: 'instances', opened: [], openedTemplates: [] } }
}
