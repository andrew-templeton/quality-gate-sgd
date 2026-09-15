import { describe, expect, it, vi } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { compileGate, discoverAssertions, modelCard } from '../../src/v2/catalog.js';
import { readResource, RESOURCES } from '../../src/v2/resources.js';
import { evaluateGate } from '../../src/v2/evaluate.js';
import { admitCandidate, initialLoopState, type AdmissionPolicy } from '../../src/v2/admission.js';
import { assessExperiment, chooseAssessment, type DecisionModel, type AssessmentExperiment } from '../../src/v2/decision.js';
import { planNudges } from '../../src/v2/nudges.js';
import { renderedLegibilityModule, type RenderEvidence } from '../../src/v2/modules.js';
import { digest } from '../../src/v2/validation.js';
import type { Assertion, AssertionCard, AssertionModule, Interval, Nudge, Observation } from '../../src/v2/types.js';

function observation(status: Observation['status'] = 'pass', cost = { evaluations: 1 }): Observation {
  return { status, findings: status === 'fail' ? [{ address: 'claim:offer', message: 'Condition was lost', evidence: ['source comparison'] }] : [], evidence: ['current assertion evidence'], actualCost: cost };
}
function assertion(id: string, overrides: Partial<AssertionCard> = {}, evaluate: Assertion['evaluate'] = async () => observation()): Assertion {
  return { card: {
    id, version: '1.0.0', title: id, path: ['meaning', 'fidelity'], claim: 'The supplied claim satisfies the declared predicate.',
    evidenceKind: 'deterministic', input: { schemas: ['test/v1'], capabilities: [], description: 'Synthetic test fixture' }, assumptions: ['The supplied source is authoritative.'], guarantees: ['The tested predicate holds.'],
    doesNotGuarantee: ['Truth outside the supplied source.'], requires: [], costUpperBound: { evaluations: 1 },
    calibration: { status: 'not-applicable', evidence: [], scope: 'Supplied artifact.' }, ...overrides,
  }, evaluate };
}
function module(assertions: Assertion[], id = 'test'): AssertionModule { return { id, version: '1.0.0', includes: [], assertions }; }
function gate(assertions: Assertion[], required = assertions.map(value => value.card.id), advisory: string[] = []) {
  return compileGate([module(assertions)], ['test'], { required, advisory });
}
function input(data: unknown = {}) { return { artifact: { id: 'test-artifact', digest: digest(data), data }, environmentDigest: digest({ audience: 'operator', policy: 'v1' }) }; }
function nudge(id = 'nudge', address = 'claim:offer', direction: -1 | 1 = 1): Nudge {
  return { id, assertionId: 'quality', instruction: 'Introduce the missing condition next to its claim.', changes: [{ address, variable: 'detail', direction }],
    reads: [address], writes: [address], effects: [{ assertionId: 'quality', direction: 'improves', basis: 'hypothesis', evidence: [] }], costUpperBound: { rounds: 1 } };
}
const exact = (value: number, unit = 'violations'): Interval => ({ lower: value, upper: value, unit });
const admissionPolicy: AdmissionPolicy = { gate: { required: ['safety'], advisory: ['quality'] }, objectives: { quality: 0.1 }, reversalMultiplier: 2, cooldownRounds: 2, maxStalledRounds: 3 };
async function comparisons(before: Interval = exact(4), after: Interval = exact(2), beforeSafety: 'pass' | 'fail' = 'pass', afterSafety: 'pass' | 'fail' = 'pass') {
  const compiled = gate([
    assertion('safety', {}, async context => observation((context.artifact.data as { safety: 'pass' | 'fail' }).safety)),
    assertion('quality', {}, async context => ({ ...observation(), loss: (context.artifact.data as { quality: Interval }).quality })),
  ], ['safety'], ['quality']);
  const baseline = await evaluateGate(compiled, input({ safety: beforeSafety, quality: before }), new BudgetLedger({ evaluations: 10 }));
  const candidate = await evaluateGate(compiled, input({ safety: afterSafety, quality: after }), new BudgetLedger({ evaluations: 10 }));
  return { baseline, candidate, state: initialLoopState(baseline) };
}

