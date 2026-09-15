import { describe, expect, it } from 'vitest';
import { BudgetLedger, COMMITMENT_INPUT, COMMITMENT_OUTPUT, COMMUNICATION_INPUT, SURFACE_OUTPUT, bindInput, commitmentInventoryDigest, communicationScopeModule, compileGate, defineAssertion, defineCommunicationContract, digest, evaluateGate, schema, sourceCommitmentsModule, sourceCoverageDigest, sourceReferenceDigest } from '../../src/v2/index.js';
import type { AssertionModule, CandidateCommitmentReport, CommitmentPolicy, CommitmentSummary, CommunicationAudience, CommunicationContract, CommunicationTask, OutputBinding, SemanticCommitment, SourceCommitmentContract, Status, SurfacePolicy, SurfaceVerification } from '../../src/v2/index.js';

const surfaceIds = ['surface.geometry', 'surface.inventory', 'surface.total-budget', 'surface.novel-budget'];
const ready = bindInput({ schemaId: 'communication-fixture.ready', schemaVersion: '1', schema: schema.boolean(), path: ['ready'] });

/** Authored records and synthetic producers test composition mechanics only. */
function fixture(mode: CommunicationContract['fidelityMode'] = 'structured-only') {
  const content = 'Approve the pilot only after review; total cost is $40.';
  const commitment: SemanticCommitment = {
    id: 'pilot', address: 'quality://claim/pilot', sourceAddresses: ['quality://component/source/full'], proposition: 'reviewed-pilot-at-stated-cost',
    quantity: { amount: 40, unit: 'USD', denominator: null }, actor: 'Operator', population: 'Pilot participants', period: 'one-time', scope: 'Synthetic pilot',
    conditions: ['review-completed'], dependencies: [], adverseScenarios: ['pilot-may-not-help'],
    uncertainty: { kind: 'unknown', lower: null, upper: null, confidence: null, description: 'Benefit is not established.' }, claimStrength: 'description',
    materialCosts: [{ id: 'all-costs', amount: 40, unit: 'USD', period: 'one-time' }],
    action: { actor: 'Operator', operation: 'review', target: 'pilot', deadline: 'before-approval', conditions: ['review-completed'] },
  };
  const source: SourceCommitmentContract = {
    id: 'communication-fixture-source', revisionDigest: digest('full-source-revision'), contentDigest: digest(content), content,
    sections: [{ address: 'quality://component/source/full', start: 0, end: content.length }],
    coverage: { status: 'complete', coveredAddresses: ['quality://component/source/full'], evidence: ['Authored fixture inventory, not empirical extraction.'] },
    commitments: [commitment], relationships: [{ id: 'cost', kind: 'all-in-cost', resultId: 'pilot', absoluteTolerance: 0 }], corrections: [],
  };
  const audience: CommunicationAudience = { id: 'fixture-business-reader', background: 'Synthetic business reader', decisionExperience: 'Declared familiarity only', knownConcepts: ['cost'], unfamiliarConcepts: ['pilot'] };
  const task: CommunicationTask = { id: 'pilot-review', decision: 'Inspect conditions and decide whether to approve a pilot.', requiredCommitmentIds: ['pilot'], entryElementIds: ['cost', 'action'] };
  const policy: SurfacePolicy = {
    version: 'communication-fixture-v1', collectorDigest: digest('synthetic-collector'), scrollModel: 'integer-css-pixels', knownConcepts: ['cost'],
    elements: [
      { id: 'cost', address: 'quality://claim/pilot/cost', text: 'Total cost is $40.', concepts: ['cost'], defines: [] },
      { id: 'action', address: 'quality://claim/pilot/action', text: 'Review before approving the pilot.', concepts: ['pilot'], defines: ['pilot'] },
    ],
    states: (['keyboard', 'touch'] as const).map(input => ({ id: `entry-${input}`, route: '/decision', viewport: { width: 400, height: 500 }, input, interaction: 'closed',
      requiredElements: ['cost', 'action'], entryElements: ['cost', 'action'], actions: ['action'], maxTotal: 2, maxNovel: 1, minFontPx: 16, minTargetPx: 44, maxBlankGapPx: 150, maxScrollScreens: 2 })),
  };
  const registration = { audience, task, source, fidelityMode: mode, surfacePolicy: policy };
  const contract = defineCommunicationContract(registration);
  const artifactDigest = digest('synthetic-candidate-render-source-and-data'); const environmentDigest = digest('synthetic-render-environment');
  const sourceSummary: CommitmentSummary = {
    sourceRevisionDigest: source.revisionDigest, sourceContentDigest: source.contentDigest, sourceCoverageDigest: sourceCoverageDigest(source), referenceDigest: sourceReferenceDigest(source),
    candidateRevisionDigest: artifactDigest, candidateContentDigest: digest(content), inventoryDigest: commitmentInventoryDigest(source.commitments),
    preservedCommitmentIds: ['pilot'], appliedCorrectionIds: [], semanticMode: mode,
  };
  const surface: SurfaceVerification = { artifactDigest, environmentDigest, renderDigest: digest('synthetic-render'), policyDigest: digest(policy), collectorDigest: policy.collectorDigest };
  return { registration, contract, sourceSummary, surfaces: surfaceIds.map(() => structuredClone(surface)),
    context: { artifact: { id: 'communication-mechanics-fixture', digest: artifactDigest, data: { ready: true, communication: { contractDigest: digest(contract) }, text: content } }, environmentDigest,
      available: { schemas: ['communication-fixture.ready@1', ...COMMUNICATION_INPUT.schemas], capabilities: COMMUNICATION_INPUT.capabilities } } };
}
type Fixture = ReturnType<typeof fixture>;

