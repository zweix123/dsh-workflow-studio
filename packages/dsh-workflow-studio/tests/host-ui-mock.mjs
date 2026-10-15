import React from 'react'
export function Modal({ open, title, closeLabel, onClose, children, footer, headless }) {
  return open ? React.createElement('div', { role: 'dialog', 'aria-label': title }, headless ? null : React.createElement('button', { 'aria-label': closeLabel, onClick: onClose }, closeLabel), children, footer) : null
}
const Icon = props => React.createElement('svg', { ...props, 'aria-hidden': true })
export const IconTriangleRightFillRegular = Icon, IconCheckOutlineRegular = Icon, IconNewChatOutlineRegular = Icon, IconClockOutlineRegular = Icon, IconRefreshOutlineRegular = Icon, IconEditOutlineRegular = Icon

export function Button({ variant, size, icon, children, ...props }) {
  return React.createElement('button', { type: 'button', ...props }, icon, children)
}
export function Input(props) { return React.createElement('span', null, React.createElement('input', props)) }
export function Switch({ label, checked, onChange, ...props }) {
  return React.createElement('button', { ...props, type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': checked, onClick: () => onChange(!checked) })
}
export function Checkbox({ label, checked, onChange, disabled }) {
  return React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked, disabled, onChange: event => onChange(event.target.checked) }), React.createElement('span', null, label))
}
export const IconCloseOutlineRegular = Icon, IconPlusOutlineRegular = Icon
