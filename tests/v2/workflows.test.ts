import { describe, expect, it, vi } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { compileGate } from '../../src/v2/catalog.js';
import { bindInput, defineAssertion, defineOutput, fromAssertion, schema } from '../../src/v2/contracts.js';
import { evaluateGate } from '../../src/v2/evaluate.js';
import { digest } from '../../src/v2/validation.js';
import type { Assertion, AssertionCard, AssertionModule, Observation } from '../../src/v2/types.js';
import { proposeWorkflowCompositions, workflowAvailable, type WorkflowContract, type WorkflowPlanOptions, type WorkflowRequirement } from '../../src/v2/workflows.js';

const input = bindInput({ schemaId: 'workflow.amount', schemaVersion: '1', schema: schema.object({ amount: schema.number() }), path: ['source'] });
const textInput = bindInput({ schemaId: 'workflow.text', schemaVersion: '1', schema: schema.string({ minLength: 1 }), path: ['text'], capabilities: ['audience-context'] });
const total = defineOutput({ schemaId: 'workflow.total', schemaVersion: '1', schema: schema.object({ total: schema.number() }) });
const implementation = { id: 'workflow/fixture', version: '1', digest: digest('workflow-fixture-build') };
function card(id: string, requires: string[] = []): AssertionCard {
  return { id, version: '1', title: id, path: ['measurement', 'arithmetic'], claim: 'Specified arithmetic over supplied amounts.', input: { schemas: ['workflow.amount@1'], capabilities: [], description: 'Synthetic source amount.' },
    evidenceKind: 'deterministic', assumptions: ['The supplied amount is the intended source.'], guarantees: ['Specified arithmetic only.'], doesNotGuarantee: ['Semantic communication quality.'], requires, costUpperBound: { evaluations: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Synthetic deterministic example.' } };
}
function assertion(id: string, evaluate = vi.fn(async (): Promise<Observation> => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 } }))) {
  return defineAssertion({ card: card(id), implementation, configuration: {}, applicability: { fixture: true }, input, evaluate });
}
function module(id: string, assertions: Assertion[], includes: string[] = []): AssertionModule { return { id, version: '1', includes, assertions }; }
const requirement = (id: string, assertionIds: string[], mode: 'required' | 'optional' = 'required'): WorkflowRequirement => ({ id, description: `Inspect ${id}`, mode, select: { assertionIds } });
const workflow: WorkflowContract = { id: 'rewrite', inputs: [input], outputs: [textInput], capabilities: ['audience-context'] };
const sample = { artifact: { id: 'candidate', digest: digest('candidate'), data: { source: { amount: 5 }, text: 'A clear statement.' } }, environmentDigest: 'fixture-environment' };
const limits = { maxAssignments: 20, maxProposals: 20 };
function options(catalog: AssertionModule[], requirements: WorkflowRequirement[]): WorkflowPlanOptions { return { workflow, sample, limits, catalog, requirements }; }

