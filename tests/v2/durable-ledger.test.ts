import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetLedger, type DurableLedgerState } from '../../src/v2/budget.js';
import { DurableRun, ReconciliationRequired } from '../../src/v2/durability.js';
import { digest } from '../../src/v2/validation.js';

const directories: string[] = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'quality-sgd-durable-')); directories.push(path); return path; };
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
const options = (path = directory()) => ({ path: join(path, 'run.json'), contractDigest: 'gate-v1', environmentDigest: 'environment-v1', limits: { tokens: 100, evaluations: 20 } });

describe('durable vector ledger', () => {
  it('restores outstanding and settled identities without granting a fresh budget', () => {
    const ledger = new BudgetLedger({ tokens: 10, evaluations: 3 });
    ledger.reserve('known', { tokens: 5, evaluations: 1 }); ledger.settle('known', { tokens: 3, evaluations: 1 });
    ledger.reserve('unknown', { tokens: 7, evaluations: 2 }); ledger.markUnknown('unknown');
    const restored = BudgetLedger.restore(ledger.exportState());
    expect(restored.snapshot()).toEqual({ limits: { tokens: 10, evaluations: 3 }, spent: { tokens: 3, evaluations: 1 }, reserved: { tokens: 7, evaluations: 2 }, exceeded: false });
    expect(restored.reserve('new', { tokens: 1 })).toBe(false);
    expect(() => restored.reserve('unknown', { tokens: 1 })).toThrow(/Duplicate/);
    restored.chargeReservation('unknown');
    expect(restored.snapshot().spent).toEqual({ tokens: 10, evaluations: 3 });
  });
  it('keeps known overrun and undeclared expenditure quarantined across restore', () => {
    const ledger = new BudgetLedger({ tokens: 10 }); ledger.reserve('a', { tokens: 2 }); ledger.failReservation('a', { tokens: 4, unconfigured: 3 });
    const restored = BudgetLedger.restore(ledger.exportState());
    expect(restored.snapshot()).toMatchObject({ spent: { tokens: 4, unconfigured: 3 }, exceeded: true });
    expect(restored.reserve('b', { tokens: 1 })).toBe(false);
  });
  it.each([
    (state: DurableLedgerState) => { state.version = 2 as 1; },
    (state: DurableLedgerState) => { state.spent.tokens = 0; },
    (state: DurableLedgerState) => { state.reservations.push(state.reservations[0]); },
    (state: DurableLedgerState) => { state.reservations[0].actualCost = {}; },
    (state: DurableLedgerState) => { state.exceeded = true; },
    (state: DurableLedgerState) => { state.reservations.push({ id: 'unaffordable', upperBound: { tokens: 100 }, status: 'unknown' }); },
  ])('rejects an internally inconsistent accounting snapshot %#', mutate => {
    const ledger = new BudgetLedger({ tokens: 10 }); ledger.reserve('a', { tokens: 5 }); ledger.settle('a', { tokens: 3 });
    const state = ledger.exportState(); mutate(state); expect(() => BudgetLedger.restore(state)).toThrow();
  });
  it('retains settled history when an ordinary ledger reuses an old name', () => {
    const ledger = new BudgetLedger({ tokens: 10 });
    for (let index = 0; index < 3; index++) { ledger.reserve('same', { tokens: 2 }); ledger.settle('same', { tokens: 1 }); }
    expect(BudgetLedger.restore(ledger.exportState()).snapshot().spent).toEqual({ tokens: 3 });
  });
  it.each(['constructor', 'toString', '__proto__'])('restores reserved and unreserved expenditure in the %s unit', unit => {
    const limits = Object.fromEntries([['tokens', 10], [unit, 10]]);
    const ledger = new BudgetLedger(limits);
    ledger.reserve('first', Object.fromEntries([[unit, 2]])); ledger.settle('first', Object.fromEntries([[unit, 1]]));
    const restored = BudgetLedger.restore(ledger.exportState());
    restored.reserve('second', { tokens: 1 }); restored.settle('second', Object.fromEntries([['tokens', 1], [unit, 1]]));
    expect(restored.snapshot().exceeded).toBe(true);
    expect(BudgetLedger.restore(restored.exportState()).snapshot()).toEqual(restored.snapshot());
  });
  it('preserves fractional addition order when settlement and reservation order differ', () => {
    const ledger = new BudgetLedger({ credits: 1e20 });
    ledger.reserve('large', { credits: 1e16 }); ledger.reserve('first-small', { credits: 1 }); ledger.reserve('second-small', { credits: 1 });
    ledger.settle('first-small', { credits: 1 }); ledger.settle('second-small', { credits: 1 }); ledger.settle('large', { credits: 1e16 });
    expect(BudgetLedger.restore(ledger.exportState()).snapshot()).toEqual(ledger.snapshot());
    const corrupt = ledger.exportState(); corrupt.reservations[0].settlementSequence = 1;
    expect(() => BudgetLedger.restore(corrupt)).toThrow(/settlement sequence/);
  });
});

