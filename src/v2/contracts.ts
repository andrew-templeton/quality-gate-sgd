import type { Assertion, AssertionCard, EvaluationContext, Observation } from './types.js';
import { digest, freezeJson, requireThat, text, unique } from './validation.js';

/** Deliberately bounded schema algebra; unsupported keywords cannot be silently ignored. */
export type SchemaNode =
  | { kind: 'json' }
  | { kind: 'string'; minLength?: number }
  | { kind: 'number'; integer?: boolean; minimum?: number; maximum?: number }
  | { kind: 'boolean' }
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'array'; items: SchemaNode; minItems?: number; maxItems?: number }
  | { kind: 'object'; properties: Record<string, SchemaNode>; optional: string[]; additionalProperties: boolean }
  | { kind: 'union'; variants: SchemaNode[] };
export interface ValueSchema<T> { readonly definition: SchemaNode; readonly valueType?: T }
export type SchemaValue<S> = S extends ValueSchema<infer T> ? T : never;
const valueSchema = <T>(definition: SchemaNode): ValueSchema<T> => freezeJson({ definition });
export const schema = {
  json: (): ValueSchema<unknown> => valueSchema({ kind: 'json' }),
  string: (options: { minLength?: number } = {}): ValueSchema<string> => valueSchema({ kind: 'string', ...options }),
  number: (options: { integer?: boolean; minimum?: number; maximum?: number } = {}): ValueSchema<number> => valueSchema({ kind: 'number', ...options }),
  boolean: (): ValueSchema<boolean> => valueSchema({ kind: 'boolean' }),
  literal: <T extends string | number | boolean | null>(value: T): ValueSchema<T> => valueSchema({ kind: 'literal', value }),
  array: <T>(items: ValueSchema<T>, options: { minItems?: number; maxItems?: number } = {}): ValueSchema<T[]> => valueSchema({ kind: 'array', items: items.definition, ...options }),
  object: <S extends Record<string, ValueSchema<unknown>>>(properties: S): ValueSchema<{ [K in keyof S]: SchemaValue<S[K]> }> => valueSchema({
    kind: 'object', properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, value.definition])), optional: [], additionalProperties: false,
  }),
  union: <S extends readonly ValueSchema<unknown>[]>(...variants: S): ValueSchema<SchemaValue<S[number]>> => valueSchema({ kind: 'union', variants: variants.map(value => value.definition) }),
};

function fields(value: object, allowed: string[], label: string): void {
  requireThat(Object.keys(value).every(key => allowed.includes(key)), `${label} has an unsupported field`);
}
function nonnegativeInteger(value: unknown, label: string): void {
  requireThat(Number.isSafeInteger(value) && (value as number) >= 0, `${label} must be a nonnegative safe integer`);
}
export function validateSchema(node: SchemaNode): void {
  digest(node);
  requireThat(node && typeof node === 'object' && !Array.isArray(node), 'Schema node must be an object');
  switch (node.kind) {
    case 'json': fields(node, ['kind'], 'JSON schema'); break;
    case 'string':
      fields(node, ['kind', 'minLength'], 'String schema');
      if (node.minLength !== undefined) nonnegativeInteger(node.minLength, 'minLength');
      break;
    case 'number':
      fields(node, ['kind', 'integer', 'minimum', 'maximum'], 'Number schema');
      if (node.integer !== undefined) requireThat(typeof node.integer === 'boolean', 'integer must be boolean');
      for (const bound of [node.minimum, node.maximum]) if (bound !== undefined) requireThat(Number.isFinite(bound), 'Numeric bounds must be finite');
      if (node.minimum !== undefined && node.maximum !== undefined) requireThat(node.minimum <= node.maximum, 'Numeric bounds are reversed');
      break;
    case 'boolean': fields(node, ['kind'], 'Boolean schema'); break;
    case 'literal': fields(node, ['kind', 'value'], 'Literal schema'); requireThat(node.value === null || ['string', 'boolean'].includes(typeof node.value) || typeof node.value === 'number' && Number.isFinite(node.value), 'Invalid literal'); break;
    case 'array':
      fields(node, ['kind', 'items', 'minItems', 'maxItems'], 'Array schema'); validateSchema(node.items);
      for (const bound of [node.minItems, node.maxItems]) if (bound !== undefined) nonnegativeInteger(bound, 'Array bound');
      if (node.minItems !== undefined && node.maxItems !== undefined) requireThat(node.minItems <= node.maxItems, 'Array bounds are reversed');
      break;
    case 'object':
      fields(node, ['kind', 'properties', 'optional', 'additionalProperties'], 'Object schema');
      requireThat(node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties), 'Schema properties required');
      unique(node.optional, 'Optional properties');
      requireThat(node.optional.every(key => Object.hasOwn(node.properties, key)), 'Optional property is undeclared');
      requireThat(typeof node.additionalProperties === 'boolean', 'additionalProperties must be explicit');
      for (const [key, child] of Object.entries(node.properties)) { text(key, 'Property name'); validateSchema(child); }
      break;
    case 'union':
      fields(node, ['kind', 'variants'], 'Union schema'); requireThat(Array.isArray(node.variants) && node.variants.length > 0, 'Union variants required'); node.variants.forEach(validateSchema); break;
    default: throw new Error('Unsupported schema kind');
  }
}

