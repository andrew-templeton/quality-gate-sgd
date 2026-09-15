import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadCore, protocol, runtimeManifest } from './program.mjs';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node examples/v2/decision-program/verify-record.mjs <record-directory>');
const core = await loadCore();
const read = async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const [registration, observations, report] = await Promise.all(['registration.json', 'observations.json', 'report.json'].map(read));
const { digest: expectedReportDigest, ...body } = report;
assert.equal(core.digest(body), expectedReportDigest, 'Report content changed');
assert.equal(core.digest(registration), report.registrationDigest, 'Registration content changed');
assert.equal(core.digest(observations), report.observationsDigest, 'Observation content changed');
assert.equal(core.digest(protocol), report.protocolDigest, 'Current protocol differs');
assert.equal(core.digest(await readFile(new URL('./program.mjs', import.meta.url), 'utf8')), report.programDigest, 'Current program differs');
assert.deepEqual(await runtimeManifest(core), report.runtimeManifest, 'Current core implementation differs; rerun instead of transferring old evidence');
for (const [mode, registered] of Object.entries(registration.censusProtocols)) {
  const rows = observations.filter(value => value.mode === mode).map(({ mode: _mode, result, budget, ...observation }) => {
    assert.equal(result.inputDigest, observation.inputDigest);
    assert.deepEqual(budget.spent, observation.actualCost);
    assert.equal(result.status === 'pass' ? 'accept' : result.status === 'fail' ? 'reject' : 'unavailable', observation.verdict);
    return observation;
  });
  assert.equal(core.digest(core.assessFiniteVerifier(registered, rows, registration.evaluatorContracts[mode])), core.digest(report.census[mode]));
}
console.log(JSON.stringify({ valid: true, reportDigest: report.digest, population: report.population.members,
  interpretation: 'Integrity and census calculations match the current recorded implementation. This does not authenticate execution, registration timing, labels, or unseen-population validity.' }, null, 2));
