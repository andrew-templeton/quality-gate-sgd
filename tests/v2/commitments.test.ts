import { describe, expect, it } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { compileGate } from '../../src/v2/catalog.js';
import { bindInput, defineAssertion, fromAssertion, schema } from '../../src/v2/contracts.js';
import { evaluateGate } from '../../src/v2/evaluate.js';
import { digest } from '../../src/v2/validation.js';
import {
  assessCommitments, commitmentInventoryDigest, sourceCommitmentsModule, sourceCoverageDigest, sourceReferenceDigest,
  COMMITMENT_INPUT, COMMITMENT_OUTPUT, type CandidateCommitmentReport, type CommitmentPolicy,
  type SemanticCommitment, type SourceCommitmentContract,
} from '../../src/v2/commitments.js';

const policy: CommitmentPolicy = { mode: 'structured-only', scope: 'first-year purchase decision', semanticEvaluators: [] };
function fixture() {
  const content = 'The first-year pilot purchase is estimated at $120: $100 license plus $20 setup. Finance approval and security review are required. Savings may be zero. Finance should decide by Friday.';
  const commitment: SemanticCommitment = {
    id: 'pilot-purchase', address: 'quality://claim/purchase/total', sourceAddresses: ['quality://component/source/body'], proposition: 'first-year pilot purchase',
    quantity: { amount: 120, unit: 'USD', denominator: null }, actor: 'Operations', population: 'pilot stores', period: 'first-year', scope: 'pilot only',
    conditions: ['finance approval'], dependencies: ['security review'], adverseScenarios: ['zero savings'],
    uncertainty: { kind: 'estimate', lower: 80, upper: 140, confidence: 0.9, description: 'Estimated cost; savings are uncertain' }, claimStrength: 'prediction',
    materialCosts: [{ id: 'license', amount: 100, unit: 'USD', period: 'first-year' }, { id: 'setup', amount: 20, unit: 'USD', period: 'first-year' }],
    action: { actor: 'Finance', operation: 'decide', target: 'pilot purchase', deadline: 'Friday', conditions: ['security review'] },
  };
  const source: SourceCommitmentContract = {
    id: 'purchase-source', revisionDigest: digest({ content, revision: 1 }), contentDigest: digest(content), content,
    sections: [{ address: 'quality://component/source/body', start: 0, end: content.length }],
    coverage: { status: 'complete', coveredAddresses: ['quality://component/source/body'], evidence: ['test-only structured source coverage'] },
    commitments: [commitment], relationships: [{ id: 'purchase-all-in', kind: 'all-in-cost', resultId: 'pilot-purchase', absoluteTolerance: 0 }], corrections: [],
  };
  const report: CandidateCommitmentReport = { sourceRevisionDigest: source.revisionDigest, sourceCoverageDigest: sourceCoverageDigest(source),
    candidateRevisionDigest: digest({ content, revision: 'candidate-1' }), candidateContentDigest: digest(content), commitments: structuredClone(source.commitments), judgment: null };
  return { source, report, content };
}
const run = async (source: SourceCommitmentContract, report: CandidateCommitmentReport, content: string, selectedPolicy = policy) => {
  const module = sourceCommitmentsModule({ source, policy: selectedPolicy });
  const gate = compileGate([module], [module.id], { required: ['source.commitments'], advisory: [] });
  const result = await evaluateGate(gate, { artifact: { id: 'candidate', digest: report.candidateRevisionDigest, data: { text: content, commitments: report } },
    environmentDigest: digest({ source: source.revisionDigest, scope: selectedPolicy.scope }), available: COMMITMENT_INPUT }, new BudgetLedger({ evaluations: 1 }));
  return { module, gate, result };
};
function qualifiedFixture() {
  const f = fixture();
  const qualified: CommitmentPolicy = { mode: 'qualified-prose', scope: policy.scope, semanticEvaluators: [{ evaluatorDigest: digest('test judge'),
    applicabilityDigest: digest('test scope'), scope: policy.scope, evidence: ['test-only qualification fixture; no real model evaluation'] }] };
  f.report.judgment = {
    evaluatorDigest: qualified.semanticEvaluators[0].evaluatorDigest, applicabilityDigest: qualified.semanticEvaluators[0].applicabilityDigest,
    referenceDigest: sourceReferenceDigest(f.source), sourceRevisionDigest: f.source.revisionDigest, sourceContentDigest: f.source.contentDigest,
    candidateRevisionDigest: f.report.candidateRevisionDigest, candidateContentDigest: f.report.candidateContentDigest,
    candidateInventoryDigest: commitmentInventoryDigest(f.report.commitments), coverageDigest: sourceCoverageDigest(f.source),
    status: 'pass', evidence: ['test-only semantic receipt'],
  };
  return { ...f, qualified };
}

