import { validateTextTemplate, renderTextTemplate } from '../../dsh-workflow-studio/src/contract/node/text-template.js'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { ServerNode, NodeFact, NodeContext } from '../../dsh-workflow-studio/src/contract/node/index.js'

interface Result { ok: boolean; stdout: string; stderr: string; exitCode: number | null; error?: string; stdoutTruncated?: boolean }

async function execute(command: string, workspaceId: string, services: NodeContext['services']): Promise<Result> {
  if (!command.trim()) return { ok: true, stdout: '', stderr: '', exitCode: 0 }
  const workspace = services.workspaceRegistry.get(WorkspaceId(workspaceId))
  if (!workspace) throw new Error('Workspace no longer exists')
  const policy = { ...services.sandboxPolicy.resolve(), workspaceRoot: workspace.path }
  if (!services.shell.sandboxMode || policy.mode === 'danger-full-access') throw new Error('Sandbox execution is unavailable')
  const spec = services.shell.resolve({ command, workdir: workspace.path, sandboxPolicy: policy })
  if (!spec.sandboxPolicy || spec.sandboxPolicy.mode === 'danger-full-access') throw new Error('Sandbox execution is unavailable')
  const outcome = await (await services.shell.execute(spec)).result()
  const result = { stdout: outcome.stdout.text, stderr: outcome.stderr.text, exitCode: outcome.exitCode, stdoutTruncated: outcome.stdout.truncated }
  if (outcome.exitCode !== 0 || outcome.signal || outcome.timedOut || outcome.aborted || outcome.sandbox?.denied || outcome.sandbox?.runnerFailed || !outcome.sandbox || outcome.sandbox.mode === 'danger-full-access') {
    const reason = outcome.sandbox?.denied ? 'Sandbox denied the command' : outcome.sandbox?.runnerFailed ? 'Sandbox runner failed'
      : !outcome.sandbox || outcome.sandbox.mode === 'danger-full-access' ? 'Sandbox execution was unavailable'
        : outcome.timedOut ? 'Command timed out' : outcome.aborted ? 'Command was interrupted' : `Command exited with code ${outcome.exitCode}`
    return { ...result, ok: false, error: reason }
  }
  return { ...result, ok: true }
}

function start(context: NodeContext): { fact: NodeFact; run?: () => Promise<NodeFact> } {
  const command = renderTextTemplate(context.definition.command as string, context.input, true)
  if (context.fact?.status === 'succeeded') return { fact: context.fact }
  if (context.fact?.status === 'running') throw new Error('Node is already running')
  if (!command.trim() && !Object.keys(context.definition.output_schema ?? {}).length) return { fact: { kind: 'bash', status: 'succeeded', output: {}, business: { stdout: '', stderr: '', exitCode: 0 } } }
  return {
    fact: { kind: 'bash', status: 'running' },
    run: async () => {
      const result = await execute(command, context.workspaceId, context.services)
      if (!result.ok) return { kind: 'bash', status: 'failed', business: result as unknown as NodeFact['business'], error: result.error }
      try {
        let output = {}
        if (Object.keys(context.definition.output_schema ?? {}).length) {
          if (result.stdoutTruncated) throw new Error('stdout was truncated; a complete JSON result is required')
          let parsed: unknown
          try { parsed = JSON.parse(result.stdout) }
          catch { throw new Error('stdout must contain one complete JSON object') }
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('stdout JSON must be an object')
          output = context.validateOutput(parsed)
        }
        return { kind: 'bash', status: 'succeeded', business: result as unknown as NodeFact['business'], output }
      } catch (error) {
        return { kind: 'bash', status: 'failed', business: result as unknown as NodeFact['business'], error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export const bashNode: ServerNode = {
  kind: 'bash',
  requires: ['workspaceRegistry', 'shell', 'sandboxPolicy'],
  validate(node) {
    if (typeof node.command !== 'string') throw new Error(`Node ${node.id}: command must be a string`)
    validateTextTemplate(node, 'command')
    if (node.is_auto_start !== undefined && typeof node.is_auto_start !== 'boolean') throw new Error(`Node ${node.id}: is_auto_start must be a boolean`)
  },
  ready(context) { return context.definition.is_auto_start === true && !context.fact ? start(context) : undefined },
  action(context, name, payload) {
    if (name !== 'start' || payload === null || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) throw new Error('Unsupported bash action')
    return start(context)
  },
  recover(fact) { return fact.status === 'running' ? { ...fact, status: 'unknown', error: 'Previous command result is unknown; run it again only if safe.' } : fact },
  project(fact) { return (fact.business ?? {}) as Record<string, never> },
  blocksDeletion(_fact, active) { return active },
}
