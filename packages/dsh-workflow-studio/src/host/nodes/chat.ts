import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

export const chatFields = ['prompt'] as const

export function validateChatNode(node: { id: string; prompt?: unknown }): void {
  if (typeof node.prompt !== 'string') throw new Error(`Node ${node.id}: prompt must be a string`)
}

export type ChatStage = 'session-created' | 'prompt-started'

export async function runChatNode({ prompt, workspaceId, sessionId, requestId, progress, sessionController, onProgress }: {
  prompt: string
  workspaceId: string
  sessionId: string
  requestId: string
  progress: { sessionCreated?: boolean; promptStarted?: boolean }
  sessionController: Context['sessionController']
  onProgress: (stage: ChatStage) => Promise<void>
}): Promise<void> {
  const session = SessionId(sessionId)
  if (!progress.sessionCreated) {
    await sessionController.create({ sessionId: session, workspaceId: WorkspaceId(workspaceId) })
    await onProgress('session-created')
  }
  if (prompt.trim() && !progress.promptStarted) {
    await sessionController.prompt({ sessionId: session, requestId: requestId as SessionRequestId, mode: 'queue', content: [{ type: 'text', text: prompt }] }, new AbortController().signal)
    await onProgress('prompt-started')
  }
}
