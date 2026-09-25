import { types } from 'node:util';
import type { DataMap, Schema, TypeDescriptor, DataPath, ExecutionPhase, ErrorLocation } from './types.js';
import { Fault } from './errors.js';

export function fail(code: import('./types.js').ExecutionErrorCode, phase: ExecutionPhase, location: ErrorLocation, dataPath?: DataPath): never {
  throw new Fault({ code, phase, location, ...(dataPath === undefined ? {} : { dataPath }), ...(dataPath !== undefined && location.instanceId !== undefined ? { sources: [{ instanceId: location.instanceId, dataPath: [...dataPath] }] } : {}) });
}
export function container(value: unknown, array: boolean, phase: ExecutionPhase, location: ErrorLocation, path: DataPath, top = false): Record<string, PropertyDescriptor> {
  if (types.isProxy(value)) fail('PROXY_CONTAINER', phase, location, path);
  if (array ? !Array.isArray(value) : value === null || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
    fail(top ? 'INVALID_MAP' : 'INVALID_FIELD_TYPE', phase, location, path);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) if (!('value' in descriptors[key]!)) fail('ACCESSOR_PROPERTY', phase, location, [...path, key]);
  return descriptors;
}
export function put(map: DataMap, key: string, value: unknown): void {
  Object.defineProperty(map, key, { value, enumerable: true, writable: true, configurable: true });
}
function field(value: unknown, type: TypeDescriptor, required: boolean, phase: ExecutionPhase, location: ErrorLocation, path: DataPath): unknown {
  if (typeof type === 'string') {
    if (typeof value !== type) fail('INVALID_FIELD_TYPE', phase, location, path);
    return value;
  }
  if (type.type === 'object') return copy(value, type.properties, required, phase, location, path, false);
  const descriptors = container(value, true, phase, location, path);
  const length = descriptors.length!.value as number;
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) result.push(field(descriptors[String(i)]?.value, type.items, required, phase, location, [...path, i]));
  for (const key of Object.keys(descriptors)) if (key !== 'length' && !(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < length)) put(result as unknown as DataMap, key, descriptors[key]!.value);
  return result;
}
export function copy(value: unknown, schema: Schema, required: boolean, phase: ExecutionPhase, location: ErrorLocation, path: DataPath = [], top = true): DataMap {
  const descriptors = container(value, false, phase, location, path, top);
  const result: DataMap = {};
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key]!;
    put(result, key, Object.hasOwn(schema, key) ? field(descriptor.value, schema[key]!, required, phase, location, [...path, key]) : descriptor.value);
  }
  if (required) for (const key of Object.keys(schema)) if (!Object.hasOwn(descriptors, key)) fail('MISSING_OUTPUT_FIELD', phase, location, [...path, key]);
  return result;
}
