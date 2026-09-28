import type { InstanceDetail, InstanceErrorCode } from '../../shared/types/workflow-instance.js'

const errorStatuses: Record<InstanceErrorCode, number> = {
  'invalid-request': 400,
  'invalid-name': 400,
  'duplicate-name': 409,
  'workspace-missing': 404,
  'template-missing': 404,
  'template-invalid': 422,
  'initialization-failed': 422,
  'instance-missing': 404,
  'node-not-ready': 409,
  'submission-failed': 422,
  'instance-incompatible': 409,
  'instance-running': 409,
  'node-running': 409,
  'node-kind-invalid': 409,
  'node-input-invalid': 422,
}

export class WorkflowInstanceError extends Error {
  readonly status: number

  constructor(readonly code: InstanceErrorCode, message: string, readonly latest?: InstanceDetail) {
    super(message)
    this.name = 'WorkflowInstanceError'
    this.status = errorStatuses[code]
  }
}
