import type { DagDefinition, EntityDefinition } from '../host/dag/index.js'

export type LayoutDirection = 'horizontal' | 'vertical'
export type LayoutIssueCode = 'invalidLayout' | 'invalidDirection' | 'invalidSegments' | 'invalidSegment' | 'unknownStart' | 'duplicateStart' | 'emptyDefault' | 'unorderedStart' | 'unsafeStart'
export interface LayoutIssue { level: 'WARN'; path: string[]; startAt?: string; segmentIndex?: number; code: LayoutIssueCode; suggestion?: string }
export interface LayoutLayer { path: string[]; direction: LayoutDirection; starts: Array<{ startAt: string; direction: LayoutDirection }>; order: string[]; issues: LayoutIssue[] }
export interface LayoutReport { layers: LayoutLayer[]; issues: LayoutIssue[] }

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const direction = (value: unknown): value is LayoutDirection => value === 'horizontal' || value === 'vertical'

function layer(definition: DagDefinition, path: string[]): LayoutLayer | undefined {
  if (!Object.hasOwn(definition, 'layout')) return
  const vertices = definition.dag.filter((item): item is Exclude<EntityDefinition, { type: 'edge' }> => item.type !== 'edge')
  const ids = vertices.map(item => item.id)
  const neighbors = new Map(ids.map(id => [id, new Set<string>()]))
  const incoming = new Map(ids.map(id => [id, new Set<string>()]))
  for (const item of definition.dag) if (item.type === 'edge' && neighbors.has(item.from) && neighbors.has(item.to)) {
    neighbors.get(item.from)!.add(item.to)
    incoming.get(item.to)!.add(item.from)
  }
  const order: string[] = []
  const pending = new Set(ids)
  while (pending.size) {
    const next = ids.find(id => pending.has(id) && [...incoming.get(id)!].every(parent => !pending.has(parent)))
    if (!next) break // The DAG compiler rejects cycles; old snapshots still need a safe fallback.
    order.push(next)
    pending.delete(next)
  }
  const reachable = (start: string): Set<string> => {
    const seen = new Set<string>()
    const visit = (id: string) => { for (const next of neighbors.get(id) ?? []) if (!seen.has(next)) { seen.add(next); visit(next) } }
    visit(start)
    return seen
  }
  const after = new Map(ids.map(id => [id, reachable(id)]))
  const unsafe = new Set<string>()
  for (const fork of ids.filter(id => (neighbors.get(id)?.size ?? 0) > 1)) {
    const arms = [...neighbors.get(fork)!]
    const joins = order.filter(id => arms.every(arm => arm === id || after.get(arm)?.has(id)))
    const join = joins[0]
    for (const id of after.get(fork) ?? []) if (!join || id === join || after.get(id)?.has(join)) unsafe.add(id)
  }
  const issues: LayoutIssue[] = []
  const issue = (code: LayoutIssueCode, startAt?: string, suggestion?: string, segmentIndex?: number) => issues.push({ level: 'WARN', path, code, ...(startAt && { startAt }), ...(suggestion && { suggestion }), ...(segmentIndex !== undefined && { segmentIndex }) })
  const raw = definition.layout
  if (!object(raw)) issue('invalidLayout')
  const base = object(raw) && raw.direction
  if (!direction(base)) issue('invalidDirection')
  const rawSegments = object(raw) ? raw.segments : undefined
  if (rawSegments !== undefined && !Array.isArray(rawSegments)) issue('invalidSegments')
  const starts: LayoutLayer['starts'] = []
  const seen = new Set<string>()
  let previous: string | undefined
  if (Array.isArray(rawSegments)) for (const [segmentIndex, segment] of rawSegments.entries()) {
    if (!object(segment) || typeof segment.start_at !== 'string' || !direction(segment.direction)) { issue('invalidSegment', object(segment) && typeof segment.start_at === 'string' ? segment.start_at : undefined, undefined, segmentIndex); continue }
    const startAt = segment.start_at
    if (!neighbors.has(startAt)) issue('unknownStart', startAt, undefined, segmentIndex)
    else if (seen.has(startAt)) issue('duplicateStart', startAt, undefined, segmentIndex)
    else if (order[0] === startAt) issue('emptyDefault', startAt, undefined, segmentIndex)
    else if (unsafe.has(startAt) || ids.some(id => id !== startAt && !after.get(id)?.has(startAt) && !after.get(startAt)?.has(id))) {
      const next = order.slice(order.indexOf(startAt) + 1).find(id => !unsafe.has(id) && ids.every(other => other === id || after.get(other)?.has(id) || after.get(id)?.has(other)))
      issue('unsafeStart', startAt, next, segmentIndex)
    } else if (previous && !after.get(previous)?.has(startAt)) issue('unorderedStart', startAt, undefined, segmentIndex)
    else previous = startAt
    seen.add(startAt)
    starts.push({ startAt, direction: segment.direction })
  }
  return { path, direction: direction(base) ? base : 'horizontal', starts, order, issues }
}

export function inspectLayout(definition: DagDefinition): LayoutReport {
  const layers: LayoutLayer[] = []
  const visit = (dag: DagDefinition, path: string[]) => {
    const result = layer(dag, path)
    if (result) layers.push(result)
    for (const child of dag.dag) if (child.type === 'dag') visit(child, [...path, child.id])
  }
  visit(definition, [definition.id])
  return { layers, issues: layers.flatMap(item => item.issues) }
}
