import assert from 'node:assert/strict'
import test from 'node:test'
import type { DagDefinition } from '../src/host/dag/index.js'
import { buildTemplateGraph, templateDefinitionAt } from '../src/client/pages/workflow-studio/templates/build-template-graph.js'

test('template graph keeps all static vertices, nested groups, recursion, and expressions', () => {
  const definition: DagDefinition = { id: 'root', type: 'dag', description: 'Whole flow', dag: [
    { id: 'start', type: 'node', node_kind: 'bash', command: 'echo hi' },
    { id: 'inner', type: 'dag', description: 'A group', dag: [
      { id: 'work', type: 'node', node_kind: 'session_agent', prompt: 'Long prompt' },
      { type: 'edge', from: 'work', to: 'inner', if: '$.again' },
    ] },
    { id: 'later', type: 'node' },
    { id: 'jobs', type: 'node' },
    { type: 'edge', from: 'start', to: 'inner', if: '$.yes' },
    { type: 'edge', from: 'inner', to: 'later' },
    { type: 'edge', from: 'start', to: 'jobs', for: '$.items' },
  ] }
  const graph = buildTemplateGraph(definition)
  assert.deepEqual(graph.nodes.map(node => node.data.label).sort(), ['inner', 'inner', 'jobs', 'later', 'start', 'work'])
  const group = graph.nodes.find(node => node.data.kind === 'dag')!
  assert.equal(graph.nodes.find(node => node.data.label === 'work')?.parentId, group.id)
  assert.equal(graph.nodes.find(node => node.data.kind === 'recursive')?.parentId, group.id)
  assert.equal(graph.edges.length, 4)
  assert.equal(graph.edges.find(edge => edge.data?.each)?.data?.each, '$.items')
  assert.equal(graph.edges.find(edge => edge.data?.condition === '$.again')?.target, `${group.id}/recursive`)
  assert.equal(templateDefinitionAt(definition, [1]).description, 'A group')
  assert.equal(templateDefinitionAt(definition, [1, 0]).prompt, 'Long prompt')
  assert.ok(graph.nodes.find(node => node.data.label === 'start')!.position.x < group.position.x)
})

test('valid layout changes direction and an invalid layer falls back alone', () => {
  const definition: DagDefinition = { id: 'root', type: 'dag', layout: { direction: 'vertical' }, dag: [
    { id: 'a', type: 'node' }, { id: 'b', type: 'node' }, { type: 'edge', from: 'a', to: 'b' },
  ] }
  const vertical = buildTemplateGraph(definition)
  assert.ok(vertical.nodes[0]!.position.y < vertical.nodes[1]!.position.y)
  definition.layout = { direction: 'diagonal' }
  const fallback = buildTemplateGraph(definition)
  assert.ok(fallback.nodes[0]!.position.x < fallback.nodes[1]!.position.x)
})
