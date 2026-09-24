import type { DagDefinition, NodeDefinition } from './dag-engine/index.js'

export type BusinessNode = NodeDefinition & { is_auto_start?: boolean } & (
  | { node_kind: 'chat'; prompt: string }
  | { node_kind: 'bash'; command: string }
)

const fields = { chat: ['prompt'], bash: ['command'] } as const

export function validateBusinessNodes(definition: DagDefinition): void {
  const owner = new Map<string, string>()
  for (const [kind, names] of Object.entries(fields)) for (const name of names) {
    const previous = owner.get(name)
    if (previous) throw new Error(`Node field ${name} is declared by both ${previous} and ${kind}`)
    owner.set(name, kind)
  }
  function visit(dag: DagDefinition): void {
    for (const entry of dag.dag) {
      if (entry.type === 'dag') { visit(entry); continue }
      if (entry.type !== 'node') continue
      const kind = entry.node_kind
      if (kind !== 'chat' && kind !== 'bash') throw new Error(`Node ${entry.id}: node_kind must be chat or bash`)
      const required = fields[kind][0]
      if (typeof entry[required] !== 'string') throw new Error(`Node ${entry.id}: ${required} must be a string`)
      if (entry.is_auto_start !== undefined && typeof entry.is_auto_start !== 'boolean') {
        throw new Error(`Node ${entry.id}: is_auto_start must be a boolean`)
      }
      for (const name of owner.keys()) if (owner.get(name) !== kind && Object.hasOwn(entry, name)) {
        throw new Error(`Node ${entry.id}: ${name} belongs to ${owner.get(name)}`)
      }
    }
  }
  visit(definition)
}

export function businessNode(definition: NodeDefinition): BusinessNode {
  return definition as BusinessNode
}
