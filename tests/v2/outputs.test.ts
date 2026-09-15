import { describe, expect, it, vi } from 'vitest';
import { BudgetLedger, DurableRun, bindInput, compileGate, defineAssertion, defineOutput, digest, evaluateGate, fromAssertion, schema } from '../../src/v2/index.js';
import type { Assertion, AssertionCard, Observation } from '../../src/v2/index.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const card = (id: string, requires: string[] = []): AssertionCard => ({
  id, version: '1', title: id, path: ['measurement', 'arithmetic'], claim: 'Compute the specified supplied-value arithmetic.',
  input: { schemas: ['fixture.amounts@1'], capabilities: [], description: 'Supplied numeric amounts.' },
  evidenceKind: 'deterministic', assumptions: ['The supplied values are the intended inputs.'], guarantees: ['Specified arithmetic only.'],
  doesNotGuarantee: ['Source authenticity or decision utility.'], requires, costUpperBound: { evaluations: 1 },
  calibration: { status: 'not-applicable', evidence: [], scope: 'Deterministic fixture.' },
});
const input = bindInput({ schemaId: 'fixture.amounts', schemaVersion: '1', schema: schema.object({ values: schema.array(schema.number()) }) });
const output = defineOutput({ schemaId: 'fixture.total', schemaVersion: '1', schema: schema.object({ total: schema.number() }) });
const base = { implementation: { id: 'fixture/arithmetic', version: '1', digest: digest('arithmetic fixture') }, configuration: {}, applicability: { scope: 'fixture' }, input };
const pass = (outputValue: unknown): Observation => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 }, output: outputValue });
function pair() {
  const produce = vi.fn(async (_context, amounts) => pass({ total: amounts.values.reduce((sum: number, value: number) => sum + value, 0) }));
  const consume = vi.fn(async (_context, _input, _config, upstream) => {
    expect(Object.isFrozen(upstream.total)).toBe(true);
    return pass({ total: upstream.total.total * 2 });
  });
  const first = defineAssertion({ ...base, card: card('sum'), output, evaluate: produce });
  const second = defineAssertion({ ...base, card: card('double', ['sum']), output, prerequisites: { total: fromAssertion('sum', output) }, evaluate: consume });
  return { first, second, produce, consume };
}
const compile = (assertions: Assertion[], required = ['double']) => compileGate([{ id: 'fixture', version: '1', includes: [], assertions }], ['fixture'], { required, advisory: [] });
const context = (values = [2, 3]) => ({ artifact: { id: 'fixture', digest: digest(values), data: { values } }, environmentDigest: 'environment', available: { schemas: ['fixture.amounts@1'], capabilities: [] } });

