import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { QualityLoopResult } from '../../src/v2/loop.js';
import { digest } from '../../src/v2/validation.js';

const directories: string[] = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'quality-sgd-crash-')); directories.push(path); return path; };
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
const worker = fileURLToPath(new URL('./fixtures/durable-worker.mjs', import.meta.url));
const launch = (path: string, environment: Record<string, string> = {}, mode = 'standard') => spawnSync(process.execPath, ['--import', 'tsx', worker, path, mode], {
  cwd: fileURLToPath(new URL('../..', import.meta.url)), env: { ...process.env, ...environment }, encoding: 'utf8', timeout: 20_000,
});
const result = (path: string) => JSON.parse(readFileSync(join(path, 'result.json'), 'utf8')) as QualityLoopResult;
const journal = (path: string) => JSON.parse(readFileSync(join(path, 'run.json'), 'utf8'));
const receipts = (path: string): { kind: string; assertionId?: string; operationId?: string; artifactDigest?: string; output: { actualCost: Record<string, number> } }[] =>
  readFileSync(join(path, 'external.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
function assertExactAccounting(path: string): void {
  const charged: Record<string, number> = {};
  const external = receipts(path);
  for (const entry of external) for (const [unit, amount] of Object.entries(entry.output.actualCost)) charged[unit] = (charged[unit] ?? 0) + amount;
  expect(result(path).budget.spent).toEqual(charged);
  expect(result(path).budget.reserved).toEqual({});
  const operationKeys = external.map(entry => entry.operationId ?? `${entry.kind}:${entry.assertionId}:${entry.artifactDigest}`);
  expect(new Set(operationKeys).size).toBe(operationKeys.length);
}

describe('actual process crashes, resumed accounting and admission', () => {
  it('meters six rounds, applies deadbands/cooldowns and preserves hard required predicates', () => {
    const path = directory(); const completed = launch(path); expect(completed.status, completed.stderr).toBe(0);
    const run = result(path);
    expect(run.stopReason).toBe('pass'); expect(run.rounds).toBe(6);
    expect(run.budget.spent).toEqual({ evaluations: 14, tokens: 76, cents: 18, rounds: 6 });
    expect(run.events.filter(event => event.phase === 'admission').map(event => event.status)).toEqual(['accepted', 'rejected', 'rejected', 'accepted', 'rejected', 'accepted']);
    expect(run.events.find(event => event.phase === 'admission' && event.round === 2)?.reason).toMatch(/deadband/);
    expect(run.events.find(event => event.phase === 'admission' && event.round === 3)?.reason).toMatch(/cooldown/);
    expect(run.events.find(event => event.phase === 'admission' && event.round === 5)?.reason).toMatch(/Required assertion regressed/);
    expect(run.state.acceptedDigests).toHaveLength(4); assertExactAccounting(path);
    const before = receipts(path).length; expect(launch(path).status).toBe(0); expect(receipts(path)).toHaveLength(before);
  });
  it.each([
    { CRASH_KIND: 'ledger:reservation', CRASH_ID: 'check:quality:' },
    { CRASH_KIND: 'operation:prepared', CRASH_ID: 'proposal:1:' },
    { CRASH_KIND: 'operation:outcome', CRASH_ID: 'check:quality:' },
    { CRASH_KIND: 'ledger:settlement', CRASH_ID: 'check:quality:' },
    { CRASH_KIND: 'ledger:reservation', CRASH_ID: 'repair:1:' },
    { CRASH_KIND: 'operation:outcome', CRASH_ID: 'repair:1:' },
    { CRASH_KIND: 'ledger:settlement', CRASH_ID: 'repair:1:' },
    { CRASH_KIND: 'loop:candidate', CRASH_ROUND: '2' },
    { CRASH_KIND: 'loop:evaluation', CRASH_ROUND: '3' },
    { CRASH_KIND: 'loop:admission', CRASH_ROUND: '2' },
    { CRASH_KIND: 'loop:admission', CRASH_ROUND: '4' },
  ])('recovers without repeat work after $CRASH_KIND ($CRASH_ID / round $CRASH_ROUND)', environment => {
    const path = directory(); const crashed = launch(path, environment as Record<string, string>);
    expect(crashed.signal, crashed.stderr).toBe('SIGKILL');
    const resumed = launch(path); expect(resumed.status, resumed.stderr).toBe(0);
    expect(result(path).stopReason).toBe('pass'); expect(result(path).rounds).toBe(6);
    expect(result(path).events.filter(event => event.phase === 'admission')).toHaveLength(6);
    expect(result(path).events.find(event => event.phase === 'admission' && event.round === 3)?.reason).toMatch(/cooldown/);
    assertExactAccounting(path);
  }, 30_000);
  it('halts on an uncertain dispatch and repeated resume does not release or duplicate it', () => {
    const path = directory(); const crashed = launch(path, { CRASH_KIND: 'operation:dispatch', CRASH_ID: 'repair:1:' });
    expect(crashed.signal, crashed.stderr).toBe('SIGKILL');
    const before = receipts(path).length;
    for (let count = 0; count < 2; count++) { const blocked = launch(path); expect(blocked.status, blocked.stderr).toBe(23); expect(blocked.stderr).toMatch(/reconcile/i); }
    expect(receipts(path)).toHaveLength(before);
    const ledger = journal(path).state.ledger;
    expect(ledger.reservations.find((entry: { id: string }) => entry.id.includes('repair:1:')).status).toBe('reserved');
    expect(ledger.spent).toEqual({ evaluations: 2, tokens: 7, cents: 1, rounds: 1 });
  });
  it('recovers an external repair receipt after a crash before the journal outcome, without repeating the repair', () => {
    const path = directory(); const crashed = launch(path, { CRASH_EXTERNAL_ROUND: '3' }); expect(crashed.signal, crashed.stderr).toBe('SIGKILL');
    const unknown = launch(path); expect(unknown.status, unknown.stderr).toBe(23);
    const before = receipts(path).filter(entry => entry.kind === 'repair').length;
    const recovered = launch(path, { RECONCILE: '1' }); expect(recovered.status, recovered.stderr).toBe(0);
    expect(receipts(path).filter(entry => entry.kind === 'repair')).toHaveLength(before + 3);
    expect(result(path).events.find(event => event.phase === 'admission' && event.round === 3)?.reason).toMatch(/cooldown/);
    expect(journal(path).state.events.some((event: { kind: string }) => event.kind === 'operation:reconciled')).toBe(true);
    assertExactAccounting(path);
  });
  it.each(['stall', 'cycle', 'budget'])('preserves the %s stop across an interrupted reversal and repeated resume', mode => {
    const path = directory(); const crashed = launch(path, { CRASH_KIND: 'loop:admission', CRASH_ROUND: '2' }, mode); expect(crashed.signal, crashed.stderr).toBe('SIGKILL');
    const completed = launch(path, {}, mode); expect(completed.status, completed.stderr).toBe(0);
    expect(result(path).stopReason).toBe(mode === 'stall' ? 'stalled' : mode);
    assertExactAccounting(path);
    const before = receipts(path).length; expect(launch(path, {}, mode).status).toBe(0); expect(receipts(path)).toHaveLength(before);
  });
  it.each(['accepted-history', 'stall-count', 'artifact-data'])('rejects inconsistent %s even if the file checksum was recomputed', corruption => {
    const path = directory(); const crashed = launch(path, { CRASH_KIND: 'loop:admission', CRASH_ROUND: '2' }); expect(crashed.signal).toBe('SIGKILL');
    const file = journal(path);
    if (corruption === 'accepted-history') file.state.checkpoint.state.acceptedDigests = ['different'];
    if (corruption === 'stall-count') file.state.checkpoint.state.stalledRounds = 0;
    if (corruption === 'artifact-data') file.state.checkpoint.artifact.data.loss = 0;
    file.checksum = digest(file.state); writeFileSync(join(path, 'run.json'), JSON.stringify(file));
    const rejected = launch(path); expect(rejected.status).toBe(1); expect(rejected.stderr).toMatch(/history disagrees|stall count disagrees|input identity mismatch/);
  });
});
