import { types } from 'node:util';
import type { CompileIssue, CompileIssueCode, DefinitionPath, DagDefinition, NodeDefinition, EdgeDefinition, Schema, TypeDescriptor } from './types.js';
import { CompileError } from './errors.js';
import { parse, type Expression, type Operand } from './expression.js';
import { put } from './data.js';

export interface Vertex {
  definition: NodeDefinition | DagDefinition;
  path: DefinitionPath;
  input: Schema;
  output: Schema;
  plan?: Plan;
}
export interface Edge {
  definition: EdgeDefinition;
  path: DefinitionPath;
  from: string;
  to: string;
  condition?: Expression;
  iteration?: Expression;
  itemSchema?: Schema;
}
export interface Plan {
  vertex: Vertex;
  positions: Map<string, Vertex>;
  edges: Edge[];
  incoming: Map<string, Edge[]>;
  outgoing: Map<string, Edge[]>;
  effective: Map<string, Schema>;
}
export function cloneDefinition<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value)) put(result as Record<string, unknown>, key, cloneDefinition((value as Record<string, unknown>)[key]));
  return result as T;
}
export function compilePlan(source: unknown, rootProvider?: Schema): Vertex {
  const issues: CompileIssue[] = [];
  const issue = (code: CompileIssueCode, path: DefinitionPath, message: string): void => { issues.push({ code, path: [...path], message }); };
  const stack = new Set<object>();
  function json(value: unknown, path: DefinitionPath): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || types.isProxy(value) || stack.has(value)) { issue('INVALID_JSON_VALUE', path, 'Definition must contain finite JSON values without cycles or proxies'); return null; }
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) { issue('INVALID_JSON_VALUE', path, 'Definition container must be a JSON object'); return null; }
    stack.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length) issue('INVALID_JSON_VALUE', path, 'Symbol keys are not JSON');
    const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(descriptors)) {
      if (Array.isArray(value) && key === 'length') continue;
      const p = [...path, Array.isArray(value) && /^(0|[1-9][0-9]*)$/.test(key) ? Number(key) : key];
      if (!('value' in descriptors[key]!)) { issue('INVALID_JSON_VALUE', p, 'Accessors are not JSON data'); continue; }
      put(result as Record<string, unknown>, key, json(descriptors[key]!.value, p));
    }
    if (Array.isArray(value)) {
      const length = descriptors.length!.value as number;
      for (let i = 0; i < length; i++) if (!Object.hasOwn(descriptors, i)) issue('INVALID_JSON_VALUE', [...path, i], 'Sparse arrays are not JSON');
    }
    stack.delete(value); return result;
  }
  const definition = json(source, []);
  const ids = new Map<string, DefinitionPath>();
  const plans: Plan[] = [];
  const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  function schema(v: unknown, path: DefinitionPath): Schema | undefined {
    if (!object(v)) { issue('INVALID_SCHEMA', path, 'Schema must be an object'); return; }
    let valid = true;
    for (const key of Object.keys(v)) if (!descriptor(v[key], [...path, key])) valid = false;
    return valid ? v as Schema : undefined;
  }
  function descriptor(v: unknown, path: DefinitionPath): boolean {
    if (v === 'string' || v === 'number' || v === 'boolean') return true;
    if (object(v) && v.type === 'object') return schema(v.properties, [...path, 'properties']) !== undefined;
    if (object(v) && v.type === 'array') return descriptor(v.items, [...path, 'items']);
    issue('INVALID_SCHEMA', path, 'Expected primitive, object with properties, or array with items'); return false;
  }
  function entity(v: unknown, path: DefinitionPath, root = false): Vertex | Edge | undefined {
    if (!object(v)) { issue('INVALID_DEFINITION', path, 'Entity must be an object'); return; }
    if (!Object.hasOwn(v, 'type')) { issue('MISSING_STANDARD_FIELD', [...path, 'type'], 'Missing entity type'); return; }
    if (!['node', 'dag', 'edge'].includes(v.type as string)) { issue('INVALID_STANDARD_FIELD', [...path, 'type'], 'Entity type must be node, dag or edge'); return; }
    if (root && v.type !== 'dag') { issue('INVALID_DEFINITION', [...path, 'type'], 'Root must be a DAG'); return; }
    let valid = true;
    function standard(key: string, kind: string, required: boolean): void {
      if (!Object.hasOwn(v!, key)) { if (required) { issue('MISSING_STANDARD_FIELD', [...path, key], `Missing ${key}`); valid = false; } }
      else if (typeof (v as Record<string, unknown>)[key] !== kind) { issue('INVALID_STANDARD_FIELD', [...path, key], `${key} must be ${kind}`); valid = false; }
    }
    standard('id', 'string', v.type !== 'edge');
    if (typeof v.id === 'string') {
      if (ids.has(v.id)) issue('DUPLICATE_ID', [...path, 'id'], `Duplicate ID ${v.id}`);
      else ids.set(v.id, path);
    }
    if (v.type === 'edge') {
      standard('from', 'string', true); standard('to', 'string', true);
      standard('if', 'string', false); standard('for', 'string', false);
      if (!valid) return;
      const edge: Edge = { definition: v as EdgeDefinition, path, from: v.from as string, to: v.to as string };
      for (const key of ['if', 'for'] as const) if (Object.hasOwn(v, key)) {
        const expression = parse(v[key] as string, key === 'for');
        if (!expression) issue('INVALID_EXPRESSION', [...path, key], 'Invalid expression grammar');
        else if (key === 'if') edge.condition = expression; else edge.iteration = expression;
      }
      return edge;
    }
    const input = Object.hasOwn(v, 'input_schema') ? schema(v.input_schema, [...path, 'input_schema']) : {};
    const output = Object.hasOwn(v, 'output_schema') ? schema(v.output_schema, [...path, 'output_schema']) : {};
    const vertex: Vertex = { definition: v as NodeDefinition | DagDefinition, path, input: input ?? {}, output: output ?? {} };
    if (v.type === 'dag') {
      if (!Array.isArray(v.dag)) { issue(Object.hasOwn(v, 'dag') ? 'INVALID_STANDARD_FIELD' : 'MISSING_STANDARD_FIELD', [...path, 'dag'], 'DAG requires an entity array'); return valid ? vertex : undefined; }
      const plan: Plan = { vertex, positions: new Map(), edges: [], incoming: new Map(), outgoing: new Map(), effective: new Map() };
      vertex.plan = plan; plans.push(plan);
      v.dag.forEach((child, i) => {
        const result = entity(child, [...path, 'dag', i]);
        if (result && 'from' in result) plan.edges.push(result);
        else if (result) plan.positions.set(result.definition.id, result);
      });
    }
    return valid ? vertex : undefined;
  }
  const root = entity(definition, [], true);
  // Structural faults make dependent analysis unreliable. Keep independently parsed diagnostics.
  if (!root || 'from' in root) throw new CompileError(issues);
  const structuralPaths = issues.filter(i => i.code !== 'INVALID_EXPRESSION' && i.code !== 'INVALID_SCHEMA').map(i => i.path);
  const schemasValid = !issues.some(i => i.code === 'INVALID_SCHEMA');
  function compatible(source: TypeDescriptor, target: TypeDescriptor): boolean {
    if (typeof source === 'string' || typeof target === 'string') return source === target;
    if (source.type !== target.type) return false;
    if (source.type === 'array' && target.type === 'array') return compatible(source.items, target.items);
    if (source.type === 'object' && target.type === 'object') return Object.keys(target.properties).every(k => Object.hasOwn(source.properties, k) && compatible(source.properties[k]!, target.properties[k]!));
    return false;
  }
  function merge(schemas: Schema[], code: CompileIssueCode, path: DefinitionPath): Schema {
    const result: Schema = {};
    for (const s of schemas) for (const key of Object.keys(s)) {
      if (Object.hasOwn(result, key)) issue(code, path, `Conflicting declared field ${key}`);
      else put(result, key, s[key]);
    }
    return result;
  }
  function covers(source: Schema, target: Schema, path: DefinitionPath, output = false): void {
    for (const key of Object.keys(target)) {
      if (!Object.hasOwn(source, key)) issue(output ? 'INCOMPLETE_OUTPUT_SCHEMA' : 'MISSING_INPUT_PROVIDER', [...path, key], `No declared provider for ${key}`);
      else if (!compatible(source[key]!, target[key]!)) issue('SCHEMA_TYPE_MISMATCH', [...path, key], `Incompatible or incomplete declaration for ${key}`);
    }
  }
  if (schemasValid && rootProvider !== undefined) covers(rootProvider, root.input, [...root.path, 'input_schema']);
  for (const plan of plans) {
    const ownId = plan.vertex.definition.id;
    if (plan.edges.some(e => e.from === ownId || e.to === ownId)) plan.positions.set(ownId, plan.vertex);
    for (const id of plan.positions.keys()) { plan.incoming.set(id, []); plan.outgoing.set(id, []); }
    const pairs = new Map<string, Set<string>>();
    let endpointsValid = true;
    for (const edge of plan.edges) {
      for (const side of ['from', 'to'] as const) if (!plan.positions.has(edge[side])) {
        issue(ids.has(edge[side]) ? 'INVALID_ENDPOINT' : side === 'from' ? 'UNKNOWN_SOURCE' : 'UNKNOWN_TARGET', [...edge.path, side], 'Endpoint must be a direct vertex or current DAG'); endpointsValid = false;
      }
      const targets = pairs.get(edge.from) ?? new Set<string>();
      if (targets.has(edge.to)) issue('DUPLICATE_EDGE', edge.path, 'Repeated endpoint pair');
      targets.add(edge.to); pairs.set(edge.from, targets);
      plan.incoming.get(edge.to)?.push(edge); plan.outgoing.get(edge.from)?.push(edge);
      if (edge.to === ownId && !Object.hasOwn(edge.definition, 'if')) issue('RECURSION_WITHOUT_CONDITION', [...edge.path, 'if'], 'Recursive input edge requires if');
    }
    if (plan.positions.has(ownId) && !plan.incoming.get(ownId)!.length) issue('RECURSION_WITHOUT_INPUT', plan.vertex.path, 'Recursive position must have an input edge');
    for (const [id, vertex] of plan.positions) {
      const fors = plan.incoming.get(id)!.filter(e => Object.hasOwn(e.definition, 'for'));
      if (fors.length > 1) issue('MULTIPLE_FOR_EDGES', vertex.path, 'Target accepts at most one for edge');
      const effective: Schema = {};
      for (const key of Object.keys(vertex.output)) put(effective, key, fors.length ? { type: 'array', items: vertex.output[key]! } : vertex.output[key]);
      plan.effective.set(id, effective);
    }
    if (!endpointsValid || structuralPaths.some(path => plan.vertex.path.every((part, i) => path[i] === part))) continue;
    const degree = new Map([...plan.incoming].map(([id, es]) => [id, es.length]));
    const queue = [...degree].filter(([, n]) => n === 0).map(([id]) => id);
    for (let i = 0; i < queue.length; i++) for (const e of plan.outgoing.get(queue[i]!)!) {
      const n = degree.get(e.to)! - 1; degree.set(e.to, n); if (!n) queue.push(e.to);
    }
    if (queue.length !== plan.positions.size) issue('CYCLIC_DEPENDENCY', plan.vertex.path, 'Dependency plan contains a cycle');
    if (!schemasValid) continue;
    for (const edge of plan.edges) {
      const source = plan.effective.get(edge.from)!;
      const operandType = (o: Operand, key: string): TypeDescriptor | undefined => {
        if ('literal' in o) return typeof o.literal as 'string' | 'number' | 'boolean';
        if (!Object.hasOwn(source, o.field)) { issue('INVALID_FIELD_REFERENCE', [...edge.path, key], `Undeclared field ${o.field}`); return; }
        return source[o.field];
      };
      if (edge.condition) {
        const left = operandType(edge.condition.left, 'if');
        const right = edge.condition.right ? operandType(edge.condition.right, 'if') : undefined;
        if (left && (edge.condition.operator ? right && (typeof left !== 'string' || left !== right) : left !== 'boolean')) issue('EXPRESSION_TYPE_MISMATCH', [...edge.path, 'if'], 'Condition requires boolean or matching scalars');
      }
      if (edge.iteration) {
        const value = operandType(edge.iteration.left, 'for');
        if (value && (typeof value === 'string' || value.type !== 'array' || typeof value.items === 'string' || value.items.type !== 'object' || !Object.hasOwn(value.items.properties, 'key') || value.items.properties.key !== 'string')) issue('EXPRESSION_TYPE_MISMATCH', [...edge.path, 'for'], 'for requires object array with string key');
        else if (value && typeof value !== 'string' && value.type === 'array' && typeof value.items !== 'string' && value.items.type === 'object') {
          edge.itemSchema = {}; for (const k of Object.keys(value.items.properties)) if (k !== 'key') put(edge.itemSchema, k, value.items.properties[k]);
        }
      }
    }
    for (const [id, vertex] of plan.positions) {
      const incoming = plan.incoming.get(id)!;
      if (incoming.filter(e => Object.hasOwn(e.definition, 'for')).length > 1 || incoming.some(e => Object.hasOwn(e.definition, 'for') && !e.itemSchema)) continue;
      const sources = incoming.length ? incoming.map(e => e.iteration ? e.itemSchema! : plan.effective.get(e.from)!) : [plan.vertex.input];
      covers(merge(sources, 'INPUT_SCHEMA_KEY_CONFLICT', [...vertex.path, 'input_schema']), vertex.input, [...vertex.path, 'input_schema']);
    }
    const exits = [...plan.positions].filter(([id]) => !plan.outgoing.get(id)!.length).map(([id]) => plan.effective.get(id)!);
    covers(merge(exits, 'OUTPUT_SCHEMA_KEY_CONFLICT', [...plan.vertex.path, 'output_schema']), plan.vertex.output, [...plan.vertex.path, 'output_schema'], true);
  }
  if (issues.length) throw new CompileError(issues);
  return root;
}
