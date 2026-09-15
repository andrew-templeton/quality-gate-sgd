import type { Cost } from './types.js';
import { requireThat, text, validateCost } from './validation.js';

/** Reserve before work, settle after it. Independent units never silently convert into dollars. */
export class BudgetLedger {
  private readonly limits: Cost;
  private spent: Cost = Object.create(null) as Cost;
  private readonly reservations = new Map<string, Cost>();
  private overrun = false;
  constructor(limits: Cost) {
    validateCost(limits);
    requireThat(Object.keys(limits).length > 0, 'At least one budget unit is required');
    this.limits = { ...limits };
  }
  private validateUnits(cost: Cost): void {
    validateCost(cost);
    for (const unit of Object.keys(cost)) requireThat(Object.hasOwn(this.limits, unit), `No budget declared for ${unit}`);
  }
  reserve(id: string, upperBound: Cost): boolean {
    text(id, 'Reservation ID'); this.validateUnits(upperBound);
    requireThat(!this.reservations.has(id), `Duplicate reservation ${id}`);
    if (this.overrun) return false;
    const reserved = this.snapshot().reserved;
    if (Object.entries(upperBound).some(([unit, amount]) => amount > this.limits[unit] - (this.spent[unit] ?? 0) - (reserved[unit] ?? 0))) return false;
    this.reservations.set(id, { ...upperBound });
    return true;
  }
  settle(id: string, actual: Cost): void {
    const reserved = this.reservations.get(id);
    requireThat(reserved, `Unknown reservation ${id}`); this.validateUnits(actual);
    for (const unit of Object.keys(reserved)) requireThat(Object.hasOwn(actual, unit), `Actual cost missing ${unit}; charge the reservation if unknown`);
    this.reservations.delete(id);
    for (const [unit, amount] of Object.entries(actual)) {
      if (amount > (reserved[unit] ?? 0)) this.overrun = true;
      this.spent[unit] = (this.spent[unit] ?? 0) + amount;
      if (!Number.isFinite(this.spent[unit]) || this.spent[unit] > this.limits[unit]) this.overrun = true;
    }
  }
  /** Failed/unmetered work does not get a free refund. */
  chargeReservation(id: string): void {
    const reserved = this.reservations.get(id);
    requireThat(reserved, `Unknown reservation ${id}`);
    this.settle(id, reserved);
  }
  /** Retain known expenditure even when metering is malformed; uncertainty disables more dispatch. */
  failReservation(id: string, reported?: unknown): void {
    const reserved = this.reservations.get(id);
    requireThat(reserved, `Unknown reservation ${id}`);
    const charged = Object.assign(Object.create(null), reserved) as Cost;
    if (reported && typeof reported === 'object' && !Array.isArray(reported)) {
      for (const [unit, value] of Object.entries(reported)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) charged[unit] = Math.max(charged[unit] ?? 0, value);
      }
    }
    this.reservations.delete(id);
    for (const [unit, value] of Object.entries(charged)) this.spent[unit] = (this.spent[unit] ?? 0) + value;
    this.overrun = true;
  }
  snapshot(): { limits: Cost; spent: Cost; reserved: Cost; exceeded: boolean } {
    const reserved: Cost = Object.create(null) as Cost;
    for (const cost of this.reservations.values()) for (const [unit, amount] of Object.entries(cost)) reserved[unit] = (reserved[unit] ?? 0) + amount;
    return { limits: { ...this.limits }, spent: { ...this.spent }, reserved, exceeded: this.overrun };
  }
}
