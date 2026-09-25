import { compile, CompileError, SubmissionError, type DagDefinition, type DataMap } from '../src/host/dag/index.js';
const definition: DagDefinition = {
  id: 'root', type: 'dag', dag: [], config: { name: 'extension' },
  input_schema: { records: { type: 'array', items: { type: 'object', properties: { name: 'string' } } } },
};
const program = compile(definition);
const execution = program.createExecution({ anything: new Date() } satisfies DataMap);
const result = execution.getResult();
if (result.status === 'completed') result.output;
else {
  // @ts-expect-error Running executions have no output.
  result.output;
}
for (const instance of execution.getSnapshot().instances) {
  if (instance.status === 'completed') instance.output satisfies DataMap;
  if (instance.type === 'node' && instance.status === 'ready') instance.output satisfies undefined;
}
const bad: DagDefinition = { id: 'bad', type: 'dag', dag: [], input_schema: {
  // @ts-expect-error Structural types require properties/items.
  data: 'object',
} };
const badExtension: DagDefinition = { id: 'bad', type: 'dag', dag: [],
  // @ts-expect-error Definition extensions must be JSON.
  handler: () => {},
};
void bad; void badExtension;
function errors(error: unknown) {
  if (error instanceof CompileError) error.issues[0]?.path;
  if (error instanceof SubmissionError) {
    error.operation satisfies 'submit'; error.submittedInstanceId satisfies string;
    error.location.forItem?.index;
  }
}
void errors;