function producer<T>(id: string, output: OutputBinding<T>, value: T, status: Status = 'pass') {
  return defineAssertion({
    card: { id, version: 'mechanics-only', title: id, path: ['control', 'reliability'], claim: 'Deliver the authored fixture record for composition mechanics.',
      input: { schemas: ['communication-fixture.ready@1'], capabilities: [], description: 'Synthetic test readiness flag.' }, evidenceKind: 'deterministic',
      assumptions: ['Authored fixture only.'], guarantees: ['Configured fixture output and status.'], doesNotGuarantee: ['Rendered collection, semantic fidelity, economics or human comprehension.'],
      requires: [], costUpperBound: { evaluations: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Protocol mechanics only.' } },
    implementation: { id: 'communication-fixture/producer', version: '1', digest: digest('synthetic-producer') }, configuration: { value, status }, applicability: { fixture: true }, input: ready, output,
    async evaluate(_context, _input, config) {
      return { status: config.status, findings: config.status === 'fail' ? [{ address: 'quality://claim/fixture', message: 'Configured fixture failure.', evidence: ['synthetic'] }] : [],
        evidence: ['Authored mechanics fixture, not collected or empirically qualified evidence.'], actualCost: { evaluations: 1 }, ...(config.status === 'pass' ? { output: config.value } : {}) };
    },
  });
}
function modules(value: Fixture, statuses: Record<string, Status> = {}): AssertionModule[] {
  return [
    { id: 'source-commitments', version: 'fixture', includes: [], assertions: [producer('source.commitments', COMMITMENT_OUTPUT, value.sourceSummary, statuses['source.commitments'])] },
    { id: 'surface-evidence', version: 'fixture', includes: [], assertions: surfaceIds.map((id, index) => producer(id, SURFACE_OUTPUT, value.surfaces[index], statuses[id])) },
    communicationScopeModule(value.contract),
  ];
}
function gate(value: Fixture, statuses: Record<string, Status> = {}) {
  return compileGate(modules(value, statuses), ['communication-scope'], { required: ['communication.scope'], advisory: [] });
}
const run = (value: Fixture, statuses: Record<string, Status> = {}) => evaluateGate(gate(value, statuses), value.context, new BudgetLedger({ evaluations: 5 }));

describe('registered communication audience, task and views', () => {
  it('freezes registration and changes evaluator identity with relevant audience and task settings', () => {
    const value = fixture(); const original = communicationScopeModule(value.contract).assertions[0];
    value.registration.audience.background = 'Different reader background';
    value.registration.task.decision = 'Different decision';
    value.registration.surfacePolicy.states[0].maxTotal = 99;
    expect(Object.isFrozen(value.contract.audience.knownConcepts)).toBe(true);
    expect(value.contract.audience.background).toBe('Synthetic business reader');
    for (const changed of [
      { ...fixture().registration, audience: { ...fixture().registration.audience, background: 'Different reader background' } },
      { ...fixture().registration, task: { ...fixture().registration.task, decision: 'A different registered decision' } },
    ]) {
      const revised = communicationScopeModule(defineCommunicationContract(changed)).assertions[0];
      expect(revised.contract?.evaluatorDigest).not.toBe(original.contract?.evaluatorDigest);
    }
    expect(original.card.doesNotGuarantee.join(' ')).toContain('Human comprehension');
    expect(original.card.doesNotGuarantee.join(' ')).toContain('causal benefit');
  });
  it.each([
    ['knowledge mismatch', (f: Fixture) => { f.registration.audience.knownConcepts = []; }],
    ['unregistered unfamiliar concept', (f: Fixture) => { f.registration.audience.unfamiliarConcepts = []; }],
    ['contradictory familiarity', (f: Fixture) => { f.registration.audience.unfamiliarConcepts.push('cost'); }],
    ['unknown source requirement', (f: Fixture) => { f.registration.task.requiredCommitmentIds = ['unknown']; }],
    ['missing entry in one required state', (f: Fixture) => { f.registration.surfacePolicy.states[1].entryElements = ['cost']; }],
    ['unknown task entry element', (f: Fixture) => { f.registration.task.entryElementIds.push('missing'); }],
    ['duplicate task requirement', (f: Fixture) => { f.registration.task.requiredCommitmentIds.push('pilot'); }],
  ] as const)('rejects %s during registration', (_label, mutate) => {
    const value = fixture(); mutate(value); expect(() => defineCommunicationContract(value.registration)).toThrow();
  });
});

describe('typed communication conjunction', () => {
  it('requires all five passing producers and emits a bound summary with their receipt lineage', async () => {
    const value = fixture(); const compiled = gate(value);
    expect(compiled.assertions.map(assertion => assertion.card.id)).toEqual(['source.commitments', ...surfaceIds, 'communication.scope']);
    const result = await run(value);
    expect(result.status).toBe('pass'); expect(result.budget.spent).toEqual({ evaluations: 5 });
    const communication = result.results.at(-1);
    expect(communication?.output).toEqual({ contractDigest: digest(value.contract), audienceId: value.contract.audience.id, taskId: value.contract.task.id,
      sourceReferenceDigest: value.contract.sourceReferenceDigest, artifactDigest: value.context.artifact.digest, renderDigest: value.surfaces[0].renderDigest, fidelityMode: 'structured-only' });
    expect(communication?.outputEvidence?.dependencies).toEqual(result.results.slice(0, 5).map(entry => entry.outputEvidence?.digest).sort());
  });
  it.each([
    ['source revision', (f: Fixture) => { f.sourceSummary.sourceRevisionDigest = digest('stale'); }],
    ['source reference', (f: Fixture) => { f.sourceSummary.referenceDigest = digest('stale'); }],
    ['source candidate revision', (f: Fixture) => { f.sourceSummary.candidateRevisionDigest = digest('stale'); }],
    ['preserved task commitments', (f: Fixture) => { f.sourceSummary.preservedCommitmentIds = []; }],
    ['render artifact', (f: Fixture) => { f.surfaces[0].artifactDigest = digest('stale'); }],
    ['render environment', (f: Fixture) => { f.surfaces[1].environmentDigest = digest('stale'); }],
    ['view policy', (f: Fixture) => { f.surfaces[2].policyDigest = digest('stale'); }],
    ['collector implementation', (f: Fixture) => { f.surfaces[3].collectorDigest = digest('stale'); }],
    ['one facet render', (f: Fixture) => { f.surfaces[1].renderDigest = digest('different-render'); }],
    ['candidate contract binding', (f: Fixture) => { f.context.artifact.data.communication.contractDigest = digest('stale'); }],
  ] as const)('makes mismatched %s unavailable even with passing producer statuses', async (_label, mutate) => {
    const value = fixture(); mutate(value); const result = await run(value);
    expect(result.results.slice(0, 5).every(entry => entry.status === 'pass')).toBe(true);
    expect(result.status).toBe('unavailable'); expect(result.results.at(-1)?.status).toBe('unavailable');
    expect(result.results.at(-1)?.outputEvidence).toBeUndefined(); expect(result.results.at(-1)?.findings.length).toBeGreaterThan(0);
  });
  it.each(['source.commitments', ...surfaceIds])('blocks communication when %s is unavailable', async id => {
    const result = await run(fixture(), { [id]: 'unavailable' });
    expect(result.status).toBe('unavailable');
    expect(result.results.at(-1)).toMatchObject({ status: 'unavailable', reasonCode: 'prerequisite-blocked', actualCost: {} });
    expect(result.results.at(-1)?.outputEvidence).toBeUndefined();
  });
  it('preserves a required failure and rejects missing or differently typed producers', async () => {
    expect((await run(fixture(), { 'surface.total-budget': 'fail' })).status).toBe('fail');
    const value = fixture(); const incomplete = modules(value); incomplete[1].assertions.pop();
    expect(() => compileGate(incomplete, ['communication-scope'], { required: ['communication.scope'], advisory: [] })).toThrow('Unknown assertion');
    const mismatched = modules(value);
    mismatched[1].assertions[0] = producer('surface.geometry', { ...SURFACE_OUTPUT, schemaVersion: '2' }, value.surfaces[0]);
    expect(() => compileGate(mismatched, ['communication-scope'], { required: ['communication.scope'], advisory: [] })).toThrow('output contract mismatch');
  });
  it.each(['structured-only', 'qualified-prose'] as const)('does not silently substitute another fidelity mode for registered %s', async mode => {
    const value = fixture(mode); value.sourceSummary.semanticMode = mode === 'structured-only' ? 'qualified-prose' : 'structured-only';
    const result = await run(value);
    expect(result.results[0].status).toBe('pass'); expect(result.results.at(-1)?.status).toBe('unavailable');
    expect(result.results.at(-1)?.findings[0].message).toContain('fidelity mode');
  });
});

describe('actual source predicate and semantic scope', () => {
  async function actualSource(mode: CommunicationContract['fidelityMode'], provideFixtureReceipt: boolean) {
    const value = fixture(mode);
    // Matching annotations deliberately accompany contradictory prose to expose structured-only scope.
    value.context.artifact.data.text = 'Approve immediately without review. There is no cost.';
    const policy: CommitmentPolicy = { mode, scope: 'Authored protocol fixtures only', semanticEvaluators: mode === 'qualified-prose' ? [{ evaluatorDigest: digest('synthetic-judge'), applicabilityDigest: digest('synthetic-scope'), scope: 'Authored protocol fixtures only', evidence: ['Synthetic authority exercises receipt mechanics; no empirical qualification.'] }] : [] };
    const report: CandidateCommitmentReport = { sourceRevisionDigest: value.registration.source.revisionDigest, candidateRevisionDigest: value.context.artifact.digest,
      candidateContentDigest: digest(value.context.artifact.data.text), sourceCoverageDigest: sourceCoverageDigest(value.registration.source), commitments: value.registration.source.commitments, judgment: null };
    if (provideFixtureReceipt) report.judgment = {
      evaluatorDigest: policy.semanticEvaluators[0].evaluatorDigest, applicabilityDigest: policy.semanticEvaluators[0].applicabilityDigest,
      referenceDigest: sourceReferenceDigest(value.registration.source), sourceRevisionDigest: value.registration.source.revisionDigest, sourceContentDigest: value.registration.source.contentDigest,
      candidateRevisionDigest: value.context.artifact.digest, candidateContentDigest: report.candidateContentDigest,
      candidateInventoryDigest: commitmentInventoryDigest(report.commitments), coverageDigest: report.sourceCoverageDigest, status: 'pass', evidence: ['Fabricated passing receipt for protocol mechanics only.'],
    };
    const catalog = modules(value); catalog[0] = sourceCommitmentsModule({ source: value.registration.source, policy });
    return evaluateGate(compileGate(catalog, ['communication-scope'], { required: ['communication.scope'], advisory: [] }), {
      ...value.context, artifact: { ...value.context.artifact, data: { ...value.context.artifact.data, commitments: report } },
      available: { schemas: [...value.context.available.schemas, ...COMMITMENT_INPUT.schemas], capabilities: [...value.context.available.capabilities, ...COMMITMENT_INPUT.capabilities] },
    }, new BudgetLedger({ evaluations: 5 }));
  }
  it('keeps a structured-only passing result explicitly narrower than prose fidelity', async () => {
    const result = await actualSource('structured-only', false);
    expect(result.status).toBe('pass'); expect(result.results.at(-1)?.output).toMatchObject({ fidelityMode: 'structured-only' });
  });
  it('blocks qualified-prose communication when the actual source module has no semantic receipt', async () => {
    const result = await actualSource('qualified-prose', false);
    expect(result.results[0].status).toBe('unavailable'); expect(result.results.at(-1)?.reasonCode).toBe('prerequisite-blocked'); expect(result.status).toBe('unavailable');
  });
  it('preserves a qualified-prose mode only through its explicitly accepted receipt mechanics', async () => {
    const result = await actualSource('qualified-prose', true);
    expect(result.status).toBe('pass'); expect(result.results.at(-1)?.output).toMatchObject({ fidelityMode: 'qualified-prose' });
    // This synthetic passing receipt is intentionally not evidence of actual semantic quality.
    expect(result.results[0].evidence.join(' ')).toContain('Fabricated passing receipt');
  });
});
