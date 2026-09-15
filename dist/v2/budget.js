import { requireThat, text, validateCost } from './validation.js';
/** Reserve before work, settle after it. Independent units never silently convert into dollars. */
export class BudgetLedger {
    limits;
    spent = Object.create(null);
    reservations = new Map();
    overrun = false;
    constructor(limits) {
        validateCost(limits);
        requireThat(Object.keys(limits).length > 0, 'At least one budget unit is required');
        this.limits = { ...limits };
    }
    validateUnits(cost) {
        validateCost(cost);
        for (const unit of Object.keys(cost))
            requireThat(Object.hasOwn(this.limits, unit), `No budget declared for ${unit}`);
    }
    /** Validate a planned operation before any dispatch; this does not reserve or spend. */
    assertCovered(cost) { this.validateUnits(cost); }
    reserve(id, upperBound) {
        text(id, 'Reservation ID');
        this.validateUnits(upperBound);
        requireThat(!this.reservations.has(id), `Duplicate reservation ${id}`);
        if (this.overrun)
            return false;
        const reserved = this.snapshot().reserved;
        if (Object.entries(upperBound).some(([unit, amount]) => amount > this.limits[unit] - (this.spent[unit] ?? 0) - (reserved[unit] ?? 0)))
            return false;
        this.reservations.set(id, { ...upperBound });
        return true;
    }
    settle(id, actual) {
        const reserved = this.reservations.get(id);
        requireThat(reserved, `Unknown reservation ${id}`);
        this.validateUnits(actual);
        for (const unit of Object.keys(reserved))
            requireThat(Object.hasOwn(actual, unit), `Actual cost missing ${unit}; charge the reservation if unknown`);
        this.reservations.delete(id);
        for (const [unit, amount] of Object.entries(actual)) {
            if (amount > (reserved[unit] ?? 0))
                this.overrun = true;
            this.spent[unit] = (this.spent[unit] ?? 0) + amount;
            if (!Number.isFinite(this.spent[unit]) || this.spent[unit] > this.limits[unit])
                this.overrun = true;
        }
    }
    /** Failed/unmetered work does not get a free refund. */
    chargeReservation(id) {
        const reserved = this.reservations.get(id);
        requireThat(reserved, `Unknown reservation ${id}`);
        this.settle(id, reserved);
    }
    /** Retain known expenditure even when metering is malformed; uncertainty disables more dispatch. */
    failReservation(id, reported) {
        const reserved = this.reservations.get(id);
        requireThat(reserved, `Unknown reservation ${id}`);
        const charged = Object.assign(Object.create(null), reserved);
        if (reported && typeof reported === 'object' && !Array.isArray(reported)) {
            for (const [unit, value] of Object.entries(reported)) {
                if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
                    charged[unit] = Math.max(charged[unit] ?? 0, value);
            }
        }
        this.reservations.delete(id);
        for (const [unit, value] of Object.entries(charged))
            this.spent[unit] = (this.spent[unit] ?? 0) + value;
        this.overrun = true;
    }
    snapshot() {
        const reserved = Object.create(null);
        for (const cost of this.reservations.values())
            for (const [unit, amount] of Object.entries(cost))
                reserved[unit] = (reserved[unit] ?? 0) + amount;
        return { limits: { ...this.limits }, spent: { ...this.spent }, reserved, exceeded: this.overrun };
    }
}
//# sourceMappingURL=budget.js.map