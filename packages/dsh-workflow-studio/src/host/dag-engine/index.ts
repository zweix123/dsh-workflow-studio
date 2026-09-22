export type * from './types.js';
export { CompileError, ExecutionError, InitializationError, SubmissionError } from './errors.js';
import { compilePlan } from './compiler.js';
import { program } from './runtime.js';
import type { Program } from './types.js';
export function compile(definition: unknown): Program { return program(compilePlan(definition)); }
