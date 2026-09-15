import { expect, it, vi } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { compileGate } from '../../src/v2/catalog.js';
import { evaluateGate } from '../../src/v2/evaluate.js';
import type { Assertion, AssertionCard, Cost, Observation } from '../../src/v2/types.js';

const card = (id: string, cost: Cost = { evaluations: 1 }): AssertionCard => ({
  id, version: '1', title: id, path: ['measurement', 'regression'], claim: 'The supplied value is within the configured threshold.',
  input: { schemas: ['consumer/value-v1'], capabilities: [], description: 'A numeric fixture.' }, evidenceKind: 'deterministic',
  assumptions: ['The fixture value is supplied correctly.'], guarantees: ['The local threshold predicate is evaluated.'], doesNotGuarantee: ['Correctness beyond this predicate.'],
  requires: [], costUpperBound: cost, calibration: { status: 'not-applicable', evidence: [], scope: 'Synthetic predicate.' },
});
const compile = (assertions: Assertion[]) => compileGate([{ id: 'consumer', version: '1', includes: [], assertions }], ['consumer'], { required: assertions.map(assertion => assertion.card.id), advisory: [] });
const input = { artifact: { id: 'fixture', digest: 'current', data: { value: 11 } }, environmentDigest: 'test-environment' };

it('preserves a third-party class receiver when compiling its assertion', async () => {
  class ThresholdAssertion implements Assertion {
    card = card('threshold');
    private readonly threshold = 10;
    async evaluate(): Promise<Observation> {
      if (!Number.isFinite(this.threshold)) throw new Error('Consumer instance threshold lost');
      return { status: 'fail', findings: [{ address: 'value', message: `Value exceeds ${this.threshold}`, evidence: ['fixture'] }], evidence: ['fixture'], actualCost: { evaluations: 1 } };
    }
  }
  const assertion = new ThresholdAssertion();
  const direct = await assertion.evaluate();
  const result = await evaluateGate(compile([assertion]), input, new BudgetLedger({ evaluations: 1 }));
  expect(result.status).toBe(direct.status);
  expect(result.results[0].findings).toEqual(direct.findings);
  expect(result.budget.exceeded).toBe(false);
});

it('preflights every configured cost unit before dispatching any check', async () => {
  const run = vi.fn(async (): Promise<Observation> => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 } }));
  const gate = compile([{ card: card('first'), evaluate: run }, { card: card('later', { tokens: 50 }), evaluate: run }]);
  const budget = new BudgetLedger({ evaluations: 5 });
  await expect(evaluateGate(gate, input, budget)).rejects.toThrow(/No budget declared for tokens/);
  expect(run).not.toHaveBeenCalled();
  expect(budget.snapshot().spent).toEqual({});
});

it('does not allow a compiled runner to be replaced under the existing contract identity', () => {
  const evaluate = async (): Promise<Observation> => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 } });
  const gate = compile([{ card: card('check'), evaluate }]);
  expect(() => { gate.assertions[0].evaluate = async () => { throw new Error('different implementation'); }; }).toThrow();
  expect(() => { gate.assertions = []; }).toThrow();
});
