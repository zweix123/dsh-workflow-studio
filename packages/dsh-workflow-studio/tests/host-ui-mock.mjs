import React from 'react'
export function Modal({ open, title, closeLabel, onClose, children, footer }) {
  return open ? React.createElement('div', { role: 'dialog', 'aria-label': title }, React.createElement('button', { 'aria-label': closeLabel, onClick: onClose }, closeLabel), children, footer) : null
}
const Icon = props => React.createElement('svg', { ...props, 'aria-hidden': true })
export const IconTriangleRightFillRegular = Icon, IconCheckOutlineRegular = Icon, IconNewChatOutlineRegular = Icon, IconClockOutlineRegular = Icon, IconRefreshOutlineRegular = Icon, IconEditOutlineRegular = Icon