describe('source commitment comparisons', () => {
  it('preserves all declared facets, exposes corrections and emits a typed passing receipt', async () => {
    const f = fixture();
    const { result } = await run(f.source, f.report, f.content);
    expect(result.status).toBe('pass');
    expect(result.results[0].outputEvidence?.value).toMatchObject({ preservedCommitmentIds: ['pilot-purchase'], appliedCorrectionIds: [],
      sourceRevisionDigest: f.source.revisionDigest, candidateRevisionDigest: f.report.candidateRevisionDigest });
    expect(result.results[0].outputEvidence?.evaluatorDigest).toHaveLength(64);
  });

  it.each([
    ['denominator', (c: SemanticCommitment) => { c.quantity!.denominator = { amount: 100, unit: 'customers', population: 'all customers' }; }, '/quantity'],
    ['condition', (c: SemanticCommitment) => { c.conditions = []; }, '/conditions'],
    ['adverse scenario', (c: SemanticCommitment) => { c.adverseScenarios = []; }, '/adverseScenarios'],
    ['causal strength', (c: SemanticCommitment) => { c.claimStrength = 'causal'; }, '/claimStrength'],
    ['population', (c: SemanticCommitment) => { c.population = 'all stores'; }, '/population'],
    ['all-in cost', (c: SemanticCommitment) => { c.quantity!.amount = 100; }, '/quantity'],
    ['recommended action', (c: SemanticCommitment) => { c.action = null; }, '/action'],
    ['dependency', (c: SemanticCommitment) => { c.dependencies = []; }, '/dependencies'],
    ['uncertainty', (c: SemanticCommitment) => { c.uncertainty.kind = 'exact'; c.uncertainty.description = 'Certain'; }, '/uncertainty'],
    ['actor', (c: SemanticCommitment) => { c.actor = 'Finance'; }, '/actor'],
    ['period', (c: SemanticCommitment) => { c.period = 'every year'; }, '/period'],
    ['scope', (c: SemanticCommitment) => { c.scope = 'entire company'; }, '/scope'],
    ['material cost', (c: SemanticCommitment) => { c.materialCosts.pop(); }, '/materialCosts'],
    ['units', (c: SemanticCommitment) => { c.quantity!.unit = 'thousands USD'; }, '/quantity'],
  ])('rejects a changed %s with an addressed finding', async (_name, change, suffix) => {
    const f = fixture(); change(f.report.commitments[0]);
    const { result } = await run(f.source, f.report, f.content);
    expect(result.status).toBe('fail');
    expect(result.results[0].findings.some(finding => finding.address.endsWith(suffix))).toBe(true);
    expect(result.results[0].outputEvidence).toBeUndefined();
  });

  it('treats set order as irrelevant but rejects dropped and invented commitments', () => {
    const f = fixture(); f.source.commitments[0].conditions.push('operating budget');
    f.report.sourceCoverageDigest = sourceCoverageDigest(f.source);
    f.report.commitments = structuredClone(f.source.commitments);
    f.report.commitments[0].conditions.reverse(); f.report.commitments[0].materialCosts.reverse();
    expect(assessCommitments(f.source, f.report, policy, f.content).status).toBe('pass');
    f.report.commitments = [];
    expect(assessCommitments(f.source, f.report, policy, f.content).findings[0].message).toContain('missing');
    const extra = structuredClone(f.source.commitments[0]); extra.id = 'invented'; extra.address = 'quality://claim/purchase/invented';
    f.report.commitments = [...f.source.commitments, extra];
    expect(assessCommitments(f.source, f.report, policy, f.content).findings.some(f => f.message.includes('unregistered'))).toBe(true);
  });

  it('requires full contiguous source coverage and explicit evidence', async () => {
    for (const change of [
      (s: SourceCommitmentContract) => { s.coverage.status = 'partial'; },
      (s: SourceCommitmentContract) => { s.sections[0].end--; },
      (s: SourceCommitmentContract) => { s.coverage.coveredAddresses = []; },
      (s: SourceCommitmentContract) => { s.coverage.evidence = []; },
    ]) {
      const f = fixture(); change(f.source); f.report.sourceCoverageDigest = sourceCoverageDigest(f.source);
      const { result } = await run(f.source, f.report, f.content);
      expect(result.status).toBe('unavailable'); expect(result.budget.exceeded).toBe(false);
    }
  });

  it('does not silently copy inconsistent source arithmetic and requires an approved correction', async () => {
    const f = fixture(); f.source.commitments[0].quantity!.amount = 100;
    f.report.commitments = structuredClone(f.source.commitments); f.report.sourceCoverageDigest = sourceCoverageDigest(f.source);
    const unresolved = await run(f.source, f.report, f.content);
    expect(unresolved.result.status).toBe('unavailable');
    expect(unresolved.result.results[0].findings[0].message).toContain('Source arithmetic is unresolved');
    const after = structuredClone(f.source.commitments[0]); after.quantity!.amount = 120;
    f.source.corrections.push({ id: 'correct-all-in', commitmentId: after.id, sourceRevisionDigest: f.source.revisionDigest,
      before: structuredClone(f.source.commitments[0]), after, approvedBy: 'fixture operator', reason: '100 license + 20 setup = 120', evidence: ['fixture source components'] });
    f.report.commitments = [after];
    const corrected = await run(f.source, f.report, f.content);
    expect(corrected.result.status).toBe('pass');
    expect(corrected.result.results[0].output).toMatchObject({ appliedCorrectionIds: ['correct-all-in'] });
    expect(corrected.gate.digest).not.toBe(unresolved.gate.digest);
    const bad = structuredClone(f.source); bad.corrections[0].before.quantity!.amount = 99;
    expect(() => sourceCommitmentsModule({ source: bad, policy })).toThrow('before-value');
  });

  it.each(['sum', 'ratio', 'all-in-cost'] as const)('does not validate %s arithmetic across unsupported denominators', kind => {
    const f = fixture();
    const base = f.source.commitments[0];
    const perStore = { amount: 1, unit: 'store', population: 'pilot stores' };
    if (kind === 'all-in-cost') {
      base.quantity = { amount: 120, unit: 'USD', denominator: perStore };
    } else {
      const first = { ...structuredClone(base), id: 'first', address: 'quality://claim/cost/first',
        quantity: { amount: 120, unit: 'USD', denominator: perStore } };
      const second = { ...structuredClone(base), id: 'second', address: 'quality://claim/cost/second',
        quantity: { amount: 120, unit: 'USD', denominator: null } };
      const result = { ...structuredClone(base), id: 'result', address: 'quality://claim/cost/result',
        quantity: { amount: kind === 'sum' ? 240 : 100, unit: kind === 'sum' ? 'USD' : 'percent',
          denominator: kind === 'sum' ? null : { amount: 120, unit: 'USD', population: base.population } } };
      f.source.commitments = [first, second, result];
      f.source.relationships = kind === 'sum'
        ? [{ id: 'sum', kind, resultId: 'result', terms: [{ commitmentId: 'first', coefficient: 1 }, { commitmentId: 'second', coefficient: 1 }], absoluteTolerance: 0 }]
        : [{ id: 'ratio', kind, resultId: 'result', numeratorId: 'first', denominatorId: 'second', scale: 100, absoluteTolerance: 0 }];
    }
    f.report.commitments = structuredClone(f.source.commitments);
    f.report.sourceCoverageDigest = sourceCoverageDigest(f.source);
    const result = assessCommitments(f.source, f.report, policy, f.content);
    expect(result.status).toBe('unavailable');
    expect(result.findings[0].message).toContain('denominator');
  });

  it('checks ratio units, population denominators and sum arithmetic without inferred conversions', () => {
    const f = fixture();
    const make = (id: string, amount: number, unit: string): SemanticCommitment => ({ ...structuredClone(f.source.commitments[0]), id,
      address: `quality://claim/renewals/${id}`, quantity: { amount, unit, denominator: null }, population: 'renewal cohort', materialCosts: [] });
    const renewed = make('renewed', 20, 'customers'), eligible = make('eligible', 100, 'customers'), rate = make('rate', 20, 'percent');
    rate.quantity!.denominator = { amount: 100, unit: 'customers', population: 'renewal cohort' };
    f.source.commitments = [renewed, eligible, rate];
    f.source.relationships = [{ id: 'renewal-rate', kind: 'ratio', resultId: 'rate', numeratorId: 'renewed', denominatorId: 'eligible', scale: 100, absoluteTolerance: 0 }];
    f.report.commitments = structuredClone(f.source.commitments); f.report.sourceCoverageDigest = sourceCoverageDigest(f.source);
    expect(assessCommitments(f.source, f.report, policy, f.content).status).toBe('pass');
    f.report.commitments[2].quantity!.denominator!.amount = 200;
    expect(assessCommitments(f.source, f.report, policy, f.content).findings.some(f => f.message.includes('denominator annotation'))).toBe(true);
    const sum = make('combined', 120, 'customers'); f.source.commitments = [renewed, eligible, sum];
    f.source.relationships = [{ id: 'combined', kind: 'sum', resultId: 'combined', terms: [{ commitmentId: 'renewed', coefficient: 1 }, { commitmentId: 'eligible', coefficient: 1 }], absoluteTolerance: 0 }];
    f.report.commitments = structuredClone(f.source.commitments); f.report.sourceCoverageDigest = sourceCoverageDigest(f.source);
    expect(assessCommitments(f.source, f.report, policy, f.content).status).toBe('pass');
    f.source.commitments[0].quantity!.unit = 'thousands of customers'; f.report.sourceCoverageDigest = sourceCoverageDigest(f.source);
    expect(assessCommitments(f.source, f.report, policy, f.content).status).toBe('unavailable');
  });
});

