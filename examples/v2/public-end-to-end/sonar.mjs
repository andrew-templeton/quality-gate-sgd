import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { v2 } from 'quality-gate-sgd';
import { sonarqubeModule, validateProvenance } from 'quality-sgd-sonarqube';

const available = { schemas: ['quality-sgd.sonarqube-report@3'], capabilities: ['sonarqube-normalized-report'] };
const recordPath = './docs/evidence/sonar-live-2026-09-14.json';

/** Read-only replay of packaged historical signed evidence through the installed public host. */
export async function runSonar({ outputDir }) {
  assert.equal(typeof outputDir, 'string'); assert(outputDir.length > 0);
  const entry = import.meta.resolve('quality-sgd-sonarqube');
  const recordBytes = await readFile(new URL(recordPath, entry));
  const historical = JSON.parse(recordBytes.toString('utf8'));
  const installedPackage = JSON.parse(await readFile(new URL('./package.json', entry), 'utf8'));
  assert.equal(historical.evidenceVersion, 1);
  assert.equal(historical.moduleVersion, installedPackage.version, 'Historical module version differs from installed package');
  assert.equal(historical.cases.length, 2);
  assert.deepEqual(historical.cases.map(item => item.expectedStatus).sort(), ['fail', 'pass']);
  const module = sonarqubeModule({ provenance: historical.publicPolicy });
  const assertion = module.assertions[0];
  assert.equal(assertion.contract.evaluatorDigest, historical.evaluatorDigest, 'Historical evaluator identity differs from installed module');
  v2.validateAssertionContract(assertion.contract);
  const gate = v2.compileGate([module], ['sonarqube'], { required: ['sonarqube.issues'], advisory: [] });
  const environmentDigest = v2.digest({ kind: 'public-package-historical-signed-replay', evaluatorDigest: historical.evaluatorDigest,
    recordDigest: v2.digest(historical), node: process.version });
  await mkdir(outputDir, { recursive: false });
  const cases = [];
  for (const item of historical.cases) {
    // The source manifest is authenticated historical data. Source files are not in the published package.
    const expectedArtifactDigest = item.report.artifactDigest;
    const provenance = validateProvenance(item.report, historical.publicPolicy, expectedArtifactDigest);
    assert.equal(v2.digest({ files: provenance.payload.sourceManifest }), expectedArtifactDigest);
    const evaluate = report => v2.evaluateGate(gate, {
      artifact: { id: item.fixture, digest: expectedArtifactDigest, data: report }, environmentDigest, available,
    }, new v2.BudgetLedger({ evaluations: 1 }));
    const evaluation = await evaluate(item.report);
    assert.equal(evaluation.status, item.expectedStatus);
    assert.equal(evaluation.results[0].findings.length, item.report.issues.length);
    assert.equal(evaluation.budget.spent.evaluations, 1);
    assert.equal(evaluation.budget.exceeded, false);
    const tampered = structuredClone(item.report);
    tampered.provenance.payload.analysis.id = 'tampered-after-historical-collection';
    assert.throws(() => validateProvenance(tampered, historical.publicPolicy, expectedArtifactDigest), /signature does not verify/);
    const tamperedEvaluation = await evaluate(tampered);
    assert.equal(tamperedEvaluation.status, 'unavailable');
    assert.equal(tamperedEvaluation.budget.spent.evaluations, 1);
    cases.push({ fixture: item.fixture, recordedSourceManifest: provenance.payload.sourceManifest,
      recordedArtifactDigest: expectedArtifactDigest, recordedAnalysisId: provenance.payload.analysis.id,
      recordedCollection: { startedAt: provenance.payload.collection.startedAt, finishedAt: provenance.payload.collection.finishedAt },
      signature: 'valid-relative-to-packaged-public-policy', sourceFilesRecollected: false,
      expectedStatus: item.expectedStatus, evaluation, tamperedEvaluation });
  }
  const body = { schemaVersion: '1', kind: 'public-package-historical-sonar-replay', runtime: { node: process.version,
    platform: process.platform, architecture: process.arch }, moduleVersion: installedPackage.version,
    evidenceSource: `quality-sgd-sonarqube/${recordPath.slice(2)}`, historicalObservedAt: historical.observedAt,
    historicalRecordDigest: v2.digest(historical), historicalRecordFileSha256: createHash('sha256').update(recordBytes).digest('hex'),
    publicPolicy: historical.publicPolicy, evaluatorDigest: historical.evaluatorDigest, gateDigest: gate.digest,
    environmentDigest, cases, actualLocalEvaluations: cases.length * 2, newServerContacts: 0, newAnalyses: 0, sourceFilesRecollected: false,
    interpretation: 'This run verifies a packaged prior signed collection and executes new local host evaluations. It makes no new server contact, starts no analysis and recollects no source files. The pinned public policy comes from the installed example package; it is not an independently authenticated collector trust decision.',
    limitations: ['The historical fixture files are not packaged, so this replay does not verify current source bytes against the recorded manifest.',
      'Signatures authenticate recorded evidence only relative to the packaged public key and the assumed trustworthy original collector/server.',
      'A replay does not establish current server state, source freshness, scanner precision/recall, application correctness, or broad verifier qualification.'] };
  const report = { ...body, digest: v2.digest(body) };
  await writeFile(resolve(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  const saved = JSON.parse(await readFile(resolve(outputDir, 'report.json'), 'utf8'));
  const { digest, ...savedBody } = saved;
  assert.equal(v2.digest(savedBody), digest);
  return { kind: report.kind, outputDir: resolve(outputDir), reportDigest: report.digest,
    evaluatorDigest: report.evaluatorDigest, historicalRecordFileSha256: report.historicalRecordFileSha256,
    cases: cases.map(item => ({ fixture: item.fixture, status: item.evaluation.status,
      signature: item.signature, tampered: item.tamperedEvaluation.status })),
    actualLocalEvaluations: report.actualLocalEvaluations, newServerContacts: 0, newAnalyses: 0, sourceFilesRecollected: false,
    interpretation: report.interpretation, limitations: report.limitations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv[2], 'Usage: node sonar.mjs <new-output-directory>');
  console.log(JSON.stringify(await runSonar({ outputDir: process.argv[2] }), null, 2));
}
