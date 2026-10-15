import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, CompileError, ExecutionError, InitializationError, SubmissionError } from '../lib/host/dag/index.js';

const node = (id, input_schema = {}, output_schema = {}, extra = {}) => ({ id, type: 'node', input_schema, output_schema, ...extra });
const edge = (from, to, extra = {}) => ({ type: 'edge', from, to, ...extra });
const dag = (children, input_schema = {}, output_schema = {}, id = 'root') => ({ id, type: 'dag', dag: children, input_schema, output_schema });
const array = items => ({ type: 'array', items });
const object = properties => ({ type: 'object', properties });
const jobs = array(object({ key: 'string', value: 'number' }));
const task = (e, id) => e.getFrontier().find(t => t.definition.id === id);
const submit = (e, id, output) => e.submit(task(e, id).instanceId, output);
function rejected(e, instanceId, output, code, phase) {
  const before = e.getSnapshot();
  assert.throws(() => e.submit(instanceId, output), error => {
    assert.ok(error instanceof SubmissionError); assert.ok(error instanceof ExecutionError);
    assert.equal(error.code, code); assert.equal(error.submittedInstanceId, instanceId);
    if (phase) assert.equal(error.phase, phase);
    return true;
  });
  assert.deepEqual(e.getSnapshot(), before);
}
function invalid(definition, codes) {
  assert.throws(() => compile(definition), error => {
    assert.ok(error instanceof CompileError);
    for (const code of codes) assert.ok(error.issues.some(i => i.code === code), `${code}: ${JSON.stringify(error.issues)}`);
    assert.ok(error.issues.every(i => Array.isArray(i.path)));
    return true;
  });
}

test('ordinary flow, repeatable queries, independent executions and duplicate submission', () => {
  const p = compile(dag([node('a', { name: 'string' }, { value: 'number' }), node('b', { value: 'number' }, { valid: 'boolean' }), edge('a', 'b')], { name: 'string' }, { valid: 'boolean' }));
  const e = p.createExecution({ name: 'test' }); const second = p.createExecution({});
  assert.deepEqual(e.getResult(), { status: 'running' });
  assert.deepEqual(e.getFrontier(), e.getFrontier());
  const a = task(e, 'a');
  rejected(e, a.instanceId, {}, 'MISSING_OUTPUT_FIELD', 'node-output');
  rejected(e, a.instanceId, { value: 'wrong' }, 'INVALID_FIELD_TYPE');
  e.submit(a.instanceId, { value: 2 });
  assert.deepEqual(task(e, 'b').input, { value: 2 });
  assert.equal(task(second, 'a').definition.id, 'a');
  submit(e, 'b', { valid: true });
  assert.deepEqual(e.getResult(), { status: 'completed', output: { valid: true } });
  rejected(e, a.instanceId, { value: 2 }, 'ALREADY_COMPLETED', 'instance-check');
  rejected(e, a.instanceId, new Proxy({}, { ownKeys() { throw new Error('must not read'); } }), 'ALREADY_COMPLETED');
});

test('empty DAG, initial errors, identities checked before output', () => {
  assert.deepEqual(compile(dag([])).createExecution({ ignored: 1 }).getResult(), { status: 'completed', output: {} });
  const p = compile(dag([node('a')]));
  for (const value of [null, [], new Date(), new Map(), new Set(), new (class Data {})()]) assert.throws(() => p.createExecution(value), error => error instanceof InitializationError && error.code === 'INVALID_MAP');
  const e = p.createExecution({});
  rejected(e, 2, null, 'INVALID_INSTANCE_ID');
  rejected(e, 'absent', null, 'UNKNOWN_INSTANCE');
  rejected(e, e.getSnapshot().rootInstanceId, null, 'NOT_SUBMITTABLE');
});

test('nested DAG boundaries and parent links', () => {
  const inner = dag([node('worker', { n: 'number' }, { answer: 'number' })], { n: 'number' }, { answer: 'number' }, 'inner');
  const e = compile(dag([inner], { n: 'number' }, { answer: 'number' })).createExecution({ n: 7 });
  const worker = task(e, 'worker');
  assert.deepEqual(worker.input, { n: 7 });
  const snapshot = e.getSnapshot();
  const parent = snapshot.instances.find(i => i.instanceId === worker.parentInstanceId);
  assert.equal(parent.definitionId, 'inner'); assert.equal(parent.parentInstanceId, snapshot.rootInstanceId);
  assert.deepEqual(snapshot.instances.find(i => i.definitionId === 'worker').definitionPath, ['dag', 0, 'dag', 0]);
  submit(e, 'worker', { answer: 8 });
  assert.ok(e.getSnapshot().instances.every(i => i.status === 'completed'));
  assert.deepEqual(e.getResult().output, { answer: 8 });
});

test('conditions allow missing inputs and skipped positions never become exits', () => {
  const e = compile(dag([node('a', {}, { on: 'boolean', a: 'number' }), node('b', {}, { b: 'number' }), node('c', { a: 'number', b: 'number' }, { answer: 'number' }), edge('a', 'c', { if: 'on' }), edge('b', 'c')], {}, { answer: 'number' })).createExecution({});
  submit(e, 'a', { on: false, a: 1 }); submit(e, 'b', { b: 2 });
  assert.deepEqual(task(e, 'c').input, { b: 2 }); submit(e, 'c', { answer: 2 });
  assert.deepEqual(e.getResult().output, { answer: 2 });
  const skipped = compile(dag([node('a', {}, { on: 'boolean' }), node('b'), node('c'), edge('a', 'b', { if: 'on' }), edge('b', 'c')])).createExecution({});
  submit(skipped, 'a', { on: false });
  assert.deepEqual(skipped.getResult().output, {});
  assert.deepEqual(skipped.getSnapshot().skippedPositions.map(p => p.definitionId), ['b', 'c']);
  assert.equal(skipped.getSnapshot().instances.length, 2);
  assert.ok(skipped.getSnapshot().edges.every(e => e.status === 'inactive'));
});

