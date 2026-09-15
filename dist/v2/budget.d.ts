import type { Cost } from './types.js';
/** Reserve before work, settle after it. Independent units never silently convert into dollars. */
export declare class BudgetLedger {
    private readonly limits;
    private spent;
    private readonly reservations;
    private overrun;
    constructor(limits: Cost);
    private validateUnits;
    reserve(id: string, upperBound: Cost): boolean;
    settle(id: string, actual: Cost): void;
    /** Failed/unmetered work does not get a free refund. */
    chargeReservation(id: string): void;
    /** Retain known expenditure even when metering is malformed; uncertainty disables more dispatch. */
    failReservation(id: string, reported?: unknown): void;
    snapshot(): {
        limits: Cost;
        spent: Cost;
        reserved: Cost;
        exceeded: boolean;
    };
}
//# sourceMappingURL=budget.d.ts.map