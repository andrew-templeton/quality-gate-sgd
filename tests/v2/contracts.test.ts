import { describe, expect, it, vi } from 'vitest';
import { BudgetLedger, bindInput, compileGate, defineAssertion, digest, discoverAssertions, evaluateGate, modelCard, parseSchema, schema, validateSchema } from '../../src/v2/index.js';
import type { Assertion, AssertionCard, AssertionModule, EvaluationContext, Observation, SchemaNode } from '../../src/v2/index.js';

const card = (): AssertionCard => ({
  id: 'threshold', version: '1', title: 'Configured threshold', path: ['measurement', 'regression'],
  input: { schemas: ['fixture.value@1'], capabilities: ['measured-value'], description: 'One numeric measurement.' },
  claim: 'The supplied measurement is at most the configured threshold.', evidenceKind: 'deterministic',
  assumptions: ['The measurement describes the declared artifact.'], guarantees: ['The configured numeric comparison.'],
  doesNotGuarantee: ['Measurement provenance or real-world fitness.'], requires: [], costUpperBound: { evaluations: 1 },
  calibration: { status: 'not-applicable', evidence: [], scope: 'Supplied numeric measurements only.' },
});
const implementation = { id: 'fixture/threshold', version: '1', digest: digest('fixture implementation') };
const binding = () => bindInput({ schemaId: 'fixture.value', schemaVersion: '1', path: ['measurement'], capabilities: ['measured-value'], schema: schema.object({ value: schema.number() }) });
function definition() {
  return { card: card(), implementation: { ...implementation }, configuration: { limits: { maximum: 10 } },
    applicability: { audience: 'fixture', measurementVersion: '1' }, input: binding(),
    async evaluate(_context: EvaluationContext, input: { value: number }, config: Readonly<{ limits: { maximum: number } }>): Promise<Observation> {
      const pass = input.value <= config.limits.maximum;
      return { status: pass ? 'pass' : 'fail', findings: pass ? [] : [{ address: 'measurement/value', message: 'Threshold exceeded', evidence: ['fixture'] }], evidence: ['fixture'], actualCost: { evaluations: 1 } };
    },
  };
}
const moduleOf = (assertion: Assertion): AssertionModule => ({ id: 'fixture', version: '1', includes: [], assertions: [assertion] });
const compile = (assertion: Assertion) => compileGate([moduleOf(assertion)], ['fixture'], { required: ['threshold'], advisory: [] });
const available = { schemas: ['fixture.value@1'], capabilities: ['measured-value'] };
const context = (data: unknown = { measurement: { value: 11 } }) => ({ artifact: { id: 'fixture', digest: 'revision', data }, environmentDigest: 'environment', available });