test('for instances wait for common dependencies, aggregate in original order and fill extra fields', () => {
  const e = compile(dag([node('prepare', {}, { jobs }), node('config', {}, { currency: 'string' }), node('worker', { value: 'number', currency: 'string' }, { price: 'number', nested: array('number') }), node('finish', { price: array('number') }, { total: 'number' }), edge('prepare', 'worker', { for: 'jobs' }), edge('config', 'worker'), edge('worker', 'finish')], {}, { total: 'number' })).createExecution({});
  submit(e, 'prepare', { jobs: [{ key: 'a_1', value: 10 }, { key: 'b', value: 20 }] });
  assert.equal(task(e, 'worker'), undefined);
  submit(e, 'config', { currency: 'CNY' });
  const workers = e.getFrontier(); assert.equal(workers.length, 2);
  assert.deepEqual(workers.map(t => t.forItem), [{ key: 'a_1', index: 0 }, { key: 'b', index: 1 }]);
  e.submit(workers[1].instanceId, { price: 20, nested: [2], note: undefined });
  assert.equal(task(e, 'finish'), undefined);
  assert.equal(e.getSnapshot().waitingPositions.some(p => p.definitionId === 'worker'), false);
  e.submit(workers[0].instanceId, { price: 10, nested: [1], onlyFirst: 'yes' });
  assert.deepEqual(task(e, 'finish').input, { price: [10, 20], nested: [[1], [2]], onlyFirst: ['yes', null], note: [null, undefined] });
  submit(e, 'finish', { total: 30 }); assert.deepEqual(e.getResult().output, { total: 30 });
});

test('for key validation, false if bypasses identity checks, empty for rollback and retry', () => {
  const definition = dag([node('a', {}, { jobs, enabled: 'boolean' }), node('b', { value: 'number' }, { price: 'number' }), edge('a', 'b', { if: 'enabled', for: 'jobs' })], {}, { price: array('number') });
  const e = compile(definition).createExecution({}); const id = task(e, 'a').instanceId;
  rejected(e, id, { jobs: [{ key: '', value: 1 }], enabled: true }, 'INVALID_FOR_KEY', 'for-expansion');
  rejected(e, id, { jobs: [{ key: 'x', value: 1 }, { key: 'x', value: 2 }], enabled: true }, 'DUPLICATE_FOR_KEY');
  rejected(e, id, { jobs: [], enabled: true }, 'MISSING_OUTPUT_FIELD', 'dag-output-validation');
  e.submit(id, { jobs: [{ key: 'x', value: 1 }], enabled: true }); submit(e, 'b', { price: 3 });
  assert.deepEqual(e.getResult().output, { price: [3] });
  definition.output_schema = {};
  const closed = compile(definition).createExecution({});
  submit(closed, 'a', { jobs: [{ key: '', value: 1 }, { key: '', value: 2 }], enabled: false });
  assert.equal(closed.getResult().status, 'completed');
  const bad = compile(definition).createExecution({});
  rejected(bad, task(bad, 'a').instanceId, { jobs: [{ value: 1 }], enabled: false }, 'MISSING_OUTPUT_FIELD', 'node-output');
});

test('early ordinary input and DAG exit conflicts roll back only triggering submission', () => {
  const e = compile(dag([node('a'), node('b'), node('c'), node('join'), edge('a', 'join'), edge('b', 'join'), edge('c', 'join')])).createExecution({});
  submit(e, 'a', { trace: 1 });
  assert.throws(() => e.submit(task(e, 'b').instanceId, { trace: 1 }), error => {
    assert.equal(error.code, 'INPUT_KEY_CONFLICT'); assert.equal(error.location.definitionId, 'join');
    assert.equal(error.location.instanceId, undefined); assert.equal(error.sources.length, 2); return true;
  });
  assert.equal(task(e, 'b').definition.id, 'b'); assert.equal(task(e, 'c').definition.id, 'c');
  submit(e, 'b', { other: 2 }); submit(e, 'c', {}); submit(e, 'join', {});
  const exits = compile(dag([node('a'), node('b'), node('c')])).createExecution({});
  submit(exits, 'a', { trace: 1 }); rejected(exits, task(exits, 'b').instanceId, { trace: 1 }, 'DAG_OUTPUT_KEY_CONFLICT', 'dag-output-merge');
  submit(exits, 'b', { other: 1 }); submit(exits, 'c', {});
});

test('for decision defers conflicts, activation detects saved conflicts, skipping ignores them', () => {
  const definition = dag([node('a'), node('b'), node('c', {}, { jobs }), node('join', { value: 'number' }), edge('a', 'join'), edge('b', 'join'), edge('c', 'join', { for: 'jobs' })]);
  const e = compile(definition).createExecution({}); submit(e, 'a', { trace: 1 }); submit(e, 'b', { trace: 2 });
  rejected(e, task(e, 'c').instanceId, { jobs: [{ key: 'x', value: 1 }] }, 'INPUT_KEY_CONFLICT');
  submit(e, 'c', { jobs: [] }); assert.equal(e.getResult().status, 'completed');
  const active = compile(definition).createExecution({}); submit(active, 'c', { jobs: [{ key: 'x', value: 1, trace: 3 }] });
  rejected(active, task(active, 'a').instanceId, { trace: 1 }, 'INPUT_KEY_CONFLICT');
});

