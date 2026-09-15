import { digest } from 'quality-gate-sgd';
import { data, inventory } from './fixture.mjs';

// Authored annotations for this invented source. This is not semantic extraction.
export const audience = {
  id: 'business-decision-makers-without-technical-jargon',
  background: 'Business decision-makers unfamiliar with technical jargon',
  decisionExperience: 'Understands budgets, annual benefits, costs and pilot decisions; no assumed data-engineering vocabulary.',
  knownConcepts: [], unfamiliarConcepts: ['inventory-join', 'sensitivity-case'],
};
export const task = {
  id: 'request-pilot-review',
  decision: 'Decide whether to request a two-week pilot review, and explain the benefit, all-in cost, downside and condition before rollout.',
  requiredCommitmentIds: ['savings', 'cost', 'net', 'condition', 'downside', 'approve'],
  entryElementIds: ['savings', 'cost', 'net', 'condition', 'downside', 'approve', 'disclosure'],
};
const content = inventory.map(item => item.text).join('\n');
const address = 'quality://component/business-case/source';
const quantities = { savings: data.annualSavings, cost: data.annualCost, net: data.annualNet,
  downside: data.downsideNet, calculation: data.annualNet, 'downside-calculation': data.downsideNet };
const commitments = inventory.map(item => ({
  id: item.id, address: `quality://${item.address}`, sourceAddresses: [address], proposition: item.text,
  quantity: Object.hasOwn(quantities, item.id) ? { amount: quantities[item.id], unit: data.currency, denominator: null } : null,
  actor: 'Operations', population: '10 pilot stores', period: 'year', scope: 'Invented pilot business case',
  conditions: ['Rollout requires the product-record matching pilot to pass'], dependencies: ['Two-week pilot review'],
  adverseScenarios: ['Annual savings can fall to 30000 USD, producing a 10000 USD annual net loss'],
  uncertainty: { kind: 'estimate', lower: null, upper: null, confidence: null, description: 'Expected savings are forecasts, not measured results' },
  claimStrength: 'prediction',
  materialCosts: item.id === 'cost' ? [{ id: 'annual-package-including-support', amount: data.annualCost, unit: data.currency, period: 'year' }] : [],
  action: item.id === 'approve' ? { actor: 'Business decision-maker', operation: 'request', target: 'two-week pilot review', deadline: 'not specified', conditions: [] } : null,
}));
commitments.push({ ...structuredClone(commitments.find(item => item.id === 'downside')), id: 'downside-savings', address: 'quality://claim/business/downside-savings',
  proposition: 'The downside scenario assumes annual savings of 30000 USD for the 10 stores.', quantity: { amount: data.downsideSavings, unit: data.currency, denominator: null } });
export const source = {
  id: 'invented-business-source-v1', revisionDigest: digest({ content, data, version: 1 }), contentDigest: digest(content), content,
  sections: [{ address, start: 0, end: content.length }], coverage: { status: 'complete', coveredAddresses: [address], evidence: ['Authored full fixture source; model annotations, not independently qualified extraction'] },
  commitments, corrections: [], relationships: [
    { id: 'net-benefit', kind: 'sum', resultId: 'net', terms: [{ commitmentId: 'savings', coefficient: 1 }, { commitmentId: 'cost', coefficient: -1 }], absoluteTolerance: 0 },
    { id: 'downside-net', kind: 'sum', resultId: 'downside', terms: [{ commitmentId: 'downside-savings', coefficient: 1 }, { commitmentId: 'cost', coefficient: -1 }], absoluteTolerance: 0 },
    { id: 'all-in-package', kind: 'all-in-cost', resultId: 'cost', absoluteTolerance: 0 },
    { id: 'supporting-net', kind: 'sum', resultId: 'calculation', terms: [{ commitmentId: 'net', coefficient: 1 }], absoluteTolerance: 0 },
    { id: 'supporting-downside', kind: 'sum', resultId: 'downside-calculation', terms: [{ commitmentId: 'downside', coefficient: 1 }], absoluteTolerance: 0 },
  ],
};

export function candidateAnnotations(report) {
  const visible = new Set(report.states.flatMap(state => state.elements.filter(item => item.rects.length).map(item => item.id)));
  return {
    text: inventory.filter(item => visible.has(item.id)).map(item => item.text).join('\n'),
    commitments: source.commitments.filter(item => item.id === 'downside-savings' ? visible.has('downside') || visible.has('downside-calculation') : visible.has(item.id)),
  };
}
