import { expect, it } from 'vitest';
import { assertionContext, bindInput, catalogContext, compileGate, compositionContext, defineAssertion, digest, readResource, schema } from '../../src/v2/index.js';
import type { AssertionCard } from '../../src/v2/index.js';

function module() {
  const make = (id: string, kind: AssertionCard['evidenceKind']) => defineAssertion({
    card: { id, version: '1', title: id, path: ['communication', 'legibility', 'business-reader'],
      claim: 'The specified fixture criterion passes.', input: { schemas: ['fixture@1'], capabilities: [], description: 'Explicit synthetic fixture.' }, evidenceKind: kind,
      assumptions: ['The criterion and population match the task.'], guarantees: ['Only the specified criterion.'], doesNotGuarantee: ['Comprehension or global quality.'],
      requires: [], costUpperBound: { evaluations: 1, tokens: 3 }, calibration: { status: kind === 'model-judgment' ? 'unqualified' : 'not-applicable', evidence: [], scope: 'Fixture only.' },
      remediation: { prompt: 'Revise the addressed passage.', harnessId: 'disabled-by-default', verification: ['criterion'] } },
    implementation: { id, version: '1', digest: digest(id) }, configuration: { cap: 4 }, applicability: { audience: 'Business decision-makers unfamiliar with technical jargon' },
    input: bindInput({ schemaId: 'fixture', schemaVersion: '1', schema: schema.object({ text: schema.string() }) }),
    async evaluate() { return { status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1, tokens: 3 } }; },
  });
  return { id: 'communication-fixture', version: '1', includes: [], assertions: [make('criterion', 'deterministic'), make('reader-judgment', 'model-judgment')] };
}

it('exposes a hierarchy and the actual configuration, scope and interpretation of each facet', () => {
  const result = catalogContext([module()]);
  const family = result.families.find(value => value.id === 'communication');
  expect(family?.children.find(value => value.path[1] === 'legibility')?.assertions).toHaveLength(2);
  expect(result.modules[0].assertions[0]).toMatchObject({ configuration: { cap: 4 }, applicability: { audience: 'Business decision-makers unfamiliar with technical jargon' }, runtimeInput: { schemaId: 'fixture', schemaVersion: '1' } });
  expect(result.modules[0].assertions[1].selectionStatus).toBe('advisory-only-unqualified');
  expect(result.evidenceKinds['model-judgment'].excluded.join(' ')).toContain('preference');
  expect(result.vocabulary.remediation).toContain('no permission');
});

it('preserves conjunctive guarantees and separate costs without inventing aggregate confidence', () => {
  const supplied = module();
  const gate = compileGate([supplied], [supplied.id], { required: ['criterion'], advisory: ['reader-judgment'] });
  const result = compositionContext(gate);
  expect(result.evaluationCostUpperBound).toEqual({ evaluations: 2, tokens: 6 });
  expect(result.assertions.map(value => value.card.doesNotGuarantee)).toEqual([['Comprehension or global quality.'], ['Comprehension or global quality.']]);
  expect(Object.hasOwn(result, 'confidence')).toBe(false);
  expect(result.selectionObligations.join(' ')).toContain('correlated errors');
  expect(() => { result.assertions[0].card.guarantees.push('Universal quality'); }).toThrow();
});

it('uses the same machine-readable vocabulary in transport-neutral catalog and subset resources', () => {
  const supplied = module(); const gate = compileGate([supplied], [supplied.id], { required: ['criterion'], advisory: [] });
  const catalog = readResource('quality://v2/assertion-catalog', { modules: [supplied] });
  expect(JSON.parse(catalog?.contents[0].text ?? '{}')).toMatchObject({ vocabulary: { output: expect.any(String) }, modules: [{ id: supplied.id }] });
  const subset = readResource('quality://v2/composition-card', { gate });
  expect(JSON.parse(subset?.contents[0].text ?? '{}')).toMatchObject({ card: { contractDigest: gate.digest } });
  expect(JSON.parse(readResource('quality://v2/composition-card')?.contents[0].text ?? '{}').status).toBe('unavailable');
  expect(readResource('quality://unknown')).toBeUndefined();
});

it('rejects a changed card statement under an unchanged semantic identity', () => {
  const assertion = module().assertions[0];
  expect(() => assertionContext({ ...assertion, card: { ...assertion.card, claim: 'A stronger guarantee.' } })).toThrow('disagrees');
});
