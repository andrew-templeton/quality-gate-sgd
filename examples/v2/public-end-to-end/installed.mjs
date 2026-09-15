import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 } from 'quality-gate-sgd';
import { runDurable } from './durable.mjs';
import { runFinite } from './finite.mjs';
import { runSonar } from './sonar.mjs';

const outputDir = resolve(process.argv[2]);
const exampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const commands = [];
const stages = join(outputDir, 'stages'); await mkdir(stages);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const subprocess = async (name, script, args = []) => {
  const start = performance.now();
  const command = { stage: name, command: process.execPath, args: [script, ...args] }; commands.push(command);
  const result = await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, command.args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '', stderr = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
    child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
    child.once('error', reject); child.once('close', (code, signal) => { clearTimeout(timer); resolveRun({ code, signal, stdout, stderr }); });
  });
  Object.assign(command, { exitCode: result.code, signal: result.signal, elapsedMilliseconds: performance.now() - start, stdoutDigest: hash(result.stdout), stderrDigest: hash(result.stderr) });
  await writeFile(join(stages, `${name}.stdout.log`), result.stdout); await writeFile(join(stages, `${name}.stderr.log`), result.stderr);
  assert.equal(result.code, 0, `${name}: ${result.stderr}`); assert.equal(result.signal, null);
  return JSON.parse(result.stdout.trim());
};
const runtimeManifest = JSON.parse(await readFile(resolve('runtime-manifest.json'), 'utf8'));
const workflow = await subprocess('workflow', join(exampleRoot, 'workflow-consumer.mjs'));
assert.equal(workflow.outcome, 'pass');
const repair = await subprocess('repair', join(exampleRoot, 'repair-validation/run.mjs'), [join(stages, 'repair.json')]);
assert.equal(repair.finalVerdict, 'pass');
const durable = await runDurable({ outputDir: join(stages, 'durable') });
const sonar = await runSonar({ outputDir: join(stages, 'sonar') });
const finite = await runFinite({ outputDir: join(stages, 'finite'), runtimeManifest });
const rendered = await subprocess('rendered', join(exampleRoot, 'rendered/composition.mjs'), [join(stages, 'rendered')]);
assert.equal(rendered.readerEvidence.realResponses, 0); assert.equal(rendered.readerEvidence.verdict, 'unverified');
assert.equal(rendered.comparisons.find(value => value.variant === 'improved').accepted, true);
assert.ok(rendered.comparisons.filter(value => value.variant !== 'improved').every(value => !value.accepted));
const report = { protocol: 'quality-sgd.public-end-to-end/v1', status: 'pass', completedAt: new Date().toISOString(), runtimeManifest,
  scopes: {
    installedProtocolAndDiscovery: 'verified by executed synthetic workflows through public package imports',
    repair: 'controlled fixed JavaScript patches, actual ESLint and four behavior cases; no model repair success-rate estimate',
    durableResume: 'actual SIGKILL after a persisted repair outcome, then required full-gate checks and budget-preserving resume',
    sonar: 'local evaluation/replay of packaged signed prior live evidence; no new server analysis or current source recollection',
    finiteCalibration: 'executed constructed finite census with reused cases and explicitly declared utility assumptions; no unseen-population qualification',
    renderedComposition: 'actual browser geometry, authored fixture fidelity/arithmetic and conjunctive admission; no measured human utility',
    humanCalibration: { status: 'unverified', realBallots: 0 }, compositionUtility: { status: 'unverified', realBallots: 0 },
  }, workflow, repair, durable, sonar, finite, rendered,
  costs: { workflowDeclaredUpperBounds: { communication: workflow.communication.costs, software: workflow.software.costs }, controlledRepair: repair.spent, durableRun: durable.after.spent,
    rendered: rendered.spent, finite: finite.invocations, sonar: { evaluations: sonar.actualLocalEvaluations, newAnalyses: sonar.newAnalyses }, interpretation: 'Separate stage-specific units. No monetary conversion or model/token spending is inferred. Command wall times are separately observed.' },
  limitations: ['The assertion zoo remains compositional: passing one module never proves the other facets.', 'The physical browser device, readers, model repairs, live Sonar server and unseen software inputs are outside this executed scope.',
    'The install lock and supplied tarball hashes identify this consumer; registry transitive dependency resolution is recorded in its package-lock.json.',
    'Durability uses the documented local single-writer filesystem model. Other crash boundaries and unknown outcomes are exercised by the dedicated core subprocess suite.'] };
await writeFile(join(outputDir, 'stage-commands.json'), `${JSON.stringify(commands, null, 2)}\n`);
await writeFile(join(outputDir, 'report.json'), `${JSON.stringify({ ...report, reportDigest: v2.digest(report) }, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, reportDigest: v2.digest(report), scopes: report.scopes }));
