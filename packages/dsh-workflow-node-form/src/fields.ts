import type { NodeDefinition, NodeValue } from 'dsh-workflow-node/contract'

export type Field = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  title?: string
  description?: string
  default?: NodeValue
  enum?: NodeValue[]
  widget?: string
  properties?: Record<string, Field>
  items?: Field
}
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const primitive = (value: unknown): value is 'string' | 'number' | 'boolean' => value === 'string' || value === 'number' || value === 'boolean'

export function validateValue(field: Field, value: unknown, path: string): void {
  if (field.type === 'object') {
    if (!object(value)) throw new Error(`Invalid form value for ${path}: expected object`)
    for (const key of Object.keys(value)) if (!Object.hasOwn(field.properties!, key)) throw new Error(`Unknown form field ${path}.${key}`)
    for (const [key, child] of Object.entries(field.properties!)) {
      if (!Object.hasOwn(value, key)) throw new Error(`Missing form value for ${path}.${key}`)
      validateValue(child, value[key], `${path}.${key}`)
    }
  } else if (field.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`Invalid form value for ${path}: expected array`)
    for (let index = 0; index < value.length; index++) validateValue(field.items!, value[index], `${path}[${index}]`)
  } else {
    if (typeof value !== field.type || (field.type === 'number' && !Number.isFinite(value))) throw new Error(`Invalid form value for ${path}: expected ${field.type}`)
    if (field.enum && !field.enum.includes(value as NodeValue)) throw new Error(`Value for ${path} is outside enum`)
  }
}

function parseField(contract: unknown, annotation: unknown, ui: unknown, path: string): Field {
  const type = primitive(contract) ? contract : object(contract) ? contract.type : undefined
  if (!primitive(type) && type !== 'object' && type !== 'array') throw new Error(`Unsupported form type for ${path}`)
  const allowed = ['type', 'title', 'description', 'default', ...(type === 'object' ? ['properties'] : type === 'array' ? ['items'] : ['enum'])]
  if (!object(annotation) || Object.keys(annotation).some(key => !allowed.includes(key))) throw new Error(`Unsupported schema for ${path}`)
  if (!object(ui)) throw new Error(`Unsupported uiSchema for ${path}`)
  if (annotation.type !== undefined && annotation.type !== type) throw new Error(`Schema type conflicts with output_schema for ${path}`)
  for (const key of ['title', 'description']) if (annotation[key] !== undefined && typeof annotation[key] !== 'string') throw new Error(`${path}.${key} must be a string`)
  const field: Field = { type, ...annotation }
  if (type === 'object') {
    if (!object(contract) || !object(contract.properties)) throw new Error(`Invalid object declaration for ${path}`)
    if (annotation.properties !== undefined && !object(annotation.properties)) throw new Error(`Invalid properties for ${path}`)
    field.properties = parseProperties(contract.properties, annotation.properties ?? {}, ui, path)
  } else if (type === 'array') {
    if (!object(contract) || !Object.hasOwn(contract, 'items')) throw new Error(`Invalid array declaration for ${path}`)
    if (Object.keys(ui).some(key => key !== 'items')) throw new Error(`Unsupported uiSchema for ${path}`)
    field.items = parseField(contract.items, Object.hasOwn(annotation, 'items') ? annotation.items : {}, Object.hasOwn(ui, 'items') ? ui.items : {}, `${path}[]`)
  } else {
    if (Object.keys(ui).some(key => key !== 'ui:widget')) throw new Error(`Unsupported uiSchema for ${path}`)
    if (annotation.enum !== undefined && (!Array.isArray(annotation.enum) || !annotation.enum.length || !annotation.enum.every(value => typeof value === type && (type !== 'number' || Number.isFinite(value))))) throw new Error(`Invalid enum for ${path}`)
    const widget = ui['ui:widget']
    if (widget !== undefined && !((widget === 'select' && field.enum) || (type === 'string' && (widget === 'text' || widget === 'textarea')) || (type === 'number' && widget === 'updown') || (type === 'boolean' && widget === 'checkbox'))) throw new Error(`unsupported widget for ${path}`)
    if (typeof widget === 'string') field.widget = widget
  }
  if (Object.hasOwn(annotation, 'default')) {
    try { validateValue(field, annotation.default, path) }
    catch (error) { throw new Error(`Invalid default: ${(error as Error).message}`) }
  }
  return field
}

function parseProperties(contract: Record<string, unknown>, annotations: unknown, ui: unknown, path: string): Record<string, Field> {
  if (!object(annotations) || !object(ui)) throw new Error(`Invalid form properties for ${path}`)
  for (const key of [...Object.keys(annotations), ...Object.keys(ui)]) if (!Object.hasOwn(contract, key)) throw new Error(`Unknown form field ${path}.${key}`)
  return Object.fromEntries(Object.entries(contract).map(([key, type]) => [key, parseField(type, Object.hasOwn(annotations, key) ? annotations[key] : {}, Object.hasOwn(ui, key) ? ui[key] : {}, `${path}.${key}`)]))
}

export function formFields(node: NodeDefinition): Record<string, Field> {
  const output = node.output_schema ?? {}
  if (!object(output)) throw new Error(`Node ${node.id}: output_schema must be an object`)
  if (node.schema !== undefined && (!object(node.schema) || Object.keys(node.schema).some(key => key !== 'properties') || !object(node.schema.properties))) throw new Error(`Node ${node.id}: schema must contain properties`)
  return parseProperties(output, object(node.schema) ? node.schema.properties : {}, node.uiSchema === undefined ? {} : node.uiSchema, node.id)
}

export function matchesContract(field: Field, contract: unknown): boolean {
  if (field.type === 'array') return object(contract) && contract.type === 'array' && matchesContract(field.items!, contract.items)
  if (field.type === 'object') {
    if (!object(contract) || contract.type !== 'object' || !object(contract.properties)) return false
    const properties = contract.properties
    return Object.keys(properties).length === Object.keys(field.properties!).length && Object.entries(field.properties!).every(([key, child]) => Object.hasOwn(properties, key) && matchesContract(child, properties[key]))
  }
  return field.type === contract
}
