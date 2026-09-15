import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { BudgetLedger, type DurableLedgerState } from './budget.js';
import type { Cost } from './types.js';
import { digest, requireThat, text } from './validation.js';

export class DurabilityError extends Error { override name = 'DurabilityError'; }
export class ReconciliationRequired extends Error {
  override name = 'ReconciliationRequired';
  constructor(readonly operationId: string, message = 'External outcome is unknown; reconcile it before resuming') { super(`${message}: ${operationId}`); }
}
export function isDurabilityInterruption(error: unknown): error is DurabilityError | ReconciliationRequired {
  return error instanceof DurabilityError || error instanceof ReconciliationRequired;
}
export interface DurableOperation {
  id: string;
  requestDigest: string;
  state: 'prepared' | 'dispatched' | 'completed' | 'abandoned';
  outcome?: unknown;
  reconciliationEvidence?: string;
}
export interface DurableEvent { sequence: number; kind: string; operationId?: string; detail?: string }
export interface DurableRunState {
  version: 1;
  runId: string;
  epoch: number;
  revision: number;
  contractDigest: string;
  environmentDigest: string;
  ledger: DurableLedgerState;
  operations: DurableOperation[];
  checkpoint: unknown | null;
  archives: { epoch: number; contractDigest: string; environmentDigest: string; checkpoint: unknown | null; reason: string }[];
  events: DurableEvent[];
}
export interface DurableRunOptions {
  path: string;
  /** Compiled gate identity; the environment is bound independently. */
  contractDigest: string;
  environmentDigest: string;
  /** Must equal persisted limits on restore. Raising a fresh in-memory budget cannot reset a run. */
  limits: Cost;
  /** Explicitly recover only a lock owned by a demonstrably dead PID on this host. */
  recoverAbandonedLock?: boolean;
  /** Runs after fsync at each boundary. Useful for tracing and actual process-crash tests. */
  onBoundary?: (event: DurableEvent) => void;
}
interface JournalFile { checksum: string; state: DurableRunState }
interface WriterLock { version: 1; host: string; pid: number; token: string }

/**
 * One writer on a local filesystem supporting atomic rename and fsync. This is not a distributed lock.
 * Every mutation persists synchronously; a failed write poisons this handle and prevents more dispatch.
 */