describe('portable execution contracts', () => {
  it('requires explicit identity and executable inputs by default, while marking legacy opt-in', () => {
    const legacy = { card: card(), evaluate: async (): Promise<Observation> => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: {} }) };
    expect(() => compile(legacy)).toThrow('explicit assertion contract');
    const gate = compileGate([moduleOf(legacy)], ['fixture'], { required: ['threshold'], advisory: [] }, { allowLegacyAssertions: true });
    expect(modelCard(gate)).toMatchObject({ legacyAssertions: ['threshold'] });
    expect(discoverAssertions([moduleOf(legacy)], available)[0].protocol).toBe('legacy');
  });

  it('snapshots instance configuration, nested values, bindings and the callback', async () => {
    class Consumer {
      limits = { maximum: 10 };
      assertion() { return defineAssertion({ ...definition(), configuration: { limits: this.limits } }); }
    }
    const owner = new Consumer();
    const assertion = owner.assertion();
    const gate = compile(assertion);
    owner.limits.maximum = 100;
    expect((await evaluateGate(gate, context(), new BudgetLedger({ evaluations: 1 }))).status).toBe('fail');
    expect(() => { assertion.evaluate = async () => { throw new Error('replaced'); }; }).toThrow();
    expect(Object.isFrozen(assertion.contract?.configuration)).toBe(true);
    const revised = owner.assertion();
    expect(revised.contract?.evaluatorDigest).not.toBe(assertion.contract?.evaluatorDigest);
    expect((await evaluateGate(compile(revised), context(), new BudgetLedger({ evaluations: 1 }))).status).toBe('pass');
  });

  it('passes validated typed values and recursively frozen configuration to the evaluator', async () => {
    const run = vi.fn(async (_context: EvaluationContext, input: { value: number }, config: Readonly<{ limits: { maximum: number } }>): Promise<Observation> => {
      expect(input.value).toBe(11);
      expect(() => { input.value = 0; }).toThrow();
      expect(() => { config.limits.maximum = 100; }).toThrow();
      return { status: 'pass', findings: [], evidence: ['typed-fixture'], actualCost: { evaluations: 1 } };
    });
    const assertion = defineAssertion({ ...definition(), evaluate: run });
    const payload = context();
    const result = await evaluateGate(compile(assertion), payload, new BudgetLedger({ evaluations: 1 }));
    expect(result.status).toBe('pass'); expect(run).toHaveBeenCalledOnce();
    expect(payload.artifact.data).toEqual({ measurement: { value: 11 } });
  });

  it.each([
    ['implementation version', (value: ReturnType<typeof definition>) => { value.implementation.version = '2'; }],
    ['implementation bytes', (value: ReturnType<typeof definition>) => { value.implementation.digest = digest('changed implementation'); }],
    ['configuration', (value: ReturnType<typeof definition>) => { value.configuration.limits.maximum = 20; }],
    ['applicability', (value: ReturnType<typeof definition>) => { value.applicability.audience = 'new population'; }],
    ['claim', (value: ReturnType<typeof definition>) => { value.card.claim = 'A stronger claim.'; }],
    ['assumptions', (value: ReturnType<typeof definition>) => { value.card.assumptions = ['A different assumption.']; }],
    ['guarantees', (value: ReturnType<typeof definition>) => { value.card.guarantees = ['A stronger guarantee.']; }],
    ['input version', (value: ReturnType<typeof definition>) => { value.input = { ...value.input, schemaVersion: '2' }; }],
    ['input schema', (value: ReturnType<typeof definition>) => { value.input = { ...value.input, schema: schema.object({ value: schema.number({ integer: true }) }).definition }; }],
    ['input path', (value: ReturnType<typeof definition>) => { value.input = { ...value.input, path: ['other'] }; }],
    ['capability', (value: ReturnType<typeof definition>) => { value.input = { ...value.input, capabilities: ['another-measurement'] }; }],
  ])('invalidates qualification when %s changes', (_label, change) => {
    const original = definition(); original.card.evidenceKind = 'model-judgment';
    const unqualified = defineAssertion(original);
    original.card.calibration = { status: 'qualified', evidence: ['scope-specific-held-out-report'], scope: 'fixture only',
      evaluatorDigest: unqualified.contract!.evaluatorDigest, applicabilityDigest: digest(original.applicability) };
    expect(() => compile(defineAssertion(original))).not.toThrow();
    change(original);
    expect(defineAssertion(original).contract!.evaluatorDigest).not.toBe(unqualified.contract!.evaluatorDigest);
    expect(() => compile(defineAssertion(original))).toThrow('complete current evaluator and applicability identity');
  });

  it('allows title edits without requalifying the semantic evaluator, but records a new gate digest', () => {
    const original = definition(); const first = defineAssertion(original);
    original.card.title = 'New display title'; const second = defineAssertion(original);
    expect(first.contract?.evaluatorDigest).toBe(second.contract?.evaluatorDigest);
    expect(compile(first).digest).not.toBe(compile(second).digest);
  });

  it('rejects tampered identities, contradictory metadata and unsupported protocols', () => {
    const original = defineAssertion(definition());
    for (const contract of [
      { ...original.contract!, evaluatorDigest: digest('forged') },
      { ...original.contract!, implementation: { ...implementation, digest: 'version-number' } },
      { ...original.contract!, protocol: 'other/v1' },
    ]) expect(() => compile({ ...original, contract: contract as typeof original.contract })).toThrow();
    expect(() => compile({ ...original, card: { ...original.card, claim: 'A different claim.' } })).toThrow('statement changed');
    expect(() => compile({ ...original, card: { ...original.card, input: { ...original.card.input, capabilities: [] } } })).toThrow('capabilities disagree');
  });
});

