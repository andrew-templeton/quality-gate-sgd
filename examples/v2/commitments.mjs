/** Runnable structured-record example, not an experiment establishing prose or reader fidelity. */
import { compileGate } from '../../dist/v2/catalog.js';
import { evaluateGate } from '../../dist/v2/evaluate.js';
import { BudgetLedger } from '../../dist/v2/budget.js';
import { digest } from '../../dist/v2/validation.js';
import { sourceCommitmentsModule, sourceCoverageDigest, COMMITMENT_INPUT } from '../../dist/v2/commitments.js';

const sourceText = 'The pilot costs $120 in its first year: $100 license and $20 setup. Finance approval is required. Savings could be zero. Finance must decide by Friday.';
const commitment = {
  id: 'pilot', address: 'quality://claim/pilot/purchase', sourceAddresses: ['quality://component/source/paragraph-1'],
  proposition: 'first-year pilot purchase', quantity: { amount: 120, unit: 'USD', denominator: null },
  actor: 'Operations', population: 'pilot stores', period: 'first-year', scope: 'pilot only',
  conditions: ['finance approval'], dependencies: [], adverseScenarios: ['zero savings'],
  uncertainty: { kind: 'unknown', lower: null, upper: null, confidence: null, description: 'Savings could be zero.' },
  claimStrength: 'description',
  materialCosts: [{ id: 'license', amount: 100, unit: 'USD', period: 'first-year' }, { id: 'setup', amount: 20, unit: 'USD', period: 'first-year' }],
  action: { actor: 'Finance', operation: 'decide', target: 'pilot', deadline: 'Friday', conditions: [] },
};
const source = {
  id: 'pilot-source', revisionDigest: digest({ sourceText, revision: 'source-v1' }), contentDigest: digest(sourceText), content: sourceText,
  sections: [{ address: 'quality://component/source/paragraph-1', start: 0, end: sourceText.length }],
  coverage: { status: 'complete', coveredAddresses: ['quality://component/source/paragraph-1'], evidence: ['Example source inventory authored directly; no empirical annotation qualification.'] },
  commitments: [commitment], relationships: [{ id: 'all-in', kind: 'all-in-cost', resultId: 'pilot', absoluteTolerance: 0 }], corrections: [],
};
const module = sourceCommitmentsModule({ source, policy: { mode: 'structured-only', scope: 'Illustrative purchase records', semanticEvaluators: [] } });
const gate = compileGate([module], [module.id], { required: ['source.commitments'], advisory: [] });
async function check(text, commitments) {
  const candidateRevisionDigest = digest({ text, commitments });
  const report = { sourceRevisionDigest: source.revisionDigest, candidateRevisionDigest, candidateContentDigest: digest(text),
    sourceCoverageDigest: sourceCoverageDigest(source), commitments, judgment: null };
  return evaluateGate(gate, { artifact: { id: 'pilot-candidate', digest: candidateRevisionDigest, data: { text, commitments: report } },
    environmentDigest: digest({ source: source.revisionDigest, scope: 'Illustrative purchase records' }), available: COMMITMENT_INPUT },
  new BudgetLedger({ evaluations: 1 }));
}
const faithful = await check(sourceText, [commitment]);
const shortened = { ...structuredClone(commitment), quantity: { amount: 100, unit: 'USD', denominator: null }, conditions: [], adverseScenarios: [], action: null };
const failed = await check('The pilot costs $100.', [shortened]);
console.log(JSON.stringify({
  scope: 'Deterministic supplied annotation comparisons only. No semantic extraction or human comprehension was evaluated.',
  faithful: { status: faithful.status, output: faithful.results[0].outputEvidence },
  shorter: { status: failed.status, findings: failed.results[0].findings },
}, null, 2));
