export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonObject
  | JsonValue[];

export type JsonObject = { [key: string]: JsonValue };
export type PrimitiveType = "string" | "number" | "boolean";
export type Schema = { [field: string]: TypeDescriptor };

export type TypeDescriptor =
  | PrimitiveType
  | ({ type: "object"; properties: Schema } & JsonObject)
  | ({ type: "array"; items: TypeDescriptor } & JsonObject);

export type NodeDefinition = {
  id: string;
  type: "node";
  input_schema?: Schema;
  output_schema?: Schema;
} & JsonObject;

export type DagDefinition = {
  id: string;
  type: "dag";
  dag: EntityDefinition[];
  input_schema?: Schema;
  output_schema?: Schema;
} & JsonObject;

export type EdgeDefinition = {
  id?: string;
  type: "edge";
  from: string;
  to: string;
  if?: string;
  for?: string;
} & JsonObject;

export type EntityDefinition =
  | NodeDefinition
  | DagDefinition
  | EdgeDefinition;

export type DataMap = Record<string, unknown>;
export type InstanceId = string;
export type DefinitionPath = readonly (string | number)[];
export type DataPath = readonly (string | number)[];

export interface Program {
  getDefinition(): DagDefinition;
  createExecution(rootInput: unknown): Execution;
}

export interface Execution {
  getFrontier(): FrontierItem[];
  getSnapshot(): ExecutionSnapshot;
  submit(instanceId: InstanceId, output: unknown): void;
  getResult(): ExecutionResult;
}

export interface ForItemIdentity {
  key: string;
  index: number;
}

export interface FrontierItem {
  instanceId: InstanceId;
  parentInstanceId: InstanceId;
  definition: NodeDefinition;
  input: DataMap;
  forItem?: ForItemIdentity;
}

export type ExecutionResult =
  | { status: "running" }
  | { status: "completed"; output: DataMap };

export interface PositionRef {
  parentInstanceId: InstanceId;
  definitionId: string;
}

export interface PositionSnapshot extends PositionRef {
  definitionPath: DefinitionPath;
}

export interface InstanceSnapshotBase {
  instanceId: InstanceId;
  definitionId: string;
  definitionPath: DefinitionPath;
  parentInstanceId: InstanceId | null;
  input: DataMap;
  forItem?: ForItemIdentity;
}

export type NodeSnapshot = InstanceSnapshotBase & (
  | { type: "node"; status: "ready"; output?: never }
  | { type: "node"; status: "completed"; output: DataMap }
);

export type DagSnapshot = InstanceSnapshotBase & (
  | { type: "dag"; status: "running"; output?: never }
  | { type: "dag"; status: "completed"; output: DataMap }
);

export type InstanceSnapshot = NodeSnapshot | DagSnapshot;

export interface RuntimeEdgeSnapshot {
  parentInstanceId: InstanceId;
  definitionPath: DefinitionPath;
  definitionId?: string;
  from: PositionRef;
  to: PositionRef;
  status: "pending" | "active" | "inactive";
}

export interface ExecutionSnapshot {
  rootInstanceId: InstanceId;
  instances: InstanceSnapshot[];
  waitingPositions: PositionSnapshot[];
  skippedPositions: PositionSnapshot[];
  edges: RuntimeEdgeSnapshot[];
}

export type CompileIssueCode =
  | "INVALID_DEFINITION"
  | "MISSING_STANDARD_FIELD"
  | "INVALID_STANDARD_FIELD"
  | "INVALID_JSON_VALUE"
  | "DUPLICATE_ID"
  | "UNKNOWN_TARGET"
  | "UNKNOWN_SOURCE"
  | "INVALID_ENDPOINT"
  | "DUPLICATE_EDGE"
  | "MULTIPLE_FOR_EDGES"
  | "CYCLIC_DEPENDENCY"
  | "INVALID_SCHEMA"
  | "INVALID_EXPRESSION"
  | "INVALID_FIELD_REFERENCE"
  | "EXPRESSION_TYPE_MISMATCH"
  | "MISSING_INPUT_PROVIDER"
  | "SCHEMA_TYPE_MISMATCH"
  | "INPUT_SCHEMA_KEY_CONFLICT"
  | "OUTPUT_SCHEMA_KEY_CONFLICT"
  | "INCOMPLETE_OUTPUT_SCHEMA"
  | "RECURSION_WITHOUT_INPUT"
  | "RECURSION_WITHOUT_CONDITION";

export interface CompileIssue {
  code: CompileIssueCode;
  path: DefinitionPath;
  message: string;
}

export type ExecutionErrorCode =
  | "INVALID_INSTANCE_ID"
  | "UNKNOWN_INSTANCE"
  | "NOT_SUBMITTABLE"
  | "ALREADY_COMPLETED"
  | "INVALID_MAP"
  | "INVALID_FIELD_TYPE"
  | "MISSING_OUTPUT_FIELD"
  | "ACCESSOR_PROPERTY"
  | "PROXY_CONTAINER"
  | "INPUT_KEY_CONFLICT"
  | "DAG_OUTPUT_KEY_CONFLICT"
  | "INVALID_FOR_VALUE"
  | "INVALID_FOR_KEY"
  | "DUPLICATE_FOR_KEY"
  | "EXPRESSION_EVALUATION_ERROR"
  | "INTERNAL_ERROR";

export type ExecutionPhase =
  | "instance-check"
  | "root-input"
  | "node-output"
  | "edge-evaluation"
  | "for-expansion"
  | "input-merge"
  | "input-validation"
  | "group-aggregation"
  | "dag-output-merge"
  | "dag-output-validation";

export interface ErrorLocation {
  definitionPath?: DefinitionPath;
  definitionId?: string;
  parentInstanceId?: InstanceId;
  instanceId?: InstanceId;
  forItem?: ForItemIdentity;
}

export interface ErrorSource {
  position?: PositionRef;
  instanceId?: InstanceId;
  dataPath?: DataPath;
}