describe('typed prerequisite evidence', () => {
  it('hands validated frozen data downstream with current producer, schema, input and dependency identities', async () => {
    const { first, second, produce, consume } = pair();
    const result = await evaluateGate(compile([first, second]), context(), new BudgetLedger({ evaluations: 2 }));
    expect(result.status).toBe('pass'); expect(produce).toHaveBeenCalledOnce(); expect(consume).toHaveBeenCalledOnce();
    const a = result.results[0].outputEvidence; const b = result.results[1].outputEvidence;
    expect(a).toMatchObject({ assertionId: 'sum', evaluatorDigest: first.contract?.evaluatorDigest, inputDigest: result.inputDigest, schemaDigest: digest(output), value: { total: 5 }, dependencies: [] });
    expect(b).toMatchObject({ assertionId: 'double', inputDigest: result.inputDigest, value: { total: 10 }, dependencies: [a?.digest] });
    expect(result.budget.spent).toEqual({ evaluations: 2 });
  });

  it.each(['missing', 'malformed', 'unavailable', 'failed'])('blocks dependents on %s upstream data', async kind => {
    const { first, second, consume } = pair();
    const observed: Observation = kind === 'missing' ? { status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 } }
      : kind === 'malformed' ? pass({ total: 'not-numeric' })
      : { status: kind === 'failed' ? 'fail' : 'unavailable', findings: kind === 'failed' ? [{ address: 'source', message: 'Bad source', evidence: ['fixture'] }] : [], evidence: ['fixture'], actualCost: { evaluations: 1 } };
    const malformed = { ...first, evaluate: async () => observed };
    const result = await evaluateGate(compile([malformed, second]), context(), new BudgetLedger({ evaluations: 2 }));
    expect(result.status).not.toBe('pass'); expect(consume).not.toHaveBeenCalled();
    expect(result.results[1]).toMatchObject({ status: 'unavailable', reasonCode: 'prerequisite-blocked', actualCost: {} });
    expect(result.budget.spent).toEqual({ evaluations: 1 });
  });

  it('rejects a missing producer, undeclared dependency and incompatible output schema/version at compilation', () => {
    const { first, second } = pair();
    expect(() => compile([second])).toThrow('Unknown assertion sum');
    const badDependency = defineAssertion({ ...base, card: card('double'), prerequisites: { total: fromAssertion('sum', output) }, evaluate: async () => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: {} }) });
    expect(() => compile([first, badDependency])).toThrow('explicit prerequisites');
    for (const changed of [{ ...output, schemaVersion: '2' }, { ...output, schema: schema.object({ total: schema.string() }).definition }]) {
      const consumer = defineAssertion({ ...base, card: card('double', ['sum']), prerequisites: { total: fromAssertion('sum', changed) }, evaluate: async () => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: {} }) });
      expect(() => compile([first, consumer])).toThrow('output contract mismatch');
    }
  });

  it('does not accept caller-injected upstream evidence or a producer-supplied host envelope', async () => {
    const { first, second, consume } = pair(); const gate = compile([first, second]);
    const original = await evaluateGate(gate, context(), new BudgetLedger({ evaluations: 2 }));
    await expect(evaluateGate(gate, { ...context([9]), prerequisites: { total: original.results[0].outputEvidence } } as ReturnType<typeof context>, new BudgetLedger({ evaluations: 2 }))).rejects.toThrow('engine-owned');
    const forged = { ...first, evaluate: async () => ({ ...pass({ total: 9 }), outputEvidence: original.results[0].outputEvidence }) };
    const revised = await evaluateGate(compile([forged, second]), context([9]), new BudgetLedger({ evaluations: 2 }));
    expect(revised.results[0].outputEvidence?.value).toEqual({ total: 9 });
    expect(revised.results[0].outputEvidence?.inputDigest).not.toBe(original.inputDigest);
    expect(revised.results[1].output).toEqual({ total: 18 }); expect(consume).toHaveBeenCalledTimes(2);
  });

  it('invalidates evaluator identity and qualification when the output contract changes', () => {
    const original = defineAssertion({ ...base, card: card('sum'), output, evaluate: async () => pass({ total: 5 }) });
    const qualifiedCard = { ...original.card, calibration: { status: 'qualified' as const, evidence: ['registered-study'], scope: 'fixture', evaluatorDigest: original.contract?.evaluatorDigest, applicabilityDigest: digest(base.applicability) } };
    const revised = defineAssertion({ ...base, card: qualifiedCard, output: { ...output, schemaVersion: '2' }, evaluate: async () => pass({ total: 5 }) });
    expect(revised.contract?.evaluatorDigest).not.toBe(original.contract?.evaluatorDigest);
    expect(() => compile([revised], ['sum'])).toThrow('complete current evaluator');
  });

  it('restores upstream output receipts without re-evaluation and rejects a changed contract on resume', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'quality-output-')); const path = join(directory, 'run.json');
    const { first, second, produce, consume } = pair(); const gate = compile([first, second]);
    let run: DurableRun | undefined;
    try {
      run = DurableRun.open({ path, contractDigest: gate.digest, environmentDigest: 'environment', limits: { evaluations: 2 } });
      const before = await evaluateGate(gate, context(), run.budget, { durability: run }); run.close();
      run = DurableRun.open({ path, contractDigest: gate.digest, environmentDigest: 'environment', limits: { evaluations: 2 } });
      const after = await evaluateGate(gate, context(), run.budget, { durability: run });
      expect(after).toEqual(before); expect(produce).toHaveBeenCalledOnce(); expect(consume).toHaveBeenCalledOnce(); run.close(); run = undefined;
      expect(() => DurableRun.open({ path, contractDigest: digest('changed-evaluator'), environmentDigest: 'environment', limits: { evaluations: 2 } })).toThrow('contract/environment changed');
    } finally { run?.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
