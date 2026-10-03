import { useEffect, useMemo, useState } from 'react'
import { Controls, ReactFlow } from '@xyflow/react'
import type { DagDefinition, DefinitionPath } from '../../../../host/dag/index.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { CanvasNavigation, edgeTypes, nodeTypes } from '../canvas/CanvasElements.js'
import type { CanvasNode, CanvasEdge, Expression } from '../canvas/types.js'
import { buildTemplateGraph } from './build-template-graph.js'

export function TemplateCanvas({ definition, t, onInspect, active, inspectorWidth }: { definition: DagDefinition; t: WorkflowTranslate; onInspect: (path: DefinitionPath) => void; active: boolean; inspectorWidth: number }) {
  const graph = useMemo(() => buildTemplateGraph(definition), [definition])
  const [ready, setReady] = useState(false)
  const [expression, setExpression] = useState<{ id: string; value: Expression }>()
  const nodes: CanvasNode[] = graph.nodes.map(node => {
    if (node.data.source !== 'template') return node
    const data = node.data
    return { ...node, data: { ...data, view: {
      kindLabel: data.kind === 'recursive' ? t('recursiveReference') : data.kind === 'dag' ? 'DAG' : t('node'),
      detailsLabel: t('nodeDetails'), onInspect: () => onInspect(data.definitionPath),
    } } }
  })
  const edges: CanvasEdge[] = graph.edges.map(edge => ({ ...edge, data: {
    ...edge.data, conditionLabel: t('conditionMark'), eachLabel: t('eachMark'),
    open: (id: string, value: Expression) => setExpression({ id, value }),
  } }))
  useEffect(() => {
    if (!expression) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpression(undefined) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [expression])
  return <div className="dsh-workflow-graph dsh-workflow-template-graph" aria-label={t('templateGraph')}>
    <ReactFlow<CanvasNode, CanvasEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} minZoom={0.05} maxZoom={2} onInit={() => setReady(true)}
      panOnDrag zoomOnScroll nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
      elementsSelectable={false} onNodeClick={() => {}} deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
      <Controls showInteractive={false} showFitView={false} />
      <CanvasNavigation nodes={nodes} candidates={[]} active={active} ready={ready} inspectorWidth={inspectorWidth} t={t} template />
    </ReactFlow>
    {expression && <aside className="dsh-workflow-expression" role="dialog" aria-label={t('fullExpression')}><header><strong>{t('fullExpression')}</strong><button type="button" aria-label={t('closeExpression')} onClick={() => setExpression(undefined)}>×</button></header>
      {expression.value.condition && <><span>{t('conditionMark')} · if</span><pre>{expression.value.condition}</pre></>}
      {expression.value.each && <><span>{t('eachMark')} · for</span><pre>{expression.value.each}</pre></>}
    </aside>}
  </div>
}
