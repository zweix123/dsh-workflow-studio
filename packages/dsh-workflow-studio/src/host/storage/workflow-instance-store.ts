import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

const executionSchema = z.object({
  kind: z.enum(['chat', 'bash']),
  status: z.enum(['running', 'chat', 'succeeded', 'failed', 'unknown']),
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  sessionCreated: z.boolean().optional(),
  promptStarted: z.boolean().optional(),
  error: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  exitCode: z.number().nullable().optional(),
}).strict()

const instanceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  templateId: z.string(),
  createdAt: z.iso.datetime(),
  revision: z.number().int().nonnegative().optional(),
  definition: z.json(),
  input: z.json(),
  snapshot: z.json(),
  state: z.json().optional(),
  drawerWidth: z.number().positive().finite().optional(),
  executions: z.record(z.string(), executionSchema).optional(),
}).strict()

export const workflowInstanceDomain = defineDomain({
  name: 'dsh_workflow_studio',
  version: 1,
  tables: { instances: domainTable<string, z.infer<typeof instanceSchema>>(instanceSchema) },
})

export type StoredInstance = z.infer<typeof instanceSchema>

export class WorkflowInstanceStore {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly domain: Domain<typeof workflowInstanceDomain>) {}

  entries(): IterableIterator<[string, StoredInstance]> {
    return this.domain.table('instances').entries()
  }

  get(id: string): StoredInstance | undefined {
    return this.domain.table('instances').get(id)
  }

  async save(row: StoredInstance): Promise<StoredInstance> {
    const updated = { ...row, revision: (this.get(row.id)?.revision ?? 0) + 1 }
    await this.domain.table('instances').put(row.id, updated)
    return updated
  }

  delete(id: string): Promise<boolean> {
    return this.domain.table('instances').delete(id)
  }

  serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work)
    this.tail = result.catch(() => {})
    return result
  }

  close(): Promise<void> {
    return this.tail.then(() => this.domain.close())
  }
}