test('downstream type failure and nested DAG completion failure publish no partial expansion', () => {
  const e = compile(dag([node('a'), node('provider', {}, { enabled: 'boolean', value: 'number' }), node('free'), node('b', { value: 'number' }), edge('a', 'free'), edge('a', 'b'), edge('provider', 'b', { if: 'enabled' })])).createExecution({});
  submit(e, 'provider', { enabled: false, value: 1 });
  rejected(e, task(e, 'a').instanceId, { value: 'bad' }, 'INVALID_FIELD_TYPE', 'input-validation');
  assert.throws(() => e.submit(task(e, 'a').instanceId, { value: 'bad' }), error => error.sources[0].instanceId === task(e, 'a').instanceId && error.location.definitionId === 'b');
  submit(e, 'a', { value: 2 }); submit(e, 'free', {}); submit(e, 'b', {});
  const inner = dag([node('select', {}, { enabled: 'boolean' }), node('value', {}, { n: 'number' }), edge('select', 'value', { if: 'enabled' })], {}, { n: 'number' }, 'inner');
  const nested = compile(dag([inner], {}, { n: 'number' })).createExecution({});
  const id = task(nested, 'select').instanceId;
  rejected(nested, id, { enabled: false }, 'MISSING_OUTPUT_FIELD', 'dag-output-validation');
  assert.throws(() => nested.submit(id, { enabled: false }), error => error.location.definitionId === 'inner' && error.submittedInstanceId === id);
  nested.submit(id, { enabled: true }); submit(nested, 'value', { n: 3 }); assert.deepEqual(nested.getResult().output, { n: 3 });
});

test('recursion unfolds on demand and returns through parent DAGs', () => {
  const definition = dag([node('step', { items: array('string') }, { items: array('string'), again: 'boolean' }), edge('step', 'recursive', { if: 'again' })], { items: array('string') }, {}, 'recursive');
  const e = compile(definition).createExecution({ items: ['a', 'b'] });
  for (const expected of [['a', 'b'], ['b'], []]) {
    const t = task(e, 'step'); assert.deepEqual(t.input.items, expected);
    e.submit(t.instanceId, { items: expected.slice(1), again: expected.length > 0 });
  }
  assert.deepEqual(e.getResult(), { status: 'completed', output: {} });
  const dags = e.getSnapshot().instances.filter(i => i.type === 'dag');
  assert.equal(dags.length, 3); assert.equal(dags[1].parentInstanceId, dags[0].instanceId); assert.equal(dags[2].parentInstanceId, dags[1].instanceId);
  assert.ok(dags.every(i => i.definitionPath.length === 0));
});

test('declared structures isolated, definitions fixed, nested extras remain referenced', () => {
  const schema = { address: object({ city: 'string' }), values: array(object({ n: 'number' })) };
  const definition = dag([node('a', schema, schema, { config: { handler: 'a' } }), node('b'), node('c'), edge('a', 'b'), edge('a', 'c')], schema);
  const p = compile(definition); definition.dag[0].config.handler = 'changed'; p.getDefinition().dag[0].config.handler = 'also changed';
  const custom = { marker: 1 }; const input = { address: { city: 'old', custom }, values: [{ n: 1 }] };
  const e = p.createExecution(input); input.address.city = 'changed'; input.values[0].n = 9;
  const a = task(e, 'a'); assert.equal(a.input.address.city, 'old'); assert.equal(a.input.values[0].n, 1); assert.equal(a.definition.config.handler, 'a');
  a.input.address.city = 'external'; a.definition.config.handler = 'external'; assert.equal(task(e, 'a').input.address.city, 'old');
  const output = { address: { city: 'accepted', custom }, values: [{ n: 2 }] }; e.submit(a.instanceId, output); output.address.city = 'later';
  const b = task(e, 'b'); b.input.address.city = 'b';
  assert.equal(task(e, 'c').input.address.city, 'accepted');
  assert.equal(e.getSnapshot().instances.find(i => i.definitionId === 'a').output.address.city, 'accepted');
  const snapshot = e.getSnapshot(); snapshot.instances.find(i => i.definitionId === 'a').output.address.city = 'snapshot';
  snapshot.instances.find(i => i.definitionId === 'a').output.values[0].n = 99;
  snapshot.instances[0].input.address.city = 'snapshot root'; snapshot.instances[0].definitionPath.push('external'); snapshot.edges[0].status = 'pending';
  assert.equal(e.getSnapshot().instances.find(i => i.definitionId === 'a').output.address.city, 'accepted');
  assert.equal(e.getSnapshot().instances.find(i => i.definitionId === 'a').output.values[0].n, 2);
  assert.equal(e.getSnapshot().instances[0].input.address.city, 'old'); assert.deepEqual(e.getSnapshot().instances[0].definitionPath, []);
  assert.equal(e.getSnapshot().edges[0].status, 'active');
  custom.marker = 2; assert.equal(task(e, 'c').input.address.custom.marker, 2);
  submit(e, 'b', {}); submit(e, 'c', {});
});

test('input missing nested fields allowed; output missing nested fields rejected; null is present', () => {
  const schema = { address: object({ city: 'string' }), records: array(object({ n: 'number' })) };
  const p = compile(dag([node('a', schema, schema)], schema, schema));
  const e = p.createExecution({ address: {}, records: [{}] });
  assert.deepEqual(task(e, 'a').input, { address: {}, records: [{}] });
  const id = task(e, 'a').instanceId;
  rejected(e, id, { address: {}, records: [{ n: 2 }] }, 'MISSING_OUTPUT_FIELD');
  rejected(e, id, { address: { city: 'x' }, records: [{}] }, 'MISSING_OUTPUT_FIELD');
  for (const city of [undefined, null, 1]) assert.throws(() => p.createExecution({ address: { city } }), error => error.code === 'INVALID_FIELD_TYPE');
  assert.throws(() => p.createExecution({ records: [null] }), error => error.code === 'INVALID_FIELD_TYPE');
  e.submit(id, { address: { city: 'x' }, records: [{ n: 2 }] });
  const result = e.getResult(); result.output.address.city = 'mutated'; assert.equal(e.getResult().output.address.city, 'x');
});

