import { admitCandidate, initialLoopState } from './admission.js';
import type { AdmissionPolicy, LoopState } from './admission.js';
import { BudgetLedger } from './budget.js';
import { DurableRun, isDurabilityInterruption } from './durability.js';
import { evaluateGate } from './evaluate.js';
import { planNudges } from './nudges.js';
import { executeRemediation } from './remediation.js';
import type { RemediationHarness, RemediationOutput, RemediationRequest } from './remediation.js';
import type { Artifact, CompiledGate, Cost, Evaluation, EvaluationContext, Nudge } from './types.js';
import { digest, freezeJson, requireThat, text, unique, validateCost, validateObservation } from './validation.js';

export interface ProposalContext { artifact: Artifact; evaluation: Evaluation; round: number; state: LoopState; signal: AbortSignal; operationId?: string }
export interface NudgeProposal { nudges: Nudge[]; actualCost: Cost }
export type LoopStopReason = 'pass' | 'stalled' | 'cycle' | 'incomplete' | 'budget' | 'round-limit';
export type NudgePlan = ReturnType<typeof planNudges>;
export interface LoopEvent {
  round: number;
  phase: 'baseline' | 'proposal' | 'plan' | 'repair' | 'evaluation' | 'admission' | 'stop';
  status: string;
  reason?: string;
  artifactDigest?: string;
  nudgeId?: string;
  actualCost?: Cost;
  plan?: NudgePlan;
}
export interface QualityLoopOptions {
  gate: CompiledGate;
  artifact: Artifact;
  environmentDigest: string;
  available?: EvaluationContext['available'];
  budget: BudgetLedger;
  admission: AdmissionPolicy;
  /** Counts attempted proposal/repair rounds independently of all monetary/token/evaluation budgets. */
  maxRounds: number;
  proposalCostUpperBound: Cost;
  propose(context: ProposalContext): Promise<NudgeProposal>;
  harnesses?: readonly RemediationHarness[];
  enabledHarnessIds?: readonly string[];
  /** Passing this function explicitly enables this generator; registered external harnesses remain opt-in. */
  candidateGenerator?: (request: RemediationRequest) => Promise<RemediationOutput>;
  /** Provide a fresh isolated checkout per attempt. The engine never publishes or copies candidates back. */
  prepareWorkspace?: (context: { artifact: Artifact; nudge: Nudge; round: number; signal: AbortSignal }) => Promise<string>;
  evaluationTimeoutMs?: number;
  proposalTimeoutMs?: number;
  repairTimeoutMs?: number;
  /** False permits objective optimization after the required assertions pass. Defaults to true. */
  stopOnGatePass?: boolean;
  durability?: DurableRun;
  /** Caller-owned immutable versions for the proposal, repair and optional workspace implementation/configuration. */
  executionIdentity?: { proposal: string; repair: string; workspace?: string };
}
export interface QualityLoopResult {
  artifact: Artifact;
  evaluation: Evaluation;
  state: LoopState;
  rounds: number;
  stopReason: LoopStopReason;
  events: LoopEvent[];
  budget: ReturnType<BudgetLedger['snapshot']>;
}

export interface LoopCheckpoint {
  version: 1;
  optionsDigest: string;
  phase: 'baseline' | 'ready' | 'proposal' | 'plan' | 'repair' | 'evaluation' | 'admission' | 'done';
  artifact: Artifact;
  evaluation?: Evaluation;
  state?: LoopState;
  events: LoopEvent[];
  rounds: number;
  attempted: string[];
  proposal?: NudgeProposal;
  nudge?: Nudge;
  candidate?: Artifact;
  candidateEvaluation?: Evaluation;
  stopReason?: LoopStopReason;
}

/**
 * One intervention per round; re-plan after observing its complete gate evaluation.
 * A durable run persists each phase and each paid operation before advancing. Unknown outcomes
 * stop with ReconciliationRequired; reopening never grants permission to repeat external work.
 */
