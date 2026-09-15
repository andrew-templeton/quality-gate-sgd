import { createHash } from 'node:crypto';
export function requireThat(condition, message) {
    if (!condition)
        throw new Error(message);
}
export function text(value, label) {
    requireThat(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text`);
}
export function finite(value, label) {
    requireThat(Number.isFinite(value), `${label} must be finite`);
}
export function unique(values, label) {
    requireThat(Array.isArray(values), `${label} must be an array`);
    values.forEach(value => text(value, label));
    requireThat(new Set(values).size === values.length, `${label} must be unique`);
}
export function validateCost(cost) {
    requireThat(cost !== null && typeof cost === 'object' && !Array.isArray(cost), 'Cost must be a unit/value record');
    for (const [unit, amount] of Object.entries(cost)) {
        text(unit, 'Cost unit');
        requireThat(Number.isFinite(amount) && amount >= 0, `Invalid nonnegative cost for ${unit}`);
    }
}
export function validateInterval(value) {
    finite(value.lower, 'Lower bound');
    finite(value.upper, 'Upper bound');
    text(value.unit, 'Interval unit');
    requireThat(value.lower <= value.upper, 'Interval bounds are reversed');
}
function canonical(value) {
    if (Array.isArray(value)) {
        requireThat(Object.keys(value).length === value.length && value.every((_, index) => Object.hasOwn(value, index)) && Object.getOwnPropertySymbols(value).length === 0, 'Digest arrays must be dense JSON arrays');
        return value.map(canonical);
    }
    if (value && typeof value === 'object') {
        requireThat([Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.getOwnPropertySymbols(value).length === 0, 'Digest inputs must be plain JSON objects');
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
    }
    requireThat(value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value)), 'Digest inputs must be finite JSON values');
    return value;
}
export function digest(value) {
    return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
/** Only use on JSON input/metadata, never an AbortSignal or a live client. */
export function freezeJson(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freezeJson);
        Object.freeze(value);
    }
    return value;
}
export function validateObservation(value) {
    requireThat(value && ['pass', 'fail', 'unavailable'].includes(value.status), 'Invalid assertion status');
    requireThat(Array.isArray(value.findings) && Array.isArray(value.evidence), 'Findings and evidence are required');
    value.evidence.forEach(item => text(item, 'Evidence'));
    for (const finding of value.findings) {
        text(finding.address, 'Finding address');
        text(finding.message, 'Finding message');
        requireThat(Array.isArray(finding.evidence), 'Finding evidence required');
        finding.evidence.forEach(item => text(item, 'Finding evidence'));
    }
    if (value.status !== 'unavailable')
        requireThat(value.evidence.length > 0, 'An evaluated verdict requires evidence');
    if (value.status === 'fail')
        requireThat(value.findings.length > 0, 'A failed assertion requires an addressed finding');
    if (value.loss)
        validateInterval(value.loss);
    validateCost(value.actualCost);
}
//# sourceMappingURL=validation.js.map