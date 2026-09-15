import { appendFileSync, closeSync, fsyncSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { bindInput, defineAssertion, schema } from '../../../src/v2/contracts.ts';
import { compileGate } from '../../../src/v2/catalog.ts';
import { DurableRun, ReconciliationRequired } from '../../../src/v2/durability.ts';
import { runQualityLoop } from '../../../src/v2/loop.ts';
import { digest } from '../../../src/v2/validation.ts';

const directory = process.argv[2];
const mode = process.argv[3] ?? 'standard';
const record = entry => {
  const descriptor = openSync(`${directory}/external.jsonl`, 'a');
  try { appendFileSync(descriptor, `${JSON.stringify(entry)}\n`); fsyncSync(descriptor); } finally { closeSync(descriptor); }
};
const artifact = data => ({ id: 'fixture', digest: digest(data), data });
const binding = bindInput({ schemaId: 'fixture', schemaVersion: '1', schema: schema.object({ loss: schema.number(), safe: schema.boolean(), nonce: schema.number({ integer: true }) }) });
const check = (id, score) => defineAssertion({ implementation: { id: `fixture-${id}`, version: '1', digest: digest({ fixture: id, version: 1 }) }, configuration: {}, applicability: { population: 'synthetic exact-valued fixtures' }, input: binding, card: { id, version: '1', title: id, path: ['measurement', 'regression'], claim: 'Deterministic fixture predicate.',
  input: { schemas: ['fixture/v1'], capabilities: [], description: 'Fixture only.' }, evidenceKind: 'deterministic',
  assumptions: ['Fixture contains exact values.'], guarantees: ['Predicate was measured.'], doesNotGuarantee: ['Real-world quality.'],
  requires: [], costUpperBound: { evaluations: 1, tokens: 2 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Fixture.' } },
  async evaluate(context) {
    const value = score(context.artifact.data);
    const output = { status: value ? 'fail' : 'pass', findings: value ? [{ address: 'component', message: id, evidence: [String(value)] }] : [],
      evidence: [`fixture:${value}`], loss: { lower: value, upper: value, unit: 'defects' }, actualCost: { evaluations: 1, tokens: 2 } };
    record({ kind: 'evaluation', assertionId: id, output, artifactDigest: context.artifact.digest }); return output;
  } });
const policy = { required: ['quality', 'behavior'], advisory: [] };
const gate = compileGate([{ id: 'fixture', version: '1', includes: [], assertions: [check('quality', data => data.loss), check('behavior', data => data.safe ? 0 : 1)] }], ['fixture'], policy);
const limits = { evaluations: mode === 'budget' ? 10 : 30, tokens: 200, cents: 30, rounds: 10 };
const run = DurableRun.open({ path: `${directory}/run.json`, contractDigest: gate.digest, environmentDigest: 'fixture-environment-v1', limits, recoverAbandonedLock: true,
  onBoundary(event) {
    if (process.env.CRASH_KIND !== event.kind) return;
    if (process.env.CRASH_ID && !event.operationId?.includes(process.env.CRASH_ID)) return;
    if (process.env.CRASH_ROUND) {
      const state = JSON.parse(readFileSync(`${directory}/run.json`, 'utf8')).state;
      if (state.checkpoint?.rounds !== Number(process.env.CRASH_ROUND)) return;
    }
    process.kill(process.pid, 'SIGKILL');
  } });
if (process.env.RECONCILE) {
  const receipt = JSON.parse(readFileSync(`${directory}/receipt.json`, 'utf8'));
  run.reconcileOperation(receipt.operationId, { outcome: receipt.output, evidence: 'Durable external fixture receipt, recovered by operation ID.' });
}
try {
  const result = await runQualityLoop({ gate, artifact: artifact({ loss: 10, safe: true, nonce: 0 }), environmentDigest: 'fixture-environment-v1', available: { schemas: ['fixture@1'], capabilities: [] }, budget: run.budget, durability: run,
    admission: { gate: policy, objectives: { quality: 1 }, reversalMultiplier: 2, cooldownRounds: 2, maxStalledRounds: mode === 'stall' ? 2 : 3 },
    maxRounds: 6, proposalCostUpperBound: { tokens: 3, cents: 1, rounds: 1 }, executionIdentity: { proposal: 'fixture-proposal-v1', repair: 'fixture-repair-v1' },
    async propose(context) {
      const round = context.round;
      const output = { actualCost: { tokens: 3, cents: 1, rounds: 1 }, nudges: [{ id: `repair-${round}`, assertionId: 'quality', instruction: 'Repair fixture.',
        changes: [{ address: 'component', variable: 'density', direction: round >= 3 ? -1 : 1 }], reads: ['component'], writes: ['component'],
        effects: [{ assertionId: 'quality', direction: 'improves', basis: 'hypothesis', evidence: [] }], costUpperBound: { tokens: 5, cents: 2 } }] };
      record({ kind: 'proposal', operationId: context.operationId, output }); return output;
    },
    async candidateGenerator(request) {
      const round = Number(request.nudge.id.split('-')[1]);
      const nonce = mode === 'cycle' && round === 3 ? 2 : round;
      const loss = [10, 8, 7, 4, 4, 0, 0][nonce];
      const output = { artifact: artifact({ loss, safe: round !== 5, nonce }), actualCost: { tokens: 5, cents: 2 } };
      record({ kind: 'repair', operationId: request.operationId, output });
      if (process.env.CRASH_EXTERNAL_ROUND === String(round)) {
        const descriptor = openSync(`${directory}/receipt.json`, 'w');
        try { writeFileSync(descriptor, JSON.stringify({ operationId: request.operationId, output })); fsyncSync(descriptor); } finally { closeSync(descriptor); }
        process.kill(process.pid, 'SIGKILL');
      }
      return output;
    },
  });
  writeFileSync(`${directory}/result.json`, JSON.stringify(result));
} catch (error) {
  if (error instanceof ReconciliationRequired) { console.error(error.message); process.exitCode = 23; }
  else { console.error(error); process.exitCode = 1; }
} finally { run.close(); }
