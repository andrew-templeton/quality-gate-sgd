import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BudgetLedger, compileGate, digest, evaluateGate, SURFACE_INPUT, surfaceEvidenceModule, validateSurfaceEvidence } from 'quality-gate-sgd';
import { collectorIdentity } from './collector.mjs';
import { settings } from './run.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = dirname(new URL(import.meta.url).pathname);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

/** Publish compact receipts and one actual top PNG per required state, plus the long narrow ending. */
export async function retainEvidence() {
  const run = await readJson(join(root, 'artifacts', 'browser-test-summary.json'));
  assert.equal(run.fixtures.length, 16);
  const receipts = [];
  for (const variant of ['baseline', 'improved']) {
    const from = join(root, 'artifacts', variant), to = join(root, 'evidence', variant);
    await mkdir(to, { recursive: true });
    const envelope = await readJson(join(from, 'surface.json'));
    assert.equal(envelope.policy.collectorDigest, collectorIdentity(settings));
    const retained = [];
    for (const state of envelope.report.states) for (const capture of state.captures) {
      const bytes = await readFile(join(from, capture.path)); assert.equal(hash(bytes), capture.digest);
      if (capture.scrollTop === 0 || variant === 'improved' && state.id === 'narrow/open/touch' && capture.scrollTop === state.documentHeight - state.viewport.height) {
        await copyFile(join(from, capture.path), join(to, capture.path));
        retained.push({ state: state.id, ...capture });
      }
    }
    for (const name of ['surface.json', 'evaluation.json', ...new Set(envelope.sourceManifest.map(value => `source-${value.bodyDigest}.html`))]) await copyFile(join(from, name), join(to, name));
    receipts.push({ variant, artifactDigest: envelope.report.artifactDigest, renderDigest: envelope.report.renderDigest, retainedCaptures: retained,
      verifiedCaptureCount: envelope.report.states.reduce((sum, state) => sum + state.captures.length, 0), note: 'All screenshot bytes were verified during the real run. This compact record retains every required state top and the improved long narrow ending; regenerate artifacts for the complete per-membership PNG set.' });
  }
  const observed = { browser: run.browser, collectedAt: run.collectedAt, collectorDigest: collectorIdentity(settings), receipts,
    fixtures: run.fixtures.map(value => ({ variant: value.variant, status: value.status, artifactDigest: value.artifactDigest, renderDigest: value.renderDigest,
      facets: value.facets.map(facet => ({ id: facet.id, status: facet.status, findings: facet.findings.length })), states: value.states })) };
  await writeFile(join(root, 'evidence', 'observed.json'), `${JSON.stringify(observed, null, 2)}\n`);
  return observed;
}

/** Read-only integrity/current-host replay. It does not claim to rerun a browser. */
export async function replayEvidence({ reevaluate = false } = {}) {
  const observed = await readJson(join(root, 'evidence', 'observed.json'));
  assert.equal(observed.collectorDigest, collectorIdentity(settings), 'Collector code/settings changed; recollect the browser evidence');
  for (const receipt of observed.receipts) {
    const folder = join(root, 'evidence', receipt.variant);
    const envelope = await readJson(join(folder, 'surface.json'));
    assert.equal(digest(envelope.sourceManifest), envelope.report.sourceDigest);
    assert.equal(digest(envelope.data), envelope.report.dataDigest);
    assert.equal(digest(envelope.environment), envelope.report.environmentDigest);
    for (const item of envelope.sourceManifest) assert.equal(hash(await readFile(join(folder, `source-${item.bodyDigest}.html`))), item.bodyDigest);
    for (const capture of receipt.retainedCaptures) {
      assert.ok(/^[a-z0-9_-]+\.png$/i.test(capture.path));
      assert.equal(hash(await readFile(join(folder, capture.path))), capture.digest);
      assert.ok(envelope.report.states.find(state => state.id === capture.state).captures.some(value => value.digest === capture.digest && value.path === capture.path));
    }
    validateSurfaceEvidence(envelope.report, envelope.policy, envelope.report);
    const module = surfaceEvidenceModule({ policy: envelope.policy });
    const gate = compileGate([module], [module.id], { required: module.assertions.map(assertion => assertion.card.id), advisory: [] });
    const evaluation = await evaluateGate(gate, { artifact: { id: receipt.variant, digest: envelope.report.artifactDigest, data: envelope.report }, environmentDigest: envelope.report.environmentDigest, available: SURFACE_INPUT }, new BudgetLedger({ evaluations: 4 }));
    const previous = await readJson(join(folder, 'evaluation.json'));
    if (reevaluate && evaluation.contractDigest !== previous.evaluation.contractDigest) {
      await copyFile(join(folder, 'evaluation.json'), join(folder, `evaluation-${previous.evaluation.contractDigest}.json`));
      const summary = { ...previous.summary, status: evaluation.status, facets: evaluation.results.map(result => ({ id: result.assertionId, status: result.status, findings: result.findings, ...(result.reason ? { reason: result.reason } : {}) })) };
      await writeFile(join(folder, 'evaluation.json'), `${JSON.stringify({ summary, evaluation, provenance: { kind: 'explicit-current-host-reevaluation', previousContractDigest: previous.evaluation.contractDigest, sourceRenderDigest: envelope.report.renderDigest, reevaluatedAt: new Date().toISOString(), browserRerun: false } }, null, 2)}\n`);
    } else assert.equal(evaluation.contractDigest, previous.evaluation.contractDigest, 'Evaluator identity changed; reevaluate the retained report explicitly');
    assert.equal(evaluation.status, receipt.variant === 'improved' ? 'pass' : 'fail');
    assert.ok(evaluation.results.every(result => result.status === 'pass' ? Boolean(result.outputEvidence) : !result.outputEvidence));
  }
  return { browser: observed.browser, fixtures: observed.fixtures.length, retainedStates: observed.receipts.map(receipt => ({ variant: receipt.variant, captures: receipt.retainedCaptures.length })), replay: 'source/data/environment/pixel integrity and current public host verdicts verified; browser not rerun' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === '--retain') await retainEvidence();
  console.log(JSON.stringify(await replayEvidence({ reevaluate: process.argv.includes('--reevaluate') }), null, 2));
}
