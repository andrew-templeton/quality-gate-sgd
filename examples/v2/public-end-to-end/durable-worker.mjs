import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 } from 'quality-gate-sgd';
import { softwareV2 } from 'quality-sgd-software';

const directory = resolve(process.argv[2]), mode = process.argv[3];
assert.ok(['crash', 'resume', 'steady'].includes(mode));
const baselineText = '/** @param {number} amount */\nexport function charge(amount) {\n  /** @type {number} */ const invalid = "bad";\n  return amount + 20;\n}\n';
const configuration = JSON.stringify({ compilerOptions: { allowJs: true, checkJs: true, noEmit: true, strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: [] }, files: ['charge.mjs'] });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receiptPath = join(directory, 'external-receipts.jsonl');
const record = entry => {
  const descriptor = openSync(receiptPath, 'a');
  try { appendFileSync(descriptor, `${JSON.stringify(entry)}\n`); fsyncSync(descriptor); } finally { closeSync(descriptor); }
};
const save = (path, value) => {
  const descriptor = openSync(path, 'w');
  try { writeFileSync(descriptor, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  const folder = openSync(dirname(path), 'r'); try { fsyncSync(folder); } finally { closeSync(folder); }
};
mkdirSync(directory, { recursive: true });
const baselineRoot = join(directory, 'baseline'); mkdirSync(baselineRoot, { recursive: true });
if (!existsSync(join(baselineRoot, 'charge.mjs'))) save(join(baselineRoot, 'charge.mjs'), baselineText);
if (!existsSync(join(baselineRoot, 'tsconfig.json'))) save(join(baselineRoot, 'tsconfig.json'), configuration);
assert.equal(readFileSync(join(baselineRoot, 'charge.mjs'), 'utf8'), baselineText);
assert.equal(readFileSync(join(baselineRoot, 'tsconfig.json'), 'utf8'), configuration);
const source = await softwareV2.snapshotSoftwareSource({ root: baselineRoot, files: ['charge.mjs'], support: ['tsconfig.json'] });
const software = softwareV2.softwareQualityModule({ files: ['charge.mjs'], support: source.support, checks: ['typescript'], maxTypeErrors: 0, maxLintErrors: 0, maxLintWarnings: 0, minimumCoverage: { statements: 100, branches: 100, functions: 100, lines: 100 } });
const typescriptId = software.assertions[0].card.id;
const behaviorId = 'public-e2e.charge-behavior';
const cases = [0, 100, 200, 10000];
const implementationDigest = hash(readFileSync(fileURLToPath(import.meta.url)));
const behavior = v2.defineAssertion({
  card: { id: behaviorId, version: '1', title: 'Retain registered charge behavior after repair', path: ['meaning', 'fidelity', 'software'],
    claim: 'The supplied controlled JavaScript fixture returns amount plus 20 for all four registered cases.', evidenceKind: 'deterministic',
    input: { schemas: ['public-e2e.source@1'], capabilities: [], description: 'Trusted synthetic fixture source bound to a collected file digest.' },
    assumptions: ['This executes only the explicitly supplied synthetic fixture and four input cases.'], guarantees: ['Every registered case is checked in a real bounded subprocess.'],
    doesNotGuarantee: ['General software correctness, arbitrary-code isolation or model repair effectiveness.'], requires: [], costUpperBound: { evaluations: 1, behaviorProcesses: 1 },
    calibration: { status: 'not-applicable', evidence: [], scope: 'Deterministic execution of four registered synthetic cases.' } },
  implementation: { id: 'public-e2e/behavior', version: '1', digest: implementationDigest }, configuration: { cases, fee: 20 }, applicability: { population: 'Four registered fixture amounts' },
  input: v2.bindInput({ schemaId: 'public-e2e.source', schemaVersion: '1', path: ['text'], schema: v2.schema.string({ minLength: 1 }) }),
  async evaluate(context, text, config) {
    assert.equal(hash(text), context.artifact.data.software.source.files[0].sha256);
    const program = 'let s="";for await(const chunk of process.stdin)s+=chunk;const m=await import("data:text/javascript;base64,"+Buffer.from(s).toString("base64"));console.log(JSON.stringify(' + JSON.stringify(config.cases) + '.map(x=>m.charge(x))));';
    const actual = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', program], { input: text, encoding: 'utf8', timeout: 3000, maxBuffer: 4096 }));
    const expected = config.cases.map(value => value + config.fee);
    const findings = expected.flatMap((value, index) => actual[index] === value ? [] : [{ address: `claim/charge/${config.cases[index]}`, message: 'Registered charge behavior changed', evidence: [v2.digest({ actual, expected })] }]);
    const output = { status: findings.length ? 'fail' : 'pass', findings, evidence: [v2.digest({ actual, expected })], actualCost: { evaluations: 1, behaviorProcesses: 1 }, loss: { lower: findings.length, upper: findings.length, unit: 'violated-fixture-cases' } };
    record({ kind: 'behavior', operationId: context.operationId, artifactDigest: context.artifact.digest, actual, expected, output });
    return output;
  },
});
const gate = v2.compileGate([software, { id: 'public-e2e.behavior', version: '1', includes: [], assertions: [behavior] }], [software.id, 'public-e2e.behavior'], { required: [typescriptId, behaviorId], advisory: [] });
const environmentDigest = v2.digest({ fixture: 'durable-installed-software-v1', cases, configuration, softwareEvaluator: software.assertions[0].contract.evaluatorDigest });
const limits = { collections: 2, evaluations: 4, behaviorProcesses: 2, proposals: 1, repairProcesses: 1 };
const run = v2.DurableRun.open({ path: join(directory, 'journal.json'), contractDigest: gate.digest, environmentDigest, limits, recoverAbandonedLock: mode === 'resume',
  onBoundary(event) {
    if (mode === 'crash' && event.kind === 'operation:outcome' && event.operationId?.includes(':repair:1:')) {
      save(join(directory, 'crash-point.json'), { event, snapshot: run.snapshot(), explanation: 'SIGKILL after the repair outcome is durably recorded, before its reserved cost is settled or postrepair assertions run.' });
      process.kill(process.pid, 'SIGKILL');
    }
  } });
try {
  const capture = async (root, operationId) => {
    const snapshot = await softwareV2.snapshotSoftwareSource({ root, files: ['charge.mjs'], support: ['tsconfig.json'] });
    const report = await softwareV2.collectTypescriptEvidence({ root, source: snapshot, timeoutMilliseconds: 20000 }, { project: 'tsconfig.json' });
    assert.equal(report.status, 'complete', report.reason ?? '');
    const text = readFileSync(join(root, 'charge.mjs'), 'utf8'); assert.equal(hash(text), snapshot.files[0].sha256);
    const data = { text, software: softwareV2.softwareEvidence(snapshot, [report]) };
    record({ kind: 'collection', operationId, sourceRevision: snapshot.revision, errors: report.measurements.errors, process: report.process, tool: report.tool });
    return { id: 'public-e2e/charge', digest: v2.digest(data), data };
  };
  const baselineFile = join(directory, 'baseline-artifact.json'); let artifact;
  if (existsSync(baselineFile)) artifact = JSON.parse(readFileSync(baselineFile, 'utf8'));
  else {
    const reservationId = run.key('baseline-collection'); assert.equal(run.budget.reserve(reservationId, { collections: 1 }), true);
    artifact = await run.operation(reservationId, { kind: 'baseline-collection', sourceRevision: source.revision }, () => capture(baselineRoot, reservationId));
    run.budget.settle(reservationId, { collections: 1 }); save(baselineFile, artifact);
  }
  assert.equal(artifact.digest, v2.digest(artifact.data)); assert.equal(artifact.data.software.source.revision, source.revision);
  const workerPath = fileURLToPath(new URL('./patch-worker.mjs', import.meta.url));
  const harness = v2.commandHarness({ id: 'public-e2e.fixed-patch', command: process.execPath, args: [workerPath], timeoutMs: 3000, maxOutputBytes: 4096,
    prompt: request => JSON.stringify({ operationId: request.operationId, receiptPath, sourceDigest: hash(request.artifact.data.text), patch: 'remove-invalid-type' }),
    toArtifact: (_result, request) => capture(request.candidateWorkspace, request.operationId), actualCost: () => ({ repairProcesses: 1, collections: 1 }) });
  const nudge = { id: 'remove-invalid-type', assertionId: typescriptId, instruction: 'Remove the invalid unused fixture declaration and retain the registered charge behavior.',
    changes: [{ address: 'component/charge/body', variable: 'invalid-declaration', direction: -1 }], reads: ['component/charge/body'], writes: ['component/charge/body'],
    effects: [{ assertionId: typescriptId, direction: 'improves', basis: 'hypothesis', evidence: ['Actual complete TypeScript baseline diagnostic'] }],
    costUpperBound: { repairProcesses: 1, collections: 1 }, remediation: { harnessId: harness.id, prompt: 'Apply only the fixed declared fixture patch.', verification: [typescriptId] } };
  const result = await v2.runQualityLoop({ gate, artifact, environmentDigest, available: { schemas: ['quality-sgd-software.evidence@1', 'public-e2e.source@1'], capabilities: ['software-source-snapshot'] }, budget: run.budget, durability: run,
    admission: { gate: gate.policy, objectives: {}, reversalMultiplier: 2, cooldownRounds: 2, maxStalledRounds: 2 }, maxRounds: 1, proposalCostUpperBound: { proposals: 1 },
    executionIdentity: { proposal: v2.digest({ implementationDigest, nudge }), repair: hash(readFileSync(workerPath)), workspace: v2.digest({ configuration, model: 'new-isolated-candidate' }) },
    async propose(context) { record({ kind: 'proposal', operationId: context.operationId, round: context.round }); return { nudges: [nudge], actualCost: { proposals: 1 } }; },
    harnesses: [harness], enabledHarnessIds: [harness.id],
    async prepareWorkspace({ artifact }) { const root = join(directory, 'candidate'); mkdirSync(root); save(join(root, 'charge.mjs'), artifact.data.text); save(join(root, 'tsconfig.json'), configuration); return root; },
  });
  assert.equal(result.stopReason, 'pass'); assert.equal(result.rounds, 1);
  assert.deepEqual(result.budget.spent, limits);
  assert.ok(result.evaluation.results.every(value => value.status === 'pass'));
  assert.equal(readFileSync(join(baselineRoot, 'charge.mjs'), 'utf8'), baselineText);
  save(join(directory, 'result.json'), { mode, gateDigest: gate.digest, externalAssertionId: typescriptId, environmentDigest, result, snapshot: run.snapshot() });
} finally { run.close(); }
