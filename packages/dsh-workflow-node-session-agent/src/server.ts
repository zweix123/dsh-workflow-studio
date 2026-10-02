import { randomUUID } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { NodeContext, NodeFact, ServerNode } from '../../dsh-workflow-studio/src/contract/node/index.js'

type SessionAgentState = { sessionId: string; requestId: string; sessionCreated?: boolean; promptStarted?: boolean }
const state = (fact?: NodeFact): SessionAgentState | undefined => fact?.business as SessionAgentState | undefined

function start(context: NodeContext) {
  const previous = state(context.fact)
  if (context.fact?.status === 'succeeded') return { fact: context.fact }
  if (context.fact?.status === 'waiting' && previous?.sessionCreated) return { fact: context.fact }
  if (context.fact?.status === 'running') throw new Error('Node is already running')
  const business: SessionAgentState = { sessionId: previous?.sessionId ?? randomUUID(), requestId: previous?.requestId ?? randomUUID(), sessionCreated: previous?.sessionCreated, promptStarted: previous?.promptStarted }
  return {
    fact: { kind: 'session_agent', status: 'running', business } as NodeFact,
    run: async (): Promise<NodeFact> => {
      const sessionId = SessionId(business.sessionId)
      if (!business.sessionCreated) {
        await context.services.sessionController.create({ sessionId, workspaceId: WorkspaceId(context.workspaceId) })
        business.sessionCreated = true
        await context.save({ kind: 'session_agent', status: 'running', business: { ...business } })
      }
      if ((context.definition.prompt as string).trim() && !business.promptStarted) {
        await context.services.sessionController.prompt({ sessionId, requestId: business.requestId as SessionRequestId, mode: 'queue', content: [{ type: 'text', text: context.definition.prompt as string }] }, new AbortController().signal)
        business.promptStarted = true
        await context.save({ kind: 'session_agent', status: 'running', business: { ...business } })
      }
      return { kind: 'session_agent', status: 'waiting', business }
    },
  }
}

export const sessionAgentNode: ServerNode = {
  kind: 'session_agent',
  requires: ['sessionController'],
  validate(node) {
    if (typeof node.prompt !== 'string') throw new Error(`Node ${node.id}: prompt must be a string`)
    if (node.is_auto_start !== undefined && typeof node.is_auto_start !== 'boolean') throw new Error(`Node ${node.id}: is_auto_start must be a boolean`)
  },
  ready(context) { return context.definition.is_auto_start === true && !context.fact ? start(context) : undefined },
  action(context, name, payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) throw new Error('Unsupported session_agent action')
    if (name === 'start') return start(context)
    if (name === 'complete' && state(context.fact)?.sessionCreated) return { fact: { ...context.fact!, status: 'succeeded' as const, error: undefined, output: context.placeholder() } }
    throw new Error('Session agent cannot perform this action now')
  },
  recover(fact) {
    if (fact.status !== 'running') return fact
    return state(fact)?.promptStarted ? { ...fact, status: 'waiting', error: undefined }
      : { ...fact, status: 'unknown', error: 'Previous session_agent start is incomplete; execute to resume.' }
  },
  project(fact) { return (fact.business ?? {}) as Record<string, never> },
}