test('proxy and accessor containers rejected without invoking external code; opaque values allowed', () => {
  const p = compile(dag([node('a', { obj: object({ n: 'number' }), values: array('number') }, { obj: object({ n: 'number' }) })], { obj: object({ n: 'number' }), values: array('number') }));
  let calls = 0;
  const proxy = value => new Proxy(value, { get() { calls++; throw Error('trap'); }, ownKeys() { calls++; throw Error('trap'); }, getPrototypeOf() { calls++; throw Error('trap'); } });
  const getter = {}; Object.defineProperty(getter, 'n', { get() { calls++; return 1; }, enumerable: true });
  for (const value of [proxy({}), { obj: proxy({ n: 1 }) }, { values: proxy([1]) }]) assert.throws(() => p.createExecution(value), error => error.code === 'PROXY_CONTAINER');
  for (const value of [getter, { obj: getter }]) assert.throws(() => p.createExecution(value), error => error.code === 'ACCESSOR_PROPERTY');
  const opaque = proxy({}); const e = p.createExecution({ opaque, nestedGetter: getter, special: new Date() });
  assert.equal(task(e, 'a').input.opaque, opaque); assert.equal(calls, 0);
  const id = task(e, 'a').instanceId;
  rejected(e, id, { obj: proxy({ n: 1 }) }, 'PROXY_CONTAINER'); rejected(e, id, { obj: getter }, 'ACCESSOR_PROPERTY'); assert.equal(calls, 0);
  e.submit(id, { obj: { n: 1 }, opaque });
});

test('null prototypes, non-enumerable own keys and prototype-sensitive names are data', () => {
  const schema = JSON.parse('{"__proto__":"number","constructor":"string","toString":"boolean"}');
  const input = Object.create(null); Object.defineProperties(input, { '__proto__': { value: 2 }, constructor: { value: 'own' }, toString: { value: true } });
  // Object literal __proto__ is special even when used in descriptor maps; define explicitly.
  Object.defineProperty(input, '__proto__', { value: 2 });
  const e = compile(dag([node('a', schema, schema)], schema, schema)).createExecution(input);
  assert.equal(task(e, 'a').input.__proto__, 2); submit(e, 'a', input);
  assert.equal(e.getResult().output.constructor, 'own'); assert.equal(Object.getPrototypeOf(e.getResult().output), Object.prototype);
});

test('independent graph errors aggregate and all structural/schema restrictions enforced', () => {
  invalid(dag([node('a'), edge('missing', 'a'), edge('a', 'other')]), ['UNKNOWN_SOURCE', 'UNKNOWN_TARGET']);
  invalid(dag([node('a'), node('a')]), ['DUPLICATE_ID']);
  invalid(dag([node('a'), node('b'), edge('a', 'b'), edge('a', 'b', { if: 'on' })]), ['DUPLICATE_EDGE']);
  invalid(dag([node('a'), node('b'), edge('a', 'b'), edge('b', 'a')]), ['CYCLIC_DEPENDENCY']);
  invalid(dag([node('a'), edge('a', 'root')]), ['RECURSION_WITHOUT_CONDITION']);
  invalid(dag([node('a'), edge('root', 'a')]), ['RECURSION_WITHOUT_INPUT']);
  invalid(dag([node('a', {}, { on: 'boolean' }), edge('a', 'root', { if: 'on' }), edge('root', 'a')]), ['CYCLIC_DEPENDENCY']);
  invalid(dag([node('a', {}, { jobs }), node('b', {}, { jobs }), node('c'), edge('a', 'c', { for: 'jobs' }), edge('b', 'c', { for: 'jobs' })]), ['MULTIPLE_FOR_EDGES']);
  invalid(dag([dag([node('hidden')], {}, {}, 'inner'), node('a'), edge('a', 'hidden')]), ['INVALID_ENDPOINT']);
  invalid(dag([node('a'), edge('a', 'a', { id: 'link' }), edge('link', 'a')]), ['INVALID_ENDPOINT']);
  for (const type of ['object', 'array', { type: 'object' }, { type: 'array' }, array('object')]) invalid(dag([node('a', { value: type })]), ['INVALID_SCHEMA']);
  invalid(dag([node('a', {}, { n: 'number' }), node('b', {}, { n: 'number' }), node('c', { n: 'number' }), edge('a', 'c'), edge('b', 'c')]), ['INPUT_SCHEMA_KEY_CONFLICT']);
  invalid(dag([node('a', {}, { n: 'number' }), node('b', {}, { n: 'number' })]), ['OUTPUT_SCHEMA_KEY_CONFLICT']);
  invalid(dag([node('a', { n: 'number' })]), ['MISSING_INPUT_PROVIDER']);
  invalid(dag([node('a')], {}, { n: 'number' }), ['INCOMPLETE_OUTPUT_SCHEMA']);
  invalid(dag([node('a', { nested: object({ x: 'number', y: 'string' }) })], { nested: object({ x: 'number' }) }), ['SCHEMA_TYPE_MISMATCH']);
  invalid(dag([node('a', { records: array(object({ x: 'number', y: 'string' })) })], { records: array(object({ x: 'number' })) }), ['SCHEMA_TYPE_MISMATCH']);
});

