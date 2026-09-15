import type { Cost } from './types.js';
import { digest, requireThat, text, validateCost } from './validation.js';

const copyCost = (cost: Cost): Cost => Object.assign(Object.create(null), cost) as Cost;

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
  onChange?: (state: DurableLedgerState, event: { kind: string; reservationId: string }) => void;
}

/** Reserve before work, settle after it. Independent units never silently convert into dollars. */
export class BudgetLedger {
  private readonly limits: Cost;
  private spent: Cost = Object.create(null) as Cost;
  private readonly reservations = new Map<string, LedgerReservation>();
  private overrun = false;
  private settlements = 0;
  private persistence: LedgerPersistence;
  constructor(limits: Cost, persistence: LedgerPersistence = {}) {
    validateCost(limits);
    requireThat(Object.keys(limits).length > 0, 'At least one budget unit is required');
    this.limits = copyCost(limits);
    this.persistence = persistence;
  }
  /** Validates the complete accounting record, including settled reservation tombstones. */
  static restore(state: DurableLedgerState, persistence: LedgerPersistence = {}): BudgetLedger {
    requireThat(state && state.version === 1, 'Unsupported durable ledger version');
    digest(state);
    const ledger = new BudgetLedger(state.limits, persistence);
    validateCost(state.spent);
    requireThat(typeof state.exceeded === 'boolean' && Array.isArray(state.reservations), 'Invalid durable ledger state');
    const spent: Cost = Object.create(null) as Cost;
    let exceeded = false;
    for (const record of state.reservations) {
      text(record.id, 'Reservation ID'); ledger.validateUnits(record.upperBound);
      requireThat(!ledger.reservations.has(record.id), `Duplicate durable reservation ${record.id}`);
      requireThat(['reserved', 'unknown', 'settled', 'charged', 'failed'].includes(record.status), 'Invalid reservation state');
      if (record.status === 'reserved' || record.status === 'unknown') {
        requireThat(record.actualCost === undefined, 'Outstanding reservation cannot contain settled expenditure');
        requireThat(record.settlementSequence === undefined, 'Outstanding reservation cannot have a settlement sequence');
      } else {
        requireThat(record.actualCost !== undefined, 'Settled reservation requires actual expenditure');
        requireThat(Number.isSafeInteger(record.settlementSequence) && (record.settlementSequence as number) > 0, 'Settled reservation requires an ordered settlement identity');
        validateCost(record.actualCost);
        if (record.status !== 'failed') ledger.validateUnits(record.actualCost);
        for (const unit of Object.keys(record.upperBound)) requireThat(Object.hasOwn(record.actualCost, unit), `Settled cost missing ${unit}`);
        if (record.status === 'charged') requireThat(digest(record.actualCost) === digest(record.upperBound), 'Conservative charge must equal its reservation');
        if (record.status === 'failed') {
          exceeded = true;
          for (const [unit, amount] of Object.entries(record.upperBound)) requireThat(record.actualCost[unit] >= amount, 'Failed reservation cannot refund uncertain expenditure');
        }
      }
      ledger.reservations.set(record.id, { ...structuredClone(record), upperBound: copyCost(record.upperBound), ...(record.actualCost ? { actualCost: copyCost(record.actualCost) } : {}) });
    }
    const settled = state.reservations.filter(record => record.actualCost).sort((a, b) => (a.settlementSequence as number) - (b.settlementSequence as number));
    settled.forEach((record, index) => {
      requireThat(record.settlementSequence === index + 1, 'Durable settlement sequence is missing, duplicate or unordered');
      for (const [unit, amount] of Object.entries(record.actualCost as Cost)) {
        spent[unit] = (spent[unit] ?? 0) + amount;
        requireThat(Number.isFinite(spent[unit]), 'Durable cost total overflow');
        if (amount > (Object.hasOwn(record.upperBound, unit) ? record.upperBound[unit] : 0) || spent[unit] > (ledger.limits[unit] ?? 0)) exceeded = true;
      }
    });
    requireThat(digest(spent) === digest(state.spent), 'Durable spent total does not match reservation history');
    requireThat(exceeded === state.exceeded, 'Durable overrun state does not match reservation history');
    ledger.spent = spent; ledger.overrun = exceeded; ledger.settlements = settled.length;
    const reserved = ledger.snapshot().reserved;
    if (!exceeded) for (const [unit, amount] of Object.entries(reserved)) requireThat(amount + (spent[unit] ?? 0) <= ledger.limits[unit], 'Outstanding reservations exceed the durable budget');
    return ledger;
  }
  private persist(kind: string, reservationId: string): void { this.persistence.onChange?.(this.exportState(), { kind, reservationId }); }
  private validateUnits(cost: Cost): void {
    validateCost(cost);
    for (const unit of Object.keys(cost)) requireThat(Object.hasOwn(this.limits, unit), `No budget declared for ${unit}`);
  }
  /** Validate a planned operation before any dispatch; this does not reserve or spend. */
  assertCovered(cost: Cost): void { this.validateUnits(cost); }
  reservation(id: string): LedgerReservation | undefined { const record = this.reservations.get(id); return record ? structuredClone(record) : undefined; }
  reserve(id: string, upperBound: Cost): boolean {
    text(id, 'Reservation ID'); this.validateUnits(upperBound);
    const previous = this.reservations.get(id);
    if (previous && this.persistence.idempotent) {
      requireThat(digest(previous.upperBound) === digest(upperBound), `Reservation identity reused with a different cost bound: ${id}`);
      return true;
    }
    requireThat(!previous || !['reserved', 'unknown'].includes(previous.status), `Duplicate reservation ${id}`);
    if (this.overrun) return false;
    const reserved = this.snapshot().reserved;
    if (Object.entries(upperBound).some(([unit, amount]) => amount > this.limits[unit] - (this.spent[unit] ?? 0) - (reserved[unit] ?? 0))) return false;
    // Ordinary callers may reuse a settled name; retain a distinct tombstone for its prior expenditure.
    if (previous) {
      let ordinal = 1; while (this.reservations.has(`${id}#${ordinal}`)) ordinal++;
      const archivedId = `${id}#${ordinal}`;
      this.reservations.delete(id); this.reservations.set(archivedId, { ...previous, id: archivedId });
    }
    this.reservations.set(id, { id, upperBound: copyCost(upperBound), status: 'reserved' });
    this.persist('reservation', id);
    return true;
  }
  /** A dispatched external operation may have consumed resources even when no result is known. */
  markUnknown(id: string): void {
    const record = this.reservations.get(id); requireThat(record, `Unknown reservation ${id}`);
    if (record.status === 'reserved') { record.status = 'unknown'; this.persist('dispatch', id); }
  }
  settle(id: string, actual: Cost): void {
    const record = this.reservations.get(id);
    requireThat(record, `Unknown reservation ${id}`); this.validateUnits(actual);
    if (!['reserved', 'unknown'].includes(record.status)) {
      requireThat(this.persistence.idempotent && digest(actual) === digest(record.actualCost), `Reservation already settled: ${id}`);
      return;
    }
    for (const unit of Object.keys(record.upperBound)) requireThat(Object.hasOwn(actual, unit), `Actual cost missing ${unit}; charge the reservation if unknown`);
    this.recordSettlement(record, actual, 'settled');
  }
  private recordSettlement(record: LedgerReservation, actual: Cost, status: 'settled' | 'charged' | 'failed'): void {
    const updated = copyCost(this.spent);
    for (const [unit, amount] of Object.entries(actual)) {
      updated[unit] = (updated[unit] ?? 0) + amount;
      requireThat(Number.isFinite(updated[unit]), 'Durable cost total overflow');
      if (amount > (record.upperBound[unit] ?? 0) || updated[unit] > (this.limits[unit] ?? 0)) this.overrun = true;
    }
    this.spent = updated; record.status = status; record.actualCost = copyCost(actual); record.settlementSequence = ++this.settlements;
    this.persist('settlement', record.id);
  }
  /** Failed/unmetered work does not get a free refund. */
  chargeReservation(id: string): void {
    const record = this.reservations.get(id); requireThat(record, `Unknown reservation ${id}`);
    if (!['reserved', 'unknown'].includes(record.status)) {
      requireThat(this.persistence.idempotent && record.status === 'charged', `Reservation already settled: ${id}`); return;
    }
    this.recordSettlement(record, record.upperBound, 'charged');
  }
  /** Retain known expenditure even when metering is malformed; uncertainty disables more dispatch. */
  failReservation(id: string, reported?: unknown): void {
    const record = this.reservations.get(id); requireThat(record, `Unknown reservation ${id}`);
    if (!['reserved', 'unknown'].includes(record.status)) { requireThat(this.persistence.idempotent, `Reservation already settled: ${id}`); return; }
    const charged = Object.assign(Object.create(null), record.upperBound) as Cost;
    if (reported && typeof reported === 'object' && !Array.isArray(reported)) {
      for (const [unit, value] of Object.entries(reported)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) charged[unit] = Math.max(charged[unit] ?? 0, value);
      }
    }
    this.overrun = true;
    this.recordSettlement(record, charged, 'failed');
  }
  exportState(): DurableLedgerState {
    return { version: 1, limits: { ...this.limits }, spent: { ...this.spent }, exceeded: this.overrun, reservations: structuredClone([...this.reservations.values()]) };
  }
  snapshot(): { limits: Cost; spent: Cost; reserved: Cost; exceeded: boolean } {
    const reserved: Cost = Object.create(null) as Cost;
    for (const record of this.reservations.values()) if (record.status === 'reserved' || record.status === 'unknown') {
      for (const [unit, amount] of Object.entries(record.upperBound)) reserved[unit] = (reserved[unit] ?? 0) + amount;
    }
    return { limits: { ...this.limits }, spent: { ...this.spent }, reserved, exceeded: this.overrun };
  }
}
