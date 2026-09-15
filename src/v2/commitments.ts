import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bindInput, defineOutput, defineAssertion, parseSchema, schema, type ValueSchema } from './contracts.js';
import { digest, freezeJson, requireThat, text, unique, validateCost } from './validation.js';
import type { AssertionModule, Cost, Finding, Observation, Status } from './types.js';

export interface CommitmentQuantity {
  amount: number; unit: string;
  denominator: { amount: number; unit: string; population: string } | null;
}
/** Canonical semantic identifiers/annotations, not an automatic natural-language parser. */
export interface SemanticCommitment {
  id: string; address: string; sourceAddresses: string[]; proposition: string;
  quantity: CommitmentQuantity | null;
  actor: string; population: string; period: string; scope: string;
  conditions: string[]; dependencies: string[]; adverseScenarios: string[];
  uncertainty: { kind: 'exact' | 'estimate' | 'interval' | 'unknown'; lower: number | null; upper: number | null; confidence: number | null; description: string };
  claimStrength: 'description' | 'association' | 'prediction' | 'causal' | 'guarantee';
  materialCosts: { id: string; amount: number; unit: string; period: string }[];
  action: { actor: string; operation: string; target: string; deadline: string; conditions: string[] } | null;
}
export type NumericRelationship =
  | { id: string; kind: 'sum'; resultId: string; terms: { commitmentId: string; coefficient: number }[]; absoluteTolerance: number }
  | { id: string; kind: 'ratio'; resultId: string; numeratorId: string; denominatorId: string; scale: 1 | 100; absoluteTolerance: number }
  | { id: string; kind: 'all-in-cost'; resultId: string; absoluteTolerance: number };
export interface SourceCorrection {
  id: string; commitmentId: string; sourceRevisionDigest: string;
  before: SemanticCommitment; after: SemanticCommitment;
  approvedBy: string; reason: string; evidence: string[];
}
export interface SourceCommitmentContract {
  id: string; revisionDigest: string; contentDigest: string; content: string;
  /** An exact contiguous partition of the supplied full text, in UTF-16 offsets. */
  sections: { address: string; start: number; end: number }[];
  coverage: { status: 'complete' | 'partial' | 'unknown'; coveredAddresses: string[]; evidence: string[] };
  commitments: SemanticCommitment[]; relationships: NumericRelationship[]; corrections: SourceCorrection[];
}
export interface SemanticJudgmentReceipt {
  evaluatorDigest: string; applicabilityDigest: string;
  referenceDigest: string; sourceRevisionDigest: string; sourceContentDigest: string;
  candidateRevisionDigest: string; candidateContentDigest: string; candidateInventoryDigest: string;
  coverageDigest: string; status: Status; evidence: string[];
}
export interface CandidateCommitmentReport {
  sourceRevisionDigest: string; candidateRevisionDigest: string; candidateContentDigest: string;
  sourceCoverageDigest: string; commitments: SemanticCommitment[];
  judgment: SemanticJudgmentReceipt | null;
}
export interface CommitmentPolicy {
  mode: 'structured-only' | 'qualified-prose'; scope: string;
  /** Accepted external qualification is an operator trust decision, not a self-issued candidate field. */
  semanticEvaluators: { evaluatorDigest: string; applicabilityDigest: string; scope: string; evidence: string[] }[];
}
export interface CommitmentSummary {
  sourceRevisionDigest: string; sourceContentDigest: string; candidateRevisionDigest: string; candidateContentDigest: string;
  sourceCoverageDigest: string; referenceDigest: string; inventoryDigest: string;
  preservedCommitmentIds: string[]; appliedCorrectionIds: string[]; semanticMode: CommitmentPolicy['mode'];
}
export interface CommitmentAssessment {
  status: Status; findings: Finding[]; evidence: string[]; summary: CommitmentSummary;
}