describe('durable operation journal', () => {
  it('holds a single writer lock and refuses live-writer recovery', () => {
    const config = options(); const run = DurableRun.open(config);
    expect(() => DurableRun.open(config)).toThrow(/single-writer lock/);
    expect(() => DurableRun.open({ ...config, recoverAbandonedLock: true })).toThrow(/live or unobservable/);
    run.close(); const restored = DurableRun.open(config); restored.close();
  });
  it('replays a durably recorded outcome and settlement exactly once', async () => {
    const config = options(); let run = DurableRun.open(config); const id = run.key('operation');
    const dispatch = vi.fn(async () => ({ actualCost: { tokens: 3 }, answer: 42 }));
    expect(run.budget.reserve(id, { tokens: 5 })).toBe(true);
    const output = await run.operation(id, { prompt: 'fixed', rubric: 'v1' }, dispatch);
    run.budget.settle(id, output.actualCost); run.close();
    run = DurableRun.open(config); expect(run.budget.reserve(id, { tokens: 5 })).toBe(true);
    const replay = await run.operation(id, { rubric: 'v1', prompt: 'fixed' }, dispatch); run.budget.settle(id, replay.actualCost);
    expect(dispatch).toHaveBeenCalledOnce(); expect(run.budget.snapshot().spent).toEqual({ tokens: 3 });
    await expect(run.operation(id, { prompt: 'changed' }, dispatch)).rejects.toThrow(/identity collision/);
    expect(() => run.budget.reserve(id, { tokens: 6 })).toThrow(/different cost bound/);
    run.close();
  });
  it('preserves an unknown outcome until explicit reconciliation; resume cannot refund or retry', async () => {
    const config = options(); let run = DurableRun.open(config); const id = run.key('operation');
    run.budget.reserve(id, { tokens: 5 });
    await expect(run.operation(id, {}, async () => { throw new Error('connection lost'); })).rejects.toBeInstanceOf(ReconciliationRequired);
    run.close(); run = DurableRun.open(config); const dispatch = vi.fn();
    await expect(run.operation(id, {}, dispatch)).rejects.toBeInstanceOf(ReconciliationRequired);
    expect(dispatch).not.toHaveBeenCalled(); expect(run.budget.snapshot().reserved).toEqual({ tokens: 5 });
    run.reconcileOperation(id, { outcome: { answer: 42, actualCost: { tokens: 4 } }, evidence: 'External service receipt op-42.' });
    const output = await run.operation(id, {}, dispatch) as { actualCost: { tokens: number } };
    run.budget.settle(id, output.actualCost); expect(run.budget.snapshot().spent).toEqual({ tokens: 4 }); run.close();
  });
  it('conservative abandonment consumes the reservation and allows only explicit rebaselining', async () => {
    const config = options(); let run = DurableRun.open(config); const id = run.key('operation');
    run.saveCheckpoint({ accepted: 'a', rejected: ['b'], rounds: 4 }); run.budget.reserve(id, { tokens: 5 });
    await expect(run.operation(id, {}, async () => { throw new Error('unknown'); })).rejects.toBeInstanceOf(ReconciliationRequired);
    expect(() => run.rebaseline({ contractDigest: 'gate-v2', environmentDigest: 'environment-v2', reason: 'Rubric changed.' })).toThrow(/Reconcile/);
    run.abandonOperation(id, 'No external receipt available; charge maximum.');
    await expect(run.operation(id, {}, vi.fn())).rejects.toBeInstanceOf(ReconciliationRequired);
    run.rebaseline({ contractDigest: 'gate-v2', environmentDigest: 'environment-v2', reason: 'Rubric changed.' });
    expect(run.key('operation')).not.toBe(id); expect(run.budget.snapshot().spent).toEqual({ tokens: 5 });
    expect(run.snapshot().archives[0].checkpoint).toEqual({ accepted: 'a', rejected: ['b'], rounds: 4 });
    run.close(); expect(() => DurableRun.open(config)).toThrow(/contract\/environment changed/);
    run = DurableRun.open({ ...config, contractDigest: 'gate-v2', environmentDigest: 'environment-v2' }); expect(run.budget.snapshot().spent.tokens).toBe(5); run.close();
  });
  it('rejects changed limits, corrupt checksums and reordered events', () => {
    const config = options(); const run = DurableRun.open(config); run.close();
    expect(() => DurableRun.open({ ...config, limits: { tokens: 1_000, evaluations: 20 } })).toThrow(/limits cannot be reset/);
    const original = JSON.parse(readFileSync(config.path, 'utf8'));
    const altered = structuredClone(original); altered.state.ledger.limits.tokens = 1_000; writeFileSync(config.path, JSON.stringify(altered));
    expect(() => DurableRun.open(config)).toThrow(/checksum/);
    original.state.events[0].sequence = 5; original.checksum = digest(original.state); writeFileSync(config.path, JSON.stringify(original));
    expect(() => DurableRun.open(config)).toThrow(/unordered/);
  });
});
