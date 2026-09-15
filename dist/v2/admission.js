import { requireThat, text, unique, validateObservation } from './validation.js';
import { validateNudge } from './nudges.js';
export function initialLoopState(evaluation) {
    return { contractDigest: evaluation.contractDigest, acceptedDigests: [evaluation.artifactDigest], lastChanges: [], stalledRounds: 0, lastRound: 0 };
}
/** Hysteresis is the mechanism preventing chatter, not a guarantee of convergence. */
export function admitCandidate(baseline, candidate, nudge, round, policy, state) {
    requireThat(Number.isInteger(round) && round > 0, 'Round must be a positive integer');
    requireThat(Number.isInteger(policy.cooldownRounds) && policy.cooldownRounds >= 0, 'Cooldown must be nonnegative');
    requireThat(Number.isInteger(policy.maxStalledRounds) && policy.maxStalledRounds > 0, 'Stall window must be positive');
    requireThat(Number.isFinite(policy.reversalMultiplier) && policy.reversalMultiplier >= 1, 'Reversal multiplier must be at least one');
    unique(policy.gate.required, 'Required assertions');
    for (const value of Object.values(policy.objectives))
        requireThat(Number.isFinite(value) && value >= 0, 'Improvement margins must be finite and nonnegative');
    const reject = (reason) => ({ accepted: false, reason, state: { ...state, lastRound: Math.max(state.lastRound, round), stalledRounds: state.stalledRounds + 1 } });
    try {
        validateNudge(nudge);
        requireThat(Number.isInteger(state.lastRound) && round > state.lastRound && state.lastChanges.every(change => change.round < round), 'Round must follow recorded history');
        for (const evaluation of [baseline, candidate]) {
            text(evaluation.inputDigest, 'Evaluation input digest');
            unique(evaluation.requiredAssertions, 'Required assertion closure');
            unique(evaluation.results.map(result => result.assertionId), 'Result IDs');
            requireThat(evaluation.requiredAssertions.length > 0, 'Empty required assertion closure');
            requireThat(policy.gate.required.every(id => evaluation.requiredAssertions.includes(id)), 'Policy does not match evaluated gate');
            evaluation.results.forEach(result => {
                requireThat(result.inputDigest === evaluation.inputDigest, 'Stale or mixed assertion evidence');
                validateObservation(result);
            });
        }
        requireThat(baseline.requiredAssertions.length === candidate.requiredAssertions.length && baseline.requiredAssertions.every(id => candidate.requiredAssertions.includes(id)), 'Required assertion closure changed');
    }
    catch (error) {
        return reject(`Invalid evidence: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (candidate.contractDigest !== baseline.contractDigest || state.contractDigest !== baseline.contractDigest)
        return reject('Contract changed; rebaseline instead of comparing incomparable runs');
    if (state.acceptedDigests.at(-1) !== baseline.artifactDigest)
        return reject('Baseline is not the current accepted artifact');
    if (state.acceptedDigests.includes(candidate.artifactDigest))
        return reject('Previously accepted artifact: cycle or no-op');
    if (candidate.budget.exceeded)
        return reject('Cost upper bound exceeded');
    const before = new Map(baseline.results.map(result => [result.assertionId, result]));
    const after = new Map(candidate.results.map(result => [result.assertionId, result]));
    let repaired = false;
    for (const id of baseline.requiredAssertions) {
        const a = before.get(id);
        const b = after.get(id);
        if (a?.status === 'unavailable' && a.reasonCode === 'prerequisite-blocked') {
            if (b?.status === 'pass') {
                repaired = true;
                continue;
            }
            if (b?.status === 'unavailable' && b.reasonCode === 'prerequisite-blocked')
                continue;
            return reject(`Previously blocked assertion has no passing comparison: ${id}`);
        }
        if (!a || !b || a.status === 'unavailable' || b.status === 'unavailable')
            return reject(`Required comparison unavailable: ${id}`);
        if (a.status === 'pass' && b.status !== 'pass')
            return reject(`Required assertion regressed: ${id}`);
        if (a.status === 'fail' && b.status === 'pass')
            repaired = true;
    }
    const reversals = nudge.changes.filter(change => state.lastChanges.some(last => last.address === change.address && last.variable === change.variable && last.direction !== change.direction));
    for (const change of reversals) {
        const last = state.lastChanges.find(entry => entry.address === change.address && entry.variable === change.variable);
        if (last && round - last.round <= policy.cooldownRounds)
            return reject('Opposite nudge is inside the reversal cooldown');
    }
    let improved = false;
    for (const [id, margin] of Object.entries(policy.objectives)) {
        const a = before.get(id);
        const b = after.get(id);
        if (!a?.loss || !b?.loss || a.status === 'unavailable' || b.status === 'unavailable' || a.loss.unit !== b.loss.unit)
            return reject(`Objective bounds unavailable or units changed: ${id}`);
        if (b.loss.upper > a.loss.lower)
            return reject(`No robust nonregression established: ${id}`);
        if (a.loss.lower - b.loss.upper > margin * (reversals.length ? policy.reversalMultiplier : 1))
            improved = true;
    }
    if (!repaired && !improved)
        return reject('No hard repair or robust gain beyond the deadband');
    if (reversals.length && !improved)
        return reject('A reversal requires measured gain beyond the larger deadband');
    const lastChanges = state.lastChanges.filter(last => !nudge.changes.some(change => change.address === last.address && change.variable === last.variable));
    return { accepted: true, reason: repaired ? 'Hard defect repaired without required regressions' : 'Robust objective improvement', state: {
            contractDigest: state.contractDigest, acceptedDigests: [...state.acceptedDigests, candidate.artifactDigest],
            lastChanges: [...lastChanges, ...nudge.changes.map(change => ({ ...change, round }))], stalledRounds: 0, lastRound: round,
        } };
}
//# sourceMappingURL=admission.js.map