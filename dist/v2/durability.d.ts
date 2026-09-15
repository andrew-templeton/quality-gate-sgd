import { BudgetLedger, type DurableLedgerState } from './budget.js';
import type { Cost } from './types.js';
export declare class DurabilityError extends Error {
    name: string;
}
export declare class ReconciliationRequired extends Error {
    readonly operationId: string;
    name: string;
    constructor(operationId: string, message?: string);
}
export declare function isDurabilityInterruption(error: unknown): error is DurabilityError | ReconciliationRequired;
export interface DurableOperation {
    id: string;
    requestDigest: string;
    state: 'prepared' | 'dispatched' | 'completed' | 'abandoned';
    outcome?: unknown;
    reconciliationEvidence?: string;
}
export interface DurableEvent {
    sequence: number;
    kind: string;
    operationId?: string;
    detail?: string;
}
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
    archives: {
        epoch: number;
        contractDigest: string;
        environmentDigest: string;
        checkpoint: unknown | null;
        reason: string;
    }[];
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
/**
 * One writer on a local filesystem supporting atomic rename and fsync. This is not a distributed lock.
 * Every mutation persists synchronously; a failed write poisons this handle and prevents more dispatch.
 */
export declare class DurableRun {
    readonly budget: BudgetLedger;
    private state;
    private readonly path;
    private readonly lockPath;
    private readonly token;
    private closed;
    private poisoned;
    private readonly onBoundary?;
    private constructor();
    static open(options: DurableRunOptions): DurableRun;
    private assertWriter;
    private commit;
    key(id: string): string;
    assertOperationId(id: string): void;
    snapshot(): DurableRunState;
    readCheckpoint<T>(): T | undefined;
    saveCheckpoint(checkpoint: unknown, boundary?: string): void;
    assertIdentity(contractDigest: string, environmentDigest: string): void;
    /** Results are persisted before returning to settlement, so a restart cannot silently repeat work. */
    operation<T>(id: string, request: unknown, dispatch: () => Promise<T>): Promise<T>;
    /** Caller supplies independently recovered evidence, never an instruction to retry an unknown operation. */
    reconcileOperation(id: string, reconciliation: {
        outcome: unknown;
        evidence: string;
    }): void;
    /** Charge the complete upper bound when an outcome cannot be recovered; this never authorizes redispatch. */
    abandonOperation(id: string, evidence: string): void;
    /** Changes comparison identity and starts a new history epoch while retaining all spending and prior histories. */
    rebaseline(options: {
        contractDigest: string;
        environmentDigest: string;
        reason: string;
    }): void;
    close(): void;
}
//# sourceMappingURL=durability.d.ts.map