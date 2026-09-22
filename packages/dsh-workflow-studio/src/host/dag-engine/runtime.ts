import type { DataMap, Schema, InstanceId, ForItemIdentity, ErrorLocation, ErrorSource, ExecutionPhase, Program, Execution, FrontierItem, ExecutionSnapshot, ExecutionResult } from './types.js';
import type { Vertex, Plan, Edge } from './compiler.js';
import { cloneDefinition } from './compiler.js';
import { copy, fail, put } from './data.js';
import { evaluate } from './expression.js';
import { Fault, InitializationError, SubmissionError, type Failure } from './errors.js';

interface Instance {
  id: InstanceId;
  vertex: Vertex;
  parent: InstanceId | null;
  position?: string;
  forItem?: ForItemIdentity;
  input: DataMap;
  output?: DataMap;
}
interface Position {
  status: 'waiting' | 'created' | 'completed' | 'skipped';
  instances: InstanceId[];
  output?: DataMap;
}
interface EdgeState { status: 'pending' | 'active' | 'inactive'; rows?: { input: DataMap; identity: ForItemIdentity }[] }
interface Frame { id: InstanceId; plan: Plan; positions: Map<string, Position>; edges: Map<Edge, EdgeState> }
interface State { root: InstanceId; next: number; instances: Map<InstanceId, Instance>; frames: Map<InstanceId, Frame> }
interface Source { data: DataMap; schema: Schema; origin: ErrorSource }

