import { IconTriangleRightFillRegular, IconCheckOutlineRegular, IconNewChatOutlineRegular, IconClockOutlineRegular, IconRefreshOutlineRegular, IconEditOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { Component, type ReactNode } from 'react'
import type { BrowserNodeRegistry } from 'dsh-workflow-node/ui'
import { hasValidActionIdentifiers, type NodeAction } from 'dsh-workflow-node/contract'
export type NodeViews = Pick<BrowserNodeRegistry, 'get' | 'text' | 'subscribe' | 'snapshot'>
export const emptyNodeViews: NodeViews = { get: () => undefined, text: value => 'text' in value ? value.text : value.key, subscribe: () => () => {}, snapshot: () => 0 }
export class NodeBoundary extends Component<{ children: ReactNode; message: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p role="alert">{this.props.message}</p> : this.props.children }
}
export function visibleActions(actions: NodeAction[], nodes: NodeViews, kind: string, source?: string): NodeAction[] {
  return actions.filter(hasValidActionIdentifiers).filter(action => [1, 2, 3].includes(action.position) && actions.filter(other => other.position === action.position).length === 1).filter(action => action.target.type !== 'client' || Boolean(nodes.get(kind, source)?.node.handlers?.[action.target.handler] || nodes.get(kind, source)?.node.interactions?.[action.target.handler]))
}
const icons = { execute: IconTriangleRightFillRegular, complete: IconCheckOutlineRegular, conversation: IconNewChatOutlineRegular, record: IconClockOutlineRegular, retry: IconRefreshOutlineRegular, edit: IconEditOutlineRegular }
export function NodeButton({ action, nodes, pending, blocked, label, onClick }: { action: NodeAction; nodes: NodeViews; pending: boolean; blocked: boolean; label?: string; onClick: () => void }) {
  const text = nodes.text(action.label)
  const Icon = icons[action.icon]
  return <button type="button" className="nodrag nopan" aria-label={label ? `${text} ${label}` : text} title={action.disabledReason ? nodes.text(action.disabledReason) : undefined} disabled={Boolean(action.disabled) || pending || (action.target.type === 'server' && blocked)} onClick={event => { event.stopPropagation(); onClick() }}>{Icon && <Icon size={12} aria-hidden="true" />}{text}</button>
}