export async function runQualityLoop(options: QualityLoopOptions): Promise<QualityLoopResult> {
  options = { ...options, artifact: freezeJson(structuredClone(options.artifact)), admission: freezeJson(structuredClone(options.admission)),
    proposalCostUpperBound: freezeJson(structuredClone(options.proposalCostUpperBound)), harnesses: (options.harnesses ?? []).map(harness => ({ id: harness.id, run: harness.run.bind(harness) })),
    enabledHarnessIds: [...(options.enabledHarnessIds ?? [])],
    ...(options.available ? { available: freezeJson(structuredClone(options.available)) } : {}),
    ...(options.executionIdentity ? { executionIdentity: freezeJson(structuredClone(options.executionIdentity)) } : {}),
  };
  const { gate, budget, durability } = options;
  unique((options.harnesses ?? []).map(harness => harness.id), 'Registered harness IDs');
  unique([...(options.enabledHarnessIds ?? [])], 'Enabled harness IDs');
  requireThat(Number.isInteger(options.maxRounds) && options.maxRounds >= 0, 'maxRounds must be a nonnegative integer');
  requireThat(Number.isInteger(options.admission.maxStalledRounds) && options.admission.maxStalledRounds > 0, 'Stall window must be positive');
  requireThat(options.admission.gate.required.length === gate.policy.required.length && options.admission.gate.required.every(id => gate.policy.required.includes(id)), 'Admission required assertions must match the compiled gate');
  unique(options.admission.gate.required, 'Admission required assertions');
  validateCost(options.proposalCostUpperBound); budget.assertCovered(options.proposalCostUpperBound);
  const proposalTimeoutMs = options.proposalTimeoutMs ?? 30_000;
  const repairTimeoutMs = options.repairTimeoutMs ?? 60_000;
  for (const value of [proposalTimeoutMs, repairTimeoutMs]) requireThat(Number.isInteger(value) && value > 0 && value <= 2_147_483_647, 'Invalid loop timeout');
  if (durability) {
    requireThat(budget === durability.budget, 'Loop must use its durable ledger');
    durability.assertIdentity(gate.digest, options.environmentDigest);
    requireThat(options.executionIdentity, 'Durable loops require explicit proposal and repair implementation/configuration identities');
    text(options.executionIdentity.proposal, 'Proposal execution identity'); text(options.executionIdentity.repair, 'Repair execution identity');
    if (options.prepareWorkspace) text(options.executionIdentity.workspace, 'Workspace execution identity');
  }
  const optionsDigest = digest({ gate: gate.digest, environment: options.environmentDigest, initialArtifact: options.artifact, available: options.available ?? null,
    admission: options.admission, maxRounds: options.maxRounds, proposalCostUpperBound: options.proposalCostUpperBound,
    proposalTimeoutMs, repairTimeoutMs, evaluationTimeoutMs: options.evaluationTimeoutMs ?? 30_000,
    stopOnGatePass: options.stopOnGatePass ?? true, executionIdentity: options.executionIdentity ?? null,
    enabledHarnessIds: [...(options.enabledHarnessIds ?? [])].sort(), registeredHarnessIds: (options.harnesses ?? []).map(value => value.id).sort(),
    suppliedGenerator: Boolean(options.candidateGenerator), workspacePreparation: Boolean(options.prepareWorkspace) });
  const checkpoint: LoopCheckpoint = durability?.readCheckpoint<LoopCheckpoint>() ?? {
    version: 1, optionsDigest, phase: 'baseline', artifact: structuredClone(options.artifact), events: [], rounds: 0, attempted: [],
  };
  validateCheckpoint(checkpoint, optionsDigest, gate.digest, options.environmentDigest, options.available);
  const save = (boundary: string): void => durability?.saveCheckpoint(checkpoint, boundary);
  if (!durability?.readCheckpoint()) save('loop:initialized');
  const result = (): QualityLoopResult => {
    requireThat(checkpoint.evaluation && checkpoint.state && checkpoint.stopReason, 'Terminal loop checkpoint is incomplete');
    return structuredClone({ artifact: checkpoint.artifact, evaluation: checkpoint.evaluation, state: checkpoint.state,
      rounds: checkpoint.rounds, stopReason: checkpoint.stopReason, events: checkpoint.events, budget: budget.snapshot() });
  };
  const stop = (stopReason: LoopStopReason, reason: string): QualityLoopResult => {
    checkpoint.events.push({ round: checkpoint.rounds, phase: 'stop', status: stopReason, reason, artifactDigest: checkpoint.artifact.digest });
    checkpoint.stopReason = stopReason; checkpoint.phase = 'done'; save('loop:stop'); return result();
  };
  const incomplete = (value: Evaluation): LoopStopReason | undefined => {
    const relevant = value.results.filter(entry => value.requiredAssertions.includes(entry.assertionId) || Object.hasOwn(options.admission.objectives, entry.assertionId));
    if (budget.snapshot().exceeded || relevant.some(entry => entry.reason?.startsWith('Evaluation budget unavailable'))) return 'budget';
    if (relevant.some(entry => entry.status === 'unavailable' && entry.reasonCode !== 'prerequisite-blocked')) return 'incomplete';
    return undefined;
  };
  for (;;) {
    if (checkpoint.phase === 'done') return result();
    if (checkpoint.phase === 'baseline') {
      const evaluation = await evaluateGate(gate, { artifact: checkpoint.artifact, environmentDigest: options.environmentDigest, ...(options.available ? { available: options.available } : {}) }, budget, { timeoutMs: options.evaluationTimeoutMs, durability });
      checkpoint.evaluation = evaluation; checkpoint.state = initialLoopState(evaluation);
      checkpoint.events.push({ round: 0, phase: 'baseline', status: evaluation.status, artifactDigest: checkpoint.artifact.digest });
      checkpoint.phase = 'ready'; save('loop:baseline');
    }
    requireThat(checkpoint.evaluation && checkpoint.state, 'Loop checkpoint has no accepted evaluation or history');
    const evaluation = checkpoint.evaluation; const artifact = checkpoint.artifact; const state = checkpoint.state;
    if (checkpoint.phase === 'ready') {
      const incompleteReason = incomplete(evaluation);
      if (incompleteReason) return stop(incompleteReason, 'Accepted evaluation did not complete; no repair dispatched');
      if ((options.stopOnGatePass ?? true) && evaluation.status === 'pass') return stop('pass', 'The required assertion subset passed');
      if (state.stalledRounds >= options.admission.maxStalledRounds) return stop('stalled', 'Consecutive rejected candidates exhausted the stall window; unresolved defects remain');
      if (checkpoint.rounds >= options.maxRounds) return stop('round-limit', 'The independent iteration limit was reached');
      checkpoint.rounds++; checkpoint.phase = 'proposal';
      delete checkpoint.proposal; delete checkpoint.nudge; delete checkpoint.candidate; delete checkpoint.candidateEvaluation;
      save('loop:round');
    }
    const round = checkpoint.rounds;
    if (checkpoint.phase === 'proposal') {
      const rawId = `proposal:${round}:${evaluation.contractDigest}:${artifact.digest}`;
      const reservationId = durability?.key(rawId) ?? rawId;
      if (!budget.reserve(reservationId, options.proposalCostUpperBound)) return stop('budget', 'Proposal budget unavailable');
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false; let proposal: NudgeProposal | undefined;
      try {
        const dispatch = () => Promise.race([
          Promise.resolve().then(() => options.propose({ ...structuredClone({ artifact, evaluation, round, state }), signal: controller.signal, operationId: reservationId })),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Proposal timeout')); }, proposalTimeoutMs); }),
        ]);
        proposal = durability ? await durability.operation(reservationId, { kind: 'proposal', artifact, contractDigest: evaluation.contractDigest, round, state }, dispatch) : await dispatch();
        proposal = structuredClone(proposal);
        budget.settle(reservationId, proposal.actualCost); settled = true;
        requireThat(Array.isArray(proposal.nudges), 'Proposal must contain a nudge array');
        checkpoint.proposal = proposal;
        checkpoint.events.push({ round, phase: 'proposal', status: 'complete', actualCost: proposal.actualCost });
      } catch (error) {
        if (isDurabilityInterruption(error)) throw error;
        if (!settled) budget.failReservation(reservationId, proposal?.actualCost);
        checkpoint.events.push({ round, phase: 'proposal', status: 'unavailable', reason: error instanceof Error ? error.message : String(error) });
        return stop(budget.snapshot().exceeded ? 'budget' : 'incomplete', 'Proposal failed; reserved work was charged');
      } finally { if (timer) clearTimeout(timer); }
      if (budget.snapshot().exceeded) return stop('budget', 'Proposal exceeded its cost upper bound');
      checkpoint.phase = 'plan'; save('loop:proposal');
    }
    if (checkpoint.phase === 'plan') {
      let plan: NudgePlan;
      try {
        requireThat(checkpoint.proposal, 'Loop proposal is missing');
        plan = planNudges(checkpoint.proposal.nudges, evaluation.results.filter(entry => entry.status === 'pass' && evaluation.requiredAssertions.includes(entry.assertionId)).map(entry => entry.assertionId));
        for (const nudge of checkpoint.proposal.nudges) {
          requireThat(gate.assertions.some(assertion => assertion.card.id === nudge.assertionId), `Nudge references an assertion outside the gate: ${nudge.assertionId}`);
          budget.assertCovered(nudge.costUpperBound);
        }
      } catch (error) { return stop('incomplete', `Invalid nudge proposal: ${error instanceof Error ? error.message : String(error)}`); }
      checkpoint.events.push({ round, phase: 'plan', status: plan.selected.length ? 'selected' : 'unresolved', plan });
      if (!plan.selected.length) return stop('stalled', 'No executable conflict-resolved nudge was proposed; unresolved defects remain');
      checkpoint.nudge = plan.selected[0]; checkpoint.phase = 'repair'; save('loop:plan');
    }
    const nudge = checkpoint.nudge; requireThat(nudge, 'Loop checkpoint has no selected nudge');
    if (checkpoint.phase === 'repair') {
      const suppliedGenerator = options.candidateGenerator;
      const injectedId = '__quality_sgd_injected_generator__';
      const registered = options.harnesses ?? [];
      requireThat(!suppliedGenerator || !registered.some(harness => harness.id === injectedId), 'Reserved injected generator harness ID');
      const delegate = suppliedGenerator ? { id: injectedId, run: suppliedGenerator } : registered.find(harness => harness.id === nudge.remediation?.harnessId);
      const wrappedHarnesses: RemediationHarness[] = delegate ? [{ id: delegate.id, async run(request) {
        const candidateWorkspace = await options.prepareWorkspace?.({ artifact: request.artifact, nudge: request.nudge, round, signal: request.signal });
        if (request.signal.aborted) throw new Error('Repair cancelled while preparing its candidate workspace');
        return delegate.run({ ...request, candidateWorkspace });
      } }] : [];
      const rawId = `repair:${round}:${artifact.digest}:${nudge.id}`;
      const repaired = await executeRemediation({ request: { artifact, environmentDigest: options.environmentDigest, nudge },
        harnesses: wrappedHarnesses, enabledHarnessIds: suppliedGenerator ? [injectedId] : options.enabledHarnessIds,
        harnessId: suppliedGenerator ? injectedId : undefined, budget, durability,
        reservationId: durability?.key(rawId) ?? rawId, timeoutMs: repairTimeoutMs });
      checkpoint.events.push({ round, phase: 'repair', status: repaired.status, nudgeId: nudge.id, actualCost: repaired.actualCost,
        ...('reason' in repaired ? { reason: repaired.reason } : { artifactDigest: repaired.artifact.digest }) });
      if (repaired.status !== 'candidate') return stop(repaired.status === 'budget' || budget.snapshot().exceeded ? 'budget' : 'incomplete', 'No candidate is available for complete-gate verification');
      if (state.acceptedDigests.includes(repaired.artifact.digest) || checkpoint.attempted.includes(repaired.artifact.digest)) return stop('cycle', 'Repair returned an accepted or previously attempted artifact; no further evaluation spending');
      checkpoint.candidate = repaired.artifact; checkpoint.attempted.push(repaired.artifact.digest); checkpoint.phase = 'evaluation'; save('loop:candidate');
    }
    const candidate = checkpoint.candidate; requireThat(candidate, 'Loop checkpoint has no candidate');
    if (checkpoint.phase === 'evaluation') {
      const candidateEvaluation = await evaluateGate(gate, { artifact: candidate, environmentDigest: options.environmentDigest, ...(options.available ? { available: options.available } : {}) }, budget, { timeoutMs: options.evaluationTimeoutMs, durability });
      checkpoint.candidateEvaluation = candidateEvaluation;
      checkpoint.events.push({ round, phase: 'evaluation', status: candidateEvaluation.status, artifactDigest: candidate.digest, nudgeId: nudge.id });
      const incompleteReason = incomplete(candidateEvaluation);
      if (incompleteReason) return stop(incompleteReason, 'Candidate evaluation was incomplete; current accepted artifact retained');
      checkpoint.phase = 'admission'; save('loop:evaluation');
    }
    requireThat(checkpoint.candidateEvaluation, 'Loop checkpoint has no candidate evaluation');
    const admission = admitCandidate(evaluation, checkpoint.candidateEvaluation, nudge, round, options.admission, state);
    checkpoint.state = admission.state;
    checkpoint.events.push({ round, phase: 'admission', status: admission.accepted ? 'accepted' : 'rejected', reason: admission.reason, artifactDigest: candidate.digest, nudgeId: nudge.id });
    if (admission.accepted) { checkpoint.artifact = candidate; checkpoint.evaluation = checkpoint.candidateEvaluation; }
    checkpoint.phase = 'ready'; save('loop:admission');
  }
}

