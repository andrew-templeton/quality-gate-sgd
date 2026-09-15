import type { AdmissionPolicy, LoopState } from './admission.js';
import { BudgetLedger } from './budget.js';
import { DurableRun } from './durability.js';
import { planNudges } from './nudges.js';
import type { RemediationHarness, RemediationOutput, RemediationRequest } from './remediation.js';
import type { Artifact, CompiledGate, Cost, Evaluation, EvaluationContext, Nudge } from './types.js';
export interface ProposalContext {
    artifact: Artifact;
    evaluation: Evaluation;
    round: number;
    state: LoopState;
    signal: AbortSignal;
    operationId?: string;
}
export interface NudgeProposal {
    nudges: Nudge[];
    actualCost: Cost;
}
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
    prepareWorkspace?: (context: {
        artifact: Artifact;
        nudge: Nudge;
        round: number;
        signal: AbortSignal;
    }) => Promise<string>;
    evaluationTimeoutMs?: number;
    proposalTimeoutMs?: number;
    repairTimeoutMs?: number;
    /** False permits objective optimization after the required assertions pass. Defaults to true. */
    stopOnGatePass?: boolean;
    durability?: DurableRun;
    /** Caller-owned immutable versions for the proposal, repair and optional workspace implementation/configuration. */
    executionIdentity?: {
        proposal: string;
        repair: string;
        workspace?: string;
    };
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
export declare function runQualityLoop(options: QualityLoopOptions): Promise<QualityLoopResult>;
//# sourceMappingURL=loop.d.ts.map