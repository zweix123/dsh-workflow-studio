import type {} from '@deepseek-ai/dsh-client-locale/client'
import { Button, Checkbox, IconCloseOutlineRegular, IconPlusOutlineRegular, Input, Modal, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import React, { type FormEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { en, zh } from './locales.js'
import type { ClientNode, NodeViewProps } from 'dsh-workflow-node/ui'
import type { NodeData, NodeValue } from 'dsh-workflow-node/contract'

import { formFields, object, validateValue, type Field } from './fields.js'

// Unfilled array scalars exist only in the page draft. Validate before serialization.
type DraftValue = NodeValue | undefined | DraftValue[] | { [key: string]: DraftValue }
type DraftObject = { [key: string]: DraftValue }

function replace(values: DraftObject, key: string, value: DraftValue): DraftObject {
  const next = { ...values }
  if (value === undefined) delete next[key]
  else return { ...values, [key]: value }
  return next
}
function initialize(field: Field): DraftValue {
  if (Object.hasOwn(field, 'default')) return structuredClone(field.default)
  if (field.type === 'array') return []
  if (field.type === 'object') {
    let values: DraftObject = {}
    for (const [key, child] of Object.entries(field.properties!)) values = replace(values, key, initialize(child))
    return values
  }
  return undefined
}
function prefill(field: Field, value: NodeValue, path: string, errors: string[]): DraftValue {
  if (field.type === 'object' && object(value)) {
    return Object.fromEntries(Object.entries(field.properties!).filter(([key]) => Object.hasOwn(value, key)).map(([key, child]) => [key, prefill(child, value[key] as NodeValue, `${path}.${key}`, errors)]))
  }
  if (field.type === 'array' && Array.isArray(value)) return value.map((item, index) => prefill(field.items!, item, `${path}[${index}]`, errors))
  if (field.type === 'object' || field.type === 'array') errors.push(path)
  else if (typeof value !== field.type || (field.type === 'number' && !Number.isFinite(value))) errors.push(path)
  return structuredClone(value)
}
function initial(props: NodeViewProps, fields: Record<string, Field>): { values: DraftObject; errors: string[] } {
  let values: DraftObject = {}
  const errors: string[] = []
  for (const [key, field] of Object.entries(fields)) values = replace(values, key, Object.hasOwn(props.input, key) ? prefill(field, props.input[key]!, key, errors) : initialize(field))
  return { values, errors }
}

function FieldControl({ field, name, value, disabled, t, onChange }: {
  field: Field; name: string; value: DraftValue; disabled: boolean; t: NodeViewProps['t']; onChange: (value: DraftValue) => void
}) {
  const id = React.useId()
  const label = field.title ?? name
  const descriptionId = field.description ? `${id}-description` : undefined
  if (field.type === 'object') {
    const values = object(value) ? value as DraftObject : {}
    return <fieldset className="dsh-workflow-form-group"><legend>{label}</legend>
      {field.description && <small>{field.description}</small>}
      {Object.entries(field.properties!).map(([key, child]) => <FieldControl key={key} field={child} name={key} value={Object.hasOwn(values, key) ? values[key] : undefined} disabled={disabled} t={t} onChange={next => onChange(replace(values, key, next))} />)}
    </fieldset>
  }
  if (field.type === 'array') {
    const items = Array.isArray(value) ? value : []
    if (field.uniqueItems && field.items!.enum) {
      const options = field.items!.enum
      return <fieldset className="dsh-workflow-form-group"><legend id={id}>{label}</legend>
        {field.description && <small>{field.description}</small>}
        {field.widget === 'checkboxes' ? <div className="dsh-workflow-form-options">
          {options.map((option, index) => <Checkbox key={index} label={field.items!.enumNames?.[index] ?? String(option)}
            disabled={disabled} checked={items.includes(option)} onChange={checked => onChange(checked ? items.includes(option) ? items : [...items, option] : items.filter(item => item !== option))} />)}
        </div> : <div className="dsh-workflow-form-field"><select aria-labelledby={id} multiple disabled={disabled}
          value={items.map(item => String(options.indexOf(item as NodeValue)))}
          onChange={event => onChange(Array.from(event.target.selectedOptions, option => options[Number(option.value)]!))}>
          {options.map((option, index) => <option key={index} value={index}>{field.items!.enumNames?.[index] ?? String(option)}</option>)}
        </select></div>}
      </fieldset>
    }
    return <fieldset className="dsh-workflow-form-group"><legend>{label}</legend>
      {field.description && <small>{field.description}</small>}
      {items.map((item, index) => <div className="dsh-workflow-form-item" role="group" aria-label={`${label} ${index + 1}`} key={index}>
        <FieldControl field={field.items!} name={String(index + 1)} value={item} disabled={disabled} t={t} onChange={next => onChange(items.map((previous, position) => position === index ? next : previous))} />
        <Button size="sm" className="dsh-workflow-form-remove" disabled={disabled} aria-label={`${t('formRemove')} ${label} ${index + 1}`} onClick={() => onChange(items.filter((_item, position) => position !== index))}>{t('formRemove')}</Button>
      </div>)}
      <Button size="sm" variant="outline" icon={<IconPlusOutlineRegular size={14} />} disabled={disabled} aria-label={`${t('formAdd')} ${label}`} onClick={() => onChange([...items, initialize(field.items!)])}>{t('formAdd')}</Button>
    </fieldset>
  }
  if (field.type === 'boolean' && !field.enum) return <div className="dsh-workflow-form-toggle">
    <div><span>{label}</span>{field.description && <small>{field.description}</small>}</div>
    <Switch label={label} title={field.description} disabled={disabled} checked={value === true} onChange={onChange} />
  </div>
  return <div className="dsh-workflow-form-field">
    <label htmlFor={id}>{label}</label>
    {field.description && <small id={descriptionId}>{field.description}</small>}
    {field.enum ? <select id={id} aria-describedby={descriptionId} disabled={disabled} value={value === undefined ? '' : String(field.enum.findIndex(option => option === value))} onChange={event => onChange(field.enum![Number(event.target.value)])}>
      <option value="" disabled>{t('formChoose')}</option>{field.enum.map((option, index) => <option key={index} value={index}>{field.enumNames?.[index] ?? String(option)}</option>)}
    </select> : field.widget === 'textarea' ? <textarea id={id} aria-describedby={descriptionId} disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} />
        : <Input id={id} aria-describedby={descriptionId} type={field.type === 'number' ? 'number' : 'text'} disabled={disabled} value={value === undefined ? '' : String(value)} onChange={event => onChange(field.type === 'number' ? (event.target.value === '' ? undefined : Number(event.target.value)) : event.target.value)} />}
  </div>
}

const groupStyles = `
.dsh-workflow-form-modal { width: min(640px, 100%); max-height: 100%; gap: 0; padding: 0; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
.dsh-workflow-form-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 16px 16px 24px; }
.dsh-workflow-form-header h2 { min-width: 0; margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; overflow-wrap: anywhere; }
.dsh-workflow-form-header button { flex: none; width: 28px; padding: 0; color: var(--dsw-alias-label-secondary); }
.dsh-workflow-form { display: flex; flex-direction: column; min-height: 0; }
.dsh-workflow-form-body { display: flex; flex-direction: column; gap: 24px; min-height: 0; padding: 8px 24px 24px; overflow: auto; overscroll-behavior: contain; }
.dsh-workflow-form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-workflow-form-field > label, .dsh-workflow-form-toggle > div > span { font-weight: 500; overflow-wrap: anywhere; }
.dsh-workflow-form small { display: block; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.dsh-workflow-form-field > span { min-width: 0; height: 36px; box-sizing: border-box; padding: 0 12px; background: var(--dsw-alias-bg-layer-3); }
.dsh-workflow-form-field select, .dsh-workflow-form-field textarea { width: 100%; min-width: 0; box-sizing: border-box; padding: 7px 12px; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: inherit; }
.dsh-workflow-form-field textarea { min-height: 112px; resize: vertical; }
.dsh-workflow-form-field select[multiple] { min-height: 112px; }
.dsh-workflow-form-field :is(input, select, textarea):disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dsh-workflow-form-field :is(select, textarea):focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.dsh-workflow-form-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.dsh-workflow-form-toggle > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dsh-workflow-form-group { display: flex; flex-direction: column; gap: 16px; min-width: 0; margin: 0; padding: 16px 0 0; border: 0; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-workflow-form-group legend { max-width: 100%; padding: 0 8px 0 0; font-weight: 500; overflow-wrap: anywhere; }
.dsh-workflow-form-group .dsh-workflow-form-group { padding-left: 12px; border-left: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-workflow-form-item { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-3); }
.dsh-workflow-form-group > button { align-self: flex-start; }
.dsh-workflow-form-remove { align-self: flex-end; color: var(--dsw-alias-label-secondary); }
.dsh-workflow-form-options { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-workflow-form-options label { overflow-wrap: anywhere; }
.dsh-workflow-form-footer { display: flex; flex: none; flex-direction: column; gap: 12px; padding: 16px 24px 24px; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-workflow-form-footer > button { align-self: flex-end; max-width: 100%; white-space: normal; height: auto; min-height: 36px; }
.dsh-workflow-form p { margin: 0; overflow-wrap: anywhere; }
.dsh-workflow-form [role="alert"] { color: var(--dsw-alias-state-error-primary); font-size: 13px; line-height: 20px; max-height: 80px; overflow: auto; }
.dsh-workflow-form [role="status"] { color: var(--dsw-alias-label-secondary); font-size: 13px; }
@media (max-width: 480px) {
  .dsh-workflow-form-header { padding-left: 16px; }
  .dsh-workflow-form-body { padding-right: 16px; padding-left: 16px; }
  .dsh-workflow-form-footer { padding: 16px; }
}
`
function FormPanel(props: NodeViewProps & { draft?: NodeData; setDraft: (draft: NodeData) => void }) {
  const fields = React.useMemo(() => formFields(props.definition), [props.definition])
  const resolved = React.useMemo(() => initial(props, fields), [props.input, fields])
  const values: DraftObject = props.output ?? props.draft ?? resolved.values
  const completed = Boolean(props.output)
  const [error, setError] = React.useState<string>()
  const set = (key: string, value: DraftValue) => {
    // The public draft channel is page-only; incomplete scalars never enter an action.
    props.setDraft(replace(values, key, value) as NodeData)
    setError(undefined)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    try { validateValue({ type: 'object', properties: fields }, values, 'form') }
    catch (error) { setError((error as Error).message); return }
    setError(undefined)
    props.action('submit', values)
  }
  return <form className="dsh-workflow-form" onSubmit={submit}>
    <div className="dsh-workflow-form-body">
      {resolved.errors.length > 0 && !props.draft && !completed && <p role="alert">{props.t('formPrefillInvalid')}: {resolved.errors.join(', ')}</p>}
      {Object.entries(fields).map(([key, field]) => <FieldControl key={key} field={field} name={key} value={Object.hasOwn(values, key) ? values[key] : undefined} disabled={completed || props.pending} t={props.t} onChange={value => set(key, value)} />)}
    </div>
    <div className="dsh-workflow-form-footer">
      {(error || props.error || props.execution?.error) && <p role="alert">{error ?? props.error ?? props.execution?.error}</p>}
      {completed ? <><p role="status">{props.t('formSubmitted')}</p><Button variant="primary" disabled={props.pending || !props.ready} onClick={() => void props.action('retry', {})}>{props.t('formRetry')}</Button></> : <Button variant="primary" type="submit" disabled={props.pending || !props.ready}>{props.t('formSubmit')}</Button>}
    </div>
  </form>
}

function FormInteraction(props: NodeViewProps) {
  const [draft, setDraft] = React.useState<NodeData>()
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { if (props.request) setOpen(true) }, [props.request])
  React.useEffect(() => { if (!props.ready && props.output) setOpen(false) }, [props.ready, props.output])
  const title = `${props.t('formOpen')} ${props.label}`
  return <><style>{groupStyles}</style><Modal headless className="dsh-workflow-form-modal" open={open && props.active} title={title} onClose={() => setOpen(false)}>
    <header className="dsh-workflow-form-header"><h2>{title}</h2>
      <Button size="sm" aria-label={props.t('formClose')} onClick={() => setOpen(false)}><IconCloseOutlineRegular size={14} /></Button>
    </header>
    <FormPanel {...props} draft={draft} setDraft={setDraft} />
  </Modal></>
}

export const formClient: ClientNode = {
  kind: 'form',
  interactions: { fill: FormInteraction },
}

export const name = '@dsh-workflow/node-form'
export const inject = ['workflowNodeViews', 'locale']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  ctx.workflowNodeViews.register(ctx, name, formClient)
}