describe('semantic evidence and composition boundaries', () => {
  it('requires semantic evidence for prose even when structured annotations agree exactly', async () => {
    const f = qualifiedFixture(); f.report.judgment = null;
    expect((await run(f.source, f.report, f.content, f.qualified)).result.status).toBe('unavailable');
    // This narrower mode tests records only, not whether contradictory text expresses them.
    const different = 'There are no costs and no approval is needed.'; f.report.candidateContentDigest = digest(different);
    expect((await run(f.source, f.report, different)).result.status).toBe('pass');
  });

  it('binds a scoped judgment to every semantic input and invalidates stale qualification', async () => {
    const good = qualifiedFixture(); expect((await run(good.source, good.report, good.content, good.qualified)).result.status).toBe('pass');
    for (const field of ['sourceRevisionDigest', 'sourceContentDigest', 'candidateRevisionDigest', 'candidateContentDigest', 'candidateInventoryDigest', 'coverageDigest', 'referenceDigest', 'evaluatorDigest', 'applicabilityDigest'] as const) {
      const f = qualifiedFixture(); f.report.judgment![field] = digest('different');
      expect((await run(f.source, f.report, f.content, f.qualified)).result.status).toBe('unavailable');
    }
    const failed = qualifiedFixture(); failed.report.judgment!.status = 'fail';
    expect((await run(failed.source, failed.report, failed.content, failed.qualified)).result.status).toBe('fail');
  });

  it('rejects stale text/revisions and malformed typed input without granting a receipt', async () => {
    const f = fixture();
    expect((await run(f.source, f.report, f.content + ' Changed.')).result.status).toBe('unavailable');
    f.report.sourceRevisionDigest = digest('stale');
    expect((await run(f.source, f.report, f.content)).result.status).toBe('unavailable');
    const module = sourceCommitmentsModule({ source: f.source, policy });
    const gate = compileGate([module], [module.id], { required: ['source.commitments'], advisory: [] });
    const result = await evaluateGate(gate, { artifact: { id: 'missing', digest: digest('missing'), data: {} },
      environmentDigest: digest('environment'), available: COMMITMENT_INPUT }, new BudgetLedger({ evaluations: 1 }));
    expect(result.status).toBe('unavailable'); expect(Object.values(result.budget.spent).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('passes typed output to a dependent assertion and blocks that work on fidelity failure', async () => {
    const f = fixture(); const module = sourceCommitmentsModule({ source: f.source, policy });
    let calls = 0;
    const dependent = defineAssertion({ card: { ...module.assertions[0].card, id: 'downstream.use-commitments', requires: ['source.commitments'] },
      implementation: { id: 'downstream-test', version: '1', digest: digest('downstream test') }, configuration: {}, applicability: 'Test only',
      input: bindInput({ schemaId: 'quality-sgd.candidate-commitments', schemaVersion: '1', schema: schema.json(), capabilities: COMMITMENT_INPUT.capabilities }),
      prerequisites: { preserved: fromAssertion('source.commitments', COMMITMENT_OUTPUT) },
      async evaluate(_context, _input, _config, prerequisites) { calls++; expect(prerequisites.preserved.preservedCommitmentIds).toEqual(['pilot-purchase']);
        return { status: 'pass', findings: [], evidence: ['test downstream'], actualCost: { evaluations: 1 } }; },
    });
    module.assertions.push(dependent);
    const gate = compileGate([module], [module.id], { required: [dependent.card.id], advisory: [] });
    const context = () => ({ artifact: { id: 'candidate', digest: f.report.candidateRevisionDigest, data: { text: f.content, commitments: f.report } },
      environmentDigest: digest('env'), available: COMMITMENT_INPUT });
    expect((await evaluateGate(gate, context(), new BudgetLedger({ evaluations: 2 }))).status).toBe('pass');
    f.report.commitments[0].conditions = [];
    const rejected = await evaluateGate(gate, context(), new BudgetLedger({ evaluations: 2 }));
    expect(rejected.status).toBe('fail'); expect(calls).toBe(1);
    expect(rejected.results[1].reasonCode).toBe('prerequisite-blocked');
  });

  it('does not allow a passing complexity facet to cancel a required fidelity failure', async () => {
    const f = fixture(); f.report.commitments[0].action = null;
    const module = sourceCommitmentsModule({ source: f.source, policy });
    const complexity = defineAssertion({ card: { ...module.assertions[0].card, id: 'test.low-complexity', path: ['communication', 'legibility'] },
      implementation: { id: 'complexity-test', version: '1', digest: digest('test') }, configuration: {}, applicability: 'Conjunction test only',
      input: bindInput({ schemaId: 'quality-sgd.candidate-commitments', schemaVersion: '1', schema: schema.json(), capabilities: COMMITMENT_INPUT.capabilities }),
      async evaluate() { return { status: 'pass', findings: [], evidence: ['test-only lower complexity'], actualCost: { evaluations: 1 }, loss: { lower: 0, upper: 0, unit: 'quanta' } }; },
    });
    module.assertions.push(complexity);
    const gate = compileGate([module], [module.id], { required: ['source.commitments'], advisory: [complexity.card.id] });
    const result = await evaluateGate(gate, { artifact: { id: 'candidate', digest: f.report.candidateRevisionDigest, data: { text: f.content, commitments: f.report } },
      environmentDigest: digest('env'), available: COMMITMENT_INPUT }, new BudgetLedger({ evaluations: 2 }));
    expect(result.results[1].status).toBe('pass'); expect(result.status).toBe('fail');
  });
});
