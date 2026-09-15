import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetLedger, bindInput, compileGate, defineAssertion, digest, evaluateGate, proposeWorkflowCompositions, schema } from 'quality-gate-sgd';
import { isoglossModule } from 'isogloss/quality-sgd';
import { softwareV2 } from 'quality-sgd-software';

const limits = { maxAssignments: 16, maxProposals: 8 };
const language = isoglossModule({ terms: ['amortization'], cap: 8, foldWords: 100, audienceId: 'synthetic-business-reader', scope: 'workflow-candidate-text' });
const numericInput = bindInput({ schemaId: 'workflow-example.amounts', schemaVersion: '1', schema: schema.object({ base: schema.number(), change: schema.number(), claimed: schema.number() }), path: ['source'] });
let arithmeticCalls = 0;
const arithmetic = defineAssertion({
  card: { id: 'workflow-example.arithmetic', version: '1', title: 'Preserve stated total', path: ['measurement', 'arithmetic'], claim: 'The supplied base plus change equals the supplied claimed total.',
    input: { schemas: ['workflow-example.amounts@1'], capabilities: [], description: 'Synthetic source amounts.' }, evidenceKind: 'deterministic', assumptions: ['These are the intended source amounts.'], guarantees: ['The specified numerical identity holds.'], doesNotGuarantee: ['Source authenticity, textual fidelity or reader comprehension.'], requires: [], costUpperBound: { evaluations: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Synthetic arithmetic predicate only.' } },
  implementation: { id: 'workflow-example/arithmetic', version: '1', digest: digest('base-plus-change-equals-claimed-v1') }, configuration: {}, applicability: { fixture: true }, input: numericInput,
  async evaluate(_context, value) {
    arithmeticCalls++;
    const status = value.base + value.change === value.claimed ? 'pass' : 'fail';
    return { status, findings: status === 'fail' ? [{ address: 'source/claimed', message: 'Claimed total does not equal base plus change.', evidence: ['fixture-arithmetic'] }] : [], evidence: ['fixture-arithmetic'], actualCost: { evaluations: 1 } };
  },
});
const numericModule = { id: 'workflow-example.numbers', version: '1', includes: [], assertions: [arithmetic] };
const communicationCatalog = [numericModule, language];
const communicationData = { source: { base: 100, change: 25, claimed: 125 }, text: 'The total is $125: a $100 base plus a $25 change.' };
const communicationSample = { artifact: { id: 'communication', digest: digest(communicationData), data: communicationData }, environmentDigest: digest({ fixture: 'communication-v1' }) };
const communicationPlan = proposeWorkflowCompositions({
  workflow: { id: 'business-communication', inputs: [numericInput], outputs: [language.assertions[0].contract.input], capabilities: ['audience-lexicon'] },
  requirements: [
    { id: 'arithmetic', description: 'Check the declared source arithmetic.', mode: 'required', select: { assertionIds: [arithmetic.card.id] } },
    { id: 'audience-facet', description: 'Inspect the external lexical novelty facet.', mode: 'optional', select: { assertionIds: ['isogloss.text-folds'], family: ['communication', 'legibility'] } },
  ], catalog: communicationCatalog, sample: communicationSample, limits,
});
assert.equal(arithmeticCalls, 0, 'Proposal generation must not execute assertions');
const withLanguage = communicationPlan.proposals.find(proposal => proposal.policy.advisory.includes('isogloss.text-folds'));
assert.ok(withLanguage); assert.equal(withLanguage.status, 'validated-inputs');
assert.equal(withLanguage.context.evaluationCostUpperBound.evaluations, 2);
const communicationResult = await evaluateGate(compileGate(communicationCatalog, withLanguage.modules, withLanguage.policy), { ...communicationSample, available: communicationPlan.available }, new BudgetLedger({ evaluations: 2 }));
assert.equal(communicationResult.status, 'pass'); assert.equal(arithmeticCalls, 1);
assert.equal(communicationResult.results.find(result => result.assertionId === 'isogloss.text-folds').status, 'pass');

const directory = await mkdtemp(join(tmpdir(), 'quality-workflow-software-'));
try {
  await writeFile(join(directory, 'a.ts'), 'export const amount: number = 5;');
  await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, files: ['a.ts'] }));
  const source = await softwareV2.snapshotSoftwareSource({ root: directory, files: ['a.ts'], support: ['tsconfig.json'] });
  const report = await softwareV2.collectTypescriptEvidence({ root: directory, source }, { project: 'tsconfig.json' });
  assert.equal(report.status, 'complete', report.reason ?? '');
  const software = softwareV2.softwareQualityModule({ files: ['a.ts'], support: source.support, checks: ['typescript'], maxTypeErrors: 0, maxLintErrors: 0, maxLintWarnings: 0, minimumCoverage: { statements: 100, branches: 100, functions: 100, lines: 100 } });
  const data = { software: softwareV2.softwareEvidence(source, [report]) };
  const sample = { artifact: { id: 'software', digest: digest(data), data }, environmentDigest: digest({ fixture: 'software-v1' }) };
  const softwareRequest = {
    workflow: { id: 'software-change', inputs: [], outputs: [software.assertions[0].contract.input], capabilities: ['software-source-snapshot'] },
    requirements: [{ id: 'complete-typescript', description: 'Require complete diagnostic evidence.', mode: 'required', select: { assertionIds: ['software.typescript.complete-evidence'] } }],
    catalog: [software], sample, limits,
  };
  const softwarePlan = proposeWorkflowCompositions(softwareRequest);
  assert.equal(softwarePlan.proposals[0].status, 'validated-inputs');
  const selected = softwarePlan.proposals[0];
  const result = await evaluateGate(compileGate([software], selected.modules, selected.policy), { ...sample, available: softwarePlan.available }, new BudgetLedger({ evaluations: 1 }));
  assert.equal(result.status, 'pass');
  const incompatible = proposeWorkflowCompositions({ ...softwareRequest, workflow: { ...softwareRequest.workflow, outputs: [{ ...software.assertions[0].contract.input, schemaVersion: 'unavailable-next-version' }] } });
  assert.equal(incompatible.proposals[0].status, 'incomplete');
  assert.ok(incompatible.proposals[0].problems.some(value => value.code === 'missing-schema'));
  console.log(JSON.stringify({
    cases: ['independent-isogloss-communication-facet', 'independent-complete-software-module', 'explicit-required-and-optional-policy', 'runtime-compatible-inputs', 'version-mismatch-reported', 'no-execution-during-planning'],
    communication: { proposalStatus: withLanguage.status, evaluation: communicationResult.status, costs: withLanguage.context.evaluationCostUpperBound },
    software: { proposalStatus: selected.status, evaluation: result.status, costs: selected.context.evaluationCostUpperBound },
    scope: 'Synthetic protocol and composition fixtures; no human comprehension or software-correctness qualification.',
    outcome: 'pass',
  }, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