test('Nunjucks grammar, comparison semantics, references and statically known result contracts', () => {
  for (const expression of ['n == 1 trailing', '', '{{ on }}', 'on && on']) invalid(dag([node('a', {}, { n: 'number', on: 'boolean' }), node('b'), edge('a', 'b', { if: expression })]), ['INVALID_EXPRESSION']);
  invalid(dag([node('a'), node('b'), edge('a', 'b', { if: 'missing' })]), ['INVALID_FIELD_REFERENCE']);
  invalid(dag([node('a', {}, { n: 'number' }), node('b'), edge('a', 'b', { if: 'n' })]), ['EXPRESSION_TYPE_MISMATCH']);
  for (const type of [array('string'), array(object({})), array(object({ key: 'number' }))]) invalid(dag([node('a', {}, { jobs: type }), node('b'), edge('a', 'b', { for: 'jobs' })]), ['EXPRESSION_TYPE_MISMATCH']);
  for (const [expression, active] of [['n == "1"', true], ['n === "1"', false], ['n + 2 >= 3 and on', true], ['s is string and on != false', true]]) {
    const e = compile(dag([node('a', {}, { n: 'number', s: 'string', on: 'boolean' }), node('b'), edge('a', 'b', { if: expression })])).createExecution({});
    submit(e, 'a', { n: 1, s: 'x', on: true }); assert.equal(Boolean(task(e, 'b')), active);
  }
});

test('definition JSON restrictions and extension fields have no orchestration semantics', () => {
  for (const value of [undefined, () => {}, Symbol(), 1n, Infinity, new Date()]) invalid(dag([node('a', {}, {}, { extension: value })]), ['INVALID_JSON_VALUE']);
  const cycle = {}; cycle.self = cycle; invalid(dag([node('a', {}, {}, { cycle })]), ['INVALID_JSON_VALUE']);
  let calls = 0; const getter = dag([]); Object.defineProperty(getter, 'extension', { get() { calls++; return {}; } }); invalid(getter, ['INVALID_JSON_VALUE']);
  invalid(new Proxy(dag([]), { ownKeys() { calls++; return []; } }), ['INVALID_JSON_VALUE']); assert.equal(calls, 0);
  const e = compile(dag([node('a', {}, {}, { if: false, for: [1], handler: { name: 'a' } })])).createExecution({});
  assert.equal(task(e, 'a').definition.if, false); submit(e, 'a', { date: new Date(), fn() {} });
  const negativeZero = compile(dag([node('negative-zero', {}, {}, { numericMetadata: -0 })]));
  assert.ok(Object.is(negativeZero.getDefinition().dag[0].numericMetadata, -0));
  assert.ok(Object.is(task(negativeZero.createExecution({}), 'negative-zero').definition.numericMetadata, -0));
});

test('different legal submission orders produce equal results', () => {
  const definition = dag([node('a', {}, { a: 'number' }), node('b', {}, { b: 'number' }), node('join', { a: 'number', b: 'number' }, { result: 'number' }), edge('a', 'join'), edge('b', 'join')], {}, { result: 'number' });
  const results = [['a', 'b'], ['b', 'a']].map(order => {
    const e = compile(definition).createExecution({}); for (const id of order) submit(e, id, { [id]: id === 'a' ? 2 : 3 });
    const t = task(e, 'join'); e.submit(t.instanceId, { result: t.input.a + t.input.b }); return e.getResult();
  }); assert.deepEqual(results[0], results[1]);
});

test('for DAG instances execute independently before aggregate flows downstream', () => {
  const inner = dag([node('worker', { value: 'number' }, { price: 'number' })], { value: 'number' }, { price: 'number' }, 'inner');
  const e = compile(dag([node('prepare', {}, { jobs }), inner, node('finish', { price: array('number') }, { sum: 'number' }), edge('prepare', 'inner', { for: 'jobs' }), edge('inner', 'finish')], {}, { sum: 'number' })).createExecution({});
  submit(e, 'prepare', { jobs: [{ key: 'x', value: 2 }, { key: 'y', value: 4 }] });
  const workers = e.getFrontier(); assert.equal(workers.length, 2);
  const parents = e.getSnapshot().instances.filter(i => i.definitionId === 'inner');
  assert.deepEqual(parents.map(i => i.forItem.index), [0, 1]);
  assert.ok(workers.every(w => parents.some(p => p.instanceId === w.parentInstanceId)));
  e.submit(workers[1].instanceId, { price: 4 }); assert.equal(task(e, 'finish'), undefined);
  e.submit(workers[0].instanceId, { price: 2 }); assert.deepEqual(task(e, 'finish').input.price, [2, 4]);
  submit(e, 'finish', { sum: 6 }); assert.deepEqual(e.getResult().output, { sum: 6 });
});

test('for exit aggregate conflict rolls back last item and keeps previously completed items', () => {
  const e = compile(dag([node('prepare', {}, { jobs }), node('worker', { value: 'number' }, { price: 'number' }), node('exit'), edge('prepare', 'worker', { for: 'jobs' })])).createExecution({});
  submit(e, 'prepare', { jobs: [{ key: 'x', value: 1 }, { key: 'y', value: 2 }] });
  submit(e, 'exit', { trace: 'exit' });
  const workers = e.getFrontier(); e.submit(workers[0].instanceId, { price: 1, trace: 'item' });
  rejected(e, workers[1].instanceId, { price: 2 }, 'DAG_OUTPUT_KEY_CONFLICT');
  assert.equal(e.getSnapshot().instances.find(i => i.instanceId === workers[0].instanceId).status, 'completed');
  assert.equal(e.getSnapshot().instances.find(i => i.instanceId === workers[1].instanceId).status, 'ready');
});

test('recursive for preserves separate identities and input item schema', () => {
  const definition = dag([node('step', { value: 'number' }, { again: 'boolean', jobs }), edge('step', 'recursive', { if: 'again', for: 'jobs' })], { value: 'number' }, {}, 'recursive');
  const e = compile(definition).createExecution({ value: 2 });
  submit(e, 'step', { again: true, jobs: [{ key: 'a', value: 0 }, { key: 'b', value: 0 }] });
  const workers = e.getFrontier(); assert.deepEqual(workers.map(w => w.input.value), [0, 0]);
  for (const w of workers) e.submit(w.instanceId, { again: false, jobs: [] });
  assert.deepEqual(e.getResult(), { status: 'completed', output: {} });
  assert.equal(new Set(e.getSnapshot().instances.map(i => i.instanceId)).size, 6);
});

