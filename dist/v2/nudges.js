import { requireThat, text, unique, validateCost, validateInterval } from './validation.js';
export function validateNudge(nudge) {
    text(nudge.id, 'Nudge ID');
    text(nudge.assertionId, 'Nudge assertion');
    text(nudge.instruction, 'Nudge instruction');
    unique(nudge.reads, 'Nudge reads');
    unique(nudge.writes, 'Nudge writes');
    requireThat(nudge.writes.length > 0, 'A nudge needs an explicit write footprint');
    validateCost(nudge.costUpperBound);
    if (nudge.netBenefit)
        validateInterval(nudge.netBenefit);
    for (const change of nudge.changes) {
        text(change.address, 'Change address');
        text(change.variable, 'Change variable');
        requireThat(change.direction === -1 || change.direction === 1, 'Change direction must be signed');
        requireThat(nudge.writes.includes(change.address), 'Change must belong to the declared write footprint');
    }
    unique(nudge.changes.map(change => JSON.stringify([change.address, change.variable])), 'Changed variables');
    for (const effect of nudge.effects) {
        text(effect.assertionId, 'Effect assertion');
        requireThat(['improves', 'worsens', 'unknown'].includes(effect.direction), 'Invalid effect direction');
        requireThat(['hypothesis', 'observed', 'identified'].includes(effect.basis), 'Invalid effect basis');
        if (effect.basis !== 'hypothesis')
            requireThat(effect.evidence.length > 0, 'Observed/identified effect needs evidence');
        effect.evidence.forEach(item => text(item, 'Effect evidence'));
    }
}
export function conflictReasons(a, b) {
    const reasons = [];
    if (a.writes.some(address => b.writes.includes(address) || b.reads.includes(address)) || b.writes.some(address => a.reads.includes(address)))
        reasons.push('Shared write or read/write dependency');
    if (a.changes.some(x => b.changes.some(y => x.address === y.address && x.variable === y.variable && x.direction !== y.direction)))
        reasons.push('Opposite proposed interventions on the same variable');
    if (a.effects.some(x => b.effects.some(y => x.assertionId === y.assertionId && x.direction !== 'unknown' && y.direction !== 'unknown' && x.direction !== y.direction)))
        reasons.push('Conflicting predicted assertion effects');
    return reasons;
}
/** Conservative partial resolution. Overlapping benefit intervals remain unresolved; this is not a global optimizer. */
export function planNudges(nudges, protectedAssertions = []) {
    unique(nudges.map(n => n.id), 'Nudge IDs');
    nudges.forEach(validateNudge);
    const deferred = new Map();
    for (const nudge of nudges)
        if (nudge.effects.some(effect => protectedAssertions.includes(effect.assertionId) && effect.direction === 'worsens'))
            deferred.set(nudge.id, 'Predicted regression of a protected assertion; revise the intervention or measure before admission');
    const eligible = nudges.filter(nudge => !deferred.has(nudge.id));
    const conflicts = [];
    for (let i = 0; i < eligible.length; i++)
        for (let j = i + 1; j < eligible.length; j++) {
            const a = eligible[i];
            const b = eligible[j];
            const reasons = conflictReasons(a, b);
            if (!reasons.length)
                continue;
            let preferred = null;
            if (a.netBenefit && b.netBenefit && a.netBenefit.unit === b.netBenefit.unit) {
                if (a.netBenefit.lower > b.netBenefit.upper)
                    preferred = a.id;
                if (b.netBenefit.lower > a.netBenefit.upper)
                    preferred = b.id;
            }
            conflicts.push({ left: a.id, right: b.id, reasons, preferred });
            if (preferred)
                deferred.set(preferred === a.id ? b.id : a.id, `Conditional net-benefit bounds prefer ${preferred}; remeasure after that change`);
            else {
                deferred.set(a.id, 'Unresolved conflict; no comparable strict benefit dominance');
                deferred.set(b.id, 'Unresolved conflict; no comparable strict benefit dominance');
            }
        }
    return { selected: eligible.filter(nudge => !deferred.has(nudge.id)), deferred: [...deferred].map(([id, reason]) => ({ id, reason })), conflicts };
}
//# sourceMappingURL=nudges.js.map