function validateCheckpoint(checkpoint: LoopCheckpoint, optionsDigest: string, gateDigest: string, environmentDigest: string, available?: EvaluationContext['available']): void {
  requireThat(checkpoint?.version === 1 && checkpoint.optionsDigest === optionsDigest, 'Loop checkpoint contract or execution settings changed; rebaseline explicitly');
  digest(checkpoint);
  requireThat(['baseline', 'ready', 'proposal', 'plan', 'repair', 'evaluation', 'admission', 'done'].includes(checkpoint.phase), 'Invalid loop checkpoint phase');
  requireThat(Number.isSafeInteger(checkpoint.rounds) && checkpoint.rounds >= 0 && Array.isArray(checkpoint.events), 'Invalid loop checkpoint counters/events');
  unique(checkpoint.attempted, 'Attempted artifact digests');
  text(checkpoint.artifact.id, 'Checkpoint artifact ID'); text(checkpoint.artifact.digest, 'Checkpoint artifact digest');
  requireThat(checkpoint.events.every((event, index) => Number.isSafeInteger(event.round) && event.round >= 0 && event.round <= checkpoint.rounds && (index === 0 || event.round >= checkpoint.events[index - 1].round)), 'Checkpoint event rounds exceed or reorder recorded history');
  if (checkpoint.phase !== 'baseline') {
    requireThat(checkpoint.evaluation && checkpoint.state, 'Checkpoint accepted evidence/history missing');
    requireThat(checkpoint.evaluation.artifactDigest === checkpoint.artifact.digest && checkpoint.state.contractDigest === checkpoint.evaluation.contractDigest, 'Checkpoint admitted artifact/evidence mismatch');
    requireThat(checkpoint.state.acceptedDigests.at(-1) === checkpoint.artifact.digest, 'Checkpoint admission history disagrees with accepted artifact');
    unique(checkpoint.state.acceptedDigests, 'Accepted artifact digests');
    requireThat(Number.isSafeInteger(checkpoint.state.lastRound) && checkpoint.state.lastRound >= 0 && checkpoint.state.lastRound <= checkpoint.rounds, 'Checkpoint admission round mismatch');
    requireThat(Number.isSafeInteger(checkpoint.state.stalledRounds) && checkpoint.state.stalledRounds >= 0, 'Invalid checkpoint stall counter');
    const lastRound = checkpoint.state.lastRound;
    requireThat(checkpoint.state.lastChanges.every(change => Number.isSafeInteger(change.round) && change.round > 0 && change.round <= lastRound), 'Invalid checkpoint reversal history');
    const admissions = checkpoint.events.filter(event => event.phase === 'admission');
    requireThat((admissions.at(-1)?.round ?? 0) === lastRound, 'Checkpoint admission events disagree with the recorded round');
    let stalls = 0;
    for (const event of admissions) {
      requireThat(event.status === 'accepted' || event.status === 'rejected', 'Invalid recorded admission verdict');
      stalls = event.status === 'accepted' ? 0 : stalls + 1;
    }
    requireThat(stalls === checkpoint.state.stalledRounds, 'Checkpoint stall count disagrees with admission history');
    const accepted = [checkpoint.events.find(event => event.phase === 'baseline')?.artifactDigest, ...admissions.filter(event => event.status === 'accepted').map(event => event.artifactDigest)];
    requireThat(digest(accepted) === digest(checkpoint.state.acceptedDigests), 'Checkpoint accepted history disagrees with admission events');
    for (const evaluation of [checkpoint.evaluation, checkpoint.candidateEvaluation].filter(Boolean) as Evaluation[]) {
      const evaluatedArtifact = evaluation === checkpoint.evaluation ? checkpoint.artifact : checkpoint.candidate;
      const contractDigest = digest({ gate: gateDigest, environment: environmentDigest });
      requireThat(evaluatedArtifact && evaluation.contractDigest === contractDigest, 'Checkpoint evaluation contract mismatch');
      requireThat(evaluation.inputDigest === digest({ contractDigest, artifact: evaluatedArtifact.digest, data: evaluatedArtifact.data, available: available ?? null }), 'Checkpoint evaluation input identity mismatch');
      evaluation.results.forEach(validateObservation);
      requireThat(evaluation.results.every(result => result.inputDigest === evaluation.inputDigest), 'Mixed checkpoint evaluation inputs');
    }
  }
  if (['plan', 'repair', 'evaluation', 'admission'].includes(checkpoint.phase)) requireThat(checkpoint.proposal, 'Checkpoint proposal missing');
  if (['repair', 'evaluation', 'admission'].includes(checkpoint.phase)) requireThat(checkpoint.nudge, 'Checkpoint selected nudge missing');
  if (['evaluation', 'admission'].includes(checkpoint.phase)) requireThat(checkpoint.candidate && checkpoint.attempted.includes(checkpoint.candidate.digest), 'Checkpoint candidate/attempt history missing');
  if (checkpoint.phase === 'admission') requireThat(checkpoint.candidateEvaluation?.artifactDigest === checkpoint.candidate?.digest, 'Checkpoint candidate evaluation mismatch');
  if (checkpoint.phase === 'done') requireThat(checkpoint.stopReason && checkpoint.events.at(-1)?.phase === 'stop', 'Terminal checkpoint missing stop evidence');
}
