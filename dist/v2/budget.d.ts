import type { Cost } from './types.js';
export interface LedgerReservation {
    id: string;
    upperBound: Cost;
    status: 'reserved' | 'unknown' | 'settled' | 'charged' | 'failed';
    actualCost?: Cost;
    /** Preserves floating-point addition order even when concurrent work settles out of reservation order. */
    settlementSequence?: number;
}
export interface DurableLedgerState {
    version: 1;
    limits: Cost;
    spent: Cost;
    exceeded: boolean;
    reservations: LedgerReservation[];
}
export interface LedgerPersistence {
    /** Durable owners replay stable operation IDs. Ordinary in-memory ledgers reject duplicate reservations. */
    idempotent?: boolean;
    /** Must synchronously persist or throw before the caller can dispatch more work. */
    onChange?: (state: DurableLedgerState, event: {
        kind: string;
        reservationId: string;
    }) => void;
}
/** Reserve before work, settle after it. Independent units never silently convert into dollars. */
export declare class BudgetLedger {
    private readonly limits;
    private spent;
    private readonly reservations;
    private overrun;
    private settlements;
    private persistence;
    constructor(limits: Cost, persistence?: LedgerPersistence);
    /** Validates the complete accounting record, including settled reservation tombstones. */
    static restore(state: DurableLedgerState, persistence?: LedgerPersistence): BudgetLedger;
    private persist;
    private validateUnits;
    /** Validate a planned operation before any dispatch; this does not reserve or spend. */
    assertCovered(cost: Cost): void;
    reservation(id: string): LedgerReservation | undefined;
    reserve(id: string, upperBound: Cost): boolean;
    /** A dispatched external operation may have consumed resources even when no result is known. */
    markUnknown(id: string): void;
    settle(id: string, actual: Cost): void;
    private recordSettlement;
    /** Failed/unmetered work does not get a free refund. */
    chargeReservation(id: string): void;
    /** Retain known expenditure even when metering is malformed; uncertainty disables more dispatch. */
    failReservation(id: string, reported?: unknown): void;
    exportState(): DurableLedgerState;
    snapshot(): {
        limits: Cost;
        spent: Cost;
        reserved: Cost;
        exceeded: boolean;
    };
}
//# sourceMappingURL=budget.d.ts.map