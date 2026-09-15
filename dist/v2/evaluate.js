import { digest, freezeJson, requireThat, text, validateObservation } from './validation.js';
export async function evaluateGate(gate, input, budget, options = {}) {
    input = freezeJson(structuredClone(input));
    text(input.artifact.id, 'Artifact ID');
    text(input.artifact.digest, 'Artifact digest');
    text(input.environmentDigest, 'Environment digest');
    requireThat(gate.digest === digest({ modules: gate.modules, cards: gate.assertions.map(a => a.card), policy: gate.policy }), 'Compiled contract mutated; recompile and rebaseline');
    const timeoutMs = options.timeoutMs ?? 30_000;
    requireThat(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 2_147_483_647, 'Invalid timeout');
    const contractDigest = digest({ gate: gate.digest, environment: input.environmentDigest });
    const inputDigest = digest({ contractDigest, artifact: input.artifact.digest, data: input.artifact.data });
    const results = [];
    const required = new Set();
    const markRequired = (id) => {
        if (required.has(id))
            return;
        required.add(id);
        gate.assertions.find(a => a.card.id === id)?.card.requires.forEach(markRequired);
    };
    gate.policy.required.forEach(markRequired);
    let interrupted = false;
    for (const assertion of gate.assertions) {
        const card = assertion.card;
        const unavailable = (reason) => {
            results.push({ assertionId: card.id, inputDigest, status: 'unavailable', findings: [], evidence: [], actualCost: {}, reason });
        };
        if (interrupted) {
            unavailable('Earlier runner timed out; no further work dispatched');
            continue;
        }
        if (card.requires.some(id => results.find(result => result.assertionId === id)?.status !== 'pass')) {
            unavailable('A prerequisite did not pass');
            results[results.length - 1].reasonCode = 'prerequisite-blocked';
            continue;
        }
        if (required.has(card.id) && card.evidenceKind === 'model-judgment' && card.calibration.status !== 'qualified') {
            unavailable('Model evaluator is not qualified for required-gate use');
            continue;
        }
        const reservation = `check:${card.id}:${inputDigest}`;
        if (!budget.reserve(reservation, card.costUpperBound)) {
            unavailable('Evaluation budget unavailable or a prior cost bound was exceeded');
            continue;
        }
        const controller = new AbortController();
        let timer;
        const spentBefore = budget.snapshot().spent;
        let settled = false;
        let reported;
        try {
            const observation = await Promise.race([
                Promise.resolve().then(() => assertion.evaluate({ ...input, signal: controller.signal })),
                new Promise((_, reject) => {
                    timer = setTimeout(() => { interrupted = true; controller.abort(); reject(new Error('Assertion timeout')); }, timeoutMs);
                }),
            ]);
            reported = observation;
            requireThat(gate.digest === digest({ modules: gate.modules, cards: gate.assertions.map(a => a.card), policy: gate.policy }), 'Contract mutated during evaluation');
            validateObservation(observation);
            budget.settle(reservation, observation.actualCost);
            settled = true;
            results.push({ ...observation, assertionId: card.id, inputDigest,
                ...(budget.snapshot().exceeded ? { status: 'unavailable', reason: 'Runner exceeded its reserved cost; further spending disabled' } : {}),
            });
        }
        catch (error) {
            if (!settled)
                budget.failReservation(reservation, reported?.actualCost);
            unavailable(error instanceof Error ? error.message : String(error));
            results[results.length - 1].actualCost = Object.fromEntries(Object.entries(budget.snapshot().spent).map(([unit, value]) => [unit, value - (Object.hasOwn(spentBefore, unit) ? spentBefore[unit] : 0)]).filter(([, value]) => value !== 0));
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    const hard = results.filter(result => required.has(result.assertionId));
    const status = hard.some(result => result.status === 'fail') ? 'fail' : hard.some(result => result.status !== 'pass') || budget.snapshot().exceeded ? 'unavailable' : 'pass';
    return { artifactDigest: input.artifact.digest, inputDigest, requiredAssertions: [...required], contractDigest, status, results, budget: budget.snapshot() };
}
//# sourceMappingURL=evaluate.js.map