import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { v2 } from 'quality-gate-sgd';
import { collectorIdentity } from './collector.mjs';
import { fixturePolicy } from './fixture.mjs';
import { settings, captureFixture } from './run.mjs';
import { source, audience, task, candidateAnnotations } from './communication-source.mjs';

// The optional local entry is for development. Installed runs use the public package subpath.
const { isoglossModule } = await import(process.env.QUALITY_SGD_ISOGLOSS_ENTRY
  ? pathToFileURL(resolve(process.env.QUALITY_SGD_ISOGLOSS_ENTRY)).href : 'isogloss/quality-sgd');
const outputDir = resolve(process.argv[2] ?? 'composition-artifacts');
await mkdir(outputDir, { recursive: true });
const surfacePolicy = fixturePolicy(collectorIdentity(settings));
const contract = v2.defineCommunicationContract({ audience, task, source, fidelityMode: 'structured-only', surfacePolicy });
const sourceModule = v2.sourceCommitmentsModule({ source, policy: { mode: 'structured-only', scope: 'Authored inventories of the invented pilot decision', semanticEvaluators: [] } });
const surfaceModule = v2.surfaceEvidenceModule({ policy: surfacePolicy, reportPath: ['surface'] });
const scopeModule = v2.communicationScopeModule(contract);
const lexical = isoglossModule({ terms: ['join', 'sensitivity'], cap: 4, foldWords: 180, audienceId: audience.id,
  scope: 'Supporting text approximation over the complete authored visible-state inventory; no rendered-layout or comprehension claim.' });
const modules = [sourceModule, surfaceModule, scopeModule, lexical];
const policy = { required: ['communication.scope'], advisory: ['isogloss.text-folds'] };
const gate = v2.compileGate(modules, [scopeModule.id, lexical.id], policy);
const available = { schemas: [...v2.COMMITMENT_INPUT.schemas, ...v2.SURFACE_INPUT.schemas, ...v2.COMMUNICATION_INPUT.schemas, 'quality-sgd.text@1'],
  capabilities: [...new Set([...v2.COMMITMENT_INPUT.capabilities, ...v2.SURFACE_INPUT.capabilities, ...v2.COMMUNICATION_INPUT.capabilities, 'audience-lexicon'])] };
const budget = new v2.BudgetLedger({ evaluations: 80, renderCollections: 8 });
const browser = await chromium.launch();
const results = [];
try {
  for (const variant of ['baseline', 'improved', 'hidden-cost', 'removed-downside', 'filler', 'small-text']) {
    const reservation = `capture/${variant}`;
    assert.equal(budget.reserve(reservation, { renderCollections: 1, evaluations: 4 }), true);
    const captured = await captureFixture(variant, { browser, outputDir: resolve(outputDir, variant) });
    // captureFixture also performs four surface predicate evaluations; count them explicitly.
    budget.settle(reservation, { renderCollections: 1, evaluations: 4 });
    assert.equal(v2.digest(captured.policy), v2.digest(surfacePolicy));
    const annotations = candidateAnnotations(captured.report);
    const commitments = { sourceRevisionDigest: source.revisionDigest, sourceCoverageDigest: v2.sourceCoverageDigest(source),
      candidateRevisionDigest: captured.report.artifactDigest, candidateContentDigest: v2.digest(annotations.text), commitments: annotations.commitments, judgment: null };
    const artifact = { id: `business-decision/${variant}`, digest: captured.report.artifactDigest,
      data: { text: annotations.text, commitments, surface: captured.report, communication: { contractDigest: v2.digest(contract) } } };
    const evaluation = await v2.evaluateGate(gate, { artifact, environmentDigest: captured.report.environmentDigest, available }, budget);
    results.push({ variant, artifactDigest: artifact.digest, renderDigest: captured.report.renderDigest, environmentDigest: captured.report.environmentDigest,
      states: captured.summary.states, evaluation });
  }
} finally { await browser.close(); }
const baseline = results[0];
const nudge = { id: 'progressive-disclosure', assertionId: 'surface.total-budget',
  instruction: 'Move supporting derivations into a labeled disclosure while retaining value, cost, pilot condition, downside and action in the entry viewport.',
  changes: [{ address: 'quality://component/decision/calculations', variable: 'supporting-disclosure', direction: 1 }],
  reads: ['quality://component/business-case/source'], writes: ['quality://component/decision/calculations'],
  effects: [{ assertionId: 'surface.total-budget', direction: 'improves', basis: 'hypothesis', evidence: ['Baseline rendered fold inventory'] }], costUpperBound: {} };
const admission = { gate: gate.policy, objectives: {}, reversalMultiplier: 2, cooldownRounds: 2, maxStalledRounds: 2 };
const comparisons = results.slice(1).map(candidate => {
  assert.equal(candidate.environmentDigest, baseline.environmentDigest);
  return { variant: candidate.variant, verdict: candidate.evaluation.status,
    admission: v2.admitCandidate(baseline.evaluation, candidate.evaluation, nudge, 1, admission, v2.initialLoopState(baseline.evaluation)) };
});
assert.equal(baseline.evaluation.status, 'fail');
assert.equal(comparisons[0].verdict, 'pass'); assert.equal(comparisons[0].admission.accepted, true);
for (const rejected of comparisons.slice(1)) { assert.equal(rejected.verdict, 'fail'); assert.equal(rejected.admission.accepted, false); }
const improvedScope = results[1].evaluation.results.find(result => result.assertionId === 'communication.scope');
assert.equal(improvedScope.outputEvidence.dependencies.length, 5);
const report = { scope: 'Actual rendered fixture measurements plus authored source annotations. No measured human understanding or independent semantic extraction.',
  contract, contractDigest: v2.digest(contract), composition: v2.compositionContext(gate), nudge,
  baseline: { variant: baseline.variant, verdict: baseline.evaluation.status, states: baseline.states },
  comparisons, spent: budget.snapshot().spent, fullEvidence: results,
  readerEvidence: { audience: audience.background, realResponses: 0, verdict: 'unverified' },
  limitations: ['Fixed provisional design caps; no universal human capacity bound.', 'The numeric/source records are authored fixture annotations, not a qualified prose extractor.',
    'Isogloss remains a separately installed advisory text proxy; all rendered requirements have their own required predicates.',
    'Candidate annotations are a declared fixture mapping, not automatic semantic equivalence between rendered text and source.',
    'Each candidate is compared independently with the same baseline; this is a bounded counterexample battery, not a global search or estimated optimum.'] };
await writeFile(resolve(outputDir, 'composition.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ contractDigest: report.contractDigest, baseline: report.baseline.verdict,
  comparisons: comparisons.map(value => ({ variant: value.variant, verdict: value.verdict, accepted: value.admission.accepted, reason: value.admission.reason })),
  spent: report.spent, readerEvidence: report.readerEvidence }));
