import type {} from '@deepseek-ai/dsh-client-locale/client'
import React, { type FormEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { en, zh } from './locales.js'
import type { ClientNode, NodeViewProps } from 'dsh-workflow-node/ui'
import type { NodeData, NodeValue } from 'dsh-workflow-node/contract'

type Field = { type: string; title?: string; description?: string; default?: NodeValue; enum?: NodeValue[]; widget?: string }
function fields(definition: NodeViewProps['definition']): Record<string, Field> {
  const properties = (definition.schema as { properties?: Record<string, Field> } | undefined)?.properties ?? {}
  const ui = (definition.uiSchema ?? {}) as Record<string, { 'ui:widget'?: string }>
  return Object.fromEntries(Object.entries(definition.output_schema ?? {}).map(([key, type]) => [key, { ...properties[key], type, widget: ui[key]?.['ui:widget'] }])) as Record<string, Field>
}
function initial(props: NodeViewProps): { values: NodeData; errors: string[] } {
  const values: NodeData = Object.create(null)
  const errors: string[] = []
  for (const [key, field] of Object.entries(fields(props.definition))) {
    if (Object.hasOwn(props.input, key)) {
      const value = props.input[key]
      if (typeof value !== field.type) errors.push(key)
      else values[key] = value
    } else if (Object.hasOwn(field, 'default')) values[key] = field.default!
  }
  return { values, errors }
}

function FormPanel(props: NodeViewProps) {
  const formId = React.useId()
  const resolved = initial(props)
  const values = props.output ?? props.draft ?? resolved.values
  const completed = Boolean(props.output)
  const set = (key: string, value: NodeValue | undefined) => {
    const next = { ...values }
    if (value === undefined) delete next[key]
    else next[key] = value
    props.setDraft(next)
  }
  const submit = (event: FormEvent) => { event.preventDefault(); props.action('submit', values) }
  return <form className="dsh-workflow-form" onSubmit={submit}>
    {resolved.errors.length > 0 && !props.draft && !completed && <p role="alert">{props.t('formPrefillInvalid')}: {resolved.errors.join(', ')}</p>}
    {Object.entries(fields(props.definition)).map(([key, field]) => {
      const value = values[key]
      const label = field.title ?? key
      return <div className="dsh-workflow-form-field" key={key}>
        <label htmlFor={`${formId}-${key}`}>{label}</label>
        {field.description && <small>{field.description}</small>}
        {field.enum ? <select id={`${formId}-${key}`} disabled={completed || props.pending} value={Object.hasOwn(values, key) ? String(field.enum.findIndex(option => option === value)) : ''} onChange={event => set(key, field.enum![Number(event.target.value)])}>
          <option value="" disabled>{props.t('formChoose')}</option>{field.enum.map((option, index) => <option key={index} value={index}>{String(option)}</option>)}
        </select> : field.type === 'boolean' ? <input id={`${formId}-${key}`} type="checkbox" role="switch" disabled={completed || props.pending} checked={value === true} onChange={event => set(key, event.target.checked)} />
          : field.widget === 'textarea' ? <textarea id={`${formId}-${key}`} disabled={completed || props.pending} value={typeof value === 'string' ? value : ''} onChange={event => set(key, event.target.value)} />
            : <input id={`${formId}-${key}`} type={field.type === 'number' ? 'number' : 'text'} disabled={completed || props.pending} value={value === undefined ? '' : String(value)} onChange={event => set(key, field.type === 'number' ? (event.target.value === '' ? undefined : Number(event.target.value)) : event.target.value)} />}
      </div>
    })}
    {completed ? <><p role="status">{props.t('formSubmitted')}</p></>
      : <button type="submit" disabled={props.pending || !props.ready}>{props.t('formSubmit')}</button>}
    {props.execution?.error && <p role="alert">{props.execution.error}</p>}
  </form>
}

export const formClient: ClientNode = {
  kind: 'form',
  Panel: FormPanel,
}

export const name = '@dsh-workflow/node-form'
export const inject = ['workflowNodeViews', 'locale']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  ctx.workflowNodeViews.register(ctx, name, formClient)
}
