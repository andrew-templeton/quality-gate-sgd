import { BudgetLedger } from './budget.js';
import { DurableRun } from './durability.js';
import type { Artifact, Cost, Nudge } from './types.js';
export interface RemediationRequest {
    artifact: Artifact;
    environmentDigest: string;
    nudge: Nudge;
    /** Caller-owned disposable checkout. Populate it from the baseline and never use the live workspace. */
    candidateWorkspace?: string;
    signal: AbortSignal;
    /** Stable durable operation key; forward it to services that support idempotency. */
    operationId?: string;
}
export interface RemediationOutput {
    artifact: Artifact;
    actualCost: Cost;
}
export interface RemediationHarness {
    id: string;
    /** Honor cancellation and bound external work. An arbitrary injected function is not sandboxed by this interface. */
    run(request: RemediationRequest): Promise<RemediationOutput>;
}
export type RemediationResult = {
    status: 'candidate';
    artifact: Artifact;
    actualCost: Cost;
} | {
    status: 'disabled' | 'budget' | 'unavailable';
    reason: string;
    actualCost: Cost;
};
export interface RemediationOptions {
    request: Omit<RemediationRequest, 'signal'>;
    harnesses: readonly RemediationHarness[];
    /** Empty by default. Registering a harness or including it in a card never enables execution. */
    enabledHarnessIds?: readonly string[];
    /** Explicit override supports an injected in-memory generator without modifying the nudge. */
    harnessId?: string;
    budget: BudgetLedger;
    reservationId: string;
    timeoutMs?: number;
    durability?: DurableRun;
}
/** Produce an isolated candidate only; the complete gate still has to evaluate and admit it. */
export declare function executeRemediation(options: RemediationOptions): Promise<RemediationResult>;
export interface CommandResult {
    stdout: string;
    stderr: string;
}
export interface CommandHarnessOptions {
    id: string;
    command: string;
    args: readonly string[];
    timeoutMs: number;
    /** Shared bound across stdout and stderr in bytes. */
    maxOutputBytes: number;
    env?: NodeJS.ProcessEnv;
    prompt?: (request: RemediationRequest) => string;
    /** Read candidate files or decode stdout and compute their actual dependency-complete digest. */
    toArtifact: (result: CommandResult, request: RemediationRequest) => Artifact | Promise<Artifact>;
    /** If unavailable, the full reserved repair cost is charged. */
    actualCost?: (result: CommandResult, request: RemediationRequest) => Cost;
}
/**
 * shell:false; prompts travel through stdin and never become command arguments.
 * The caller prepares a fresh isolated checkout for EACH attempt and owns cleanup.
 * This adapter is process control, not an OS sandbox: command permissions remain the caller's.
 * On POSIX, abort/timeout/output overflow kills the process group. Windows kills only the child.
 */
export declare function commandHarness(options: CommandHarnessOptions): RemediationHarness;
//# sourceMappingURL=remediation.d.ts.map