describe('workflow composition proposals', () => {
  it('finds required assertions and optional facets without executing or reconfiguring them', () => {
    const invoked = vi.fn(async (): Promise<Observation> => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 } }));
    const main = assertion('arithmetic', invoked);
    const optional = defineAssertion({ card: { ...card('communication'), path: ['communication', 'legibility'], evidenceKind: 'model-judgment', calibration: { status: 'unqualified', evidence: [], scope: 'Example only.' }, remediation: { prompt: 'Suggested repair text.', harnessId: 'optional-command', verification: ['arithmetic'] } }, implementation, configuration: { audience: 'specified-reader' }, applicability: { fixture: true }, input: textInput, evaluate: invoked });
    const catalog = [module('core-fixture', [main]), module('language-fixture', [optional])];
    const before = digest(catalog.map(item => item.assertions.map(value => ({ card: value.card, contract: value.contract }))));
    const plan = proposeWorkflowCompositions(options(catalog, [requirement('numbers', ['arithmetic']), requirement('reader-facet', ['communication'], 'optional')]));
    expect(plan.proposals).toHaveLength(2); expect(plan.enumeration.complete).toBe(true);
    expect(plan.proposals[0].policy).toEqual({ required: ['arithmetic'], advisory: [] });
    expect(plan.proposals[1].policy).toEqual({ required: ['arithmetic'], advisory: ['communication'] });
    expect(plan.proposals[1].status).toBe('validated-inputs');
    expect(plan.proposals[1].context?.evaluationCostUpperBound).toEqual({ evaluations: 2 });
    expect(plan.requirements[1].alternatives[0].context?.selectionStatus).toBe('advisory-only-unqualified');
    expect(invoked).not.toHaveBeenCalled();
    expect(digest(catalog.map(item => item.assertions.map(value => ({ card: value.card, contract: value.contract }))))).toBe(before);
    expect(JSON.parse(JSON.stringify(plan)).schemaVersion).toBe('quality-sgd.workflow-plan/v1');
    expect(Object.isFrozen(plan.proposals[1].context)).toBe(true);
  });
  it('uses the execution binding for runtime rejection and spends nothing while planning', async () => {
    const evaluate = vi.fn(async (): Promise<Observation> => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 } }));
    const catalog = [module('arithmetic', [assertion('arithmetic', evaluate)])];
    const badSample = { ...sample, artifact: { ...sample.artifact, data: { source: { amount: 'wrong' }, text: 'Still readable.' } } };
    const request = { ...options(catalog, [requirement('numbers', ['arithmetic'])]), sample: badSample };
    const plan = proposeWorkflowCompositions(request);
    expect(plan.proposals[0].status).toBe('incomplete');
    expect(plan.proposals[0].problems.some(issue => issue.code === 'runtime-input-invalid')).toBe(true);
    const proposal = plan.proposals[0];
    const actual = await evaluateGate(compileGate(catalog, proposal.modules, proposal.policy), { ...badSample, available: plan.available }, new BudgetLedger({ evaluations: 3 }));
    expect(actual.status).toBe('unavailable'); expect(actual.budget.spent).toEqual({}); expect(evaluate).not.toHaveBeenCalled();
  });
  it('reports missing versions, capabilities and shape/path disagreements', () => {
    const language = defineAssertion({ card: { ...card('language'), path: ['communication', 'legibility'] }, implementation, configuration: {}, applicability: {}, input: textInput, evaluate: async () => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: {} }) });
    for (const [changed, expectedCode] of [
      [{ ...workflow, outputs: [{ ...textInput, schemaVersion: '2' }] }, 'missing-schema'],
      [{ ...workflow, capabilities: [] }, 'missing-capability'],
      [{ ...workflow, outputs: [{ ...textInput, path: ['different'] }] }, 'binding-mismatch'],
      [{ ...workflow, outputs: [{ ...textInput, schema: schema.number().definition }] }, 'binding-mismatch'],
    ] as const) {
      const plan = proposeWorkflowCompositions({ ...options([module('language', [language])], [requirement('language', ['language'])]), workflow: changed });
      expect(plan.proposals[0].status).toBe('incomplete'); expect(plan.proposals[0].problems.some(issue => issue.code === expectedCode)).toBe(true);
    }
  });
  it.each(['id', 'digest', 'environmentDigest'] as const)('rejects an empty sample %s before calling it validated', async field => {
    const evaluate = vi.fn(async (): Promise<Observation> => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 } }));
    const catalog = [module('arithmetic', [assertion('arithmetic', evaluate)])];
    const badSample = structuredClone(sample);
    if (field === 'environmentDigest') badSample.environmentDigest = '';
    else badSample.artifact[field] = '';
    const plan = proposeWorkflowCompositions({ ...options(catalog, [requirement('numbers', ['arithmetic'])]), sample: badSample });
    const proposal = plan.proposals[0];
    expect(proposal.status).toBe('incomplete');
    expect(proposal.inputs[0].runtime).toBe('invalid');
    expect(proposal.problems.some(issue => issue.code === 'runtime-input-invalid' && issue.message.includes('nonempty text'))).toBe(true);
    const ledger = new BudgetLedger({ evaluations: 1 });
    await expect(evaluateGate(compileGate(catalog, proposal.modules, proposal.policy), { ...badSample, available: plan.available }, ledger)).rejects.toThrow('nonempty text');
    expect(ledger.snapshot().spent).toEqual({}); expect(evaluate).not.toHaveBeenCalled();
  });
  it('does not call declaration compatibility a validated payload without a sample', () => {
    const request = options([module('numbers', [assertion('numbers')])], [requirement('numbers', ['numbers'])]);
    delete request.sample;
    const plan = proposeWorkflowCompositions(request);
    expect(plan.proposals[0].status).toBe('declaration-compatible'); expect(plan.proposals[0].inputs[0].runtime).toBe('not-supplied');
  });
  it('exposes unsupported requirements and bounded deterministic alternatives without inventing replacements', () => {
    const catalog = [module('alternatives', ['one', 'two', 'three'].map(id => assertion(id)))];
    const plan = proposeWorkflowCompositions({ ...options(catalog, [requirement('numbers', ['one', 'two', 'three']), requirement('facet', ['one', 'two', 'three'], 'optional')]), limits: { maxAssignments: 2, maxProposals: 10 } });
    expect(plan.requirements[0].alternatives).toHaveLength(3);
    expect(plan.enumeration).toMatchObject({ consideredAssignments: 2, totalAssignments: '12', complete: false, truncated: true });
    const missing = proposeWorkflowCompositions(options(catalog, [requirement('required-missing', ['does-not-exist'])]));
    expect(missing.proposals).toEqual([]); expect(missing.unsupportedRequirements[0].id).toBe('required-missing'); expect(missing.enumeration.complete).toBe(true);
    const optional = proposeWorkflowCompositions(options(catalog, [requirement('numbers', ['one']), requirement('optional-missing', ['absent'], 'optional')]));
    expect(optional.proposals).toHaveLength(1); expect(optional.proposals[0].omittedOptional).toEqual(['optional-missing']);
  });
  it('marks family/text matching as contextual hints and requires all explicit selectors', () => {
    const catalog = [module('numbers', [assertion('numbers')])];
    const selected: WorkflowRequirement = { id: 'facet', description: 'Inspect arithmetic context', mode: 'required', select: { family: ['measurement', 'arithmetic'], query: 'supplied amounts' } };
    const plan = proposeWorkflowCompositions(options(catalog, [selected]));
    expect(plan.requirements[0].alternatives[0].matchReasons.join(' ')).toMatch(/does not establish semantic equivalence/);
    const unsupported = proposeWorkflowCompositions(options(catalog, [{ ...selected, select: { ...selected.select, assertionIds: ['unrelated'] } }]));
    expect(unsupported.proposals).toHaveLength(0);
  });
  it('preserves qualification restrictions for required assertions and transitive prerequisites', () => {
    const unqualified = defineAssertion({ card: { ...card('judge'), evidenceKind: 'model-judgment', calibration: { status: 'unqualified', evidence: [], scope: 'Not qualified.' } }, implementation, configuration: {}, applicability: {}, input, evaluate: async () => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: {} }) });
    const dependent = defineAssertion({ card: card('dependent', ['judge']), implementation, configuration: {}, applicability: {}, input, evaluate: async () => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: {} }) });
    const plan = proposeWorkflowCompositions(options([module('judgment', [unqualified, dependent])], [requirement('dependent', ['dependent'])]));
    expect(plan.proposals[0].status).toBe('incomplete');
    expect(plan.proposals[0].problems).toContainEqual(expect.objectContaining({ code: 'required-gate-unqualified', assertionId: 'judge' }));
    expect(unqualified.card.calibration.status).toBe('unqualified');
  });
  it('compiles typed handoffs in prerequisite order and reports exact evidence output alternatives', () => {
    const producer = defineAssertion({ card: card('produce'), implementation, configuration: {}, applicability: {}, input, output: total, evaluate: async () => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 }, output: { total: 10 } }) });
    const consumer = defineAssertion({ card: card('consume', ['produce']), implementation, configuration: {}, applicability: {}, input, output: total, prerequisites: { sourceTotal: fromAssertion('produce', total) }, evaluate: async (_context, _input, _config, previous) => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: { evaluations: 1 }, output: previous.sourceTotal }) });
    const catalog = [module('producer', [producer]), module('consumer', [consumer], ['producer'])];
    const plan = proposeWorkflowCompositions(options(catalog, [{ ...requirement('result', ['consume']), select: { assertionIds: ['consume'], produces: total } }]));
    const proposal = plan.proposals[0];
    expect(proposal.orderedAssertions).toEqual(['produce', 'consume']);
    expect(proposal.handoffs).toEqual([{ from: 'produce', to: 'consume', name: 'sourceTotal', schema: 'workflow.total@1', schemaDigest: digest(total), status: 'contract-compatible-not-executed' }]);
    expect(proposal.context?.evaluationCostUpperBound).toEqual({ evaluations: 2 });
    const noMatch = proposeWorkflowCompositions(options(catalog, [{ ...requirement('result', ['consume']), select: { produces: { ...total, schemaVersion: '2' } } }]));
    expect(noMatch.unsupportedRequirements).toHaveLength(1);
  });
  it('surfaces invalid closures rather than inventing missing producer implementations', () => {
    const dependent = defineAssertion({ card: card('dependent', ['missing']), implementation, configuration: {}, applicability: {}, input, evaluate: async () => ({ status: 'pass', findings: [], evidence: ['fixture'], actualCost: {} }) });
    const plan = proposeWorkflowCompositions(options([module('invalid', [dependent])], [requirement('dependent', ['dependent'])]));
    expect(plan.proposals[0].status).toBe('invalid'); expect(plan.proposals[0].problems[0].message).toMatch(/Unknown assertion missing/);
  });
  it('rejects ambiguous/malformed declarations and requires explicit positive enumeration limits', () => {
    const catalog = [module('numbers', [assertion('numbers')])]; const request = options(catalog, [requirement('numbers', ['numbers'])]);
    expect(() => workflowAvailable({ ...workflow, outputs: [input] })).toThrow(/unique/);
    expect(() => proposeWorkflowCompositions({ ...request, limits: { maxAssignments: 0, maxProposals: 1 } })).toThrow(/positive/);
    for (const select of [{}, { assertionIds: null }, { family: null }, { produces: null }]) expect(() => proposeWorkflowCompositions({ ...request, requirements: [{ ...request.requirements[0], select } as WorkflowRequirement] })).toThrow();
    expect(() => proposeWorkflowCompositions({ ...request, requirements: [requirement('optional', ['numbers'], 'optional')] })).toThrow(/at least one required/);
  });
});
