import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 } from 'quality-gate-sgd';

const worker = fileURLToPath(new URL('./durable-worker.mjs', import.meta.url));
const launch = (directory, mode) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [worker, directory, mode], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  let stdout = '', stderr = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  child.once('error', reject); child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
});
const read = async path => JSON.parse(await readFile(path, 'utf8'));

export async function runDurable({ outputDir }) {
  await mkdir(outputDir, { recursive: false });
  const crash = await launch(outputDir, 'crash');
  assert.equal(crash.signal, 'SIGKILL', JSON.stringify(crash)); assert.equal(crash.code, null);
  const point = await read(join(outputDir, 'crash-point.json'));
  assert.equal(point.event.kind, 'operation:outcome'); assert.ok(point.event.operationId.includes(':repair:1:'));
  const completed = point.snapshot.operations.find(value => value.id === point.event.operationId);
  assert.equal(completed.state, 'completed'); assert.ok(completed.outcome);
  const outstanding = point.snapshot.ledger.reservations.find(value => value.id === point.event.operationId);
  assert.ok(outstanding && ['reserved', 'unknown'].includes(outstanding.status));
  assert.equal(point.snapshot.ledger.spent.repairProcesses ?? 0, 0);
  const beforeReceipts = (await readFile(join(outputDir, 'external-receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(beforeReceipts.filter(value => value.kind === 'repair').length, 1);
  const resume = await launch(outputDir, 'resume');
  assert.equal(resume.code, 0, JSON.stringify(resume)); assert.equal(resume.signal, null);
  const after = await read(join(outputDir, 'result.json'));
  const receipts = (await readFile(join(outputDir, 'external-receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(after.result.stopReason, 'pass'); assert.equal(after.result.rounds, 1);
  assert.equal(receipts.filter(value => value.kind === 'repair').length, 1, 'Persisted repair must not redispatch');
  assert.equal(receipts.filter(value => value.kind === 'proposal').length, 1);
  assert.equal(receipts.filter(value => value.kind === 'collection').length, 2);
  assert.equal(receipts.filter(value => value.kind === 'behavior').length, 2);
  assert.deepEqual(receipts.filter(value => value.kind === 'collection').map(value => value.errors > 0), [true, false]);
  assert.ok(receipts.filter(value => value.kind === 'behavior').every(value => value.output.status === 'pass'));
  assert.deepEqual(after.result.budget.spent, { collections: 2, evaluations: 4, behaviorProcesses: 2, proposals: 1, repairProcesses: 1 });
  assert.equal(after.result.evaluation.results.length, 2);
  assert.ok(after.result.evaluation.results.some(value => value.assertionId === after.externalAssertionId && value.status === 'pass'));
  assert.equal(after.snapshot.operations.find(value => value.id === point.event.operationId).state, 'completed');
  const events = after.snapshot.events.filter(value => value.operationId === point.event.operationId);
  assert.equal(events.filter(value => value.kind === 'operation:dispatch').length, 1);
  assert.equal(events.filter(value => value.kind === 'operation:outcome').length, 1);
  assert.ok(after.snapshot.ledger.reservations.every(value => !['reserved', 'unknown'].includes(value.status)));
  for (const [unit, spent] of Object.entries(point.snapshot.ledger.spent)) assert.ok(after.result.budget.spent[unit] >= spent);
  const terminalReplay = await launch(outputDir, 'resume'); assert.equal(terminalReplay.code, 0, JSON.stringify(terminalReplay));
  const replayed = await read(join(outputDir, 'result.json'));
  const replayedReceipts = (await readFile(join(outputDir, 'external-receipts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(replayedReceipts, receipts, 'Resuming a completed loop must not dispatch more work');
  assert.deepEqual(replayed.result.budget, after.result.budget); assert.deepEqual(replayed.snapshot, after.snapshot);
  const summary = { mode: 'actual-process-interruption-and-resume', crashPoint: point.explanation, crashSignal: crash.signal, resumed: true,
    gateDigest: after.gateDigest, evaluationContractDigest: after.result.evaluation.contractDigest, externalAssertionId: after.externalAssertionId,
    before: { ledger: point.snapshot.ledger, checkpointPhase: point.snapshot.checkpoint.phase, round: point.snapshot.checkpoint.rounds },
    after: { spent: after.result.budget.spent, verdict: after.result.evaluation.status, rounds: after.result.rounds, repairDispatches: 1, repairReceipts: 1, collections: 2, behaviorSubprocesses: 2, completedReplayDispatches: 0, requiredPostrepairAssertions: after.result.evaluation.results.map(value => ({ id: value.assertionId, status: value.status })) },
    receiptDigest: v2.digest(receipts), stateDigest: v2.digest(after.snapshot),
    scope: 'One actual SIGKILL after a cached repair outcome and before settlement; broader core subprocess tests cover other crash phases and unknown-result reconciliation. Local single-writer filesystem only. Fixed synthetic repair, no model or general correctness claim.' };
  await writeFile(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
