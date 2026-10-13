import type { NodeData } from 'dsh-workflow-node/contract'

export type AgentAttempt = {
  id: string
  status: 'running' | 'succeeded' | 'failed' | 'unknown'
  address?: { kind: 'subagent'; parentSessionId: string; childSessionId: string; mode: 'one-shot' }
  output?: NodeData
  error?: string
}
export type AgentState = {
  mode?: 'foreground' | 'background'
  sessionId?: string
  requestId?: string
  sessionCreated?: boolean
  promptStarted?: boolean
  parentSessionId?: string
  attempts?: AgentAttempt[]
  pendingOutput?: NodeData
}
