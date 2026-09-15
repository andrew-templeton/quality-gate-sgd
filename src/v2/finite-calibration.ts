import { validateAssertionContract, type AssertionContract } from './contracts.js';
import type { Cost } from './types.js';
import { digest, freezeJson, requireThat, text, unique, validateCost } from './validation.js';

export interface FiniteVerifierProtocol {
  id: string;
  version: string;
  scope: string;
  evaluatorDigest: string;
  applicabilityDigest: string;
  /** Fixed complete census, not a sample of a larger population. */
  population: { id: string; inputDigest: string; label: 'acceptable' | 'unacceptable'; labelEvidence: string[] }[];
  reference: { kind: 'mathematical-definition' | 'external-reference'; description: string; evidence: string[] };
  design: {
    kind: 'exhaustive-finite-population';
    weighting: 'uniform-within-label';
    dependence: string;
    evidenceUse: string;
    registeredBeforeExecution: boolean;
  };
  thresholds: { maximumFalseAcceptRate: number; maximumFalseRejectRate: number };
  /** Operator-supplied consequences, not costs inferred from correctness or preference. */
  consequences: { unit: string; falseAccept: number; falseReject: number; basis: string };
}

export interface FiniteVerifierObservation {
  caseId: string;
  inputDigest: string;
  evaluatorDigest: string;
  verdict: 'accept' | 'reject' | 'unavailable';
  evidence: string[];
  actualCost: Cost;
  reason?: string;
}

const hash = (value: string): void => requireThat(/^[a-f0-9]{64}$/.test(value), 'Expected SHA-256 identity');
const nonemptyEvidence = (values: string[]): void => {
  requireThat(Array.isArray(values) && values.length > 0, 'Explicit reference evidence is required');
  values.forEach(value => text(value, 'Evidence reference'));
};

/**
 * Exact class-conditional census rates, with worst-case completion bounds for missing outcomes.
 * No independence assumption, sampling confidence, label verification or execution attestation.
 */
