/**
 * Experiment Logger
 * =================
 * Records experiment trajectories to disk for later analysis.
 * Supports streaming writes for crash-resilient logging.
 */
import type { ExperimentRun, ExperimentCondition, IterationRecord, RunOutcome, TargetSuggestion, IterationOutcome, ExperimentBatch } from './types.js';
/**
 * Start a new experiment run.
 * Creates log file and initializes state.
 */
export declare function startExperimentRun(taskId: string, condition: ExperimentCondition, options?: {
    logDir?: string;
    runId?: string;
}): string;
/**
 * Log a single iteration.
 * Appends to log file immediately for crash resilience.
 */
export declare function logIteration(metrics: Record<string, number>, qualityScore: number, passed: boolean, options?: {
    target?: TargetSuggestion;
    outcome?: IterationOutcome;
    durationMs?: number;
}): IterationRecord;
/**
 * End the current experiment run.
 * Computes final outcome and writes footer.
 */
export declare function endExperimentRun(stopReason?: RunOutcome['stopReason']): ExperimentRun;
/**
 * Get the current experiment run ID.
 */
export declare function getCurrentRunId(): string | null;
/**
 * Get the current iteration number.
 */
export declare function getCurrentIteration(): number;
/**
 * Create a new experiment batch.
 */
export declare function createBatch(design: ExperimentBatch['design'], hypotheses: ExperimentBatch['hypotheses'], options?: {
    batchId?: string;
    logDir?: string;
}): ExperimentBatch;
/**
 * Add a completed run to a batch.
 */
export declare function addRunToBatch(batch: ExperimentBatch, run: ExperimentRun): void;
/**
 * Save batch to disk.
 */
export declare function saveBatch(batch: ExperimentBatch, options?: {
    logDir?: string;
}): void;
/**
 * Load a batch from disk.
 */
export declare function loadBatch(batchId: string, options?: {
    logDir?: string;
}): ExperimentBatch | null;
/**
 * Load an experiment run from disk.
 */
export declare function loadRun(runId: string, options?: {
    logDir?: string;
}): ExperimentRun | null;
/**
 * List all experiment runs in the log directory.
 */
export declare function listRuns(options?: {
    logDir?: string;
}): string[];
//# sourceMappingURL=logger.d.ts.map