export interface InstanceNavigationTarget { instanceId: string; nodeInstanceId: string }
interface ConversationInstance { target: InstanceNavigationTarget | null }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
export async function getConversationInstance(sessionId: string): Promise<ConversationInstance> {
  const value = await fetch(`/api/dsh-workflow-studio/conversations/${encodeURIComponent(sessionId)}/instance`, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() })
  if (!object(value) || !(value.target === null || (object(value.target)
    && typeof value.target.instanceId === 'string' && value.target.instanceId
    && typeof value.target.nodeInstanceId === 'string' && value.target.nodeInstanceId))) throw new Error('Unexpected conversation instance')
  return value as unknown as ConversationInstance
}