test('long recursive chain completes through iterative internal propagation', () => {
  const e = compile(dag([node('step', { remaining: 'number' }, { remaining: 'number', again: 'boolean' }), edge('step', 'recursive', { if: 'again' })], { remaining: 'number' }, {}, 'recursive')).createExecution({ remaining: 1200 });
  for (let n = 1200; n >= 0; n--) {
    const t = task(e, 'step'); assert.equal(t.input.remaining, n);
    e.submit(t.instanceId, { remaining: n - 1, again: n > 0 });
  }
  assert.deepEqual(e.getResult(), { status: 'completed', output: {} });
  assert.equal(e.getSnapshot().instances.length, 2402);
});

test('independent graph diagnostics survive invalid expressions and schemas', () => {
  invalid(dag([node('a'), node('b'), edge('a', 'b', { if: 'x >' }), edge('b', 'absent')]), ['INVALID_EXPRESSION', 'UNKNOWN_TARGET']);
  invalid(dag([node('a', { bad: 'object' }), edge('a', 'absent')]), ['INVALID_SCHEMA', 'UNKNOWN_TARGET']);
  invalid(dag([node('a'), node('a'), edge('a', 'absent')]), ['DUPLICATE_ID', 'UNKNOWN_TARGET']);
  invalid({ id: 'x', dag: [] }, ['MISSING_STANDARD_FIELD']);
  invalid({ id: 'x', type: 'invalid', dag: [] }, ['INVALID_STANDARD_FIELD']);
});

test('Nunjucks edge expressions compute native booleans from nested output and builtins', () => {
  const program = compile(dag([
    node('review', {}, { review: object({ score: 'number', approved: 'boolean' }) }),
    node('work'),
    edge('review', 'work', { if: 'review.approved and (review.score + 5) >= 80 and range(2) | length == 2' }),
  ]));
  const run = program.createExecution({});
  submit(run, 'review', { review: { score: 75, approved: true } });
  assert.equal(task(run, 'work').definition.id, 'work');
});

test('dynamic for checks actual values and preserves known compile-time conflicts', () => {
  const definition = dag([
    node('source', {}, { selected: 'string', sets: object({ good: jobs }) }),
    node('other', {}, { shared: 'string' }), node('worker', { value: 'number', shared: 'string', optional: 'boolean' }),
    edge('source', 'worker', { for: 'sets[selected]' }), edge('other', 'worker'),
  ]);
  const execution = compile(definition).createExecution({});
  submit(execution, 'other', { shared: 'saved' });
  const id = task(execution, 'source').instanceId;
  rejected(execution, id, { selected: 'bad', sets: { good: [], bad: [1] } }, 'INVALID_FOR_VALUE');
  rejected(execution, id, { selected: 'bad', sets: { good: [], bad: [{ key: '', value: 2 }] } }, 'INVALID_FOR_KEY');
  rejected(execution, id, { selected: 'bad', sets: { good: [], bad: [{ key: 'a', value: 2 }, { key: 'a', value: 3 }] } }, 'DUPLICATE_FOR_KEY');
  rejected(execution, id, { selected: 'bad', sets: { good: [], bad: [{ key: 'a', value: 'wrong' }] } }, 'INVALID_FIELD_TYPE');
  rejected(execution, id, { selected: 'bad', sets: { good: [], bad: [{ key: 'a', shared: 'conflict' }] } }, 'INPUT_KEY_CONFLICT');
  submit(execution, 'source', { selected: 'good', sets: { good: [{ key: 'with-business', value: 2 }] } });
  assert.deepEqual(task(execution, 'worker').input, { value: 2, shared: 'saved' });
  invalid(dag([...definition.dag, node('another', {}, { shared: 'string' }), edge('another', 'worker')]), ['INPUT_SCHEMA_KEY_CONFLICT']);
  const wrongType = structuredClone(definition); wrongType.dag[2].input_schema.shared = 'number';
  invalid(wrongType, ['SCHEMA_TYPE_MISMATCH']);
  const badReference = structuredClone(definition); badReference.dag[3].for = 'sets[selected] + undeclared';
  invalid(badReference, ['INVALID_FIELD_REFERENCE']);
});

test('parenthesized fixed array paths retain declared item checks even on closed edges', () => {
  invalid(dag([node('source', {}, { jobs }), node('worker', { value: 'string' }), edge('source', 'worker', { if: 'false', for: '(jobs)' })]), ['SCHEMA_TYPE_MISMATCH']);
});

test('missing expression values follow library defaults and final contracts; failures roll back', () => {
  const make = (condition, iteration) => compile(dag([
    node('source', {}, { values: array('boolean'), batches: array(jobs) }), node('worker'),
    edge('source', 'worker', { if: condition.replaceAll('value', 'values[0]'), ...(iteration ? { for: iteration.replaceAll('jobs', 'batches[0]') } : {}) }),
  ]));
  for (const condition of ['value | default("false")', 'value | default(none)']) {
    const run = make(condition).createExecution({});
    rejected(run, task(run, 'source').instanceId, { values: [], batches: [] }, 'EXPRESSION_EVALUATION_ERROR');
  }
  const absent = make('value').createExecution({});
  rejected(absent, task(absent, 'source').instanceId, { values: [], batches: [] }, 'EXPRESSION_EVALUATION_ERROR');
  for (const condition of ['value is defined', 'value | default(false)', 'value is defined and value']) {
    const run = make(condition, 'jobs | random').createExecution({}); submit(run, 'source', { values: [], batches: [] });
    assert.equal(run.getResult().status, 'completed');
  }
  const empty = make('value | default(true)', 'jobs | default([])').createExecution({}); submit(empty, 'source', { values: [], batches: [] });
  assert.equal(empty.getResult().status, 'completed');
  const badFor = make('value | default(true)', 'jobs').createExecution({});
  rejected(badFor, task(badFor, 'source').instanceId, { values: [], batches: [] }, 'INVALID_FOR_VALUE');
  // A real library error, with location and cause, rolls back the source submission.
  const failing = compile(dag([node('source', {}, { n: 'number' }), node('worker'), edge('source', 'worker', { if: 'n() is defined' })])).createExecution({});
  const sourceId = task(failing, 'source').instanceId;
  assert.throws(() => failing.submit(sourceId, { n: 1 }), error => error.code === 'EXPRESSION_EVALUATION_ERROR' && error.location.definitionPath.at(-1) === 'if' && error.cause instanceof Error);
  assert.equal(task(failing, 'source').instanceId, sourceId);
  assert.throws(() => compile(dag([dag([], {}, {}, 'empty'), node('target'), edge('empty', 'target', { if: '["false"] | first' })])).createExecution({}), error => error instanceof InitializationError && error.code === 'EXPRESSION_EVALUATION_ERROR');
  assert.throws(() => compile(dag([node('root-input', { value: 'boolean' })], { value: 'boolean' })).createExecution({ value: 'wrong' }), error => error instanceof InitializationError && error.code === 'INVALID_FIELD_TYPE');
});