const nonempty = schema.string({ minLength: 1 });
const nullableNumber = schema.union(schema.number(), schema.literal(null));
const quantity = schema.object({ amount: schema.number(), unit: nonempty,
  denominator: schema.union(schema.object({ amount: schema.number(), unit: nonempty, population: nonempty }), schema.literal(null)) });
export const COMMITMENT_SCHEMA: ValueSchema<SemanticCommitment> = schema.object({
  id: nonempty, address: nonempty, sourceAddresses: schema.array(nonempty, { minItems: 1 }), proposition: nonempty,
  quantity: schema.union(quantity, schema.literal(null)), actor: nonempty, population: nonempty, period: nonempty, scope: nonempty,
  conditions: schema.array(nonempty), dependencies: schema.array(nonempty), adverseScenarios: schema.array(nonempty),
  uncertainty: schema.object({ kind: schema.union(schema.literal('exact'), schema.literal('estimate'), schema.literal('interval'), schema.literal('unknown')),
    lower: nullableNumber, upper: nullableNumber, confidence: schema.union(schema.number({ minimum: 0, maximum: 1 }), schema.literal(null)), description: nonempty }),
  claimStrength: schema.union(schema.literal('description'), schema.literal('association'), schema.literal('prediction'), schema.literal('causal'), schema.literal('guarantee')),
  materialCosts: schema.array(schema.object({ id: nonempty, amount: schema.number(), unit: nonempty, period: nonempty })),
  action: schema.union(schema.object({ actor: nonempty, operation: nonempty, target: nonempty, deadline: nonempty, conditions: schema.array(nonempty) }), schema.literal(null)),
});
const relationship: ValueSchema<NumericRelationship> = schema.union(
  schema.object({ id: nonempty, kind: schema.literal('sum'), resultId: nonempty,
    terms: schema.array(schema.object({ commitmentId: nonempty, coefficient: schema.number() }), { minItems: 1 }), absoluteTolerance: schema.number({ minimum: 0 }) }),
  schema.object({ id: nonempty, kind: schema.literal('ratio'), resultId: nonempty, numeratorId: nonempty, denominatorId: nonempty,
    scale: schema.union(schema.literal(1), schema.literal(100)), absoluteTolerance: schema.number({ minimum: 0 }) }),
  schema.object({ id: nonempty, kind: schema.literal('all-in-cost'), resultId: nonempty, absoluteTolerance: schema.number({ minimum: 0 }) }),
);
const sourceSchema: ValueSchema<SourceCommitmentContract> = schema.object({
  id: nonempty, revisionDigest: nonempty, contentDigest: nonempty, content: nonempty,
  sections: schema.array(schema.object({ address: nonempty, start: schema.number({ integer: true, minimum: 0 }), end: schema.number({ integer: true, minimum: 0 }) }), { minItems: 1 }),
  coverage: schema.object({ status: schema.union(schema.literal('complete'), schema.literal('partial'), schema.literal('unknown')),
    coveredAddresses: schema.array(nonempty), evidence: schema.array(nonempty) }),
  commitments: schema.array(COMMITMENT_SCHEMA, { minItems: 1 }), relationships: schema.array(relationship),
  corrections: schema.array(schema.object({ id: nonempty, commitmentId: nonempty, sourceRevisionDigest: nonempty,
    before: COMMITMENT_SCHEMA, after: COMMITMENT_SCHEMA, approvedBy: nonempty, reason: nonempty, evidence: schema.array(nonempty, { minItems: 1 }) })),
});
const judgment: ValueSchema<SemanticJudgmentReceipt> = schema.object({
  evaluatorDigest: nonempty, applicabilityDigest: nonempty, referenceDigest: nonempty, sourceRevisionDigest: nonempty, sourceContentDigest: nonempty,
  candidateRevisionDigest: nonempty, candidateContentDigest: nonempty, candidateInventoryDigest: nonempty, coverageDigest: nonempty,
  status: schema.union(schema.literal('pass'), schema.literal('fail'), schema.literal('unavailable')), evidence: schema.array(nonempty),
});
export const CANDIDATE_COMMITMENT_SCHEMA: ValueSchema<CandidateCommitmentReport> = schema.object({
  sourceRevisionDigest: nonempty, candidateRevisionDigest: nonempty, candidateContentDigest: nonempty, sourceCoverageDigest: nonempty,
  commitments: schema.array(COMMITMENT_SCHEMA), judgment: schema.union(judgment, schema.literal(null)),
});
const summarySchema: ValueSchema<CommitmentSummary> = schema.object({
  sourceRevisionDigest: nonempty, sourceContentDigest: nonempty, candidateRevisionDigest: nonempty, candidateContentDigest: nonempty,
  sourceCoverageDigest: nonempty, referenceDigest: nonempty, inventoryDigest: nonempty,
  preservedCommitmentIds: schema.array(nonempty), appliedCorrectionIds: schema.array(nonempty),
  semanticMode: schema.union(schema.literal('structured-only'), schema.literal('qualified-prose')),
});
export const COMMITMENT_OUTPUT = defineOutput({ schemaId: 'quality-sgd.commitment-summary', schemaVersion: '1', schema: summarySchema });
export const COMMITMENT_INPUT = freezeJson({ schemas: ['quality-sgd.candidate-commitments@1'], capabilities: ['source-commitment-inventory'] });

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
const implementation = { id: 'quality-sgd/source-commitments', version: '1', digest: createHash('sha256').update(
  ['commitments', 'contracts', 'validation'].map(name => readFileSync(new URL(`./${name}${extension}`, import.meta.url), 'utf8')).join('\n'),
).digest('hex') };
const address = (source: SourceCommitmentContract, part: string) => `quality://claim/${encodeURIComponent(source.id)}/${encodeURIComponent(part)}`;
function sha(value: string, label: string): void { requireThat(/^[a-f0-9]{64}$/.test(value), `${label} must be SHA-256`); }
function validatePolicy(policy: CommitmentPolicy): void {
  digest(policy);
  requireThat(Object.keys(policy).every(key => ['mode', 'scope', 'semanticEvaluators'].includes(key)), 'Unknown commitment policy field');
  requireThat(['structured-only', 'qualified-prose'].includes(policy.mode), 'Unknown semantic evidence mode');
  text(policy.scope, 'Commitment applicability scope');
  requireThat(Array.isArray(policy.semanticEvaluators), 'Semantic evaluator allowlist required');
  unique(policy.semanticEvaluators.map(q => `${q.evaluatorDigest}:${q.applicabilityDigest}`), 'Semantic evaluator qualifications');
  for (const qualifier of policy.semanticEvaluators) {
    sha(qualifier.evaluatorDigest, 'Semantic evaluator identity'); sha(qualifier.applicabilityDigest, 'Semantic applicability identity');
    text(qualifier.scope, 'Semantic qualification scope');
    requireThat(Array.isArray(qualifier.evidence), 'Qualification evidence required'); qualifier.evidence.forEach(e => text(e, 'Semantic qualification evidence'));
  }
}
function inventory(items: SemanticCommitment[]): SemanticCommitment[] {
  unique(items.map(c => c.id), 'Commitment IDs'); unique(items.map(c => c.address), 'Commitment addresses');
  return items.map(item => {
    for (const entries of [item.sourceAddresses, item.conditions, item.dependencies, item.adverseScenarios]) unique(entries, 'Commitment facet identifiers');
    unique(item.materialCosts.map(c => c.id), 'Material cost IDs');
    if (item.action) unique(item.action.conditions, 'Action conditions');
    requireThat(item.uncertainty.lower === null || item.uncertainty.upper === null || item.uncertainty.lower <= item.uncertainty.upper, 'Uncertainty interval is reversed');
    return { ...structuredClone(item), sourceAddresses: [...item.sourceAddresses].sort(), conditions: [...item.conditions].sort(),
      dependencies: [...item.dependencies].sort(), adverseScenarios: [...item.adverseScenarios].sort(),
      materialCosts: [...item.materialCosts].sort((a, b) => a.id.localeCompare(b.id)),
      action: item.action ? { ...item.action, conditions: [...item.action.conditions].sort() } : null };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
export function commitmentInventoryDigest(items: SemanticCommitment[]): string { return digest(inventory(items)); }
export function sourceCoverageDigest(source: SourceCommitmentContract): string {
  return digest({ sourceRevisionDigest: source.revisionDigest, sourceContentDigest: source.contentDigest,
    sections: source.sections, coverage: source.coverage, inventoryDigest: commitmentInventoryDigest(source.commitments) });
}
export function sourceReferenceDigest(source: SourceCommitmentContract): string {
  return digest({ sourceCoverageDigest: sourceCoverageDigest(source), relationships: source.relationships, corrections: source.corrections });
}

function effectiveReference(source: SourceCommitmentContract): SemanticCommitment[] {
  let items = inventory(source.commitments);
  unique(source.corrections.map(c => c.id), 'Source correction IDs');
  for (const correction of source.corrections) {
    const previous = items.find(c => c.id === correction.commitmentId);
    requireThat(previous && correction.sourceRevisionDigest === source.revisionDigest && correction.before.id === correction.commitmentId && correction.after.id === correction.commitmentId,
      'Source correction must bind the exact source revision and preserve the commitment ID');
    requireThat(digest(inventory([previous])) === digest(inventory([correction.before])), 'Source correction before-value does not match the reference');
    requireThat(correction.before.address === correction.after.address, 'Source correction must preserve the claim address');
    text(correction.approvedBy, 'Correction approver'); text(correction.reason, 'Correction reason');
    requireThat(correction.evidence.length > 0, 'Source correction needs explicit evidence');
    items = items.map(c => c.id === correction.commitmentId ? inventory([correction.after])[0] : c);
  }
  return inventory(items);
}
function numericalFailures(items: SemanticCommitment[], relationships: NumericRelationship[]): { id: string; message: string }[] {
  const failures: { id: string; message: string }[] = [];
  const get = (id: string): SemanticCommitment & { quantity: CommitmentQuantity } => {
    const c = items.find(c => c.id === id); requireThat(c?.quantity, `Missing quantity for ${id}`); return { ...c, quantity: c.quantity };
  };
  for (const relation of relationships) {
    try {
      const result = get(relation.resultId); const q = result.quantity;
      let expected: number;
      if (relation.kind === 'sum') expected = relation.terms.reduce((total, term) => {
        const input = get(term.commitmentId);
        requireThat(input.quantity.unit === q.unit && input.period === result.period && input.population === result.population &&
          digest(input.quantity.denominator) === digest(q.denominator),
          'Sum operands must use the same unit, denominator, period and population; conversions must be explicit upstream');
        return total + term.coefficient * input.quantity.amount;
      }, 0);
      else if (relation.kind === 'ratio') {
        const numerator = get(relation.numeratorId); const denominator = get(relation.denominatorId);
        requireThat(numerator.quantity.denominator === null && denominator.quantity.denominator === null,
          'Ratio operands must be unnormalized quantities; nested denominators require explicit upstream conversion');
        requireThat(numerator.quantity.unit === denominator.quantity.unit && numerator.period === denominator.period &&
          numerator.population === denominator.population && numerator.period === result.period && denominator.population === result.population,
        'Ratio operands require a shared counted unit, period and population');
        requireThat(denominator.quantity.amount !== 0, 'Ratio denominator is zero');
        requireThat(q.unit === (relation.scale === 100 ? 'percent' : 'ratio'), 'Ratio output unit disagrees with its scale');
        requireThat(q.denominator && q.denominator.amount === denominator.quantity.amount && q.denominator.unit === denominator.quantity.unit &&
          q.denominator.population === denominator.population, 'Ratio denominator annotation disagrees with the measured denominator');
        expected = numerator.quantity.amount / denominator.quantity.amount * relation.scale;
      } else {
        requireThat(q.denominator === null, 'All-in cost requires an unnormalized result; cost components have no denominator conversion');
        requireThat(result.materialCosts.length > 0, 'All-in cost requires its material cost inventory');
        expected = result.materialCosts.reduce((sum, item) => {
          requireThat(item.unit === q.unit && item.period === result.period, 'All-in costs require the same unit and declared accounting period');
          return sum + item.amount;
        }, 0);
      }
      requireThat(Number.isFinite(expected), 'Numeric relationship exceeds finite arithmetic');
      if (Math.abs(q.amount - expected) > relation.absoluteTolerance) failures.push({ id: relation.id,
        message: `Declared ${q.amount} ${q.unit} differs from calculated ${expected} by more than ${relation.absoluteTolerance}.` });
    } catch (error) { failures.push({ id: relation.id, message: error instanceof Error ? error.message : String(error) }); }
  }
  return failures;
}

/** Compare validated structured annotations. Prose fidelity additionally requires an accepted scoped semantic receipt. */
export function assessCommitments(sourceInput: SourceCommitmentContract, candidateInput: CandidateCommitmentReport,
  policy: CommitmentPolicy, candidateText: string): CommitmentAssessment {
  validatePolicy(policy); text(candidateText, 'Current candidate text');
  const source = parseSchema(sourceSchema, sourceInput); const candidate = parseSchema(CANDIDATE_COMMITMENT_SCHEMA, candidateInput);
  const reference = effectiveReference(source); const actual = inventory(candidate.commitments);
  const sourceDigest = sourceCoverageDigest(source); const referenceDigest = sourceReferenceDigest(source);
  const evidence = [`commitments:${digest({ source: referenceDigest, candidate, candidateText, policy })}`];
  const summary: CommitmentSummary = { sourceRevisionDigest: source.revisionDigest, sourceContentDigest: source.contentDigest,
    candidateRevisionDigest: candidate.candidateRevisionDigest, candidateContentDigest: candidate.candidateContentDigest,
    sourceCoverageDigest: sourceDigest, referenceDigest, inventoryDigest: commitmentInventoryDigest(actual),
    preservedCommitmentIds: [], appliedCorrectionIds: source.corrections.map(c => c.id), semanticMode: policy.mode };
  const finding = (at: string, message: string): Finding => ({ address: at, message, evidence });
  const unavailable = (message: string): CommitmentAssessment => ({ status: 'unavailable', findings: [finding(address(source, 'evidence'), message)], evidence, summary });
  if ([source.revisionDigest, source.contentDigest, candidate.sourceRevisionDigest, candidate.candidateRevisionDigest,
    candidate.candidateContentDigest, candidate.sourceCoverageDigest].some(value => !/^[a-f0-9]{64}$/.test(value)))
    return unavailable('Source, candidate and coverage identities must be explicit SHA-256 digests.');
  if (source.contentDigest !== digest(source.content)) return unavailable('Full source content does not match its recorded digest.');
  if (source.revisionDigest !== candidate.sourceRevisionDigest || sourceDigest !== candidate.sourceCoverageDigest) return unavailable('Source revision or coverage binding is stale.');
  if (candidate.candidateContentDigest !== digest(candidateText)) return unavailable('Candidate annotations do not bind the current text content.');
  const sectionIds = source.sections.map(s => s.address);
  unique(sectionIds, 'Source section addresses'); unique(source.coverage.coveredAddresses, 'Source coverage addresses');
  const contiguous = source.sections.every((s, index) => s.start === (index ? source.sections[index - 1].end : 0) && s.end > s.start)
    && source.sections[source.sections.length - 1].end === source.content.length;
  if (!contiguous || source.coverage.status !== 'complete' || !source.coverage.evidence.length ||
    digest([...source.coverage.coveredAddresses].sort()) !== digest([...sectionIds].sort()) ||
    [...source.commitments, ...reference].some(c => c.sourceAddresses.some(a => !sectionIds.includes(a)))) return unavailable('Complete coverage of the supplied full source is required.');
  const sourceErrors = numericalFailures(reference, source.relationships);
  if (sourceErrors.length) return { status: 'unavailable', findings: sourceErrors.map(e => finding(address(source, `source-arithmetic/${e.id}`),
    `Source arithmetic is unresolved: ${e.message} Record an explicit source correction before assessing preservation.`)), evidence, summary };
  if (policy.mode === 'qualified-prose') {
    const receipt = candidate.judgment;
    const qualification = receipt && policy.semanticEvaluators.find(q => q.evaluatorDigest === receipt.evaluatorDigest &&
      q.applicabilityDigest === receipt.applicabilityDigest && q.scope === policy.scope && q.evidence.length > 0);
    if (!receipt || !qualification || receipt.status === 'unavailable' || !receipt.evidence.length) return unavailable('Required scoped semantic judgment evidence is unavailable or unqualified.');
    const bindings = { referenceDigest, sourceRevisionDigest: source.revisionDigest, sourceContentDigest: source.contentDigest,
      candidateRevisionDigest: candidate.candidateRevisionDigest, candidateContentDigest: candidate.candidateContentDigest,
      candidateInventoryDigest: summary.inventoryDigest, coverageDigest: sourceDigest };
    if (Object.entries(bindings).some(([field, expected]) => receipt[field as keyof SemanticJudgmentReceipt] !== expected))
      return unavailable('Semantic judgment does not bind the current source, corrections, coverage, candidate and inventory.');
    evidence.push(...receipt.evidence, ...qualification.evidence);
    if (receipt.status === 'fail') return { status: 'fail', findings: [finding(address(source, 'semantic-judgment'),
      'The accepted scoped semantic evaluator rejected preservation of the corrected source commitments.')], evidence, summary };
  }
  const findings: Finding[] = [];
  const compared: (keyof SemanticCommitment)[] = ['address', 'sourceAddresses', 'proposition', 'quantity', 'actor', 'population', 'period', 'scope', 'conditions', 'dependencies',
    'adverseScenarios', 'uncertainty', 'claimStrength', 'materialCosts', 'action'];
  for (const expected of reference) {
    const item = actual.find(c => c.id === expected.id);
    if (!item) { findings.push(finding(expected.address, 'A required source commitment is missing.')); continue; }
    const changes = compared.filter(field => digest(expected[field]) !== digest(item[field]));
    if (!changes.length) summary.preservedCommitmentIds.push(expected.id);
    for (const field of changes) findings.push(finding(`${expected.address}/${field}`,
      `Source commitment ${field} changed: expected ${JSON.stringify(expected[field])}; observed ${JSON.stringify(item[field])}. Preserve the registered meaning or record an explicit source correction.`));
  }
  for (const extra of actual.filter(c => !reference.some(s => s.id === c.id))) findings.push(finding(extra.address, 'Candidate introduces an unregistered commitment; it requires an explicit reference update.'));
  for (const error of numericalFailures(actual, source.relationships)) findings.push(finding(address(source, `candidate-arithmetic/${error.id}`), error.message));
  return { status: findings.length ? 'fail' : 'pass', findings, evidence, summary };
}

export function sourceCommitmentsModule(options: {
  source: SourceCommitmentContract; policy: CommitmentPolicy; reportPath?: string[]; candidateTextPath?: string[]; costUpperBound?: Cost;
}): AssertionModule {
  digest(options);
  const source = parseSchema(sourceSchema, options.source);
  const policy = freezeJson(structuredClone(options.policy));
  validatePolicy(policy);
  sha(source.revisionDigest, 'Source revision'); sha(source.contentDigest, 'Source content');
  unique(source.relationships.map(r => r.id), 'Numeric relationship IDs');
  effectiveReference(source); // Invalid corrections are configuration errors, never silent rewrites.
  const cost = { ...(options.costUpperBound ?? { evaluations: 1 }) }; validateCost(cost);
  const candidateTextPath = options.candidateTextPath ?? ['text']; candidateTextPath.forEach(p => text(p, 'Candidate text path'));
  const configuration = { source, policy, candidateTextPath, cost };
  const input = bindInput({ schemaId: 'quality-sgd.candidate-commitments', schemaVersion: '1', schema: CANDIDATE_COMMITMENT_SCHEMA,
    path: options.reportPath ?? ['commitments'], capabilities: COMMITMENT_INPUT.capabilities });
  const assertion = defineAssertion({
    card: {
      id: 'source.commitments', version: '1', title: 'Source commitments and business arithmetic', path: ['meaning', 'fidelity'],
      claim: 'The bound candidate inventory preserves the corrected source inventory and its checked numeric relationships under the configured semantic-evidence policy.',
      evidenceKind: 'deterministic', input: { ...COMMITMENT_INPUT, description: 'Structured candidate commitment report tied to full source coverage and current candidate revision/content; semantic receipts are required in qualified-prose mode.' },
      assumptions: ['The operator supplies the actual full source, correct canonical inventories, accurate scope and authoritative content/revision digests.',
        'Accepted semantic qualifications and receipt provenance are valid for the configured scope; hashes do not authenticate an external judge.'],
      guarantees: ['Deterministic equality checks preserve every declared source facet; registered sum, ratio and all-in-cost relationships are evaluated in the declared units and tolerances.',
        'Unresolved source arithmetic, missing full-source coverage and missing required semantic evidence cannot pass; source corrections remain explicit and identity-bound.'],
      doesNotGuarantee: ['Annotation equality is not proof that the prose faithfully expresses those annotations, nor that a reader understands them.',
        'This module does not extract semantic annotations, call or qualify a model, establish source truth, perform currency/unit conversion, or infer causal validity.'],
      requires: [], costUpperBound: cost, calibration: { status: 'not-applicable', evidence: [],
        scope: 'Deterministic structured/report predicate. External semantic evaluators retain their own scoped qualification obligations.' },
    }, implementation, configuration, applicability: { scope: policy.scope, mode: policy.mode }, input, output: COMMITMENT_OUTPUT,
    async evaluate(context, report, config): Promise<Observation<CommitmentSummary>> {
      let content: unknown = context.artifact.data;
      for (const part of config.candidateTextPath) {
        if (content === null || typeof content !== 'object' || !Object.hasOwn(content, part)) return {
          status: 'unavailable', findings: [{ address: 'quality://claim/candidate/text', message: 'Current candidate text is unavailable.', evidence: [] }], evidence: [], actualCost: config.cost,
        };
        content = (content as Record<string, unknown>)[part];
      }
      if (typeof content !== 'string' || content.trim().length === 0 || report.candidateRevisionDigest !== context.artifact.digest) return {
        status: 'unavailable', findings: [{ address: 'quality://claim/candidate/revision', message: 'Candidate text or revision binding is unavailable/stale.', evidence: [] }], evidence: [], actualCost: config.cost,
      };
      let result: CommitmentAssessment;
      try { result = assessCommitments(config.source, report, config.policy, content); }
      catch (error) { return { status: 'unavailable', findings: [{ address: 'quality://claim/candidate/commitments',
        message: `Commitment evidence could not be validated: ${error instanceof Error ? error.message : String(error)}`, evidence: [] }], evidence: [], actualCost: config.cost }; }
      return { status: result.status, findings: result.findings, evidence: result.evidence, actualCost: config.cost,
        ...(result.status === 'pass' ? { output: result.summary } : {}),
        ...(result.status !== 'unavailable' ? { loss: { lower: result.findings.length, upper: result.findings.length, unit: 'commitment-violations' } } : {}) };
    },
  });
  requireThat(assertion.contract, 'Source commitment assertion requires its standard contract');
  return { id: 'source-commitments', version: assertion.contract.evaluatorDigest, includes: [], assertions: [assertion] };
}
