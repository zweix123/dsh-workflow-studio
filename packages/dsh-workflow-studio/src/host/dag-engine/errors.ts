import type { CompileIssue, ExecutionErrorCode, ExecutionPhase, ErrorLocation, DataPath, ErrorSource, InstanceId } from './types.js';

export class CompileError extends Error {
  readonly issues: readonly CompileIssue[];
  constructor(issues: readonly CompileIssue[]) {
    super(issues.map(i => `${i.code}: ${i.message}`).join('\n'));
    this.name = 'CompileError';
    this.issues = issues.map(i => ({ ...i, path: [...i.path] }));
  }
}
export interface Failure {
  code: ExecutionErrorCode;
  phase: ExecutionPhase;
  location: ErrorLocation;
  dataPath?: DataPath;
  sources?: readonly ErrorSource[];
  cause?: unknown;
}
export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly operation: 'createExecution' | 'submit';
  readonly phase: ExecutionPhase;
  readonly location: ErrorLocation;
  readonly dataPath?: DataPath;
  readonly sources?: readonly ErrorSource[];
  override readonly cause?: unknown;
  constructor(operation: 'createExecution' | 'submit', failure: Failure) {
    super(`${failure.code} (${failure.phase})`);
    this.name = 'ExecutionError'; this.operation = operation;
    this.code = failure.code; this.phase = failure.phase; this.location = failure.location;
    if (failure.dataPath !== undefined) this.dataPath = failure.dataPath;
    if (failure.sources !== undefined) this.sources = failure.sources;
    if ('cause' in failure) this.cause = failure.cause;
  }
}
export class InitializationError extends ExecutionError {
  declare readonly operation: 'createExecution';
  constructor(failure: Failure) { super('createExecution', failure); this.name = 'InitializationError'; }
}
export class SubmissionError extends ExecutionError {
  declare readonly operation: 'submit';
  readonly submittedInstanceId: InstanceId;
  constructor(id: InstanceId, failure: Failure) { super('submit', failure); this.name = 'SubmissionError'; this.submittedInstanceId = id; }
}
export class Fault extends Error {
  constructor(readonly failure: Failure) { super(failure.code); }
}
