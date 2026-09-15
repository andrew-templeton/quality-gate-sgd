import { BudgetLedger } from './budget.js';
import type { AssertionResult, CompiledGate, Evaluation, EvaluationContext, Observation } from './types.js';
import { digest, freezeJson, requireThat, text, validateObservation } from './validation.js';
import { compiledGateDigest } from './catalog.js';
import { prepareInput } from './contracts.js';
import { DurableRun, isDurabilityInterruption } from './durability.js';

export async function evaluateGate(
  gate: CompiledGate,
  input: Omit<EvaluationContext, 'signal' | 'operationId'>,
  budget: BudgetLedger,
  options: { timeoutMs?: number; durability?: DurableRun } = {},
): Promise<Evaluation> {
  digest(input);
  input = freezeJson(structuredClone(input));
  text(input.artifact.id, 'Artifact ID'); text(input.artifact.digest, 'Artifact digest'); text(input.environmentDigest, 'Environment digest');
  requireThat(gate.digest === compiledGateDigest(gate), 'Compiled contract mutated; recompile and rebaseline');
  if (options.durability) {
    requireThat(budget === options.durability.budget, 'Use the durable run ledger');
    options.durability.assertIdentity(gate.digest, input.environmentDigest);
  }
  gate.assertions.forEach(assertion => budget.assertCovered(assertion.card.costUpperBound));
  const timeoutMs = options.timeoutMs ?? 30_000;
  requireThat(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 2_147_483_647, 'Invalid timeout');
  const contractDigest = digest({ gate: gate.digest, environment: input.environmentDigest });
  const inputDigest = digest({ contractDigest, artifact: input.artifact.digest, data: input.artifact.data, available: input.available ?? null });
  const inputErrors = new Map<string, string>();
  // Inspect every executable binding before dispatching any paid assertion work.
  for (const assertion of gate.assertions) if (assertion.contract) {
    try { prepareInput(assertion.contract.input, input); }
    catch (error) { inputErrors.set(assertion.card.id, error instanceof Error ? error.message : String(error)); }
  }
  const results: AssertionResult[] = [];
  const required = new Set<string>();
  const markRequired = (id: string): void => {
    if (required.has(id)) return; required.add(id);
    gate.assertions.find(a => a.card.id === id)?.card.requires.forEach(markRequired);
  };
  gate.policy.required.forEach(markRequired);
  let interrupted = false;
  for (const assertion of gate.assertions) {
    const card = assertion.card;
    const unavailable = (reason: string): void => {
      results.push({ assertionId: card.id, inputDigest, status: 'unavailable', findings: [], evidence: [], actualCost: {}, reason });
    };
    if (interrupted) { unavailable('Earlier runner timed out; no further work dispatched'); continue; }
    if (inputErrors.has(card.id)) { unavailable(inputErrors.get(card.id) as string); continue; }
    if (card.requires.some(id => results.find(result => result.assertionId === id)?.status !== 'pass')) {
      unavailable('A prerequisite did not pass'); results[results.length - 1].reasonCode = 'prerequisite-blocked'; continue;
    }
    if (required.has(card.id) && card.evidenceKind === 'model-judgment' && card.calibration.status !== 'qualified') {
      unavailable('Model evaluator is not qualified for required-gate use'); continue;
    }
    const rawReservation = `check:${card.id}:${inputDigest}`;
    const reservation = options.durability?.key(rawReservation) ?? rawReservation;
    if (!budget.reserve(reservation, card.costUpperBound)) { unavailable('Evaluation budget unavailable or a prior cost bound was exceeded'); continue; }
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const spentBefore = budget.snapshot().spent;
    let settled = false;
    let reported: Observation | undefined;
    try {
      const dispatch = (): Promise<Observation> => Promise.race([
        Promise.resolve().then(() => assertion.evaluate({ ...input, signal: controller.signal, operationId: reservation })),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { interrupted = true; controller.abort(); reject(new Error('Assertion timeout')); }, timeoutMs);
        }),
      ]);
      const observation = options.durability
        ? await options.durability.operation(reservation, { kind: 'assertion', assertionId: card.id, inputDigest }, dispatch)
        : await dispatch();
      reported = observation;
      requireThat(gate.digest === compiledGateDigest(gate), 'Contract mutated during evaluation');
      validateObservation(observation);
      budget.settle(reservation, observation.actualCost); settled = true;
      results.push({ ...observation, assertionId: card.id, inputDigest,
        ...(budget.snapshot().exceeded ? { status: 'unavailable' as const, reason: 'Runner exceeded its reserved cost; further spending disabled' } : {}),
      });
    } catch (error) {
      if (isDurabilityInterruption(error)) throw error;
      if (!settled) budget.failReservation(reservation, reported?.actualCost);
      unavailable(error instanceof Error ? error.message : String(error));
      results[results.length - 1].actualCost = Object.fromEntries(Object.entries(budget.snapshot().spent).map(([unit, value]) => [unit, value - (Object.hasOwn(spentBefore, unit) ? spentBefore[unit] : 0)]).filter(([, value]) => value !== 0));
    } finally { if (timer) clearTimeout(timer); }
  }
  const hard = results.filter(result => required.has(result.assertionId));
  const status = hard.some(result => result.status === 'fail') ? 'fail' : hard.some(result => result.status !== 'pass') || budget.snapshot().exceeded ? 'unavailable' : 'pass';
  return { artifactDigest: input.artifact.digest, inputDigest, requiredAssertions: [...required], contractDigest, status, results, budget: budget.snapshot() };
}
