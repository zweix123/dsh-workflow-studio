import { compile } from './dag-engine/index.js'
import type { DagDefinition, ExecutionSnapshot, JsonObject, JsonValue, Schema, TypeDescriptor } from './dag-engine/index.js'

function emptyValue(type: TypeDescriptor): JsonValue {
  if (type === 'string') return ''
  if (type === 'number') return 0
  if (type === 'boolean') return false
  if (type.type === 'array') return []
  return emptyInput(type.properties)
}

function emptyInput(schema: Schema): JsonObject {
  return Object.fromEntries(Object.entries(schema).map(([key, type]) => [key, emptyValue(type)]))
}

export function initializeWorkflow(definition: DagDefinition): { input: JsonObject; snapshot: ExecutionSnapshot } {
  const program = compile(definition)
  const input = emptyInput(program.getDefinition().input_schema ?? {})
  const execution = program.createExecution(input)
  // TODO: Replace this temporary placeholder input with real run input, then execute ready nodes here and submit their outputs to the DAG engine.
  return { input, snapshot: execution.getSnapshot() }
}
