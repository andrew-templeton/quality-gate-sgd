import type { Change, Evaluation, GatePolicy, Nudge } from './types.js';
export interface AdmissionPolicy {
    gate: GatePolicy;
    /** Per-assertion minimum robust loss reduction in that assertion's unit. */
    objectives: Record<string, number>;
    reversalMultiplier: number;
    cooldownRounds: number;
    maxStalledRounds: number;
}
export interface LoopState {
    contractDigest: string;
    acceptedDigests: string[];
    lastChanges: (Change & {
        round: number;
    })[];
    stalledRounds: number;
    lastRound: number;
}
export declare function initialLoopState(evaluation: Evaluation): LoopState;
/** Hysteresis is the mechanism preventing chatter, not a guarantee of convergence. */
export declare function admitCandidate(baseline: Evaluation, candidate: Evaluation, nudge: Nudge, round: number, policy: AdmissionPolicy, state: LoopState): {
    accepted: boolean;
    reason: string;
    state: LoopState;
};
//# sourceMappingURL=admission.d.ts.map