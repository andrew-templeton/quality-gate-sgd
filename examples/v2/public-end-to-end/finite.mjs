import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { v2 } from 'quality-gate-sgd';
import { runDecisionProgram, protocol } from '../decision-program/program.mjs';

const implementationFiles = ['contracts', 'validation', 'catalog', 'evaluate', 'budget', 'decision', 'nudges', 'nudge-trace',
  'finite-calibration', 'calibration', 'admission', 'loop', 'remediation', 'durability'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

async function save(directory, name, value) {
  const file = await open(resolve(directory, name), 'wx');
  try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync(); }
  finally { await file.close(); }
}

async function verifyRuntimeManifest(supplied) {
  // Reject non-JSON inputs before cloning, then bind a fixed snapshot throughout this run.
  v2.digest(supplied);
  const manifest = v2.freezeJson(structuredClone(supplied));
  assert.equal(manifest.algorithm, 'sha256-file-bytes');
  assert.equal(manifest.node, process.version, 'Runtime manifest must describe this Node process');
  assert(Array.isArray(manifest.packages) && manifest.packages.length > 0, 'Installed package identities are required');
  assert.equal(new Set(manifest.packages.map(item => item.name)).size, manifest.packages.length);
  for (const item of manifest.packages) {
    assert.equal(typeof item.name, 'string'); assert(item.name.length > 0);
    assert.equal(typeof item.version, 'string'); assert(item.version.length > 0);
    assert.match(item.tarballSha256, /^[a-f0-9]{64}$/);
  }
  const entry = import.meta.resolve('quality-gate-sgd');
  const installedPackage = await readJson(new URL('../package.json', entry));
  const declaredPackage = manifest.packages.find(item => item.name === 'quality-gate-sgd');
  assert(declaredPackage, 'Core package tarball identity is required');
  assert.equal(declaredPackage.version, installedPackage.version);
  for (const name of implementationFiles) {
    assert.match(manifest[name], /^[a-f0-9]{64}$/, `Missing installed implementation identity: ${name}`);
    // These are identity reads only. No implementation subpath is imported or executed.
    assert.equal(sha256(await readFile(new URL(`./v2/${name}.js`, entry))), manifest[name], `Installed ${name} bytes differ`);
  }
  return manifest;
}

