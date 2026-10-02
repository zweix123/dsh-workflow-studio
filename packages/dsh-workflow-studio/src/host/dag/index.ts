export type * from './types.js';
export { CompileError, ExecutionError, InitializationError, SubmissionError } from './errors.js';
import { compilePlan } from './compiler.js';
import { program } from './runtime.js';
import type { Program, Schema } from './types.js';
export function compile(definition: unknown, rootProvider?: Schema): Program { return program(compilePlan(definition, rootProvider)); }