describe('budget reservations and settlement', () => {
  it('reserves every declared unit before work and releases only the unused portion', () => {
    const ledger = new BudgetLedger({ tokens: 100, rounds: 2 });
    expect(ledger.reserve('a', { tokens: 80, rounds: 1 })).toBe(true);
    expect(ledger.reserve('b', { tokens: 30, rounds: 1 })).toBe(false);
    ledger.settle('a', { tokens: 50, rounds: 1 });
    expect(ledger.reserve('b', { tokens: 50, rounds: 1 })).toBe(true);
    ledger.chargeReservation('b');
    expect(ledger.snapshot()).toEqual({ limits: { tokens: 100, rounds: 2 }, spent: { tokens: 100, rounds: 2 }, reserved: {}, exceeded: false });
  });
  it('quarantines spending when a runner exceeds its own bound even below the overall limit', () => {
    const ledger = new BudgetLedger({ tokens: 100 });
    ledger.reserve('a', { tokens: 10 }); ledger.settle('a', { tokens: 11 });
    expect(ledger.snapshot().spent.tokens).toBe(11);
    expect(ledger.snapshot().exceeded).toBe(true);
    expect(ledger.reserve('b', { tokens: 1 })).toBe(false);
  });
  it('does not silently convert unknown units or refund a missing actual measurement', () => {
    const ledger = new BudgetLedger({ tokens: 100 });
    expect(() => ledger.reserve('bad', { dollars: 1 })).toThrow(/budget/i);
    ledger.reserve('a', { tokens: 5 });
    expect(() => ledger.settle('a', {})).toThrow(/missing/i);
    expect(ledger.snapshot().reserved).toEqual({ tokens: 5 });
    ledger.chargeReservation('a');
    expect(ledger.snapshot().spent).toEqual({ tokens: 5 });
  });
  it('returns snapshots that cannot alter the ledger', () => {
    const ledger = new BudgetLedger({ tokens: 100 }); ledger.reserve('a', { tokens: 5 });
    const snapshot = ledger.snapshot(); snapshot.limits.tokens = 1_000; snapshot.reserved.tokens = 0;
    expect(ledger.snapshot().limits.tokens).toBe(100); expect(ledger.snapshot().reserved.tokens).toBe(5);
  });
  it.each([NaN, Infinity, -1])('rejects invalid costs %s', amount => {
    expect(() => new BudgetLedger({ tokens: amount })).toThrow();
  });
});