/** Recompute recorded census results using the public API and independently check the finite labels and counts. */
export async function verifyFiniteRecords({ outputDir, runtimeManifest }) {
  const manifest = await verifyRuntimeManifest(runtimeManifest);
  const [registration, observations, report] = await Promise.all(['registration.json', 'observations.json', 'report.json']
    .map(name => readJson(resolve(outputDir, name))));
  const { digest: reportDigest, ...reportBody } = report;
  assert.equal(v2.digest(reportBody), reportDigest, 'Report integrity mismatch');
  assert.equal(v2.digest(registration), report.registrationDigest, 'Registration integrity mismatch');
  assert.equal(v2.digest(observations), report.observationsDigest, 'Observations integrity mismatch');
  assert.equal(v2.digest(protocol), report.protocolDigest, 'Packaged protocol differs from execution record');
  assert.equal(v2.digest(protocol), registration.protocolDigest);
  assert.deepEqual(registration.protocol, protocol);
  const programDigest = v2.digest(await readFile(new URL('../decision-program/program.mjs', import.meta.url), 'utf8'));
  assert.equal(programDigest, report.programDigest, 'Packaged program differs from execution record');
  assert.equal(programDigest, registration.programDigest);
  assert.deepEqual(report.runtimeManifest, manifest);
  assert.deepEqual(registration.runtimeManifest, manifest);
  assert.deepEqual(registration.runtimeEnvironment, { node: process.version, platform: process.platform, architecture: process.arch });
  assert.deepEqual(report.runtimeEnvironment, registration.runtimeEnvironment);
  assert.equal(registration.environmentDigest, v2.digest({ protocol, manifest, runtimeEnvironment: registration.runtimeEnvironment }));

  // This independent enumeration intentionally does not use program.enumeratePopulation.
  const labels = new Map();
  for (const a of protocol.population.a) for (const b of protocol.population.b) {
    for (const total of protocol.population.total) for (const color of protocol.population.color) {
      labels.set(`${a}:${b}:${total}:${color}`, BigInt(a) + BigInt(b) === BigInt(total) ? 'acceptable' : 'unacceptable');
    }
  }
  assert.equal(labels.size, 224);
  assert.equal(report.population.members, labels.size);
  assert.equal(report.population.acceptable, [...labels.values()].filter(label => label === 'acceptable').length);
  assert.equal(report.population.unacceptable, [...labels.values()].filter(label => label === 'unacceptable').length);
  assert.equal(report.population.scope, protocol.population.scope);
  assert.deepEqual(Object.keys(registration.censusProtocols).sort(), [...protocol.calibration.variants].sort());
  assert.deepEqual(Object.keys(report.census).sort(), [...protocol.calibration.variants].sort());
  assert.deepEqual([...new Set(observations.map(row => row.mode))].sort(), Object.keys(registration.evaluatorContracts).sort());

  const replay = {};
  for (const [mode, registered] of Object.entries(registration.censusProtocols)) {
    assert.equal(registered.scope, protocol.population.scope);
    assert.equal(registered.design.kind, 'exhaustive-finite-population');
    assert.equal(registered.design.evidenceUse, protocol.population.evidenceUse);
    assert.equal(registered.population.length, labels.size);
    assert.equal(new Set(registered.population.map(item => item.id)).size, labels.size);
    for (const member of registered.population) assert.equal(member.label, labels.get(member.id), 'Finite mathematical label changed');
    const rows = observations.filter(row => row.mode === mode).map(({ mode: _mode, result, budget, ...observation }) => {
      assert.equal(result.inputDigest, observation.inputDigest);
      assert.equal(result.assertionId, `finite-${mode}`);
      assert.deepEqual(budget.spent, observation.actualCost);
      // The deliberately thrown attempt conservatively spends its reservation and closes the ledger.
      assert.equal(budget.exceeded, mode === 'outage' && observation.caseId === protocol.calibration.outage.throwOnCase);
      assert.deepEqual(budget.reserved, {});
      assert.equal(result.status === 'pass' ? 'accept' : result.status === 'fail' ? 'reject' : 'unavailable', observation.verdict);
      return observation;
    });
    const recomputed = v2.assessFiniteVerifier(registered, rows, registration.evaluatorContracts[mode]);
    assert.equal(v2.digest(recomputed), v2.digest(report.census[mode]), `Public census replay differs: ${mode}`);
    const byCase = new Map(rows.map(row => [row.caseId, row]));
    for (const [label, field, wrong] of [['acceptable', 'falseReject', 'reject'], ['unacceptable', 'falseAccept', 'accept']]) {
      const members = [...labels.entries()].filter(([, value]) => value === label).map(([id]) => id);
      const counts = { population: members.length, errors: 0, missing: 0, unavailable: 0, correct: 0 };
      for (const id of members) {
        const result = byCase.get(id);
        if (!result) counts.missing++;
        else if (result.verdict === 'unavailable') counts.unavailable++;
        else if (result.verdict === wrong) counts.errors++;
        else counts.correct++;
      }
      for (const [key, value] of Object.entries(counts)) assert.equal(recomputed[field][key], value);
    }
    replay[mode] = { digest: recomputed.digest, status: recomputed.status, observations: rows.length,
      falseAccept: recomputed.falseAccept, falseReject: recomputed.falseReject };
  }
  assert.equal(replay.exact.status, 'meets-finite-thresholds');
  assert.equal(replay.approximate.status, 'fails-finite-thresholds');
  assert.equal(replay.approximate.falseAccept.errors, 44);
  assert.equal(replay.approximate.falseReject.errors, 12);
  assert.equal(replay.outage.status, 'incomplete-census');
  assert.equal(replay.outage.falseAccept.missing + replay.outage.falseReject.missing, 1);
  assert.equal(replay.outage.falseAccept.unavailable + replay.outage.falseReject.unavailable, 57);
  return { valid: true, reportDigest, registrationDigest: report.registrationDigest,
    observationsDigest: report.observationsDigest, runtimeManifestDigest: v2.digest(manifest), population: report.population,
    census: replay, interpretation: 'Local integrity checks and independently counted mathematical labels agree with the public API census replay for this reused constructed population. No human, unseen-population or general verifier qualification is established. Registration was written before dispatch, but is not independently timestamp-authenticated. Tarball identities come from the supplied installation manifest; installed implementation bytes are checked here.' };
}

/** Execute through the installed public namespace; the program's checkout loader is never invoked. */
export async function runFinite({ outputDir, runtimeManifest }) {
  assert.equal(typeof outputDir, 'string'); assert(outputDir.length > 0);
  const manifest = await verifyRuntimeManifest(runtimeManifest);
  await mkdir(outputDir, { recursive: false });
  let registered = false;
  const result = await runDecisionProgram(v2, { runtimeManifest: manifest, onRegistered: async registration => {
    assert.equal(registered, false, 'Registration must be written exactly once');
    await save(outputDir, 'registration.json', registration);
    registered = true;
  } });
  assert(registered, 'No registration was written before the program returned');
  await save(outputDir, 'observations.json', result.observations);
  await save(outputDir, 'report.json', result.report);
  const replay = await verifyFiniteRecords({ outputDir, runtimeManifest: manifest });
  await save(outputDir, 'replay.json', replay);
  return { kind: 'executed-public-package-finite-program', outputDir: resolve(outputDir), reportDigest: result.report.digest,
    registrationDigest: result.report.registrationDigest, replayDigest: v2.digest(replay), population: result.report.population,
    census: Object.fromEntries(Object.entries(replay.census).map(([mode, item]) => [mode, item.status])),
    invocations: result.report.totalMeasuredInvocations,
    loops: result.report.loops.map(item => ({ scenario: item.scenario, stopReason: item.stopReason, rounds: item.rounds })),
    scope: protocol.population.evidenceUse, limitations: protocol.claimsExcluded };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputDir = process.argv[2];
  const manifestPath = process.argv[3] ?? process.env.QUALITY_SGD_RUNTIME_MANIFEST;
  assert(outputDir && manifestPath, 'Usage: node finite.mjs <new-output-directory> <installed-runtime-manifest.json>');
  console.log(JSON.stringify(await runFinite({ outputDir, runtimeManifest: await readJson(manifestPath) }), null, 2));
}
