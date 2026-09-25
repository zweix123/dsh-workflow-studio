import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

export const bashFields = ['command'] as const

export function validateBashNode(node: { id: string; command?: unknown }): void {
  if (typeof node.command !== 'string') throw new Error(`Node ${node.id}: command must be a string`)
}

export function isNoopBash(command: string): boolean {
  return !command.trim()
}

export interface BashResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  error?: string
}

export async function runBashNode({ command, workspaceId, workspaceRegistry, shell, sandboxPolicy }: {
  command: string
  workspaceId: string
  workspaceRegistry: Context['workspaceRegistry']
  shell: Context['shell']
  sandboxPolicy: Context['sandboxPolicy']
}): Promise<BashResult> {
  if (isNoopBash(command)) return { ok: true, stdout: '', stderr: '', exitCode: 0 }

  const workspace = workspaceRegistry.get(WorkspaceId(workspaceId))
  if (!workspace) throw new Error('Workspace no longer exists')
  const policy = { ...sandboxPolicy.resolve(), workspaceRoot: workspace.path }
  if (!shell.sandboxMode || policy.mode === 'danger-full-access') throw new Error('Sandbox execution is unavailable')
  const spec = shell.resolve({ command, workdir: workspace.path, sandboxPolicy: policy })
  if (!spec.sandboxPolicy || spec.sandboxPolicy.mode === 'danger-full-access') throw new Error('Sandbox execution is unavailable')
  const outcome = await shell.run(spec)
  const result = { stdout: outcome.stdout.text, stderr: outcome.stderr.text, exitCode: outcome.exitCode }
  if (outcome.exitCode !== 0 || outcome.signal || outcome.timedOut || outcome.aborted || outcome.sandbox?.denied || outcome.sandbox?.runnerFailed || !outcome.sandbox || outcome.sandbox.mode === 'danger-full-access') {
    const reason = outcome.sandbox?.denied ? 'Sandbox denied the command' : outcome.sandbox?.runnerFailed ? 'Sandbox runner failed'
      : !outcome.sandbox || outcome.sandbox.mode === 'danger-full-access' ? 'Sandbox execution was unavailable'
        : outcome.timedOut ? 'Command timed out' : outcome.aborted ? 'Command was interrupted' : `Command exited with code ${outcome.exitCode}`
    return { ...result, ok: false, error: reason }
  }
  return { ...result, ok: true }
}