test('random edge decisions resample after rollback but persisted expansion restores without sampling', t => {
  let draws = 0;
  t.mock.method(Math, 'random', () => ++draws <= 2 ? 0 : 0.99);
  const program = compile(dag([
    node('source', {}, { choices: array('boolean'), batches: array(jobs) }),
    node('worker', { value: 'number' }),
    edge('source', 'worker', { if: 'choices | random', for: 'batches | random' }),
  ]));
  const execution = program.createExecution({});
  const id = task(execution, 'source').instanceId;
  const output = { choices: [true], batches: [[{ key: '', value: 1 }], [{ key: 'saved', value: 2 }]] };
  rejected(execution, id, output, 'INVALID_FOR_KEY');
  assert.equal(draws, 2);
  execution.submit(id, output);
  assert.equal(draws, 4);
  const saved = execution.exportState();
  const restored = program.restoreExecution(JSON.parse(JSON.stringify(saved)));
  assert.equal(draws, 4);
  assert.deepEqual(restored.getFrontier(), execution.getFrontier());
  assert.deepEqual(task(restored, 'worker').input, { value: 2 });
  assert.equal(task(restored, 'worker').forItem.key, 'saved');
  submit(restored, 'worker', {});
  assert.equal(restored.getResult().status, 'completed');
});

test('runtime expression diagnostics identify the edge field and preserve the library reason', () => {
  const execution = compile(dag([node('source', {}, { n: 'number' }), node('worker'), edge('source', 'worker', { id: 'checked-edge', if: 'n() is defined' })])).createExecution({});
  assert.throws(() => submit(execution, 'source', { n: 2 }), error => {
    assert.match(error.message, /checked-edge.*if/s);
    assert.match(error.message, /not a function/i);
    return true;
  });
});

test('computed for diagnostics keep target paths without inventing an upstream data path', () => {
  const program = expression => compile(dag([node('source', {}, { sets: object({}), selected: 'string' }), node('worker', { value: 'number' }), edge('source', 'worker', { for: expression })]));
  const literal = program('[{key: ""}]').createExecution({});
  assert.throws(() => submit(literal, 'source', { sets: {}, selected: 'x' }), error => error.code === 'INVALID_FOR_KEY' && error.dataPath === undefined);
  const dynamic = program('sets[selected]').createExecution({});
  assert.throws(() => submit(dynamic, 'source', { sets: { x: [{ key: 'a', value: 'wrong' }] }, selected: 'x' }), error => {
    assert.deepEqual(error.dataPath, ['value']);
    assert.equal(error.sources[0].dataPath, undefined);
    assert.ok(error.sources[0].instanceId);
    return true;
  });
});

test('dynamic for consumes arrays and rows under the existing own-data container contract', () => {
  const program = compile(dag([
    node('source', {}, { selected: 'string', sets: object({}) }), node('worker', { value: 'number' }),
    edge('source', 'worker', { for: 'sets[selected]' }),
  ]));
  let calls = 0;
  const accessor = { key: 'a', get value() { calls++; return 1; } };
  const proxy = value => new Proxy(value, { get() { calls++; throw Error('must not invoke'); }, ownKeys() { calls++; throw Error('must not invoke'); }, getPrototypeOf() { calls++; throw Error('must not invoke'); } });
  const arrayAccessor = []; Object.defineProperty(arrayAccessor, '0', { get() { calls++; return { key: 'a', value: 1 }; } });
  const date = Object.assign(new Date(), { key: 'a', value: 1 });
  for (const [rows, code] of [
    [[accessor], 'ACCESSOR_PROPERTY'], [[proxy({ key: 'a', value: 1 })], 'PROXY_CONTAINER'],
    [proxy([{ key: 'a', value: 1 }]), 'PROXY_CONTAINER'], [arrayAccessor, 'ACCESSOR_PROPERTY'],
    [[date], 'INVALID_FIELD_TYPE'], [[Object.assign(Object.create({ key: 'inherited' }), { value: 1 })], 'INVALID_FIELD_TYPE'],
  ]) {
    const execution = program.createExecution({});
    rejected(execution, task(execution, 'source').instanceId, { selected: 'extra', sets: { extra: rows } }, code);
  }
  assert.equal(calls, 0);
  const execution = program.createExecution({});
  const row = Object.create(null); Object.defineProperties(row, { key: { value: 'own' }, value: { value: 2 } });
  submit(execution, 'source', { selected: 'extra', sets: { extra: [row] } });
  assert.deepEqual(task(execution, 'worker').input, { value: 2 });
});