export function assessFiniteVerifier(
  protocol: FiniteVerifierProtocol, observations: FiniteVerifierObservation[], evaluator: AssertionContract,
) {
  digest(protocol); digest(observations); validateAssertionContract(evaluator);
  [protocol.id, protocol.version, protocol.scope, protocol.reference.description, protocol.design.dependence,
    protocol.design.evidenceUse, protocol.consequences.unit, protocol.consequences.basis].forEach(value => text(value, 'Finite calibration context'));
  requireThat(protocol.design.kind === 'exhaustive-finite-population' && protocol.design.weighting === 'uniform-within-label', 'Only an explicit, uniformly weighted finite census is supported');
  requireThat(typeof protocol.design.registeredBeforeExecution === 'boolean', 'Registration timing must be explicitly attested');
  requireThat(['mathematical-definition', 'external-reference'].includes(protocol.reference.kind), 'Unknown reference kind');
  nonemptyEvidence(protocol.reference.evidence);
  hash(protocol.evaluatorDigest); hash(protocol.applicabilityDigest);
  requireThat(protocol.evaluatorDigest === evaluator.evaluatorDigest && protocol.applicabilityDigest === digest(evaluator.applicability), 'Calibration does not match the current evaluator and applicability');
  requireThat(Array.isArray(protocol.population) && protocol.population.length > 0, 'Explicit nonempty population required');
  unique(protocol.population.map(item => item.id), 'Population case IDs');
  for (const item of protocol.population) {
    hash(item.inputDigest); nonemptyEvidence(item.labelEvidence);
    requireThat(['acceptable', 'unacceptable'].includes(item.label), 'Unknown reference label');
  }
  for (const threshold of [protocol.thresholds.maximumFalseAcceptRate, protocol.thresholds.maximumFalseRejectRate]) requireThat(Number.isFinite(threshold) && threshold >= 0 && threshold <= 1, 'Error-rate thresholds must lie in [0,1]');
  for (const value of [protocol.consequences.falseAccept, protocol.consequences.falseReject]) requireThat(Number.isFinite(value) && value >= 0, 'Error consequences must be finite and nonnegative');
  requireThat(Array.isArray(observations), 'Observations must be an array');
  unique(observations.map(item => item.caseId), 'Observation case IDs');
  const population = new Map(protocol.population.map(item => [item.id, item]));
  const observed = new Map(observations.map(item => [item.caseId, item]));
  const actualCost = Object.create(null) as Cost;
  for (const item of observations) {
    const member = population.get(item.caseId);
    requireThat(member && item.inputDigest === member.inputDigest && item.evaluatorDigest === evaluator.evaluatorDigest, 'Unknown case, changed input, or stale evaluator observation');
    requireThat(['accept', 'reject', 'unavailable'].includes(item.verdict), 'Unknown verifier verdict');
    nonemptyEvidence(item.evidence); validateCost(item.actualCost);
    if (item.verdict === 'unavailable') text(item.reason, 'Unavailable verdict reason');
    if (item.reason !== undefined) text(item.reason, 'Verdict reason');
    for (const [unit, amount] of Object.entries(item.actualCost)) {
      actualCost[unit] = (actualCost[unit] ?? 0) + amount;
      requireThat(Number.isFinite(actualCost[unit]), 'Total cost overflow');
    }
  }
  const classResult = (label: 'acceptable' | 'unacceptable') => {
    const members = protocol.population.filter(item => item.label === label);
    requireThat(members.length > 0, 'Both reference classes must be present');
    const wrong = label === 'acceptable' ? 'reject' : 'accept';
    let errors = 0; let missing = 0; let unavailable = 0; let correct = 0;
    for (const member of members) {
      const result = observed.get(member.id);
      if (!result) missing++;
      else if (result.verdict === 'unavailable') unavailable++;
      else if (result.verdict === wrong) errors++;
      else correct++;
    }
    return { population: members.length, correct, errors, missing, unavailable,
      rate: missing + unavailable === 0 ? errors / members.length : null,
      completionBounds: { lower: errors / members.length, upper: (errors + missing + unavailable) / members.length } };
  };
  const falseAccept = classResult('unacceptable'); const falseReject = classResult('acceptable');
  const complete = observations.length === population.size && observations.every(item => item.verdict !== 'unavailable');
  const meets = falseAccept.completionBounds.upper <= protocol.thresholds.maximumFalseAcceptRate
    && falseReject.completionBounds.upper <= protocol.thresholds.maximumFalseRejectRate;
  const consequence = falseAccept.errors * protocol.consequences.falseAccept + falseReject.errors * protocol.consequences.falseReject;
  requireThat(Number.isFinite(consequence), 'Known error consequence overflow');
  const body = {
    kind: 'finite-verifier-census' as const,
    status: !complete ? 'incomplete-census' as const : meets ? 'meets-finite-thresholds' as const : 'fails-finite-thresholds' as const,
    protocolDigest: digest(protocol), evaluatorDigest: evaluator.evaluatorDigest, applicabilityDigest: protocol.applicabilityDigest,
    populationDigest: digest(protocol.population), observationsDigest: digest([...observations].sort((a, b) => a.caseId.localeCompare(b.caseId))),
    scope: protocol.scope, design: structuredClone(protocol.design), complete, falseAccept, falseReject,
    thresholds: { ...protocol.thresholds }, actualCost,
    knownErrorConsequence: { amount: consequence,
      unit: protocol.consequences.unit, basis: protocol.consequences.basis },
    unresolved: protocol.population.flatMap(item => {
      const observation = observed.get(item.id);
      return !observation ? [{ caseId: item.id, label: item.label, kind: 'missing', reason: 'No observation was supplied' }]
        : observation.verdict === 'unavailable' ? [{ caseId: item.id, label: item.label, kind: 'unavailable', reason: observation.reason ?? 'Unavailable' }] : [];
    }),
    interpretation: 'Class-conditional fractions and completion bounds describe only the explicitly enumerated population. Bounds range over all completions of missing/unavailable verdicts; they are not sampling confidence intervals.',
    limitations: [
      'Reference labels and census completeness are caller-supplied. Mathematical/external evidence references are not automatically verified.',
      'Input/evaluator digests reject accidental mixing; they neither authenticate execution nor prove preregistration timing.',
      'Meeting finite thresholds does not qualify unseen inputs, new evaluator configurations, human comprehension, semantic prose fidelity, causal claims, or a composed gate.',
      'Unknown outcomes remain unresolved and block a complete-census verdict even when worst-case thresholds would pass. No claim is made about future availability.',
      'Error consequences are explicit operator assumptions. Preference observations are not correctness labels.',
    ],
  };
  return freezeJson({ ...body, digest: digest(body) });
}
