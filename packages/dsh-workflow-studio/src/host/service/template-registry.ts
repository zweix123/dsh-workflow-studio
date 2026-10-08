import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { compile, type DagDefinition } from '../dag/index.js'
import { validateWorkflowNodes, WorkflowInstanceError } from '../workflow/index.js'
import { inspectLayout } from '../../shared/layout.js'
import type { TemplateCatalog, TemplateDetail, TemplateRow } from '../../shared/types/workflow-instance.js'
import { nodeService, type NodeLookup } from 'dsh-workflow-node/contract'

declare module '@deepseek-ai/cordis' { interface Context { workflowTemplates: TemplateRegistry } }
type Contribution = TemplateRow & { definition?: DagDefinition; templateDirectory?: string; loadError?: string; typesReady?: boolean }

/** Owned by Studio in one host profile; definitions never read files here. */
export class TemplateRegistry {
  private readonly contributions = new Set<Contribution>()
  constructor(owner: Context, private readonly nodes: NodeLookup = owner.workflowNodes) {
    if (nodes.subscribe) owner.effect(() => nodes.subscribe!(() => this.revalidate()))
  }
  register(owner: Context, source: string, value: { definition: unknown; templateDirectory?: string } | { error: string }): void {
    const row: Contribution = { key: randomUUID(), id: '', source }
    try {
      if ('error' in value) throw new Error(value.error)
      const raw = structuredClone(value.definition) as Record<string, unknown> | null
      if (raw && typeof raw.id === 'string') row.id = raw.id
      if (raw && typeof raw.name === 'string' && raw.name.trim()) row.name = raw.name
      if (!row.id.trim()) throw new Error('Template root id must be a nonempty string')
      if (!row.name) throw new Error('Template root name must be a nonempty string')
      row.definition = compile(raw, {}).getDefinition()
      row.templateDirectory = value.templateDirectory
      const layout = inspectLayout(row.definition)
      if (layout.layers.length) row.layout = layout
    } catch (error) { row.loadError = error instanceof Error ? error.message : String(error) }
    if (row.definition) {
      const kinds = new Set<string>()
      const visit = (dag: DagDefinition): void => {
        for (const entry of dag.dag) {
          if (entry.type === 'dag') visit(entry)
          else if (entry.type === 'node' && typeof entry.node_kind === 'string') kinds.add(entry.node_kind)
        }
      }
      visit(row.definition)
      owner.inject([...kinds].map(nodeService), dependency => {
        row.typesReady = true
        this.revalidate()
        dependency.effect(() => () => { row.typesReady = false; this.revalidate() })
      })
    }
    owner.effect(() => {
      this.contributions.add(row)
      this.revalidate()
      return () => { this.contributions.delete(row); this.revalidate() }
    })
  }
  private revalidate(): void {
    for (const row of this.contributions) {
      const duplicates = [...this.contributions].filter(other => row.id.trim() && other.id === row.id)
      try {
        if (duplicates.length > 1) throw new Error(`Conflicting template ID ${row.id}: ${duplicates.map(other => other.source).join(', ')}`)
        if (row.loadError) throw new Error(row.loadError)
        validateWorkflowNodes(row.definition!, this.nodes)
        if (!row.typesReady) throw new Error('Waiting for required node_kind services')
        delete row.error
      } catch (error) { row.error = error instanceof Error ? error.message : String(error) }
    }
  }
  list(): TemplateCatalog {
    return { templates: [...this.contributions].map(({ definition: _definition, templateDirectory: _directory, loadError: _loadError, typesReady: _typesReady, ...row }) => structuredClone(row))
      .sort((a, b) => a.id.localeCompare(b.id, 'en') || a.source.localeCompare(b.source, 'en')) }
  }
  get(id: string): TemplateDetail & { templateDirectory?: string } {
    const row = [...this.contributions].find(row => row.id === id && id.trim())
    if (!row) throw new WorkflowInstanceError('template-missing', 'Workflow template not found')
    if (row.error || !row.definition) throw new WorkflowInstanceError('template-invalid', row.error ?? 'Workflow template is invalid')
    const { loadError: _loadError, typesReady: _typesReady, ...detail } = row
    return structuredClone(detail) as TemplateDetail
  }
}
