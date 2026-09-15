import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node record.mjs <completed-output-directory> [new-receipt.json]');
const read = async path => JSON.parse(await readFile(join(directory, path), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const inputs = await read('inputs.json'), report = await read('report.json');
const { reportDigest, ...reportBody } = report; assert.equal(digest(reportBody), reportDigest);
assert.equal(report.status, 'pass');
assert.deepEqual(report.scopes.humanCalibration, { status: 'unverified', realBallots: 0 });
assert.deepEqual(report.scopes.compositionUtility, { status: 'unverified', realBallots: 0 });
assert.equal(report.rendered.readerEvidence.realResponses, 0);
for (const source of inputs.sources) assert.equal(hash(await readFile(join(directory, 'packages', `${source.name}.tgz`))), source.tarballSha256);
for (const source of inputs.sourceFiles) assert.equal(hash(await readFile(join(directory, 'consumer', source.path))), source.sha256);
assert.equal(hash(await readFile(join(directory, 'consumer', 'package-lock.json'))), inputs.installLockSha256);
assert.equal(hash(await readFile(new URL('./run.mjs', import.meta.url))), inputs.orchestrationBootstrapSha256, 'Bootstrap source changed since the recorded run');
for (const name of ['installed.mjs', 'durable.mjs', 'durable-worker.mjs', 'patch-worker.mjs', 'finite.mjs', 'sonar.mjs']) {
  assert.equal(hash(await readFile(new URL(name, import.meta.url))), inputs.sourceFiles.find(source => source.path === `examples/public-end-to-end/${name}`).sha256, 'Orchestration source changed since the recorded run');
}
const journal = await read('stages/durable/journal.json'); assert.equal(digest(journal.state), journal.checksum);
const externalBytes = await readFile(join(directory, 'stages/durable/external-receipts.jsonl'));
const receipts = externalBytes.toString('utf8').trim().split('\n').map(JSON.parse);
assert.equal(digest(receipts), report.durable.receiptDigest);
assert.equal(receipts.filter(value => value.kind === 'repair').length, 1);
assert.equal(receipts.filter(value => value.kind === 'behavior').length, 2);
assert.deepEqual(journal.state.ledger.spent, report.durable.after.spent);
assert.equal(journal.state.checkpoint.phase, 'done');
assert.equal(report.durable.after.completedReplayDispatches, 0);
const commands = await read('commands.json'), stageCommands = await read('stage-commands.json');
assert.ok(commands.every(command => command.code === 0 && !command.signal && !command.timedOut && !command.overflow));
assert.ok(stageCommands.every(command => command.exitCode === 0 && !command.signal));
const artifacts = ['inputs.json', 'report.json', 'commands.json', 'stage-commands.json', 'stages/repair.json', 'stages/durable/summary.json', 'stages/durable/journal.json', 'stages/durable/crash-point.json', 'stages/durable/external-receipts.jsonl', 'stages/sonar/report.json', 'stages/finite/registration.json', 'stages/finite/observations.json', 'stages/finite/report.json', 'stages/finite/replay.json', 'stages/rendered/composition.json'];
const hashes = Object.fromEntries(await Promise.all(artifacts.map(async path => [path, hash(await readFile(join(directory, path)))])));
const body = { protocol: 'quality-sgd.public-end-to-end-receipt/v1', completedAt: report.completedAt, status: 'pass', packages: inputs.sources,
  orchestrationBootstrapSha256: inputs.orchestrationBootstrapSha256, sourceFiles: inputs.sourceFiles, installLockSha256: inputs.installLockSha256,
  reportDigest, artifacts: hashes, scopes: report.scopes, workflow: report.workflow, repair: report.repair,
  durable: { crashPoint: report.durable.crashPoint, crashSignal: report.durable.crashSignal, resumed: report.durable.resumed,
    gateDigest: report.durable.gateDigest, evaluationContractDigest: report.durable.evaluationContractDigest, externalAssertionId: report.durable.externalAssertionId,
    before: { spent: report.durable.before.ledger.spent, outstanding: report.durable.before.ledger.reservations.filter(value => ['reserved', 'unknown'].includes(value.status)), checkpointPhase: report.durable.before.checkpointPhase, round: report.durable.before.round },
    after: report.durable.after, receiptDigest: report.durable.receiptDigest, stateDigest: report.durable.stateDigest, scope: report.durable.scope },
  sonar: report.sonar, finite: report.finite, rendered: report.rendered, costs: report.costs, commands, stageCommands,
  interpretation: 'Receipt of the actual completed installed-consumer run. File integrity and observed expected outcomes were checked locally. Reproducing creates a new consumer and new timestamps/operation IDs; these hashes do not independently authenticate execution or registration timing.',
  limitations: report.limitations };
const receipt = { ...body, receiptDigest: digest(body) };
if (process.argv[3]) await writeFile(resolve(process.argv[3]), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ valid: true, reportDigest, receiptDigest: receipt.receiptDigest, packages: inputs.sources.map(source => `${source.name}@${source.version}`), durable: report.durable.after, scopes: report.scopes }, null, 2));
