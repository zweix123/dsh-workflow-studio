import type {} from '@deepseek-ai/dsh-client-locale/client'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
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
  if (field.type === 'object') {
    const values = object(value) ? value as DraftObject : {}
    return <fieldset className="dsh-workflow-form-group"><legend>{label}</legend>
      {field.description && <small>{field.description}</small>}
      {Object.entries(field.properties!).map(([key, child]) => <FieldControl key={key} field={child} name={key} value={Object.hasOwn(values, key) ? values[key] : undefined} disabled={disabled} t={t} onChange={next => onChange(replace(values, key, next))} />)}
    </fieldset>
  }
  if (field.type === 'array') {
    const items = Array.isArray(value) ? value : []
    return <fieldset className="dsh-workflow-form-group"><legend>{label}</legend>
      {field.description && <small>{field.description}</small>}
      {items.map((item, index) => <div className="dsh-workflow-form-item" role="group" aria-label={`${label} ${index + 1}`} key={index}>
        <FieldControl field={field.items!} name={String(index + 1)} value={item} disabled={disabled} t={t} onChange={next => onChange(items.map((previous, position) => position === index ? next : previous))} />
        <button type="button" disabled={disabled} aria-label={`${t('formRemove')} ${label} ${index + 1}`} onClick={() => onChange(items.filter((_item, position) => position !== index))}>{t('formRemove')}</button>
      </div>)}
      <button type="button" disabled={disabled} aria-label={`${t('formAdd')} ${label}`} onClick={() => onChange([...items, initialize(field.items!)])}>{t('formAdd')}</button>
    </fieldset>
  }
  return <div className="dsh-workflow-form-field">
    <label htmlFor={id}>{label}</label>
    {field.description && <small>{field.description}</small>}
    {field.enum ? <select id={id} disabled={disabled} value={value === undefined ? '' : String(field.enum.findIndex(option => option === value))} onChange={event => onChange(field.enum![Number(event.target.value)])}>
      <option value="" disabled>{t('formChoose')}</option>{field.enum.map((option, index) => <option key={index} value={index}>{String(option)}</option>)}
    </select> : field.type === 'boolean' ? <input id={id} type="checkbox" role="switch" disabled={disabled} checked={value === true} onChange={event => onChange(event.target.checked)} />
      : field.widget === 'textarea' ? <textarea id={id} disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} />
        : <input id={id} type={field.type === 'number' ? 'number' : 'text'} disabled={disabled} value={value === undefined ? '' : String(value)} onChange={event => onChange(field.type === 'number' ? (event.target.value === '' ? undefined : Number(event.target.value)) : event.target.value)} />}
  </div>
}

const groupStyles = `
.dsh-workflow-form-modal { width: min(600px, 100%); max-height: 100%; }
.dsh-workflow-form-modal-content { min-height: 0; overflow: auto; }

.dsh-workflow-form-group { display: grid; gap: 12px; min-width: 0; margin: 0; padding: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; }
.dsh-workflow-form-group legend { font-weight: 600; padding: 0 4px; overflow-wrap: anywhere; }
.dsh-workflow-form-group small { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-workflow-form-item { display: grid; gap: 8px; min-width: 0; padding-bottom: 10px; border-bottom: 1px solid var(--dsw-alias-border-l3); }
.dsh-workflow-form-group button { justify-self: start; }
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
    <style>{groupStyles}</style>
    {resolved.errors.length > 0 && !props.draft && !completed && <p role="alert">{props.t('formPrefillInvalid')}: {resolved.errors.join(', ')}</p>}
    {Object.entries(fields).map(([key, field]) => <FieldControl key={key} field={field} name={key} value={Object.hasOwn(values, key) ? values[key] : undefined} disabled={completed || props.pending} t={props.t} onChange={value => set(key, value)} />)}
    {completed ? <><p role="status">{props.t('formSubmitted')}</p><button type="button" disabled={props.pending || !props.ready} onClick={() => void props.action('retry', {})}>{props.t('formRetry')}</button></> : <button type="submit" disabled={props.pending || !props.ready}>{props.t('formSubmit')}</button>}
    {(error || props.error || props.execution?.error) && <p role="alert">{error ?? props.error ?? props.execution?.error}</p>}
  </form>
}

function FormInteraction(props: NodeViewProps) {
  const [draft, setDraft] = React.useState<NodeData>()
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { if (props.request) setOpen(true) }, [props.request])
  React.useEffect(() => { if (!props.ready && props.output) setOpen(false) }, [props.ready, props.output])
  return <><style>{groupStyles}</style><Modal className="dsh-workflow-form-modal" contentClassName="dsh-workflow-form-modal-content" open={open && props.active} title={`${props.t('formOpen')} ${props.label}`} closeLabel={props.t('formClose')} onClose={() => setOpen(false)}><FormPanel {...props} draft={draft} setDraft={setDraft} /></Modal></>
}

export const formClient: ClientNode = {
  kind: 'form',
  Panel: ({ output, execution, t }) => <>{output && <p role="status">{t('formSubmitted')}</p>}{execution?.error && <p role="alert">{execution.error}</p>}</>,
  interactions: { fill: FormInteraction },
}

export const name = '@dsh-workflow/node-form'
export const inject = ['workflowNodeViews', 'locale']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  ctx.workflowNodeViews.register(ctx, name, formClient)
}
