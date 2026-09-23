import { compile } from '../dag-engine/index.js'
import type { DagDefinition, ExecutionSnapshot, JsonObject, JsonValue, SavedExecution, Schema, TypeDescriptor } from '../dag-engine/index.js'

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

export function placeholderOutput(schema: Schema): JsonObject {
  return emptyInput(schema)
}

export function initializeWorkflow(definition: DagDefinition): { input: JsonObject; snapshot: ExecutionSnapshot; state: SavedExecution } {
  const program = compile(definition)
  const input = emptyInput(program.getDefinition().input_schema ?? {})
  const execution = program.createExecution(input)
  return { input, snapshot: execution.getSnapshot(), state: execution.exportState() }
}

export function executeWorkflowNode(
  definition: DagDefinition,
  input: JsonObject,
  state: SavedExecution | undefined,
  nodeInstanceId: string,
): { snapshot: ExecutionSnapshot; state: SavedExecution } | undefined {
  const program = compile(definition)
  const execution = state ? program.restoreExecution(state) : program.createExecution(input)
  const ready = execution.getFrontier().find(item => item.instanceId === nodeInstanceId)
  if (!ready) return undefined
  execution.submit(nodeInstanceId, placeholderOutput(ready.definition.output_schema ?? {}))
  return { snapshot: execution.getSnapshot(), state: execution.exportState() }
}
