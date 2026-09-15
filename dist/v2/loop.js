import { admitCandidate, initialLoopState } from './admission.js';
import { evaluateGate } from './evaluate.js';
import { planNudges } from './nudges.js';
import { executeRemediation } from './remediation.js';
import { requireThat, unique, validateCost } from './validation.js';
/**
 * One intervention per round; re-plan after observing its complete gate evaluation.
 * Nudge effects are hypotheses, never substitutes for the admission evidence.
 * Callbacks must honor AbortSignal; timeout stops dispatch but cannot sandbox arbitrary JavaScript.
 */
export async function runQualityLoop(options) {
    const { gate, budget } = options;
    unique((options.harnesses ?? []).map(harness => harness.id), 'Registered harness IDs');
    unique([...(options.enabledHarnessIds ?? [])], 'Enabled harness IDs');
    requireThat(Number.isInteger(options.maxRounds) && options.maxRounds >= 0, 'maxRounds must be a nonnegative integer');
    requireThat(Number.isInteger(options.admission.maxStalledRounds) && options.admission.maxStalledRounds > 0, 'Stall window must be positive');
    requireThat(options.admission.gate.required.length === gate.policy.required.length && options.admission.gate.required.every(id => gate.policy.required.includes(id)), 'Admission required assertions must match the compiled gate');
    unique(options.admission.gate.required, 'Admission required assertions');
    validateCost(options.proposalCostUpperBound);
    budget.assertCovered(options.proposalCostUpperBound);
    const proposalTimeoutMs = options.proposalTimeoutMs ?? 30_000;
    const repairTimeoutMs = options.repairTimeoutMs ?? 60_000;
    for (const value of [proposalTimeoutMs, repairTimeoutMs])
        requireThat(Number.isInteger(value) && value > 0 && value <= 2_147_483_647, 'Invalid loop timeout');
    let artifact = structuredClone(options.artifact);
    let evaluation = await evaluateGate(gate, { artifact, environmentDigest: options.environmentDigest }, budget, { timeoutMs: options.evaluationTimeoutMs });
    let state = initialLoopState(evaluation);
    const events = [{ round: 0, phase: 'baseline', status: evaluation.status, artifactDigest: artifact.digest }];
    let rounds = 0;
    const stop = (stopReason, reason) => {
        events.push({ round: rounds, phase: 'stop', status: stopReason, reason, artifactDigest: artifact.digest });
        return { artifact, evaluation, state, rounds, stopReason, events, budget: budget.snapshot() };
    };
    const incomplete = (value) => {
        const relevant = value.results.filter(result => value.requiredAssertions.includes(result.assertionId) || Object.hasOwn(options.admission.objectives, result.assertionId));
        if (budget.snapshot().exceeded || relevant.some(result => result.reason?.startsWith('Evaluation budget unavailable')))
            return 'budget';
        if (relevant.some(result => result.status === 'unavailable' && result.reasonCode !== 'prerequisite-blocked'))
            return 'incomplete';
        return undefined;
    };
    const baselineIncomplete = incomplete(evaluation);
    if (baselineIncomplete)
        return stop(baselineIncomplete, 'Baseline evaluation did not complete; no repair dispatched');
    if ((options.stopOnGatePass ?? true) && evaluation.status === 'pass')
        return stop('pass', 'The required assertion subset passed');
    const attempted = new Set();
    for (let round = 1; round <= options.maxRounds; round++) {
        rounds = round;
        const reservationId = `proposal:${round}:${evaluation.contractDigest}:${artifact.digest}`;
        if (!budget.reserve(reservationId, options.proposalCostUpperBound))
            return stop('budget', 'Proposal budget unavailable');
        const proposalController = new AbortController();
        let proposalTimer;
        let proposalSettled = false;
        let proposal;
        try {
            proposal = await Promise.race([
                Promise.resolve().then(() => options.propose({ ...structuredClone({ artifact, evaluation, round, state }), signal: proposalController.signal })),
                new Promise((_, reject) => {
                    proposalTimer = setTimeout(() => { proposalController.abort(); reject(new Error('Proposal timeout')); }, proposalTimeoutMs);
                }),
            ]);
            proposal = structuredClone(proposal);
            budget.settle(reservationId, proposal.actualCost);
            proposalSettled = true;
            requireThat(Array.isArray(proposal.nudges), 'Proposal must contain a nudge array');
            events.push({ round, phase: 'proposal', status: 'complete', actualCost: proposal.actualCost });
        }
        catch (error) {
            if (!proposalSettled)
                budget.failReservation(reservationId, proposal?.actualCost);
            events.push({ round, phase: 'proposal', status: 'unavailable', reason: error instanceof Error ? error.message : String(error) });
            return stop(budget.snapshot().exceeded ? 'budget' : 'incomplete', 'Proposal failed; reserved work was charged');
        }
        finally {
            if (proposalTimer)
                clearTimeout(proposalTimer);
        }
        if (budget.snapshot().exceeded)
            return stop('budget', 'Proposal exceeded its cost upper bound');
        let plan;
        try {
            plan = planNudges(proposal.nudges, evaluation.results.filter(result => result.status === 'pass' && evaluation.requiredAssertions.includes(result.assertionId)).map(result => result.assertionId));
            for (const nudge of proposal.nudges) {
                requireThat(gate.assertions.some(assertion => assertion.card.id === nudge.assertionId), `Nudge references an assertion outside the gate: ${nudge.assertionId}`);
                for (const unit of Object.keys(nudge.costUpperBound))
                    requireThat(Object.hasOwn(budget.snapshot().limits, unit), `No repair budget declared for ${unit}`);
            }
        }
        catch (error) {
            return stop('incomplete', `Invalid nudge proposal: ${error instanceof Error ? error.message : String(error)}`);
        }
        events.push({ round, phase: 'plan', status: plan.selected.length ? 'selected' : 'unresolved', plan });
        if (!plan.selected.length)
            return stop('stalled', 'No executable conflict-resolved nudge was proposed; unresolved defects remain');
        const nudge = plan.selected[0];
        const suppliedGenerator = options.candidateGenerator;
        const injectedId = '__quality_sgd_injected_generator__';
        const registered = options.harnesses ?? [];
        requireThat(!suppliedGenerator || !registered.some(harness => harness.id === injectedId), 'Reserved injected generator harness ID');
        const delegate = suppliedGenerator ? { id: injectedId, run: suppliedGenerator } : registered.find(harness => harness.id === nudge.remediation?.harnessId);
        // Workspace preparation is charged and timed as part of the same repair reservation.
        const wrappedHarnesses = delegate ? [{ id: delegate.id, async run(request) {
                    const candidateWorkspace = await options.prepareWorkspace?.({ artifact: request.artifact, nudge: request.nudge, round, signal: request.signal });
                    if (request.signal.aborted)
                        throw new Error('Repair cancelled while preparing its candidate workspace');
                    return delegate.run({ ...request, candidateWorkspace });
                } }] : [];
        const repaired = await executeRemediation({
            request: { artifact, environmentDigest: options.environmentDigest, nudge },
            harnesses: wrappedHarnesses,
            enabledHarnessIds: suppliedGenerator ? [injectedId] : options.enabledHarnessIds,
            harnessId: suppliedGenerator ? injectedId : undefined,
            budget, reservationId: `repair:${round}:${artifact.digest}:${nudge.id}`, timeoutMs: repairTimeoutMs,
        });
        events.push({ round, phase: 'repair', status: repaired.status, nudgeId: nudge.id, actualCost: repaired.actualCost,
            ...('reason' in repaired ? { reason: repaired.reason } : { artifactDigest: repaired.artifact.digest }) });
        if (repaired.status !== 'candidate')
            return stop(repaired.status === 'budget' || budget.snapshot().exceeded ? 'budget' : 'incomplete', 'No candidate is available for complete-gate verification');
        const candidate = repaired.artifact;
        if (state.acceptedDigests.includes(candidate.digest) || attempted.has(candidate.digest))
            return stop('cycle', 'Repair returned an accepted or previously attempted artifact; no further evaluation spending');
        attempted.add(candidate.digest);
        const candidateEvaluation = await evaluateGate(gate, { artifact: candidate, environmentDigest: options.environmentDigest }, budget, { timeoutMs: options.evaluationTimeoutMs });
        events.push({ round, phase: 'evaluation', status: candidateEvaluation.status, artifactDigest: candidate.digest, nudgeId: nudge.id });
        const candidateIncomplete = incomplete(candidateEvaluation);
        if (candidateIncomplete)
            return stop(candidateIncomplete, 'Candidate evaluation was incomplete; current accepted artifact retained');
        const admission = admitCandidate(evaluation, candidateEvaluation, nudge, round, options.admission, state);
        state = admission.state;
        events.push({ round, phase: 'admission', status: admission.accepted ? 'accepted' : 'rejected', reason: admission.reason, artifactDigest: candidate.digest, nudgeId: nudge.id });
        if (admission.accepted) {
            artifact = candidate;
            evaluation = candidateEvaluation;
        }
        if ((options.stopOnGatePass ?? true) && evaluation.status === 'pass')
            return stop('pass', 'The admitted artifact passed the required assertion subset');
        if (state.stalledRounds >= options.admission.maxStalledRounds)
            return stop('stalled', 'Consecutive rejected candidates exhausted the stall window; unresolved defects remain');
    }
    return stop('round-limit', 'The independent iteration limit was reached');
}
//# sourceMappingURL=loop.js.map