describe('pre-dispatch input validation and discovery', () => {
  it.each([
    ['missing path', {}], ['missing property', { measurement: {} }], ['wrong type', { measurement: { value: '11' } }],
    ['unknown property', { measurement: { value: 11, unsupported: true } }],
  ])('makes %s unavailable without calling or charging the evaluator', async (_label, data) => {
    const run = vi.fn(definition().evaluate);
    const result = await evaluateGate(compile(defineAssertion({ ...definition(), evaluate: run })), context(data), new BudgetLedger({ evaluations: 1 }));
    expect(result.status).toBe('unavailable'); expect(result.budget.spent).toEqual({}); expect(run).not.toHaveBeenCalled();
  });

  it.each([
    { schemas: [], capabilities: [] }, { schemas: ['fixture.value@2'], capabilities: ['measured-value'] },
    { schemas: ['fixture.value@1'], capabilities: [] },
  ])('uses the same version/capability compatibility rules for discovery and evaluation: %j', async declarations => {
    const assertion = defineAssertion(definition()); const module = moduleOf(assertion);
    expect(discoverAssertions([module], declarations)[0].declaredCompatible).toBe(false);
    const result = await evaluateGate(compile(assertion), { ...context(), available: declarations }, new BudgetLedger({ evaluations: 1 }));
    expect(result.status).toBe('unavailable'); expect(result.budget.spent).toEqual({});
  });

  it('does not infer runtime capabilities from the module declaration or the artifact shape', async () => {
    const supplied = context();
    const undeclared = { artifact: supplied.artifact, environmentDigest: supplied.environmentDigest };
    const result = await evaluateGate(compile(defineAssertion(definition())), undeclared, new BudgetLedger({ evaluations: 1 }));
    expect(result.status).toBe('unavailable'); expect(result.budget.spent).toEqual({});
  });

  it('keeps declaration matches distinct from actual payload validity', async () => {
    const assertion = defineAssertion(definition());
    expect(discoverAssertions([moduleOf(assertion)], available, 'threshold')[0]).toMatchObject({ protocol: 'quality-sgd.assertion/v1', declaredCompatible: true });
    const result = await evaluateGate(compile(assertion), context({ measurement: 'wrong shape' }), new BudgetLedger({ evaluations: 1 }));
    expect(result.status).toBe('unavailable'); expect(result.budget.spent).toEqual({});
  });
});

describe('bounded JSON schemas and integrity', () => {
  it('validates nested arrays, unions, literal values and optional properties without coercion', () => {
    const value = schema.object({ values: schema.array(schema.union(schema.literal('unknown'), schema.number({ minimum: 0, integer: true })), { minItems: 1, maxItems: 2 }) });
    expect(parseSchema(value, { values: ['unknown', 2] })).toEqual({ values: ['unknown', 2] });
    for (const input of [{ values: [] }, { values: [1, 2, 3] }, { values: [-1] }, { values: [1.5] }, { values: ['2'] }]) expect(() => parseSchema(value, input)).toThrow();
    const optional: SchemaNode = { kind: 'object', properties: { label: { kind: 'string' } }, optional: ['label'], additionalProperties: false };
    expect(parseSchema({ definition: optional }, {})).toEqual({});
  });

  it('rejects unsupported schema fields and ambiguous schema keys', () => {
    expect(() => validateSchema({ kind: 'number', maximum: 1, unsupported: true } as unknown as SchemaNode)).toThrow('unsupported field');
    expect(() => validateSchema({ kind: 'string', pattern: 'x' } as unknown as SchemaNode)).toThrow('unsupported field');
    expect(() => bindInput({ schemaId: 'fixture@value', schemaVersion: '1', schema: schema.number() })).toThrow('@ separator');
  });

  it('rejects accessors, hidden metadata, custom instances, sparse arrays and cycles before cloning', () => {
    const getter = vi.fn(() => 5); const accessor = Object.defineProperty({}, 'limit', { enumerable: true, get: getter });
    const hidden = Object.defineProperty({}, 'limit', { value: 5 });
    const sparse = new Array(2); sparse[0] = 1; sparse.extra = 2;
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    for (const bad of [accessor, hidden, new Date(), sparse, cycle, { value: NaN }]) {
      expect(() => digest(bad)).toThrow();
      expect(() => defineAssertion({ ...definition(), configuration: bad })).toThrow();
    }
    expect(getter).not.toHaveBeenCalled();
  });
});