// Only records in touched DAG frames are copied. Accepted data and unrelated instances stay shared.
class Transaction {
  readonly instances = new Map<InstanceId, Instance>();
  readonly frames = new Map<InstanceId, Frame>();
  readonly queue: InstanceId[] = [];
  readonly queued = new Set<InstanceId>();
  next: number;
  constructor(readonly base: State) { this.next = base.next; }
  instance(id: InstanceId): Instance | undefined { return this.instances.get(id) ?? this.base.instances.get(id); }
  frame(id: InstanceId): Frame {
    let frame = this.frames.get(id);
    if (!frame) {
      const original = this.base.frames.get(id)!;
      frame = { ...original, positions: new Map([...original.positions].map(([k, p]) => [k, { ...p, instances: [...p.instances] }])), edges: new Map([...original.edges].map(([k, e]) => [k, { ...e }])) };
      this.frames.set(id, frame);
    }
    return frame;
  }
  schedule(id: InstanceId): void { if (!this.queued.has(id)) { this.queue.push(id); this.queued.add(id); } }
  create(vertex: Vertex, input: DataMap, parent: InstanceId | null, position?: string, forItem?: ForItemIdentity): InstanceId {
    const id = `i${this.next++}`;
    const instance: Instance = { id, vertex, input, parent, ...(position === undefined ? {} : { position }), ...(forItem ? { forItem: { ...forItem } } : {}) };
    this.instances.set(id, instance);
    if (vertex.plan) {
      this.frames.set(id, { id, plan: vertex.plan, positions: new Map([...vertex.plan.positions.keys()].map(k => [k, { status: 'waiting', instances: [] }])), edges: new Map(vertex.plan.edges.map(e => [e, { status: 'pending' }])) });
      this.schedule(id);
    }
    return id;
  }
  publish(root: InstanceId): State {
    return { root, next: this.next, instances: new Map([...this.base.instances, ...this.instances]), frames: new Map([...this.base.frames, ...this.frames]) };
  }
}
function location(instance: Instance): ErrorLocation {
  return { definitionPath: [...instance.vertex.path], definitionId: instance.vertex.definition.id, instanceId: instance.id, ...(instance.parent === null ? {} : { parentInstanceId: instance.parent }), ...(instance.forItem ? { forItem: { ...instance.forItem } } : {}) };
}
function targetLocation(frame: Frame, vertex: Vertex, identity?: ForItemIdentity): ErrorLocation {
  return { definitionPath: [...vertex.path], definitionId: vertex.definition.id, parentInstanceId: frame.id, ...(identity ? { forItem: { ...identity } } : {}) };
}
function positionSource(frame: Frame, id: string): Source {
  const position = frame.positions.get(id)!;
  return { data: position.output!, schema: frame.plan.effective.get(id)!, origin: { position: { parentInstanceId: frame.id, definitionId: id }, ...(position.instances.length === 1 && !frame.plan.incoming.get(id)!.some(e => e.iteration) ? { instanceId: position.instances[0]! } : {}) } };
}
function merge(sources: Source[], phase: ExecutionPhase, loc: ErrorLocation, output = false): DataMap {
  const result: DataMap = {};
  const origins = new Map<string, ErrorSource>();
  for (const source of sources) {
    const data = validate(source.data, source.schema, false, phase, loc, [source]);
    for (const key of Object.keys(data)) {
      if (origins.has(key)) throw new Fault({ code: output ? 'DAG_OUTPUT_KEY_CONFLICT' : 'INPUT_KEY_CONFLICT', phase, location: loc, dataPath: [key], sources: [{ ...origins.get(key)!, dataPath: [...(origins.get(key)!.dataPath ?? []), key] }, { ...source.origin, dataPath: [...(source.origin.dataPath ?? []), key] }] });
      put(result, key, data[key]); origins.set(key, source.origin);
    }
  }
  return result;
}
function validate(data: DataMap, schema: Schema, required: boolean, phase: ExecutionPhase, loc: ErrorLocation, sources: Source[]): DataMap {
  try { return copy(data, schema, required, phase, loc); }
  catch (error) {
    if (error instanceof Fault && error.failure.dataPath?.length) {
      const path = error.failure.dataPath;
      const source = sources.find(s => Object.hasOwn(s.data, path[0]!));
      if (source) throw new Fault({ ...error.failure, sources: [{ ...source.origin, dataPath: [...(source.origin.dataPath ?? []), ...path] }] });
    }
    throw error;
  }
}
function aggregate(frame: Frame, id: string, instances: Instance[]): DataMap {
  const result: DataMap = {};
  const keys = new Set(instances.flatMap(i => Object.keys(i.output!)));
  for (const key of keys) put(result, key, instances.map(i => Object.hasOwn(i.output!, key) ? i.output![key] : null));
  return copy(result, frame.plan.effective.get(id)!, true, 'group-aggregation', targetLocation(frame, frame.plan.positions.get(id)!));
}
function edgeValue(frame: Frame, edge: Edge, state: EdgeState): void {
  const source = frame.positions.get(edge.from)!;
  if (source.status === 'skipped') { state.status = 'inactive'; return; }
  const loc = { parentInstanceId: frame.id, definitionPath: [...edge.path, edge.condition ? 'if' : 'for'], ...(edge.definition.id === undefined ? {} : { definitionId: edge.definition.id }) };
  const data = copy(source.output!, frame.plan.effective.get(edge.from)!, true, 'edge-evaluation', loc);
  if (edge.condition) {
    const value = evaluate(edge.condition, data);
    if (typeof value !== 'boolean') fail('EXPRESSION_EVALUATION_ERROR', 'edge-evaluation', loc);
    if (!value) { state.status = 'inactive'; return; }
  }
  if (!edge.iteration) { state.status = 'active'; return; }
  const forLoc = { ...loc, definitionPath: [...edge.path, 'for'] };
  const value = evaluate(edge.iteration, data);
  if (!Array.isArray(value)) fail('INVALID_FOR_VALUE', 'for-expansion', forLoc);
  const field = 'field' in edge.iteration.left ? edge.iteration.left.field : '';
  const keys = new Set<string>();
  const rows: NonNullable<EdgeState['rows']> = [];
  for (let index = 0; index < value.length; index++) {
    const item = value[index] as DataMap;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) fail('INVALID_FOR_VALUE', 'for-expansion', forLoc, [field, index]);
    const key = item.key;
    if (typeof key !== 'string' || key.length === 0) fail('INVALID_FOR_KEY', 'for-expansion', forLoc, [field, index, 'key']);
    const identity = { key, index };
    if (keys.has(key)) fail('DUPLICATE_FOR_KEY', 'for-expansion', { ...forLoc, forItem: identity }, [field, index, 'key']);
    keys.add(key);
    const input: DataMap = {}; for (const k of Object.keys(item)) if (k !== 'key') put(input, k, item[k]);
    rows.push({ input, identity });
  }
  state.rows = rows; state.status = rows.length ? 'active' : 'inactive';
}
function inputs(frame: Frame, id: string): { sources: Source[]; identity?: ForItemIdentity }[] | undefined {
  const incoming = frame.plan.incoming.get(id)!;
  const ordinary = incoming.filter(e => !e.iteration && frame.edges.get(e)!.status === 'active').map(e => positionSource(frame, e.from));
  const iteration = incoming.find(e => e.iteration);
  if (iteration) {
    const edge = frame.edges.get(iteration)!;
    if (edge.status !== 'active') return;
    const field = 'field' in iteration.iteration!.left ? iteration.iteration!.left.field : '';
    return edge.rows!.map(row => ({ identity: row.identity, sources: [{ data: row.input, schema: iteration.itemSchema!, origin: { ...positionSource(frame, iteration.from).origin, dataPath: [field, row.identity.index] } }, ...ordinary] }));
  }
  return ordinary.length ? [{ sources: ordinary }] : undefined;
}
function advance(tx: Transaction): void {
  for (let cursor = 0; cursor < tx.queue.length; cursor++) {
    const id = tx.queue[cursor]!; tx.queued.delete(id);
    const instance = tx.instance(id)!;
    if (instance.output !== undefined) continue;
    const frame = tx.frame(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [positionId, position] of frame.positions) if (position.status === 'created') {
        const items = position.instances.map(i => tx.instance(i)!);
        if (items.every(i => i.output !== undefined)) {
          position.output = frame.plan.incoming.get(positionId)!.some(e => e.iteration) ? aggregate(frame, positionId, items) : copy(items[0]!.output!, items[0]!.vertex.output, true, 'group-aggregation', location(items[0]!));
          position.status = 'completed'; changed = true;
          const exits = [...frame.positions].filter(([k, p]) => !frame.plan.outgoing.get(k)!.length && p.status === 'completed').map(([k]) => positionSource(frame, k));
          merge(exits, 'dag-output-merge', location(instance), true);
        }
      }
      for (const edge of frame.plan.edges) {
        const state = frame.edges.get(edge)!;
        const status = frame.positions.get(edge.from)!.status;
        if (state.status === 'pending' && (status === 'completed' || status === 'skipped')) { edgeValue(frame, edge, state); changed = true; }
      }
      for (const [positionId, position] of frame.positions) if (position.status === 'waiting') {
        const vertex = frame.plan.positions.get(positionId)!;
        const incoming = frame.plan.incoming.get(positionId)!;
        const available = inputs(frame, positionId);
        // Detect actual conflicts immediately once creation is known, before all dependencies finish.
        const merged = available?.map(row => ({ ...row, input: merge(row.sources, 'input-merge', targetLocation(frame, vertex, row.identity)) }));
        if (incoming.some(e => frame.edges.get(e)!.status === 'pending')) continue;
        if (incoming.length && !merged) { position.status = 'skipped'; changed = true; continue; }
        const rows: { input: DataMap; sources: Source[]; identity?: ForItemIdentity }[] = incoming.length ? merged! : [{ sources: [{ data: instance.input, schema: instance.vertex.input, origin: { instanceId: instance.id } }], input: copy(instance.input, instance.vertex.input, false, 'input-merge', targetLocation(frame, vertex)) }];
        const ids: InstanceId[] = [];
        for (const row of rows) {
          const identity = row.identity;
          const input = validate(row.input, vertex.input, false, 'input-validation', targetLocation(frame, vertex, identity), row.sources);
          ids.push(tx.create(vertex, input, frame.id, positionId, identity));
        }
        position.instances = ids; position.status = 'created'; changed = true;
      }
    }
    if ([...frame.positions.values()].every(p => p.status === 'completed' || p.status === 'skipped')) {
      const sources = [...frame.positions].filter(([k, p]) => !frame.plan.outgoing.get(k)!.length && p.status === 'completed').map(([k]) => positionSource(frame, k));
      const merged = merge(sources, 'dag-output-merge', location(instance), true);
      const output = validate(merged, instance.vertex.output, true, 'dag-output-validation', location(instance), sources);
      tx.instances.set(id, { ...instance, output });
      if (instance.parent !== null) tx.schedule(instance.parent);
    }
  }
}
function failure(error: unknown, phase: ExecutionPhase, loc: ErrorLocation): Failure {
  return error instanceof Fault ? error.failure : { code: 'INTERNAL_ERROR', phase, location: loc, cause: error };
}
class RunningExecution implements Execution {
  #state: State;
  constructor(state: State) { this.#state = state; }
  submit(instanceId: InstanceId, output: unknown): void {
    let loc: ErrorLocation = {};
    let phase: ExecutionPhase = 'instance-check';
    try {
      if (typeof instanceId !== 'string') fail('INVALID_INSTANCE_ID', phase, loc);
      const instance = this.#state.instances.get(instanceId);
      if (!instance) fail('UNKNOWN_INSTANCE', phase, loc);
      loc = location(instance);
      if (instance.vertex.definition.type !== 'node') fail('NOT_SUBMITTABLE', phase, loc);
      if (instance.output !== undefined) fail('ALREADY_COMPLETED', phase, loc);
      phase = 'node-output';
      const accepted = copy(output, instance.vertex.output, true, phase, loc);
      const tx = new Transaction(this.#state);
      tx.instances.set(instanceId, { ...instance, output: accepted });
      tx.schedule(instance.parent!); advance(tx);
      this.#state = tx.publish(this.#state.root);
    } catch (error) { throw new SubmissionError(instanceId, failure(error, phase, loc)); }
  }
  getFrontier(): FrontierItem[] {
    return [...this.#state.instances.values()].filter(i => i.vertex.definition.type === 'node' && i.output === undefined).map(i => ({ instanceId: i.id, parentInstanceId: i.parent!, definition: cloneDefinition(i.vertex.definition) as import('./types.js').NodeDefinition, input: copy(i.input, i.vertex.input, false, 'input-validation', location(i)), ...(i.forItem ? { forItem: { ...i.forItem } } : {}) }));
  }
  getSnapshot(): ExecutionSnapshot {
    const snapshot: ExecutionSnapshot = { rootInstanceId: this.#state.root, instances: [], waitingPositions: [], skippedPositions: [], edges: [] };
    for (const i of this.#state.instances.values()) {
      const base = { instanceId: i.id, definitionId: i.vertex.definition.id, definitionPath: [...i.vertex.path], parentInstanceId: i.parent, input: copy(i.input, i.vertex.input, false, 'input-validation', location(i)), ...(i.forItem ? { forItem: { ...i.forItem } } : {}) };
      if (i.output !== undefined) snapshot.instances.push({ ...base, type: i.vertex.definition.type, status: 'completed', output: copy(i.output, i.vertex.output, true, 'node-output', location(i)) });
      else if (i.vertex.definition.type === 'node') snapshot.instances.push({ ...base, type: 'node', status: 'ready' });
      else snapshot.instances.push({ ...base, type: 'dag', status: 'running' });
    }
    for (const frame of this.#state.frames.values()) {
      for (const [id, p] of frame.positions) if (p.status === 'waiting' || p.status === 'skipped') {
        snapshot[p.status === 'waiting' ? 'waitingPositions' : 'skippedPositions'].push({ parentInstanceId: frame.id, definitionId: id, definitionPath: [...frame.plan.positions.get(id)!.path] });
      }
      for (const edge of frame.plan.edges) snapshot.edges.push({ parentInstanceId: frame.id, definitionPath: [...edge.path], ...(edge.definition.id === undefined ? {} : { definitionId: edge.definition.id }), from: { parentInstanceId: frame.id, definitionId: edge.from }, to: { parentInstanceId: frame.id, definitionId: edge.to }, status: frame.edges.get(edge)!.status });
    }
    return snapshot;
  }
  getResult(): ExecutionResult {
    const root = this.#state.instances.get(this.#state.root)!;
    return root.output === undefined ? { status: 'running' } : { status: 'completed', output: copy(root.output, root.vertex.output, true, 'dag-output-validation', location(root)) };
  }
}
export function program(vertex: Vertex): Program {
  return {
    getDefinition: () => cloneDefinition(vertex.definition) as import('./types.js').DagDefinition,
    createExecution(rootInput: unknown): Execution {
      const loc: ErrorLocation = { definitionId: vertex.definition.id, definitionPath: [...vertex.path] };
      try {
        const input = copy(rootInput, vertex.input, false, 'root-input', loc);
        const tx = new Transaction({ root: '', next: 1, instances: new Map(), frames: new Map() });
        const root = tx.create(vertex, input, null); advance(tx);
        return new RunningExecution(tx.publish(root));
      } catch (error) { throw new InitializationError(failure(error, 'root-input', loc)); }
    },
  };
}
