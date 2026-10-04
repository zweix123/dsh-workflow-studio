import { node } from './server.js'
export const name = '@example/workflow-joint'
export const inject = ['workflowNodes']
export function apply(ctx) { ctx.workflowNodes.register(ctx, name, node) }
