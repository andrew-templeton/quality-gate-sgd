import { describe, expect, it } from 'vitest';
import { assessFiniteVerifier, type FiniteVerifierObservation, type FiniteVerifierProtocol } from '../../src/v2/finite-calibration.js';
import { bindInput, defineAssertion, schema } from '../../src/v2/contracts.js';
import { digest } from '../../src/v2/validation.js';

function fixture() {
  const assertion = defineAssertion({
    card: { id: 'finite', version: '1', title: 'Finite predicate', path: ['measurement', 'arithmetic'], claim: 'Fixture predicate',
      input: { schemas: [], capabilities: [], description: 'Declared finite cases' }, evidenceKind: 'deterministic',
      assumptions: ['References supplied'], guarantees: ['Predicate execution'], doesNotGuarantee: ['Unseen inputs'], requires: [],
      costUpperBound: { steps: 1 }, calibration: { status: 'not-applicable', scope: 'Finite test', evidence: [] } },
    implementation: { id: 'fixture', version: '1', digest: digest('fixture') }, configuration: { threshold: 1 }, applicability: { scope: 'finite' },
    input: bindInput({ schemaId: 'integer', schemaVersion: '1', schema: schema.number({ integer: true }) }),
    async evaluate() { return { status: 'pass', findings: [], evidence: ['fixture'], actualCost: { steps: 1 } }; },
  });
  if (!assertion.contract) throw new Error('Standard evaluator contract required');
  const evaluator = assertion.contract;
  const protocol: FiniteVerifierProtocol = { id: 'census', version: '1', scope: 'Four explicitly named cases only', evaluatorDigest: evaluator.evaluatorDigest,
    applicabilityDigest: digest(evaluator.applicability), population: ['good-a', 'good-b', 'bad-a', 'bad-b'].map(id => ({ id, inputDigest: digest(id),
      label: id.startsWith('good') ? 'acceptable' : 'unacceptable', labelEvidence: ['mathematical fixture definition'] })),
    reference: { kind: 'mathematical-definition', description: 'Fixed fixture labels', evidence: ['fixture-source'] },
    design: { kind: 'exhaustive-finite-population', weighting: 'uniform-within-label', dependence: 'Complete finite enumeration; no sampling model', evidenceUse: 'Repeated mechanical control', registeredBeforeExecution: false },
    thresholds: { maximumFalseAcceptRate: 0, maximumFalseRejectRate: 0 }, consequences: { unit: 'assumed-points', falseAccept: 10, falseReject: 2, basis: 'Test operator assumptions' } };
  const observations: FiniteVerifierObservation[] = protocol.population.map(item => ({ caseId: item.id, inputDigest: item.inputDigest,
    evaluatorDigest: evaluator.evaluatorDigest, verdict: item.label === 'acceptable' ? 'accept' : 'reject', evidence: ['actual fixture outcome'], actualCost: { steps: 1 } }));
  return { evaluator, protocol, observations };
}

describe('finite verifier census evidence', () => {
  it('reports exact rates only for the explicit finite population without statistical qualification', () => {
    const { evaluator, protocol, observations } = fixture();
    const result = assessFiniteVerifier(protocol, observations, evaluator);
    expect(result.status).toBe('meets-finite-thresholds');
    expect(result.falseAccept).toMatchObject({ population: 2, errors: 0, rate: 0, completionBounds: { lower: 0, upper: 0 } });
    expect(result.actualCost).toEqual({ steps: 4 });
    expect(result).not.toHaveProperty('confidence');
    expect(result.limitations.join(' ')).toMatch(/does not qualify unseen inputs/);
  });

  it('preserves separate error classes and their declared consequences', () => {
    const { evaluator, protocol, observations } = fixture();
    observations[0].verdict = 'reject'; observations[2].verdict = 'accept';
    const result = assessFiniteVerifier(protocol, observations, evaluator);
    expect(result.status).toBe('fails-finite-thresholds');
    expect(result.falseAccept.rate).toBe(0.5); expect(result.falseReject.rate).toBe(0.5);
    expect(result.knownErrorConsequence.amount).toBe(12);
  });

  it('retains known errors and missing/unavailable cases in completion bounds over the full denominators', () => {
    const { evaluator, protocol, observations } = fixture();
    observations[0].verdict = 'reject';
    observations[2] = { ...observations[2], verdict: 'unavailable', reason: 'Scanner failed' };
    const result = assessFiniteVerifier(protocol, observations.slice(0, 3), evaluator);
    expect(result.status).toBe('incomplete-census');
    expect(result.falseAccept).toMatchObject({ population: 2, unavailable: 1, missing: 1, rate: null, completionBounds: { lower: 0, upper: 1 } });
    expect(result.falseReject).toMatchObject({ rate: 0.5, completionBounds: { lower: 0.5, upper: 0.5 } });
    expect(result.unresolved.map(item => item.kind)).toEqual(['unavailable', 'missing']);
  });

  it('blocks a complete verdict despite permissive thresholds when outcomes are unknown', () => {
    const { evaluator, protocol } = fixture();
    protocol.thresholds = { maximumFalseAcceptRate: 1, maximumFalseRejectRate: 1 };
    expect(assessFiniteVerifier(protocol, [], evaluator).status).toBe('incomplete-census');
  });

  it('rejects changed configuration, applicability, inputs, duplicates and unknown members', () => {
    const { evaluator, protocol, observations } = fixture();
    expect(() => assessFiniteVerifier({ ...protocol, evaluatorDigest: digest('old-version') }, observations, evaluator)).toThrow(/current evaluator/);
    expect(() => assessFiniteVerifier({ ...protocol, applicabilityDigest: digest('other-scope') }, observations, evaluator)).toThrow(/applicability/);
    expect(() => assessFiniteVerifier(protocol, [{ ...observations[0], inputDigest: digest('changed') }], evaluator)).toThrow(/changed input/);
    expect(() => assessFiniteVerifier(protocol, [{ ...observations[0], evaluatorDigest: digest('changed') }], evaluator)).toThrow(/stale evaluator/);
    expect(() => assessFiniteVerifier(protocol, [observations[0], observations[0]], evaluator)).toThrow(/unique/);
    expect(() => assessFiniteVerifier(protocol, [{ ...observations[0], caseId: 'unregistered' }], evaluator)).toThrow(/Unknown case/);
  });

  it('requires both classes, explicit thresholds, valid metering and failure reasons', () => {
    const { evaluator, protocol, observations } = fixture();
    expect(() => assessFiniteVerifier({ ...protocol, population: protocol.population.slice(0, 2) }, [], evaluator)).toThrow(/Both reference classes/);
    expect(() => assessFiniteVerifier({ ...protocol, thresholds: {} as FiniteVerifierProtocol['thresholds'] }, [], evaluator)).toThrow(/thresholds/);
    expect(() => assessFiniteVerifier(protocol, [{ ...observations[0], verdict: 'unavailable' }], evaluator)).toThrow(/reason/);
    expect(() => assessFiniteVerifier(protocol, [{ ...observations[0], actualCost: { steps: -1 } }], evaluator)).toThrow();
  });

  it('preserves explicitly named resource units even when they match object prototype names', () => {
    const { evaluator, protocol, observations } = fixture();
    observations[0].actualCost = Object.fromEntries([['__proto__', 1], ['constructor', 2]]);
    const result = assessFiniteVerifier(protocol, observations, evaluator);
    expect(Object.hasOwn(result.actualCost, '__proto__')).toBe(true);
    expect(result.actualCost['__proto__']).toBe(1); expect(result.actualCost.constructor).toBe(2);
  });
});
