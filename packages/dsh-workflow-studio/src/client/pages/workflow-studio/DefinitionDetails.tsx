import type { DagDefinition, DefinitionPath, EntityDefinition } from '../../../host/dag/index.js'

export function definitionAt(root: DagDefinition, path: DefinitionPath): EntityDefinition | undefined {
  let current: EntityDefinition = root
  if (path.length % 2) return
  for (let index = 0; index < path.length; index += 2) {
    if (path[index] !== 'dag' || typeof path[index + 1] !== 'number' || current.type !== 'dag') return
    const child: EntityDefinition | undefined = current.dag[path[index + 1] as number]
    if (!child) return
    current = child
  }
  return current
}

export function DetailFields({ fields }: { fields: Array<[string, unknown]> }) {
  return <dl>{fields.map(([key, value]) => <div key={key} className="dsh-workflow-detail-field"><dt>{key}</dt><dd><pre>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></dd></div>)}</dl>
}

export function DefinitionDetails({ definition }: { definition: EntityDefinition }) {
  return <DetailFields fields={Object.entries(definition).filter(([key]) => definition.type !== 'dag' || key !== 'dag')} />
}