describe('composition contracts', () => {
  it('hashes equivalent JSON consistently but rejects lossy non-JSON identity inputs', () => {
    expect(digest({ b: [1, null], a: true })).toBe(digest({ a: true, b: [1, null] }));
    for (const value of [new Date('2026-01-01'), new Set(['claim']), { callback: () => true }, { identity: Symbol('claim') }, new Array(1)]) {
      expect(() => digest(value)).toThrow();
    }
  });
  it('computes transitive module and prerequisite closure once in dependency order', () => {
    const base = module([assertion('source')], 'base');
    const child = { ...module([assertion('fidelity', { requires: ['source'] })], 'child'), includes: ['base'] };
    const outer = { ...module([assertion('communication', { requires: ['fidelity'] })], 'outer'), includes: ['base', 'child'] };
    const compiled = compileGate([base, child, outer], ['outer'], { required: ['communication'], advisory: [] });
    expect(compiled.assertions.map(value => value.card.id)).toEqual(['source', 'fidelity', 'communication']);
    expect(compiled.modules).toEqual(['base@1.0.0', 'child@1.0.0', 'outer@1.0.0']);
    expect(modelCard(compiled)).toMatchObject({ evaluatedClosure: ['source', 'fidelity', 'communication'] });
  });
  it('rejects module cycles, prerequisite cycles and missing references', () => {
    expect(() => compileGate([{ ...module([], 'a'), includes: ['b'] }, { ...module([], 'b'), includes: ['a'] }], ['a'], { required: ['x'], advisory: [] })).toThrow(/cycle/i);
    expect(() => gate([assertion('a', { requires: ['b'] }), assertion('b', { requires: ['a'] })])).toThrow(/cycle/i);
    expect(() => gate([assertion('a', { requires: ['missing'] })])).toThrow(/unknown assertion/i);
  });
  it('rejects duplicate assertion identities and overlapping hard/advisory policy', () => {
    expect(() => gate([assertion('a'), assertion('a')])).toThrow(/duplicate|unique/i);
    expect(() => gate([assertion('a')], ['a'], ['a'])).toThrow(/overlap/i);
  });
  it('snapshots source cards and policy rather than trusting later registry mutation', async () => {
    const original = assertion('a'); const policy = { required: ['a'], advisory: [] as string[] };
    const compiled = compileGate([module([original])], ['test'], policy);
    original.card.costUpperBound.evaluations = 1_000; policy.required.length = 0;
    expect((await evaluateGate(compiled, input(), new BudgetLedger({ evaluations: 2 }))).status).toBe('pass');
    expect(compiled.policy.required).toEqual(['a']);
  });
  it('rejects mutation of the compiled contract before running any assertion', async () => {
    const run = vi.fn(async () => observation()); const compiled = gate([assertion('a', {}, run)]);
    expect(() => { compiled.assertions[0].card.claim = 'Different guarantee'; }).toThrow();
    const altered = { ...compiled, assertions: compiled.assertions.map(value => ({ ...value, card: { ...value.card, claim: 'Different guarantee' } })) };
    await expect(evaluateGate(altered, input(), new BudgetLedger({ evaluations: 2 }))).rejects.toThrow(/mutated|contract/i);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('discoverable assertion contracts', () => {
  const reader = assertion('reader.legibility', { path: ['communication', 'legibility'], title: 'Reader legibility',
    input: { schemas: ['prose/v1', 'audience/v1'], capabilities: ['rendered-states'], description: 'Rendered prose for a declared reader background.' } });
  it('reports declared input compatibility without upgrading it into semantic qualification', () => {
    const found = discoverAssertions([module([reader])], { schemas: ['prose/v1', 'audience/v1'], capabilities: ['rendered-states'] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ moduleId: 'test', declaredCompatible: true, missingSchemas: [], missingCapabilities: [] });
    expect(found[0].limitation).toMatch(/declared inputs|calibration/i);
    expect(found[0].card).toMatchObject({ doesNotGuarantee: ['Truth outside the supplied source.'] });
  });
  it('keeps an applicable assertion discoverable while naming missing inputs and capabilities', () => {
    const found = discoverAssertions([module([reader])], { schemas: ['prose/v1'], capabilities: [] }, 'reader');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ declaredCompatible: false, missingSchemas: ['audience/v1'], missingCapabilities: ['rendered-states'] });
  });
  it('matches query words across the hierarchy and input description, without returning unrelated assertions', () => {
    const found = discoverAssertions([module([reader, assertion('arithmetic', { path: ['measurement', 'arithmetic'], title: 'Arithmetic' })])], { schemas: [], capabilities: [] }, ' COMMUNICATION  background ');
    expect(found.map(entry => entry.card.id)).toEqual(['reader.legibility']);
    expect(discoverAssertions([module([reader])], { schemas: [], capabilities: [] }, 'missing-topic')).toEqual([]);
  });
  it('exposes the taxonomy and composition limitations through the MCP resource contract', () => {
    const uri = 'quality://v2/assertion-zoo';
    expect(RESOURCES.find(resource => resource.uri === uri)?.mimeType).toBe('application/json');
    const resource = readResource(uri); expect(resource?.contents).toHaveLength(1);
    const content = resource!.contents[0]; expect(content.uri).toBe(uri);
    const contract = JSON.parse(content.text);
    expect(contract.schemaVersion).toBe(2);
    expect(contract.families.map((family: { path: string[] }) => family.path.join('/'))).toEqual(expect.arrayContaining(['communication/legibility', 'meaning/fidelity', 'causality/identification']));
    expect(contract.cardFields).toEqual(expect.arrayContaining(['input', 'doesNotGuarantee', 'requires', 'costUpperBound', 'calibration']));
    expect(contract.composition).toMatch(/conjunction/i);
    expect(contract.composition).toMatch(/missing evidence is unavailable/i);
    expect(contract.composition).toMatch(/no composite confidence/i);
  });
});

describe('evaluation fails closed', () => {
  it('a failed prerequisite blocks the child and cannot be canceled by advisory passes', async () => {
    const child = vi.fn(async () => observation());
    const compiled = gate([assertion('source', {}, async () => observation('fail')), assertion('child', { requires: ['source'] }, child), assertion('advice')], ['child'], ['advice']);
    const result = await evaluateGate(compiled, input(), new BudgetLedger({ evaluations: 10 }));
    expect(result.status).toBe('fail'); expect(child).not.toHaveBeenCalled();
    expect(result.results.find(value => value.assertionId === 'child')?.status).toBe('unavailable');
  });
  it('unqualified model judgment is advisory only, including when it is a hard prerequisite', async () => {
    const model = assertion('judge', { evidenceKind: 'model-judgment', calibration: { status: 'unqualified', evidence: ['pilot below threshold'], scope: 'Pilot only' } });
    const hard = await evaluateGate(gate([model, assertion('child', { requires: ['judge'] })], ['child']), input(), new BudgetLedger({ evaluations: 10 }));
    expect(hard.status).toBe('unavailable'); expect(hard.budget.spent).toEqual({});
    const advisory = await evaluateGate(gate([model, assertion('source')], ['source'], ['judge']), input(), new BudgetLedger({ evaluations: 10 }));
    expect(advisory.status).toBe('pass'); expect(advisory.results.find(value => value.assertionId === 'judge')?.status).toBe('pass');
  });
  it('requires qualification evidence bound to the current evaluator version', () => {
    expect(() => gate([assertion('judge', { evidenceKind: 'model-judgment', calibration: { status: 'qualified', evidence: ['calibration result'], evaluatorVersion: 'older', scope: 'Readers' } })])).toThrow(/version/i);
    expect(() => gate([assertion('judge', { evidenceKind: 'model-judgment', calibration: { status: 'qualified', evidence: [], evaluatorVersion: '1.0.0', scope: 'Readers' } })])).toThrow(/evidence/i);
  });
  it.each([
    ['missing verdict evidence', { ...observation(), evidence: [] }],
    ['failed verdict without finding', { ...observation('fail'), findings: [] }],
    ['non-finite loss', { ...observation(), loss: exact(NaN) }],
    ['malformed status', { ...observation(), status: 'good' }],
  ])('charges work and makes %s unavailable', async (_label, value) => {
    const compiled = gate([assertion('a', {}, async () => value as Observation)]);
    const result = await evaluateGate(compiled, input(), new BudgetLedger({ evaluations: 2 }));
    expect(result.status).toBe('unavailable'); expect(result.budget.spent.evaluations).toBe(1);
  });
  it('retains known overspend when a report also omits a reserved cost unit', async () => {
    const later = vi.fn(async () => observation());
    const compiled = gate([assertion('bad', { costUpperBound: { evaluations: 1, tokens: 10 } }, async () => observation('pass', { evaluations: 100 })), assertion('later', {}, later)]);
    const result = await evaluateGate(compiled, input(), new BudgetLedger({ evaluations: 1_000, tokens: 1_000 }));
    expect(result.status).toBe('unavailable'); expect(result.budget.spent.evaluations).toBe(100);
    expect(result.budget.spent.tokens).toBe(10); expect(result.budget.exceeded).toBe(true); expect(later).not.toHaveBeenCalled();
    expect(result.results[0].actualCost).toEqual({ evaluations: 100, tokens: 10 });
  });
  it('retains actual overspend even when the verdict itself is malformed', async () => {
    const result = await evaluateGate(gate([assertion('a', {}, async () => ({ ...observation('pass', { evaluations: 50 }), evidence: [] }))]), input(), new BudgetLedger({ evaluations: 100 }));
    expect(result.status).toBe('unavailable'); expect(result.budget.spent.evaluations).toBe(50); expect(result.budget.exceeded).toBe(true);
  });
  it('does not invoke a runner that cannot be reserved', async () => {
    const run = vi.fn(async () => observation());
    const result = await evaluateGate(gate([assertion('a', {}, run)]), input(), new BudgetLedger({ evaluations: 0 }));
    expect(result.status).toBe('unavailable'); expect(run).not.toHaveBeenCalled();
  });
  it('aborts a timed-out runner, charges its reservation and dispatches no later work', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined; const later = vi.fn(async () => observation());
      const pending = evaluateGate(gate([assertion('slow', {}, async context => { signal = context.signal; return new Promise<Observation>(() => {}); }), assertion('later', {}, later)]), input(), new BudgetLedger({ evaluations: 10 }), { timeoutMs: 5 });
      await vi.advanceTimersByTimeAsync(6); const result = await pending;
      expect(signal?.aborted).toBe(true); expect(result.status).toBe('unavailable');
      expect(result.budget.spent.evaluations).toBe(1); expect(result.budget.reserved).toEqual({}); expect(later).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('never reports pass for artifact content mutated by an assertion during evaluation', async () => {
    const supplied = input({ meaning: 'original' });
    const result = await evaluateGate(gate([assertion('a', {}, async context => { (context.artifact.data as { meaning: string }).meaning = 'changed'; return observation(); })]), supplied, new BudgetLedger({ evaluations: 2 }));
    expect(result.status).not.toBe('pass');
  });
});

describe('candidate admission and hysteresis', () => {
  it('accepts robust objective gain and records the accepted revision and intervention', async () => {
    const { baseline, candidate, state } = await comparisons();
    const result = admitCandidate(baseline, candidate, nudge(), 1, admissionPolicy, state);
    expect(result.accepted).toBe(true); expect(result.state.acceptedDigests.at(-1)).toBe(candidate.artifactDigest);
    expect(result.state.lastChanges).toEqual([{ ...nudge().changes[0], round: 1 }]);
  });
  it('rejects required regressions regardless of objective improvement', async () => {
    const { baseline, candidate, state } = await comparisons(exact(4), exact(0), 'pass', 'fail');
    expect(admitCandidate(baseline, candidate, nudge(), 1, admissionPolicy, state)).toMatchObject({ accepted: false, reason: expect.stringMatching(/regressed/i) });
  });
  it('allows a hard repair with unchanged valid objectives', async () => {
    const { baseline, candidate, state } = await comparisons(exact(4), exact(4), 'fail', 'pass');
    expect(admitCandidate(baseline, candidate, nudge(), 1, admissionPolicy, state).accepted).toBe(true);
  });
  it('rejects overlapping bounds and gains only equal to the deadband', async () => {
    const overlapping = await comparisons({ lower: 3, upper: 5, unit: 'violations' }, { lower: 2, upper: 4, unit: 'violations' });
    expect(admitCandidate(overlapping.baseline, overlapping.candidate, nudge(), 1, admissionPolicy, overlapping.state).accepted).toBe(false);
    const equal = await comparisons(exact(3), exact(2));
    expect(admitCandidate(equal.baseline, equal.candidate, nudge(), 1, { ...admissionPolicy, objectives: { quality: 1 } }, equal.state).accepted).toBe(false);
  });
  it('requires a rebaseline for changed contracts and rejects previously accepted artifacts', async () => {
    const { baseline, candidate, state } = await comparisons();
    expect(admitCandidate(baseline, { ...candidate, contractDigest: 'changed' }, nudge(), 1, admissionPolicy, state).accepted).toBe(false);
    expect(admitCandidate(baseline, candidate, nudge(), 1, admissionPolicy, { ...state, acceptedDigests: [candidate.artifactDigest, baseline.artifactDigest] }).reason).toMatch(/cycle/i);
  });
  it('applies cooldown and then the larger reversal deadband', async () => {
    const { baseline, candidate, state } = await comparisons(exact(4), exact(3));
    const prior = { ...state, lastRound: 1, lastChanges: [{ ...nudge().changes[0], round: 1 }] };
    const reverse = nudge('reverse', 'claim:offer', -1);
    expect(admitCandidate(baseline, candidate, reverse, 2, admissionPolicy, prior).reason).toMatch(/cooldown/i);
    const larger = { ...admissionPolicy, objectives: { quality: 0.75 } };
    expect(admitCandidate(baseline, candidate, reverse, 4, larger, prior).accepted).toBe(false);
    expect(admitCandidate(baseline, candidate, reverse, 4, admissionPolicy, prior).accepted).toBe(true);
  });
  it('rejects malformed interventions and rounds that would rewrite later history', async () => {
    const { baseline, candidate, state } = await comparisons();
    const invalid = nudge(); invalid.changes[0].direction = 0 as 1;
    const rejected = (action: () => { accepted: boolean }) => {
      try { expect(action().accepted).toBe(false); } catch (error) { if (error instanceof Error && error.name === 'AssertionError') throw error; }
    };
    rejected(() => admitCandidate(baseline, candidate, invalid, 1, admissionPolicy, state));
    rejected(() => admitCandidate(baseline, candidate, nudge(), 2, admissionPolicy, { ...state, lastRound: 3, lastChanges: [{ ...nudge().changes[0], round: 3 }] }));
  });
  it('rejects stale/missing evidence and malformed losses even when another objective improves', async () => {
    const { baseline, candidate, state } = await comparisons();
    const stale = structuredClone(candidate); stale.results[0].inputDigest = baseline.results[0].inputDigest;
    expect(admitCandidate(baseline, stale, nudge(), 1, admissionPolicy, state)).toMatchObject({ accepted: false, reason: expect.stringMatching(/digest|evidence|input/i) });
    const missing = structuredClone(candidate); missing.results[0].evidence = [];
    expect(admitCandidate(baseline, missing, nudge(), 1, admissionPolicy, state)).toMatchObject({ accepted: false, reason: expect.stringMatching(/evidence/i) });
    const malformed = structuredClone(candidate); malformed.results[0].loss = exact(NaN);
    const baselineWithLoss = structuredClone(baseline); baselineWithLoss.results[0].loss = exact(4);
    expect(admitCandidate(baselineWithLoss, malformed, nudge(), 1, { ...admissionPolicy, objectives: { safety: 0.1, quality: 0.1 } }, state)).toMatchObject({ accepted: false, reason: expect.stringMatching(/finite/i) });
  });
  it('does not admit a candidate with omitted prerequisite results', async () => {
    const compiled = gate([assertion('prereq'), assertion('safety', { requires: ['prereq'] }), assertion('quality', {}, async context => ({ ...observation(), loss: exact((context.artifact.data as { loss: number }).loss) }))], ['safety'], ['quality']);
    const baseline = await evaluateGate(compiled, input({ loss: 4 }), new BudgetLedger({ evaluations: 10 }));
    const candidate = await evaluateGate(compiled, input({ loss: 2 }), new BudgetLedger({ evaluations: 10 }));
    candidate.results = candidate.results.filter(result => result.assertionId !== 'prereq');
    const check = () => admitCandidate(baseline, candidate, nudge(), 1, admissionPolicy, initialLoopState(baseline));
    let accepted = false;
    try { accepted = check().accepted; } catch { /* malformed required coverage is rejected before admission */ }
    expect(accepted).toBe(false);
  });
  it('cannot treat stalled rounds as evidence of improvement', async () => {
    const { baseline, candidate, state } = await comparisons(exact(4), exact(4));
    const result = admitCandidate(baseline, candidate, nudge(), 4, admissionPolicy, { ...state, stalledRounds: 3 });
    expect(result.accepted).toBe(false);
  });
});

describe('partial nudge conflict resolution', () => {
  it('detects read/write dependencies across different proposed variables', () => {
    const a = nudge('a'); const b = nudge('b', 'claim:price'); b.reads.push('claim:offer');
    const plan = planNudges([a, b]); expect(plan.selected).toEqual([]);
    expect(plan.conflicts[0].reasons).toContain('Shared write or read/write dependency');
  });
  it('keeps incomparable benefit units and overlapping benefit intervals unresolved', () => {
    const a = { ...nudge('a'), netBenefit: { lower: 5, upper: 8, unit: 'reader-seconds' } };
    const b = { ...nudge('b'), netBenefit: { lower: 1, upper: 2, unit: 'dollars' } };
    expect(planNudges([a, b]).selected).toEqual([]);
    b.netBenefit = { lower: 7, upper: 9, unit: 'reader-seconds' };
    expect(planNudges([a, b]).conflicts[0].preferred).toBeNull();
  });
  it('chooses only a strict comparable winner and separately protects hard assertions', () => {
    const a = { ...nudge('a'), netBenefit: { lower: 5, upper: 8, unit: 'utility' } };
    const b = { ...nudge('b'), netBenefit: { lower: 1, upper: 2, unit: 'utility' } };
    expect(planNudges([a, b]).selected.map(value => value.id)).toEqual(['a']);
    a.effects.push({ assertionId: 'fidelity', direction: 'worsens', basis: 'hypothesis', evidence: [] });
    expect(planNudges([a], ['fidelity']).selected).toEqual([]);
  });
  it('does not promote unsupported causal-effect labels to observations', () => {
    const value = nudge(); value.effects[0].basis = 'identified';
    expect(() => planNudges([value])).toThrow(/evidence/i);
    value.effects[0].basis = 'hypothesis'; expect(planNudges([value]).selected).toHaveLength(1);
  });
  it('leaves unrelated interventions available when another pair conflicts', () => {
    expect(planNudges([nudge('a'), nudge('b', 'claim:offer', -1), nudge('c', 'claim:other')]).selected.map(value => value.id)).toEqual(['c']);
  });
});

describe('finite decision value', () => {
  const model: DecisionModel = { unit: 'utility', perspective: 'operator', horizon: 'one release', basis: 'explicit toy model', states: [{ id: 'good', prior: 0.5 }, { id: 'bad', prior: 0.5 }], actions: [{ id: 'ship', utility: { good: 10, bad: -10 } }, { id: 'hold', utility: { good: 0, bad: 0 } }] };
  const perfect: AssessmentExperiment = { id: 'perfect', unit: 'utility', cost: 1, basis: 'modeled perfect observation', outcomes: [{ id: 'positive', likelihood: { good: 1, bad: 0 } }, { id: 'negative', likelihood: { good: 0, bad: 1 } }] };
  it('computes posterior decisions and net value on the declared utility scale', () => {
    const result = assessExperiment(model, perfect);
    expect(result.currentUtility).toBe(0); expect(result.expectedUtility).toBe(5);
    expect(result.grossValue).toBe(5); expect(result.netValue).toBe(4); expect(result.informationGainBits).toBe(1);
    expect(result.outcomes.map(outcome => outcome.actions)).toEqual([['ship'], ['hold']]);
    expect(chooseAssessment(model, [perfect])).toMatchObject({ kind: 'assess', selected: ['perfect'] });
  });
  it('does not equate entropy reduction with actionable value', () => {
    const irrelevant = { ...model, actions: [{ id: 'hold', utility: { good: 2, bad: 2 } }] };
    const result = assessExperiment(irrelevant, perfect);
    expect(result.informationGainBits).toBe(1); expect(result.grossValue).toBe(0); expect(result.netValue).toBe(-1);
    expect(chooseAssessment(irrelevant, [perfect])).toMatchObject({ kind: 'stop', selected: [] });
  });
  it('handles impossible outcomes and zero priors without nonfinite posteriors', () => {
    const result = assessExperiment({ ...model, states: [{ id: 'good', prior: 1 }, { id: 'bad', prior: 0 }] }, perfect);
    expect(result.netValue).toBe(-1); expect(result.outcomes[1]).toMatchObject({ probability: 0, posterior: null, entropy: null });
  });
  it('requires explicit model context, complete distributions and matching units', () => {
    expect(chooseAssessment(null, [perfect]).kind).toBe('insufficient-model');
    expect(() => assessExperiment(model, { ...perfect, unit: 'USD' })).toThrow(/unit/i);
    expect(() => assessExperiment(model, { ...perfect, outcomes: [perfect.outcomes[0]] })).toThrow(/sum/i);
    expect(() => assessExperiment({ ...model, actions: [{ id: 'ship', utility: { good: 10 } }] }, perfect)).toThrow(/exactly/i);
    expect(() => assessExperiment(model, { ...perfect, cost: Infinity })).toThrow(/finite/i);
  });
});

describe('bundled assertion adapters', () => {
  function render(): RenderEvidence { return { artifactDigest: 'rendered-artifact', environmentDigest: 'environment', screenshotDigest: 'screenshots', views: ['desktop:closed', 'mobile:expanded'].map(id => ({ id, defects: [], folds: [{ id: 'fold:0', quanta: ['price', 'condition'], novel: ['condition'], unexplained: [] }] })) }; }
  async function evaluateRender(report: RenderEvidence) {
    const policy = { version: '1', views: ['desktop:closed', 'mobile:expanded'].map(id => ({ id, maxTotal: 2, maxNovel: 1 })) };
    const compiled = compileGate([renderedLegibilityModule(() => report, policy)], ['rendered-legibility'], { required: ['render.geometry', 'render.fold-budget'], advisory: [] });
    return evaluateGate(compiled, { artifact: { id: 'page', digest: 'rendered-artifact', data: {} }, environmentDigest: 'environment' }, new BudgetLedger({ evaluations: 10 }));
  }
  it('checks all required rendered states and caps rather than only the first desktop view', async () => {
    const report = render(); expect((await evaluateRender(report)).status).toBe('pass');
    report.views[1].folds[0].quanta.push('risk');
    const overloaded = await evaluateRender(report); expect(overloaded.status).toBe('fail');
    expect(overloaded.results.flatMap(result => result.findings).map(finding => finding.address)).toContain('mobile:expanded/fold:0');
  });
  it('fails unexplained novelty and geometry defects independently', async () => {
    const report = render(); report.views[0].folds[0].unexplained = ['condition']; report.views[1].defects = [{ address: 'mobile:expanded/panel', message: 'Actions overlap the cost.' }];
    const result = await evaluateRender(report); expect(result.results.map(value => value.status)).toEqual(['fail', 'fail']);
  });
  it('makes stale, missing and inconsistent render evidence unavailable', async () => {
    const stale = render(); stale.artifactDigest = 'old'; expect((await evaluateRender(stale)).status).toBe('unavailable');
    const missing = render(); missing.views.pop(); expect((await evaluateRender(missing)).status).toBe('unavailable');
    const screenshot = render(); screenshot.screenshotDigest = ''; expect((await evaluateRender(screenshot)).status).toBe('unavailable');
    const invalid = render(); invalid.views[0].folds[0].novel = ['unlisted']; expect((await evaluateRender(invalid)).status).toBe('unavailable');
  });
});
