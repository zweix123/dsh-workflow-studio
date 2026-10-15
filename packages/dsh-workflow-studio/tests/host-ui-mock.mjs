import React from 'react'
import { createPortal } from 'react-dom'
export function Modal({ open, title, closeLabel, onClose, children, footer, headless }) {
  return open ? React.createElement('div', { role: 'dialog', 'aria-label': title }, headless ? null : React.createElement('button', { 'aria-label': closeLabel, onClick: onClose }, closeLabel), children, footer) : null
}
const Icon = props => React.createElement('svg', { ...props, 'aria-hidden': true })
export const IconTriangleRightFillRegular = Icon, IconCheckOutlineRegular = Icon, IconNewChatOutlineRegular = Icon, IconClockOutlineRegular = Icon, IconRefreshOutlineRegular = Icon, IconEditOutlineRegular = Icon

export function Button({ variant, size, icon, children, ...props }) {
  return React.createElement('button', { type: 'button', ...props }, icon, children)
}
export function Input({ className, ...props }) { return React.createElement('span', { className }, React.createElement('input', props)) }
export function Menu({ open, anchor, items, onSelect, className, listClassName, portal }) {
  const list = open ? React.createElement('div', { role: 'menu', className: listClassName }, items.map(item => React.createElement('button', { type: 'button', role: 'menuitem', key: item.id, onClick: () => onSelect(item.id) }, item.label))) : null
  return React.createElement('span', { className }, anchor, portal && list ? createPortal(list, document.body) : list)
}
export function Switch({ label, checked, onChange, ...props }) {
  return React.createElement('button', { ...props, type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': checked, onClick: () => onChange(!checked) })
}
export function Checkbox({ label, checked, onChange, disabled }) {
  return React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked, disabled, onChange: event => onChange(event.target.checked) }), React.createElement('span', null, label))
}
export const IconCloseOutlineRegular = Icon, IconPlusOutlineRegular = Icon