export class DurableRun {
  readonly budget: BudgetLedger;
  private state: DurableRunState;
  private readonly path: string;
  private readonly lockPath: string;
  private readonly token: string;
  private closed = false;
  private poisoned = false;
  private readonly onBoundary?: DurableRunOptions['onBoundary'];
  private constructor(options: DurableRunOptions, token: string, state: DurableRunState) {
    this.path = resolve(options.path); this.lockPath = `${this.path}.lock`; this.token = token; this.state = state;
    this.onBoundary = options.onBoundary;
    this.budget = BudgetLedger.restore(state.ledger, { idempotent: true, onChange: (ledger, event) => {
      this.state.ledger = ledger; this.commit(`ledger:${event.kind}`, event.reservationId);
    } });
  }
  static open(options: DurableRunOptions): DurableRun {
    text(options.path, 'Journal path'); text(options.contractDigest, 'Contract digest'); text(options.environmentDigest, 'Environment digest');
    const path = resolve(options.path); const lockPath = `${path}.lock`; mkdirSync(dirname(path), { recursive: true });
    const token = randomUUID();
    if (existsSync(lockPath) && options.recoverAbandonedLock) {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as WriterLock;
      requireThat(lock.version === 1 && lock.host === hostname() && Number.isInteger(lock.pid) && lock.pid > 0, 'Cannot safely recover a malformed or remote writer lock');
      let dead = false;
      try { process.kill(lock.pid, 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
      requireThat(dead, 'Durable run still has a live or unobservable writer');
      // Recovery is itself single-writer: a separate exclusive recovery lock serializes contenders.
      const recoveryPath = `${lockPath}.recovery`; const recovery = openSync(recoveryPath, 'wx', 0o600);
      try {
        const current = JSON.parse(readFileSync(lockPath, 'utf8')) as WriterLock;
        requireThat(current.token === lock.token, 'Writer lock changed during recovery');
        unlinkSync(lockPath);
      } finally { closeSync(recovery); unlinkSync(recoveryPath); }
    }
    let descriptor: number;
    try { descriptor = openSync(lockPath, 'wx', 0o600); } catch (error) { throw new DurabilityError(`Cannot acquire durable single-writer lock: ${String(error)}`); }
    try {
      writeFileSync(descriptor, JSON.stringify({ version: 1, host: hostname(), pid: process.pid, token } satisfies WriterLock)); fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
    try {
      let state: DurableRunState;
      if (existsSync(path)) {
        const file = JSON.parse(readFileSync(path, 'utf8')) as JournalFile;
        requireThat(file && file.checksum === digest(file.state), 'Durable journal checksum mismatch');
        state = file.state; validateState(state);
        requireThat(state.contractDigest === options.contractDigest && state.environmentDigest === options.environmentDigest, 'Durable contract/environment changed; explicitly rebaseline the existing run');
        requireThat(digest(state.ledger.limits) === digest(options.limits), 'Durable budget limits cannot be reset during restore');
      } else {
        state = { version: 1, runId: randomUUID(), epoch: 0, revision: 0, contractDigest: options.contractDigest, environmentDigest: options.environmentDigest,
          ledger: new BudgetLedger(options.limits).exportState(), operations: [], checkpoint: null, archives: [], events: [] };
      }
      const run = new DurableRun(options, token, state);
      if (!existsSync(path)) run.commit('created');
      return run;
    } catch (error) {
      unlinkSync(lockPath); throw error;
    }
  }
  private assertWriter(): void {
    if (this.closed || this.poisoned) throw new DurabilityError('Durable writer is closed or failed; reopen its persisted journal');
    try {
      const lock = JSON.parse(readFileSync(this.lockPath, 'utf8')) as WriterLock;
      if (lock.token !== this.token || lock.pid !== process.pid || lock.host !== hostname()) throw new Error('Writer ownership changed');
    } catch (error) { this.poisoned = true; throw new DurabilityError(`Durable writer ownership lost: ${String(error)}`); }
  }
  private commit(kind: string, operationId?: string, detail?: string): void {
    this.assertWriter();
    const event: DurableEvent = { sequence: this.state.events.length + 1, kind, ...(operationId ? { operationId } : {}), ...(detail ? { detail } : {}) };
    this.state.events.push(event); this.state.revision++;
    const temporary = `${this.path}.${this.token}.tmp`;
    try {
      const file: JournalFile = { state: this.state, checksum: digest(this.state) };
      const descriptor = openSync(temporary, 'w', 0o600);
      try { writeFileSync(descriptor, JSON.stringify(file)); fsyncSync(descriptor); } finally { closeSync(descriptor); }
      renameSync(temporary, this.path);
      const directory = openSync(dirname(this.path), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
      this.onBoundary?.(structuredClone(event));
    } catch (error) {
      this.poisoned = true;
      throw new DurabilityError(`Durable checkpoint write failed; no further work may dispatch: ${String(error)}`);
    }
  }
  key(id: string): string { text(id, 'Operation key'); return `${this.state.runId}:${this.state.epoch}:${id}`; }
  assertOperationId(id: string): void {
    text(id, 'Operation ID');
    requireThat(id.startsWith(`${this.state.runId}:${this.state.epoch}:`), 'Use DurableRun.key() for an operation in the current baseline epoch');
  }
  snapshot(): DurableRunState { return structuredClone(this.state); }
  readCheckpoint<T>(): T | undefined { return this.state.checkpoint === null ? undefined : structuredClone(this.state.checkpoint) as T; }
  saveCheckpoint(checkpoint: unknown, boundary = 'checkpoint'): void {
    digest(checkpoint); this.state.checkpoint = structuredClone(checkpoint); this.commit(boundary);
  }
  assertIdentity(contractDigest: string, environmentDigest: string): void {
    requireThat(this.state.contractDigest === contractDigest && this.state.environmentDigest === environmentDigest, 'Durable contract/environment mismatch; rebaseline explicitly');
  }
  /** Results are persisted before returning to settlement, so a restart cannot silently repeat work. */
  async operation<T>(id: string, request: unknown, dispatch: () => Promise<T>): Promise<T> {
    this.assertWriter(); this.assertOperationId(id);
    const requestDigest = digest(request);
    let operation = this.state.operations.find(entry => entry.id === id);
    if (operation) {
      requireThat(operation.requestDigest === requestDigest, `Durable operation identity collision: ${id}`);
      if (operation.state === 'completed') return structuredClone(operation.outcome) as T;
      if (operation.state === 'dispatched' || operation.state === 'abandoned') throw new ReconciliationRequired(id, operation.state === 'abandoned' ? 'Operation was conservatively abandoned; explicitly rebaseline or terminate' : undefined);
    } else {
      operation = { id, requestDigest, state: 'prepared' }; this.state.operations.push(operation); this.commit('operation:prepared', id);
    }
    const reservation = this.budget.reservation(id);
    requireThat(reservation && ['reserved', 'unknown'].includes(reservation.status), 'Durable operation must have an outstanding reservation before dispatch');
    if (reservation.status === 'unknown') throw new ReconciliationRequired(id);
    operation.state = 'dispatched'; this.commit('operation:dispatch', id);
    this.budget.markUnknown(id);
    // Errors and timeout races deliberately leave the external outcome unknown. Cancellation is not proof of no spend.
    let outcome: T;
    try { outcome = await dispatch(); digest(outcome); }
    catch (error) { throw new ReconciliationRequired(id, `External outcome was not durably recorded (${error instanceof Error ? error.message : String(error)}); reconcile before resuming`); }
    operation.outcome = structuredClone(outcome); operation.state = 'completed'; this.commit('operation:outcome', id);
    return structuredClone(outcome);
  }
  /** Caller supplies independently recovered evidence, never an instruction to retry an unknown operation. */
  reconcileOperation(id: string, reconciliation: { outcome: unknown; evidence: string }): void {
    this.assertWriter(); text(reconciliation.evidence, 'Reconciliation evidence'); digest(reconciliation.outcome);
    const operation = this.state.operations.find(entry => entry.id === id);
    requireThat(operation?.state === 'dispatched', 'Only an unknown dispatched operation can be reconciled');
    operation.outcome = structuredClone(reconciliation.outcome); operation.reconciliationEvidence = reconciliation.evidence; operation.state = 'completed';
    this.commit('operation:reconciled', id, reconciliation.evidence);
  }
  /** Charge the complete upper bound when an outcome cannot be recovered; this never authorizes redispatch. */
  abandonOperation(id: string, evidence: string): void {
    text(evidence, 'Abandonment evidence');
    const operation = this.state.operations.find(entry => entry.id === id);
    requireThat(operation?.state === 'dispatched', 'Only an unknown dispatched operation can be abandoned');
    this.budget.chargeReservation(id);
    operation.state = 'abandoned'; operation.reconciliationEvidence = evidence; this.commit('operation:abandoned', id, evidence);
  }
  /** Changes comparison identity and starts a new history epoch while retaining all spending and prior histories. */
  rebaseline(options: { contractDigest: string; environmentDigest: string; reason: string }): void {
    text(options.contractDigest, 'Contract digest'); text(options.environmentDigest, 'Environment digest'); text(options.reason, 'Rebaseline reason');
    requireThat(!this.state.operations.some(entry => entry.state === 'dispatched'), 'Reconcile or conservatively abandon outstanding operations before rebaselining');
    requireThat(!this.state.ledger.reservations.some(entry => entry.status === 'reserved' || entry.status === 'unknown'), 'Outstanding reservations must be reconciled before rebaselining');
    this.state.archives.push({ epoch: this.state.epoch, contractDigest: this.state.contractDigest, environmentDigest: this.state.environmentDigest, checkpoint: this.state.checkpoint, reason: options.reason });
    this.state.epoch++; this.state.contractDigest = options.contractDigest; this.state.environmentDigest = options.environmentDigest; this.state.checkpoint = null;
    this.commit('rebaseline', undefined, options.reason);
  }
  close(): void {
    if (this.closed) return;
    // Even a failed writer can release its own lock. A crashed process leaves it for explicit dead-PID recovery.
    const lock = JSON.parse(readFileSync(this.lockPath, 'utf8')) as WriterLock;
    requireThat(lock.token === this.token, 'Cannot close another durable writer');
    unlinkSync(this.lockPath); this.closed = true;
  }
}
function validateState(state: DurableRunState): void {
  requireThat(state?.version === 1, 'Unsupported durable journal version');
  text(state.runId, 'Durable run ID'); text(state.contractDigest, 'Durable contract digest'); text(state.environmentDigest, 'Durable environment digest');
  requireThat(Number.isSafeInteger(state.epoch) && state.epoch >= 0 && Number.isSafeInteger(state.revision) && state.revision > 0, 'Invalid durable counters');
  requireThat(Array.isArray(state.operations) && Array.isArray(state.events) && Array.isArray(state.archives), 'Invalid durable journal arrays');
  requireThat(state.events.length === state.revision && state.events.every((entry, index) => entry.sequence === index + 1 && typeof entry.kind === 'string'), 'Durable events are unordered or incomplete');
  BudgetLedger.restore(state.ledger);
  const ids = new Set<string>();
  for (const operation of state.operations) {
    text(operation.id, 'Operation ID'); text(operation.requestDigest, 'Operation request digest');
    requireThat(!ids.has(operation.id), 'Duplicate durable operation ID'); ids.add(operation.id);
    requireThat(['prepared', 'dispatched', 'completed', 'abandoned'].includes(operation.state), 'Invalid durable operation state');
    requireThat(operation.state === 'completed' ? Object.hasOwn(operation, 'outcome') : !Object.hasOwn(operation, 'outcome'), 'Durable outcome/state mismatch');
    requireThat(state.ledger.reservations.some(entry => entry.id === operation.id), 'Durable operation has no accounting reservation');
  }
}
