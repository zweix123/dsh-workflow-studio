import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agentNode } from '../../dsh-workflow-node-agent/src/server.js'

test('Agent 节点以 agent 登记，允许输出声明，mode 默认台前并拒绝未知模式', () => {
  assert.equal(agentNode.kind, 'agent')
  agentNode.validate({ id: 'task', type: 'node', node_kind: 'agent', prompt: 'Task', output_schema: { result: 'string' } })
  agentNode.validate({ id: 'task', type: 'node', node_kind: 'agent', prompt: 'Task', mode: 'background' })
  assert.throws(() => agentNode.validate({ id: 'task', type: 'node', node_kind: 'agent', prompt: 'Task', mode: 'invalid' }), /mode/)
})

import type { NodeContext, NodeFact } from '../../dsh-workflow-node/src/index.js'

const context = (definition: NodeContext['definition'], services: Record<string, unknown>, fact?: NodeFact): NodeContext => ({
  definition, input: {}, workspaceId: 'workspace-a', services: services as NodeContext['services'], fact,
  save: async () => {}, validateOutput: value => value as NodeContext['input'],
})

test('台前完成用 fork 的结构化结果交付，嵌套声明保持必需字段和额外字段语义', async () => {
  const parent = { id: 'conversation', status: 'idle', inbox: { nextTurn: [], nextStep: [] } }
  let request: any
  const c = context({ id: 'task', type: 'node', prompt: 'Task', output_schema: { rows: { type: 'array', items: { type: 'object', properties: { count: 'number', ok: 'boolean' }, required: [] } } } }, {
    agents: { get: () => parent },
    subagents: { start: async (provider: string, value: unknown) => { assert.equal(provider, 'fork'); request = value; return { id: 'delivery-1', result: Promise.resolve({ stopReason: 'completed', structured: { rows: [{ count: 0, ok: false, extra: 'kept' }] } }), dispose: async () => {} } } },
  }, { kind: 'agent', status: 'waiting', business: { sessionId: 'conversation', requestId: 'request', sessionCreated: true, promptStarted: true } })
  const plan = agentNode.action(c, 'complete', {})
  assert.equal(plan.fact.status, 'running')
  const result = await plan.run!()
  assert.equal(result.status, 'succeeded')
  assert.deepEqual(result.output, { rows: [{ count: 0, ok: false, extra: 'kept' }] })
  assert.deepEqual(request.outputSchema, { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { count: { type: 'number' }, ok: { type: 'boolean' } }, required: ['count', 'ok'], additionalProperties: true } } }, required: ['rows'], additionalProperties: true })
  assert.deepEqual((result.business as any).attempts[0].address, { kind: 'subagent', parentSessionId: 'conversation', childSessionId: 'delivery-1', mode: 'one-shot' })
})

test('主对话生成中或有排队消息时完成被服务端拒绝，无输出也受保护', () => {
  for (const parent of [{ status: 'running', inbox: { nextTurn: [], nextStep: [] } }, { status: 'idle', inbox: { nextTurn: [{}], nextStep: [] } }]) {
    const c = context({ id: 'task', type: 'node', prompt: '' }, { agents: { get: () => parent } }, { kind: 'agent', status: 'waiting', business: { sessionId: 'conversation', requestId: 'r', sessionCreated: true, promptStarted: true } })
    assert.throws(() => agentNode.action(c, 'complete', {}), /generating/)
  }
})

test('普通文本不能代替结构化结果，失败后重试保留历次记录并再次核验输出', async () => {
  let calls = 0
  const parent = { id: 'conversation', status: 'idle', inbox: { nextTurn: [], nextStep: [] } }
  const c = context({ id: 'task', type: 'node', prompt: 'Task', output_schema: { result: 'string' } }, {
    agents: { get: () => parent }, subagents: { start: async () => ({ id: `delivery-${++calls}`, result: Promise.resolve(calls === 1 ? { stopReason: 'completed', output: [{ type: 'text', text: '{"result":"guess"}' }] } : { stopReason: 'completed', structured: { result: 'verified' } }), dispose: async () => {} }) },
  }, { kind: 'agent', status: 'waiting', business: { sessionId: 'conversation', requestId: 'r', sessionCreated: true, promptStarted: true } })
  const first = await agentNode.action(c, 'complete', {}).run!()
  assert.equal(first.status, 'failed')
  assert.equal(first.output, undefined)
  c.fact = first
  let validations = 0
  c.validateOutput = value => { validations++; return value as any }
  const second = await agentNode.action(c, 'complete', {}).run!()
  assert.equal(second.status, 'succeeded')
  assert.equal(validations, 1)
  assert.deepEqual((second.business as any).attempts.map((a: any) => [a.status, a.address.childSessionId]), [['failed', 'delivery-1'], ['succeeded', 'delivery-2']])
})

test('交付中断恢复为结果未知并保留子记录，不把已启动提示词误判为交付完成', () => {
  const fact: NodeFact = { kind: 'agent', status: 'running', business: { sessionId: 'conversation', requestId: 'r', sessionCreated: true, promptStarted: true, attempts: [{ id: 'a', status: 'running', address: { kind: 'subagent', parentSessionId: 'conversation', childSessionId: 'delivery', mode: 'one-shot' } }] } }
  const recovered = agentNode.recover(fact)
  assert.equal(recovered.status, 'unknown')
  assert.equal((recovered.business as any).attempts[0].status, 'unknown')
  assert.equal((recovered.business as any).attempts[0].address.childSessionId, 'delivery')
})

test('末次完整轮次之后的手动压缩不能被 fork 忽略并重引旧材料，交付明确失败', async () => {
  let starts = 0
  const c = context({ id: 'task', type: 'node', prompt: 'Task', output_schema: { result: 'string' } }, {
    agents: { get: () => ({ id: 'main', status: 'idle', inbox: { nextTurn: [], nextStep: [] }, session: { snapshotEvents: () => [{ type: 'turn/end', seq: 12 }, { type: 'compaction/summary', seq: 14 }] } }) },
    subagents: { start: async () => { starts++; return { id: 'child', result: Promise.resolve({ stopReason: 'completed', structured: { result: 'stale' } }), dispose: async () => {} } } },
  }, { kind: 'agent', status: 'waiting', business: { sessionId: 'main', requestId: 'r', sessionCreated: true, promptStarted: true } })
  const fact = await agentNode.action(c, 'complete', {}).run!()
  assert.equal(fact.status, 'failed')
  assert.match(fact.error!, /compaction.*completed turn/)
  assert.equal(starts, 0)
  assert.equal(fact.output, undefined)
})
