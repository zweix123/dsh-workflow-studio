import { compile } from '../dag/index.js'
import type { DagDefinition, ExecutionSnapshot, JsonObject, SavedExecution } from '../dag/index.js'

export function initializeWorkflow(definition: DagDefinition): { input: JsonObject; snapshot: ExecutionSnapshot; state: SavedExecution } {
  const program = compile(definition, {})
  const input = {}
  const execution = program.createExecution(input)
  return { input, snapshot: execution.getSnapshot(), state: execution.exportState() }
}

export function executeWorkflowNode(
  definition: DagDefinition,
  input: JsonObject,
  state: SavedExecution | undefined,
  nodeInstanceId: string,
  output?: JsonObject,
): { snapshot: ExecutionSnapshot; state: SavedExecution } | undefined {
  const program = compile(definition)
  const execution = state ? program.restoreExecution(state) : program.createExecution(input)
  const ready = execution.getFrontier().find(item => item.instanceId === nodeInstanceId)
  if (!ready) return undefined
  execution.submit(nodeInstanceId, output ?? {})
  return { snapshot: execution.getSnapshot(), state: execution.exportState() }
}
