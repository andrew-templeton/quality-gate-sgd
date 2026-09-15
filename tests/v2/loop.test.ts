import { describe, expect, it, vi } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { compileGate } from '../../src/v2/catalog.js';
import { runQualityLoop } from '../../src/v2/loop.js';
import type { QualityLoopOptions } from '../../src/v2/loop.js';
import type { Artifact, Assertion, Nudge } from '../../src/v2/types.js';
import { digest } from '../../src/v2/validation.js';

interface Data { loss: number; safe: boolean; nonce?: number }
const artifact = (data: Data): Artifact => ({ id: 'fixture', digest: digest(data), data });
const repair = (): Nudge => ({ id: 'repair', assertionId: 'quality', instruction: 'Improve the addressed quality defect without changing behavior.',
  changes: [{ address: 'component', variable: 'density', direction: -1 }], reads: ['component'], writes: ['component'],
  effects: [{ assertionId: 'quality', direction: 'improves', basis: 'hypothesis', evidence: [] }], costUpperBound: { tokens: 3 },
  remediation: { harnessId: 'repairer', prompt: 'Repair the issue.', verification: ['quality', 'behavior'] } });

function fixture(overrides: Partial<QualityLoopOptions> = {}): QualityLoopOptions {
  const assertion = (id: string, value: (data: Data) => number): Assertion => ({
    card: { id, version: 'test-1', title: id, path: ['measurement', 'regression'], claim: 'Fixture predicate holds.',
      input: { schemas: ['test/v1'], capabilities: [], description: 'Synthetic fixture' },
      evidenceKind: 'deterministic', assumptions: ['Supplied fixture is complete.'], guarantees: ['Fixture predicate was executed.'], doesNotGuarantee: ['General application correctness.'],
      requires: [], costUpperBound: { evaluations: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Test fixture' } },
    async evaluate(context) {
      const loss = value(context.artifact.data as Data);
      return { status: loss === 0 ? 'pass' : 'fail', evidence: [`measured:${id}:${loss}`], findings: loss === 0 ? [] : [{ address: 'component', message: `${id} fails`, evidence: [String(loss)] }],
        loss: { lower: loss, upper: loss, unit: 'defects' }, actualCost: { evaluations: 1 } };
    },
  });
  const policy = { required: ['quality', 'behavior'], advisory: [] };
  const gate = compileGate([{ id: 'fixture', version: '1', includes: [], assertions: [assertion('quality', data => data.loss), assertion('behavior', data => data.safe ? 0 : 1)] }], ['fixture'], policy);
  return { gate, artifact: artifact({ loss: 2, safe: true }), environmentDigest: 'environment', budget: new BudgetLedger({ evaluations: 20, tokens: 30 }),
    admission: { gate: policy, objectives: { quality: 0 }, reversalMultiplier: 2, cooldownRounds: 1, maxStalledRounds: 2 },
    maxRounds: 4, proposalCostUpperBound: { tokens: 1 },
    async propose() { return { nudges: [repair()], actualCost: { tokens: 1 } }; },
    ...overrides,
  };
}

describe('bounded proposal/repair/evaluate/admit loop', () => {
  it('charges all phases and re-evaluates the complete gate before retaining a candidate', async () => {
    const options = fixture({ candidateGenerator: async () => ({ artifact: artifact({ loss: 0, safe: true }), actualCost: { tokens: 2 } }) });
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('pass'); expect(result.rounds).toBe(1); expect(result.artifact.data).toEqual({ loss: 0, safe: true });
    expect(result.evaluation.results.map(entry => entry.assertionId)).toEqual(['quality', 'behavior']);
    expect(result.budget.spent).toEqual({ evaluations: 4, tokens: 3 });
    expect(result.events.map(event => event.phase)).toEqual(['baseline', 'proposal', 'plan', 'repair', 'evaluation', 'admission', 'stop']);
  });

  it('stops immediately for a passing baseline without calling a generator or proposer', async () => {
    const propose = vi.fn(); const candidateGenerator = vi.fn();
    const result = await runQualityLoop(fixture({ artifact: artifact({ loss: 0, safe: true }), propose, candidateGenerator }));
    expect(result.stopReason).toBe('pass'); expect(result.rounds).toBe(0); expect(propose).not.toHaveBeenCalled(); expect(candidateGenerator).not.toHaveBeenCalled();
  });

  it('rejects an undeclared proposal unit before spending on the baseline', async () => {
    const propose = vi.fn();
    const budget = new BudgetLedger({ evaluations: 20 });
    await expect(runQualityLoop(fixture({ budget, propose }))).rejects.toThrow(/No budget declared for tokens/);
    expect(budget.snapshot().spent).toEqual({});
    expect(propose).not.toHaveBeenCalled();
  });

  it('leaves registered external harnesses disabled and returns the proposed plan for review', async () => {
    const run = vi.fn(); const prepareWorkspace = vi.fn();
    const result = await runQualityLoop(fixture({ harnesses: [{ id: 'repairer', run }], prepareWorkspace }));
    expect(result.stopReason).toBe('incomplete'); expect(run).not.toHaveBeenCalled(); expect(prepareWorkspace).not.toHaveBeenCalled();
    expect(result.events.find(event => event.phase === 'plan')?.plan?.selected).toHaveLength(1);
    expect(result.budget.spent).toEqual({ evaluations: 2, tokens: 1 });
  });

  it('prepares a workspace only inside an enabled, budgeted repair attempt', async () => {
    const prepareWorkspace = vi.fn(async () => '/isolated/fixture');
    const run = vi.fn(async context => { expect(context.candidateWorkspace).toBe('/isolated/fixture'); return { artifact: artifact({ loss: 0, safe: true }), actualCost: { tokens: 1 } }; });
    const result = await runQualityLoop(fixture({ harnesses: [{ id: 'repairer', run }], enabledHarnessIds: ['repairer'], prepareWorkspace }));
    expect(result.stopReason).toBe('pass'); expect(prepareWorkspace).toHaveBeenCalledOnce(); expect(run).toHaveBeenCalledOnce();
  });

  it('rejects an attractive local repair when another required assertion regresses', async () => {
    const options = fixture({ candidateGenerator: async () => ({ artifact: artifact({ loss: 0, safe: false }), actualCost: { tokens: 1 } }) });
    options.admission.maxStalledRounds = 1;
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('stalled'); expect(result.artifact).toEqual(options.artifact);
    expect(result.events.find(event => event.phase === 'admission')).toMatchObject({ status: 'rejected', reason: 'Required assertion regressed: behavior' });
    expect(result.budget.spent.evaluations).toBe(4);
  });

  it('bounds rounds even when successive candidates improve without passing', async () => {
    const result = await runQualityLoop(fixture({ maxRounds: 1, candidateGenerator: async () => ({ artifact: artifact({ loss: 1, safe: true }), actualCost: { tokens: 1 } }) }));
    expect(result.stopReason).toBe('round-limit'); expect(result.rounds).toBe(1); expect(result.artifact.data).toEqual({ loss: 1, safe: true });
    expect(result.evaluation.status).toBe('fail');
  });

  it('keeps the accepted artifact when the candidate cannot afford every gate check', async () => {
    const options = fixture({ budget: new BudgetLedger({ evaluations: 3, tokens: 10 }), candidateGenerator: async () => ({ artifact: artifact({ loss: 0, safe: true }), actualCost: { tokens: 1 } }) });
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('budget'); expect(result.artifact).toEqual(options.artifact); expect(result.evaluation.status).toBe('fail');
    expect(result.events.some(event => event.phase === 'admission')).toBe(false); expect(result.budget.spent.evaluations).toBe(3);
  });

  it('does not dispatch a candidate generator when its repair reservation is unaffordable', async () => {
    const candidateGenerator = vi.fn();
    const result = await runQualityLoop(fixture({ budget: new BudgetLedger({ evaluations: 3, tokens: 1 }), candidateGenerator }));
    expect(result.stopReason).toBe('budget'); expect(candidateGenerator).not.toHaveBeenCalled(); expect(result.budget.spent.tokens).toBe(1);
  });

  it('detects accepted-artifact cycles before spending on repeated evaluations', async () => {
    const options = fixture(); options.candidateGenerator = async () => ({ artifact: options.artifact, actualCost: { tokens: 1 } });
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('cycle'); expect(result.budget.spent.evaluations).toBe(2);
  });

  it('also detects repeated rejected artifacts rather than paying indefinitely to judge them', async () => {
    const options = fixture({ candidateGenerator: async () => ({ artifact: artifact({ loss: 0, safe: false }), actualCost: { tokens: 1 } }) });
    options.admission.maxStalledRounds = 3;
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('cycle'); expect(result.rounds).toBe(2); expect(result.budget.spent.evaluations).toBe(4);
  });

  it('stops with unresolved conflicts and never treats a plateau as a pass', async () => {
    const candidateGenerator = vi.fn();
    const result = await runQualityLoop(fixture({ candidateGenerator, async propose() {
      return { nudges: [repair(), { ...repair(), id: 'opposite', changes: [{ address: 'component', variable: 'density', direction: 1 }] }], actualCost: { tokens: 1 } };
    } }));
    expect(result.stopReason).toBe('stalled'); expect(result.evaluation.status).toBe('fail'); expect(candidateGenerator).not.toHaveBeenCalled();
  });

  it('conservatively records malformed proposal metering and disables the next phase', async () => {
    const candidateGenerator = vi.fn();
    const result = await runQualityLoop(fixture({ candidateGenerator, async propose() { return { nudges: [repair()], actualCost: { tokens: 8, undeclared: 2 } }; } }));
    expect(result.stopReason).toBe('budget'); expect(result.budget.spent).toEqual({ evaluations: 2, tokens: 8, undeclared: 2 }); expect(candidateGenerator).not.toHaveBeenCalled();
  });

  it('does not let an in-place proposal edit change the current accepted artifact', async () => {
    const options = fixture({ async propose(context) { (context.artifact.data as Data).safe = false; return { nudges: [], actualCost: { tokens: 1 } }; } });
    const result = await runQualityLoop(options);
    expect(result.artifact).toEqual(options.artifact); expect((result.artifact.data as Data).safe).toBe(true);
  });

  it('can repair a prerequisite and evaluate its previously blocked dependent', async () => {
    const options = fixture({ candidateGenerator: async () => ({ artifact: artifact({ loss: 0, safe: true }), actualCost: { tokens: 1 } }) });
    const assertions = options.gate.assertions.map(assertion => ({ ...assertion, card: { ...assertion.card, requires: assertion.card.id === 'behavior' ? ['quality'] : [] } }));
    options.gate = compileGate([{ id: 'dependent', version: '1', includes: [], assertions }], ['dependent'], options.gate.policy);
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('pass'); expect(result.artifact.data).toEqual({ loss: 0, safe: true });
    expect(result.evaluation.results.map(entry => entry.status)).toEqual(['pass', 'pass']);
    expect(result.budget.spent.evaluations).toBe(3);
  });

  it('reports an unavailable advisory without blocking a complete required-gate pass', async () => {
    const options = fixture({ artifact: artifact({ loss: 0, safe: true }) });
    const policy = { required: ['quality'], advisory: ['behavior'] };
    const assertions = options.gate.assertions.map(assertion => assertion.card.id === 'behavior' ? { ...assertion, async evaluate() {
      return { status: 'unavailable' as const, findings: [], evidence: [], actualCost: { evaluations: 1 } };
    } } : assertion);
    options.gate = compileGate([{ id: 'advisory', version: '1', includes: [], assertions }], ['advisory'], policy);
    options.admission.gate = policy;
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('pass'); expect(result.rounds).toBe(0);
    expect(result.evaluation.results.find(entry => entry.assertionId === 'behavior')?.status).toBe('unavailable');
    expect(result.budget.exceeded).toBe(false);
  });
});
