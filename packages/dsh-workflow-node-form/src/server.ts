import { NodeInputError, type NodeData, type NodeDefinition, type NodeFact, type NodeValue, type ServerNode } from '../../dsh-workflow-studio/src/contract/node/index.js'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const primitive = (value: unknown): value is 'string' | 'number' | 'boolean' => value === 'string' || value === 'number' || value === 'boolean'
const matches = (value: unknown, type: string): boolean => typeof value === type && (type !== 'number' || Number.isFinite(value))

export function formFields(node: NodeDefinition): Record<string, { type: string; title?: string; description?: string; default?: NodeValue; enum?: NodeValue[]; widget?: string }> {
  const output = node.output_schema ?? {}
  if (!object(output)) throw new Error(`Node ${node.id}: output_schema must be an object`)
  if (node.schema !== undefined && (!object(node.schema) || Object.keys(node.schema).some(key => key !== 'properties') || !object(node.schema.properties))) throw new Error(`Node ${node.id}: schema must contain properties`)
  if (node.uiSchema !== undefined && !object(node.uiSchema)) throw new Error(`Node ${node.id}: uiSchema must be an object`)
  const annotations = (node.schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}
  const ui = (node.uiSchema ?? {}) as Record<string, unknown>
  for (const key of [...Object.keys(annotations), ...Object.keys(ui)]) if (!Object.hasOwn(output, key)) throw new Error(`Node ${node.id}: unknown form field ${key}`)
  const fields: ReturnType<typeof formFields> = Object.create(null)
  for (const [key, type] of Object.entries(output)) {
    if (!primitive(type)) throw new Error(`Node ${node.id}: unsupported form type for ${key}`)
    const annotation = annotations[key] ?? {}
    const presentation = ui[key] ?? {}
    if (!object(annotation) || Object.keys(annotation).some(name => !['title', 'description', 'default', 'enum', 'type'].includes(name))) throw new Error(`Node ${node.id}: unsupported schema for ${key}`)
    if (!object(presentation) || Object.keys(presentation).some(name => name !== 'ui:widget')) throw new Error(`Node ${node.id}: unsupported uiSchema for ${key}`)
    if (annotation.type !== undefined && annotation.type !== type) throw new Error(`Node ${node.id}: schema type conflicts with output_schema for ${key}`)
    for (const name of ['title', 'description']) if (annotation[name] !== undefined && typeof annotation[name] !== 'string') throw new Error(`Node ${node.id}: ${key}.${name} must be a string`)
    if (annotation.default !== undefined && !matches(annotation.default, type)) throw new Error(`Node ${node.id}: invalid default for ${key}`)
    if (annotation.enum !== undefined && (!Array.isArray(annotation.enum) || !annotation.enum.length || !annotation.enum.every(value => matches(value, type)))) throw new Error(`Node ${node.id}: invalid enum for ${key}`)
    if (annotation.default !== undefined && Array.isArray(annotation.enum) && !annotation.enum.includes(annotation.default)) throw new Error(`Node ${node.id}: default is outside enum for ${key}`)
    const widget = presentation['ui:widget'] as string | undefined
    if (widget !== undefined && !((widget === 'select' && annotation.enum) || (type === 'string' && ['text', 'textarea'].includes(widget)) || (type === 'number' && widget === 'updown') || (type === 'boolean' && widget === 'checkbox'))) throw new Error(`Node ${node.id}: unsupported widget for ${key}`)
    if (widget === 'select' && !annotation.enum) throw new Error(`Node ${node.id}: select requires enum for ${key}`)
    fields[key] = { type, ...(annotation as object), ...(widget ? { widget } : {}) } as typeof fields[string]
  }
  return fields
}

function validateSubmission(node: NodeDefinition, payload: unknown): NodeData {
  if (!object(payload)) throw new NodeInputError('Form submission must be an object')
  const fields = formFields(node)
  if (Object.keys(payload).length !== Object.keys(fields).length) throw new NodeInputError('Form fields do not match output_schema')
  for (const [key, field] of Object.entries(fields)) {
    if (!Object.hasOwn(payload, key) || !matches(payload[key], field.type)) throw new NodeInputError(`Invalid form value for ${key}`)
    if (field.enum && !field.enum.includes(payload[key] as NodeValue)) throw new NodeInputError(`Value for ${key} is outside enum`)
  }
  return payload as NodeData
}

export const formNode: ServerNode = {
  kind: 'form',
  requires: [],
  validate(node) { formFields(node) },
  ready() { return undefined },
  action(context, name, payload) {
    if (context.fact?.status === 'succeeded') {
      if (name === 'retry' && object(payload) && !Object.keys(payload).length) return { fact: context.fact }
      throw new Error('Form has already been submitted')
    }
    if (name !== 'submit') throw new Error('Unsupported form action')
    const output = validateSubmission(context.definition, payload)
    return { fact: { kind: 'form', status: 'succeeded', output, business: { submitted: true } } as NodeFact }
  },
  recover(fact) { return fact },
  project() { return {} },
}
