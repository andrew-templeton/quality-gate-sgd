import { ASSERTION_ZOO, modelCard } from './catalog.js';
import { assertionStatement, validateAssertionContract } from './contracts.js';
import type { Assertion, AssertionModule, CompiledGate, Cost, EvidenceKind } from './types.js';
import { digest, freezeJson, requireThat, validateCost } from './validation.js';

export const CARD_VOCABULARY = freezeJson({
  id: 'Stable assertion name; equal names do not authenticate equivalent implementations.',
  path: 'Discoverable family and sub-facets, not a rank of proof strength.',
  claim: 'The exact proposition reported by a passing result.',
  evidenceKind: 'The form of support: calculation, observed sample, model judgment or causal-assumption audit.',
  assumptions: 'Conditions that must hold for the stated guarantee to apply.',
  guarantees: 'Conclusions supported within the declared scope when assumptions hold.',
  doesNotGuarantee: 'Nearby conclusions that this assertion cannot justify.',
  applicability: 'Declared population, task, measurement and environment scope; assess fit before use.',
  implementation: 'Version and build identity of the evaluator; a digest is not execution attestation.',
  configuration: 'Frozen thresholds, audience definitions, rubric or other behaviorally relevant settings.',
  input: 'Exact versioned runtime schema, own-property selector and required capabilities.',
  output: 'Optional versioned data schema; passing output is validated before it can become evidence.',
  prerequisites: 'Required upstream assertions and optional named typed output handoffs.',
  calibration: 'Evidence, scope and current evaluator identity authorizing the declared use; inspect the cited study.',
  costUpperBound: 'Reserved evaluation units. Units are independent; report collection and repairs need separate budgets.',
  remediation: 'Suggested prompt and verification requirements. This metadata grants no permission to run a harness.',
});

export const EVIDENCE_CONTEXT: Record<EvidenceKind, { supports: string; requiredEvidence: string[]; excluded: string[] }> = freezeJson({
  deterministic: { supports: 'A specified predicate over supplied inputs.', requiredEvidence: ['Executable predicate and current complete inputs for its declared scope.'], excluded: ['Authenticity or adequacy of its inputs.', 'Human comprehension or application utility without separate evidence.'] },
  empirical: { supports: 'Observed performance within a specified study and population.', requiredEvidence: ['Sampling and task protocol, measurements, exclusions, uncertainty and evidence-use history.'], excluded: ['Automatic transfer to other populations.', 'Causal identification from correlation alone.'] },
  'model-judgment': { supports: 'A model-produced assessment under the declared rubric.', requiredEvidence: ['Exact model/prompt/configuration identity.', 'Scoped known-label error evidence before required-gate use.'], excluded: ['Correctness from preference wins.', 'Reliability from fluent explanations or a large scalar score.'] },
  'causal-assumption-audit': { supports: 'An audit of stated assumptions relevant to an intervention claim.', requiredEvidence: ['Causal model, intervention, estimand and evidence for identification assumptions.'], excluded: ['An identified effect merely because assumptions were declared.', 'Global causal optimality from local nudge scores.'] },
});

export function assertionContext(assertion: Assertion) {
  digest(assertion.card);
  if (assertion.contract) {
    validateAssertionContract(assertion.contract);
    requireThat(assertion.contract.statementDigest === assertionStatement(assertion.card), 'Card statement disagrees with its execution contract');
  }
  const { card, contract } = assertion;
  requireThat(Object.hasOwn(EVIDENCE_CONTEXT, card.evidenceKind), 'Unknown evidence kind');
  return freezeJson(structuredClone({ card, protocol: contract?.protocol ?? 'legacy',
    implementation: contract?.implementation ?? null, configuration: contract?.configuration ?? null,
    applicability: contract?.applicability ?? null, evaluatorDigest: contract?.evaluatorDigest ?? null,
    runtimeInput: contract?.input ?? null, runtimeOutput: contract?.output ?? null, handoffs: contract?.prerequisites ?? {},
    interpretation: EVIDENCE_CONTEXT[card.evidenceKind],
    selectionStatus: card.evidenceKind === 'model-judgment' && card.calibration.status !== 'qualified' ? 'advisory-only-unqualified' : 'inspect-scope-and-evidence',
  }));
}

export function catalogContext(modules: AssertionModule[]) {
  const families = [...new Set(ASSERTION_ZOO.map(family => family.path[0]))].map(name => ({
    id: name,
    children: ASSERTION_ZOO.filter(family => family.path[0] === name).map(family => ({
      path: [...family.path], meaning: family.meaning,
      assertions: modules.flatMap(module => module.assertions.filter(assertion => family.path.every((part, index) => assertion.card.path[index] === part))
        .map(assertion => ({ moduleId: module.id, assertionId: assertion.card.id, path: [...assertion.card.path] }))),
    })),
  }));
  return freezeJson({ schemaVersion: 1, vocabulary: CARD_VOCABULARY, evidenceKinds: EVIDENCE_CONTEXT, families,
    modules: modules.map(module => ({ id: module.id, version: module.version, includes: [...module.includes], assertions: module.assertions.map(assertionContext) })),
    interpretation: 'A catalog match is a proposal for inspection. Shared labels do not establish interchangeable guarantees, applicability or qualification.',
  });
}

export function evaluationCostUpperBound(assertions: Assertion[]): Cost {
  const cost: Cost = Object.create(null) as Cost;
  for (const assertion of assertions) {
    validateCost(assertion.card.costUpperBound);
    for (const [unit, amount] of Object.entries(assertion.card.costUpperBound)) {
      cost[unit] = (cost[unit] ?? 0) + amount;
      requireThat(Number.isFinite(cost[unit]), 'Evaluation cost bound overflow');
    }
  }
  return { ...cost };
}

/** A selected subset retains every component's boundaries; it has no invented aggregate confidence. */
export function compositionContext(gate: CompiledGate) {
  return freezeJson({ schemaVersion: 1, card: modelCard(gate), assertions: gate.assertions.map(assertionContext),
    evaluationCostUpperBound: evaluationCostUpperBound(gate.assertions),
    accountingScope: 'One evaluation of the compiled closure; collection, proposals, repairs and repeated rounds require separate reservations.',
    selectionObligations: [
      'Confirm the audience, task and scope match each component and the composition.',
      'Inspect shared inputs and correlated errors; do not multiply component pass rates or confidence values.',
      'Keep incompatible guarantees, conflicting nudges and uncertain tradeoffs visible until additional evidence resolves them.',
      'A remediation suggestion cannot authorize execution or admit its own result.',
    ],
  });
}