function match(node: SchemaNode, value: unknown, address: string): void {
  const fail = (condition: unknown, reason: string): void => requireThat(condition, `${address}: ${reason}`);
  switch (node.kind) {
    case 'json': return;
    case 'string': fail(typeof value === 'string' && value.length >= (node.minLength ?? 0), 'expected string of required length'); return;
    case 'number': fail(typeof value === 'number' && Number.isFinite(value) && (!node.integer || Number.isSafeInteger(value)) && value >= (node.minimum ?? -Infinity) && value <= (node.maximum ?? Infinity), 'expected number within declared bounds'); return;
    case 'boolean': fail(typeof value === 'boolean', 'expected boolean'); return;
    case 'literal': fail(value === node.value, 'literal mismatch'); return;
    case 'array':
      requireThat(Array.isArray(value), `${address}: expected array`);
      fail(value.length >= (node.minItems ?? 0) && value.length <= (node.maxItems ?? Infinity), 'array length outside bounds');
      value.forEach((entry, index) => match(node.items, entry, `${address}/${index}`)); return;
    case 'object': {
      requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${address}: expected object`);
      const record = value as Record<string, unknown>;
      if (!node.additionalProperties) fail(Object.keys(record).every(key => Object.hasOwn(node.properties, key)), 'unexpected property');
      for (const [key, child] of Object.entries(node.properties)) {
        if (!Object.hasOwn(record, key)) fail(node.optional.includes(key), `missing ${key}`);
        else match(child, record[key], `${address}/${key}`);
      }
      return;
    }
    case 'union': {
      for (const variant of node.variants) { try { match(variant, value, address); return; } catch { /* Try the declared alternative. */ } }
      throw new Error(`${address}: no declared union alternative matched`);
    }
  }
}
export function parseSchema<T>(definition: ValueSchema<T>, input: unknown): T {
  validateSchema(definition.definition);
  digest(input); // Reject non-JSON data rather than dropping it during cloning.
  match(definition.definition, input, '$');
  return freezeJson(structuredClone(input)) as T;
}

export interface InputContract {
  schemaId: string;
  schemaVersion: string;
  schema: SchemaNode;
  /** Own properties from artifact.data. Empty path binds the complete payload. */
  path: string[];
  capabilities: string[];
}
export interface InputBinding<T> extends InputContract { readonly valueType?: T }
export function bindInput<T>(options: { schemaId: string; schemaVersion: string; schema: ValueSchema<T>; path?: string[]; capabilities?: string[] }): InputBinding<T> {
  const binding = { schemaId: options.schemaId, schemaVersion: options.schemaVersion, schema: options.schema.definition, path: options.path ?? [], capabilities: options.capabilities ?? [] };
  validateInputContract(binding);
  return freezeJson(structuredClone(binding));
}
export function inputSchemaKey(input: Pick<InputContract, 'schemaId' | 'schemaVersion'>): string { return `${input.schemaId}@${input.schemaVersion}`; }
export function validateInputContract(input: InputContract): void {
  digest(input);
  fields(input, ['schemaId', 'schemaVersion', 'schema', 'path', 'capabilities'], 'Input binding');
  text(input.schemaId, 'Schema ID'); text(input.schemaVersion, 'Schema version');
  requireThat(!input.schemaId.includes('@') && !input.schemaVersion.includes('@'), 'Schema ID and version must not contain the @ separator');
  requireThat(Array.isArray(input.path), 'Input path required'); input.path.forEach(key => text(key, 'Input path field'));
  unique(input.capabilities, 'Input capabilities'); validateSchema(input.schema); digest(input);
}
export function inputCompatibility(contract: InputContract, available: EvaluationContext['available']) {
  const key = inputSchemaKey(contract);
  const missingSchemas = available?.schemas.includes(key) ? [] : [key];
  const missingCapabilities = contract.capabilities.filter(value => !available?.capabilities.includes(value));
  return { missingSchemas, missingCapabilities, declaredCompatible: missingSchemas.length === 0 && missingCapabilities.length === 0 };
}
export function prepareInput<T>(contract: InputBinding<T>, context: Omit<EvaluationContext, 'signal'>): T {
  const compatibility = inputCompatibility(contract, context.available);
  requireThat(compatibility.declaredCompatible, `Input contract unavailable: ${[...compatibility.missingSchemas, ...compatibility.missingCapabilities].join(', ')}`);
  let value = context.artifact.data;
  for (const field of contract.path) {
    requireThat(value !== null && typeof value === 'object' && Object.hasOwn(value, field), `Input path missing: ${field}`);
    value = (value as Record<string, unknown>)[field];
  }
  return parseSchema({ definition: contract.schema }, value) as T;
}

export interface AssertionContract {
  protocol: 'quality-sgd.assertion/v1';
  implementation: { id: string; version: string; digest: string };
  configuration: unknown;
  applicability: unknown;
  statementDigest: string;
  input: InputContract;
  evaluatorDigest: string;
}
export function evaluatorIdentity(contract: Omit<AssertionContract, 'evaluatorDigest'> | AssertionContract): string {
  return digest({ protocol: contract.protocol, implementation: contract.implementation, configuration: contract.configuration, applicability: contract.applicability, statementDigest: contract.statementDigest, input: contract.input });
}
export function assertionStatement(card: AssertionCard): string {
  return digest({ id: card.id, claim: card.claim, evidenceKind: card.evidenceKind, assumptions: card.assumptions,
    guarantees: card.guarantees, doesNotGuarantee: card.doesNotGuarantee, requires: card.requires });
}
export function validateAssertionContract(contract: AssertionContract): void {
  fields(contract, ['protocol', 'implementation', 'configuration', 'applicability', 'statementDigest', 'input', 'evaluatorDigest'], 'Assertion contract');
  requireThat(contract.protocol === 'quality-sgd.assertion/v1', 'Unsupported assertion protocol');
  fields(contract.implementation, ['id', 'version', 'digest'], 'Implementation identity');
  for (const key of ['id', 'version', 'digest'] as const) text(contract.implementation[key], `Implementation ${key}`);
  requireThat(/^[a-f0-9]{64}$/.test(contract.implementation.digest), 'Implementation digest must be SHA-256');
  requireThat(/^[a-f0-9]{64}$/.test(contract.statementDigest), 'Statement digest must be SHA-256');
  validateInputContract(contract.input);
  requireThat(contract.evaluatorDigest === evaluatorIdentity(contract), 'Evaluator identity mismatch');
}

/**
 * Semantic configuration is passed as a frozen snapshot, never as the caller's object.
 * Implementation identity is an integrity declaration, not attestation of honest JavaScript.
 * Evaluators must use the supplied configuration; undeclared mutable closure state violates this contract.
 */
export function defineAssertion<C, I>(definition: {
  card: AssertionCard;
  implementation: AssertionContract['implementation'];
  configuration: C;
  applicability: unknown;
  input: InputBinding<I>;
  evaluate(context: EvaluationContext, input: I, configuration: Readonly<C>): Promise<Observation>;
}): Assertion {
  digest(definition.card);
  const supplied = { protocol: 'quality-sgd.assertion/v1' as const, implementation: definition.implementation,
    configuration: definition.configuration, applicability: definition.applicability, statementDigest: assertionStatement(definition.card), input: definition.input };
  digest(supplied); // Validate before cloning can erase unsupported metadata or execute accessors.
  const body = freezeJson(structuredClone(supplied));
  const contract = freezeJson({ ...body, evaluatorDigest: evaluatorIdentity(body) });
  validateAssertionContract(contract);
  const card = freezeJson(structuredClone({ ...definition.card, input: { ...definition.card.input,
    schemas: [inputSchemaKey(contract.input)], capabilities: contract.input.capabilities } }));
  const run = definition.evaluate.bind(undefined);
  return Object.freeze({ card, contract, async evaluate(context: EvaluationContext) {
    return run(context, prepareInput<I>(contract.input, context), contract.configuration as Readonly<C>);
  } });
}
