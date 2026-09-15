import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { BudgetLedger } from './budget.js';
import { digest, requireThat, text } from './validation.js';
export class DurabilityError extends Error {
    name = 'DurabilityError';
}
export class ReconciliationRequired extends Error {
    operationId;
    name = 'ReconciliationRequired';
    constructor(operationId, message = 'External outcome is unknown; reconcile it before resuming') {
        super(`${message}: ${operationId}`);
        this.operationId = operationId;
    }
}
export function isDurabilityInterruption(error) {
    return error instanceof DurabilityError || error instanceof ReconciliationRequired;
}
/**
 * One writer on a local filesystem supporting atomic rename and fsync. This is not a distributed lock.
 * Every mutation persists synchronously; a failed write poisons this handle and prevents more dispatch.
 */
export class DurableRun {
    budget;
    state;
    path;
    lockPath;
    token;
    closed = false;
    poisoned = false;
    onBoundary;
    constructor(options, token, state) {
        this.path = resolve(options.path);
        this.lockPath = `${this.path}.lock`;
        this.token = token;
        this.state = state;
        this.onBoundary = options.onBoundary;
        this.budget = BudgetLedger.restore(state.ledger, { idempotent: true, onChange: (ledger, event) => {
                this.state.ledger = ledger;
                this.commit(`ledger:${event.kind}`, event.reservationId);
            } });
    }
    static open(options) {
        text(options.path, 'Journal path');
        text(options.contractDigest, 'Contract digest');
        text(options.environmentDigest, 'Environment digest');
        const path = resolve(options.path);
        const lockPath = `${path}.lock`;
        mkdirSync(dirname(path), { recursive: true });
        const token = randomUUID();
        if (existsSync(lockPath) && options.recoverAbandonedLock) {
            const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
            requireThat(lock.version === 1 && lock.host === hostname() && Number.isInteger(lock.pid) && lock.pid > 0, 'Cannot safely recover a malformed or remote writer lock');
            let dead = false;
            try {
                process.kill(lock.pid, 0);
            }
            catch (error) {
                dead = error.code === 'ESRCH';
            }
            requireThat(dead, 'Durable run still has a live or unobservable writer');
            // Recovery is itself single-writer: a separate exclusive recovery lock serializes contenders.
            const recoveryPath = `${lockPath}.recovery`;
            const recovery = openSync(recoveryPath, 'wx', 0o600);
            try {
                const current = JSON.parse(readFileSync(lockPath, 'utf8'));
                requireThat(current.token === lock.token, 'Writer lock changed during recovery');
                unlinkSync(lockPath);
            }
            finally {
                closeSync(recovery);
                unlinkSync(recoveryPath);
            }
        }
        let descriptor;
        try {
            descriptor = openSync(lockPath, 'wx', 0o600);
        }
        catch (error) {
            throw new DurabilityError(`Cannot acquire durable single-writer lock: ${String(error)}`);
        }
        try {
            writeFileSync(descriptor, JSON.stringify({ version: 1, host: hostname(), pid: process.pid, token }));
            fsyncSync(descriptor);
        }
        finally {
            closeSync(descriptor);
        }
        try {
            let state;
            if (existsSync(path)) {
                const file = JSON.parse(readFileSync(path, 'utf8'));
                requireThat(file && file.checksum === digest(file.state), 'Durable journal checksum mismatch');
                state = file.state;
                validateState(state);
                requireThat(state.contractDigest === options.contractDigest && state.environmentDigest === options.environmentDigest, 'Durable contract/environment changed; explicitly rebaseline the existing run');
                requireThat(digest(state.ledger.limits) === digest(options.limits), 'Durable budget limits cannot be reset during restore');
            }
            else {
                state = { version: 1, runId: randomUUID(), epoch: 0, revision: 0, contractDigest: options.contractDigest, environmentDigest: options.environmentDigest,
                    ledger: new BudgetLedger(options.limits).exportState(), operations: [], checkpoint: null, archives: [], events: [] };
            }
            const run = new DurableRun(options, token, state);
            if (!existsSync(path))
                run.commit('created');
            return run;
        }
        catch (error) {
            unlinkSync(lockPath);
            throw error;
        }
    }
    assertWriter() {
        if (this.closed || this.poisoned)
            throw new DurabilityError('Durable writer is closed or failed; reopen its persisted journal');
        try {
            const lock = JSON.parse(readFileSync(this.lockPath, 'utf8'));
            if (lock.token !== this.token || lock.pid !== process.pid || lock.host !== hostname())
                throw new Error('Writer ownership changed');
        }
        catch (error) {
            this.poisoned = true;
            throw new DurabilityError(`Durable writer ownership lost: ${String(error)}`);
        }
    }
    commit(kind, operationId, detail) {
        this.assertWriter();
        const event = { sequence: this.state.events.length + 1, kind, ...(operationId ? { operationId } : {}), ...(detail ? { detail } : {}) };
        this.state.events.push(event);
        this.state.revision++;
        const temporary = `${this.path}.${this.token}.tmp`;
        try {
            const file = { state: this.state, checksum: digest(this.state) };
            const descriptor = openSync(temporary, 'w', 0o600);
            try {
                writeFileSync(descriptor, JSON.stringify(file));
                fsyncSync(descriptor);
            }
            finally {
                closeSync(descriptor);
            }
            renameSync(temporary, this.path);
            const directory = openSync(dirname(this.path), 'r');
            try {
                fsyncSync(directory);
            }
            finally {
                closeSync(directory);
            }
            this.onBoundary?.(structuredClone(event));
        }
        catch (error) {
            this.poisoned = true;
            throw new DurabilityError(`Durable checkpoint write failed; no further work may dispatch: ${String(error)}`);
        }
    }
    key(id) { text(id, 'Operation key'); return `${this.state.runId}:${this.state.epoch}:${id}`; }
    assertOperationId(id) {
        text(id, 'Operation ID');
        requireThat(id.startsWith(`${this.state.runId}:${this.state.epoch}:`), 'Use DurableRun.key() for an operation in the current baseline epoch');
    }
    snapshot() { return structuredClone(this.state); }
    readCheckpoint() { return this.state.checkpoint === null ? undefined : structuredClone(this.state.checkpoint); }
    saveCheckpoint(checkpoint, boundary = 'checkpoint') {
        digest(checkpoint);
        this.state.checkpoint = structuredClone(checkpoint);
        this.commit(boundary);
    }
    assertIdentity(contractDigest, environmentDigest) {
        requireThat(this.state.contractDigest === contractDigest && this.state.environmentDigest === environmentDigest, 'Durable contract/environment mismatch; rebaseline explicitly');
    }
    /** Results are persisted before returning to settlement, so a restart cannot silently repeat work. */
    async operation(id, request, dispatch) {
        this.assertWriter();
        this.assertOperationId(id);
        const requestDigest = digest(request);
        let operation = this.state.operations.find(entry => entry.id === id);
        if (operation) {
            requireThat(operation.requestDigest === requestDigest, `Durable operation identity collision: ${id}`);
            if (operation.state === 'completed')
                return structuredClone(operation.outcome);
            if (operation.state === 'dispatched' || operation.state === 'abandoned')
                throw new ReconciliationRequired(id, operation.state === 'abandoned' ? 'Operation was conservatively abandoned; explicitly rebaseline or terminate' : undefined);
        }
        else {
            operation = { id, requestDigest, state: 'prepared' };
            this.state.operations.push(operation);
            this.commit('operation:prepared', id);
        }
        const reservation = this.budget.reservation(id);
        requireThat(reservation && ['reserved', 'unknown'].includes(reservation.status), 'Durable operation must have an outstanding reservation before dispatch');
        if (reservation.status === 'unknown')
            throw new ReconciliationRequired(id);
        operation.state = 'dispatched';
        this.commit('operation:dispatch', id);
        this.budget.markUnknown(id);
        // Errors and timeout races deliberately leave the external outcome unknown. Cancellation is not proof of no spend.
        let outcome;
        try {
            outcome = await dispatch();
            digest(outcome);
        }
        catch (error) {
            throw new ReconciliationRequired(id, `External outcome was not durably recorded (${error instanceof Error ? error.message : String(error)}); reconcile before resuming`);
        }
        operation.outcome = structuredClone(outcome);
        operation.state = 'completed';
        this.commit('operation:outcome', id);
        return structuredClone(outcome);
    }
    /** Caller supplies independently recovered evidence, never an instruction to retry an unknown operation. */
    reconcileOperation(id, reconciliation) {
        this.assertWriter();
        text(reconciliation.evidence, 'Reconciliation evidence');
        digest(reconciliation.outcome);
        const operation = this.state.operations.find(entry => entry.id === id);
        requireThat(operation?.state === 'dispatched', 'Only an unknown dispatched operation can be reconciled');
        operation.outcome = structuredClone(reconciliation.outcome);
        operation.reconciliationEvidence = reconciliation.evidence;
        operation.state = 'completed';
        this.commit('operation:reconciled', id, reconciliation.evidence);
    }
    /** Charge the complete upper bound when an outcome cannot be recovered; this never authorizes redispatch. */
    abandonOperation(id, evidence) {
        text(evidence, 'Abandonment evidence');
        const operation = this.state.operations.find(entry => entry.id === id);
        requireThat(operation?.state === 'dispatched', 'Only an unknown dispatched operation can be abandoned');
        this.budget.chargeReservation(id);
        operation.state = 'abandoned';
        operation.reconciliationEvidence = evidence;
        this.commit('operation:abandoned', id, evidence);
    }
    /** Changes comparison identity and starts a new history epoch while retaining all spending and prior histories. */
    rebaseline(options) {
        text(options.contractDigest, 'Contract digest');
        text(options.environmentDigest, 'Environment digest');
        text(options.reason, 'Rebaseline reason');
        requireThat(!this.state.operations.some(entry => entry.state === 'dispatched'), 'Reconcile or conservatively abandon outstanding operations before rebaselining');
        requireThat(!this.state.ledger.reservations.some(entry => entry.status === 'reserved' || entry.status === 'unknown'), 'Outstanding reservations must be reconciled before rebaselining');
        this.state.archives.push({ epoch: this.state.epoch, contractDigest: this.state.contractDigest, environmentDigest: this.state.environmentDigest, checkpoint: this.state.checkpoint, reason: options.reason });
        this.state.epoch++;
        this.state.contractDigest = options.contractDigest;
        this.state.environmentDigest = options.environmentDigest;
        this.state.checkpoint = null;
        this.commit('rebaseline', undefined, options.reason);
    }
    close() {
        if (this.closed)
            return;
        // Even a failed writer can release its own lock. A crashed process leaves it for explicit dead-PID recovery.
        const lock = JSON.parse(readFileSync(this.lockPath, 'utf8'));
        requireThat(lock.token === this.token, 'Cannot close another durable writer');
        unlinkSync(this.lockPath);
        this.closed = true;
    }
}
function validateState(state) {
    requireThat(state?.version === 1, 'Unsupported durable journal version');
    text(state.runId, 'Durable run ID');
    text(state.contractDigest, 'Durable contract digest');
    text(state.environmentDigest, 'Durable environment digest');
    requireThat(Number.isSafeInteger(state.epoch) && state.epoch >= 0 && Number.isSafeInteger(state.revision) && state.revision > 0, 'Invalid durable counters');
    requireThat(Array.isArray(state.operations) && Array.isArray(state.events) && Array.isArray(state.archives), 'Invalid durable journal arrays');
    requireThat(state.events.length === state.revision && state.events.every((entry, index) => entry.sequence === index + 1 && typeof entry.kind === 'string'), 'Durable events are unordered or incomplete');
    BudgetLedger.restore(state.ledger);
    const ids = new Set();
    for (const operation of state.operations) {
        text(operation.id, 'Operation ID');
        text(operation.requestDigest, 'Operation request digest');
        requireThat(!ids.has(operation.id), 'Duplicate durable operation ID');
        ids.add(operation.id);
        requireThat(['prepared', 'dispatched', 'completed', 'abandoned'].includes(operation.state), 'Invalid durable operation state');
        requireThat(operation.state === 'completed' ? Object.hasOwn(operation, 'outcome') : !Object.hasOwn(operation, 'outcome'), 'Durable outcome/state mismatch');
        requireThat(state.ledger.reservations.some(entry => entry.id === operation.id), 'Durable operation has no accounting reservation');
    }
}
//# sourceMappingURL=durability.js.map