test('definition identifiers share exact ASCII rules while names remain optional display text', () => {
  const valid = ['a', '0', '2review', 'review_v2', 'review.zh', 'review-step', 'a'.repeat(1024)];
  const invalidIds = ['', '中文', 'Review', '_review', 'review_', 'review..zh', 'review-_task', ' review', 'review ', 'review task', 'review\n', 'review\r', 'review\t', 'review\0', 'review\u200b'];
  for (const id of valid) {
    for (const definition of [dag([], {}, {}, id), dag([node(id)]), dag([dag([], {}, {}, id)]), dag([node('source'), node('target'), edge('source', 'target', { id })])]) {
      assert.doesNotThrow(() => compile(definition), id);
    }
  }
  for (const id of invalidIds) {
    for (const definition of [dag([], {}, {}, id), dag([node(id)]), dag([dag([], {}, {}, id)]), dag([node('source'), node('target'), edge('source', 'target', { id })])]) invalid(definition, ['INVALID_STANDARD_FIELD']);
  }
  const named = { ...dag([node('first', {}, {}, { name: '同名' }), { ...dag([node('inside')], {}, {}, 'nested'), name: '同名' }, edge('first', 'nested', { id: 'link', name: '中文连线' })]), name: ' 根名称 ' };
  const program = compile(named);
  assert.deepEqual(program.getDefinition(), named);
  const execution = program.createExecution({});
  assert.equal(task(execution, 'first').definition.name, '同名');
  submit(execution, 'first', {});
  const restored = program.restoreExecution(execution.exportState());
  assert.equal(task(restored, 'inside').definition.id, 'inside');
  assert.deepEqual(restored.getSnapshot(), execution.getSnapshot());
  for (const name of ['', ' \n\t', null, 0, false, [], {}]) {
    for (const definition of [{ ...dag([]), name }, dag([node('a', {}, {}, { name })]), dag([{ ...dag([], {}, {}, 'nested'), name }]), dag([node('a'), node('b'), edge('a', 'b', { id: 'link', name })])]) invalid(definition, ['INVALID_STANDARD_FIELD']);
  }
  invalid(dag([node('same', {}, {}, { name: '甲' }), node('same', {}, {}, { name: '乙' })]), ['DUPLICATE_ID']);
});

test('for keys use exact identifiers, roll back atomically and survive partial completion and restore', () => {
  for (const expression of ['jobs', 'sets[selected]']) {
    const program = compile(dag([node('source', {}, { jobs, sets: object({}), selected: 'string' }), node('worker', { value: 'number' }, { result: 'number' }), edge('source', 'worker', { for: expression })], {}, { result: array('number') }));
    const execution = program.createExecution({});
    for (const key of ['中文', 'a/b', 'A', 'a ', 'a\n', 'a\0', 'a..b', 'a-_b']) {
      const rows = [{ key: 'valid', value: 1 }, { key, value: 2 }];
      const before = execution.exportState();
      rejected(execution, task(execution, 'source').instanceId, { jobs: rows, sets: { batch: rows }, selected: 'batch' }, 'INVALID_FOR_KEY');
      assert.deepEqual(execution.exportState(), before);
    }
    const rows = ['0', 'a_b', 'a.b', 'a-b'].map((key, value) => ({ key, value }));
    submit(execution, 'source', { jobs: rows, sets: { batch: rows }, selected: 'batch' });
    const workers = execution.getFrontier();
    assert.deepEqual(workers.map(item => item.forItem.key), ['0', 'a_b', 'a.b', 'a-b']);
    assert.ok(workers.every(item => !Object.hasOwn(item.input, 'key')));
    execution.submit(workers[3].instanceId, { result: 3 });
    const restored = program.restoreExecution(execution.exportState());
    assert.deepEqual(restored.getFrontier(), execution.getFrontier());
    for (const worker of restored.getFrontier().reverse()) restored.submit(worker.instanceId, { result: worker.input.value });
    assert.deepEqual(restored.getResult(), { status: 'completed', output: { result: [0, 1, 2, 3] } });
  }
});

test('JSON business field names stay unrestricted at every declared object level', () => {
  const keys = ['', '中文', 'a.b', 'a-b', 'line\nquote"\\', '__proto__', 'constructor'];
  const properties = Object.fromEntries(keys.map(key => [key, 'string']));
  const schema = { payload: object(properties), ...properties };
  const value = Object.fromEntries(keys.map(key => [key, `value:${key}`]));
  const data = { payload: { ...value }, ...value };
  const definition = dag([node('first', schema, schema), node('second', schema, schema), edge('first', 'second')], schema, schema);
  const execution = compile(definition).createExecution(data);
  assert.deepEqual(task(execution, 'first').input, data);
  submit(execution, 'first', data);
  assert.deepEqual(task(execution, 'second').input, data);
  submit(execution, 'second', data);
  assert.deepEqual(execution.getResult(), { status: 'completed', output: data });
});

test('separate expansions may reuse the same item key without changing instance identity scopes', () => {
  const execution = compile(dag([
    node('left', {}, { left_jobs: jobs }), node('right', {}, { right_jobs: jobs }), node('left-worker'), node('right-worker'),
    edge('left', 'left-worker', { for: 'left_jobs' }), edge('right', 'right-worker', { for: 'right_jobs' }),
  ])).createExecution({});
  submit(execution, 'left', { left_jobs: [{ key: 'same', value: 1 }] });
  submit(execution, 'right', { right_jobs: [{ key: 'same', value: 2 }] });
  const workers = execution.getFrontier();
  assert.equal(workers.length, 2);
  assert.notEqual(workers[0].instanceId, workers[1].instanceId);
  assert.deepEqual(workers.map(item => item.forItem), [{ key: 'same', index: 0 }, { key: 'same', index: 0 }]);
  for (const item of workers) execution.submit(item.instanceId, {});
  assert.deepEqual(execution.getResult(), { status: 'completed', output: {} });
});
