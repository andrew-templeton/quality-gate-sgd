/**
 * Experiment Runner
 * =================
 * Orchestrates experiment runs across conditions and tasks.
 * Supports single runs, batch execution, and parallel processing.
 */
import type { ExperimentDesign, ExperimentCondition, ExperimentConfig, ExperimentRun, ExperimentBatch, IterationRecord, TargetSuggestion, IterationOutcome } from './types.js';
/**
 * A task to be executed in an experiment.
 * This is the interface that task providers (e.g., SWE-bench) must implement.
 */
export interface ExperimentTask {
    /** Unique task identifier */
    id: string;
    /** Human-readable description */
    description?: string;
    /** Task metadata */
    metadata?: Record<string, unknown>;
}
/**
 * Result of evaluating the current state during an experiment iteration.
 */
export interface IterationEvaluationResult {
    /** Current metrics */
    metrics: Record<string, number>;
    /** Computed quality score */
    qualityScore: number;
    /** Whether the gate passes */
    passed: boolean;
}
/**
 * Agent interface for experiment execution.
 * Abstracts the LLM agent so we can swap implementations.
 */
export interface ExperimentAgent {
    /**
     * Initialize the agent for a task.
     * Called once at the start of each run.
     */
    initialize(task: ExperimentTask, config: ExperimentConfig): Promise<void>;
    /**
     * Get a suggestion for what to fix next.
     * Only called if gateEnabled is true.
     */
    getSuggestion?(config: ExperimentConfig): Promise<TargetSuggestion | null>;
    /**
     * Execute one iteration of the agent.
     * The agent should attempt to improve quality.
     * Returns the outcome of the attempt.
     */
    executeIteration(iteration: number, suggestion: TargetSuggestion | null, config: ExperimentConfig): Promise<IterationOutcome>;
    /**
     * Evaluate the current state.
     * Returns metrics, quality score, and pass/fail status.
     */
    evaluate(config: ExperimentConfig): Promise<IterationEvaluationResult>;
    /**
     * Clean up after a run.
     */
    cleanup(): Promise<void>;
}
/**
 * Options for a single experiment run.
 */
export interface RunOptions {
    /** Directory for log files */
    logDir?: string;
    /** Custom run ID (auto-generated if not provided) */
    runId?: string;
    /** Callback for progress updates */
    onProgress?: (iteration: number, total: number, metrics: Record<string, number>) => void;
    /** Callback for iteration completion */
    onIteration?: (record: IterationRecord) => void;
    /** Whether to abort on error (default: false) */
    abortOnError?: boolean;
}
/**
 * Options for batch execution.
 */
export interface BatchOptions extends RunOptions {
    /** Maximum parallel runs (default: 1) */
    parallelism?: number;
    /** Whether to continue batch on individual run failure */
    continueOnFailure?: boolean;
    /** Callback for run completion */
    onRunComplete?: (run: ExperimentRun, index: number, total: number) => void;
    /** Custom batch ID */
    batchId?: string;
}
/**
 * Execute a single experiment run.
 */
export declare function executeRun(task: ExperimentTask, condition: ExperimentCondition, agent: ExperimentAgent, options?: RunOptions): Promise<ExperimentRun>;
/**
 * Execute a batch of runs for a design.
 */
export declare function executeBatch(design: ExperimentDesign, tasks: ExperimentTask[], agent: ExperimentAgent, options?: BatchOptions): Promise<ExperimentBatch>;
/**
 * Run all conditions for a single task.
 * Useful for paired comparisons (same task, different conditions).
 */
export declare function executeTaskAcrossConditions(task: ExperimentTask, design: ExperimentDesign, agent: ExperimentAgent, options?: RunOptions): Promise<ExperimentRun[]>;
/**
 * Run baseline and treatment conditions for a single task.
 * Returns [baseline, ...treatments] for easy comparison.
 */
export declare function executeBaselineVsTreatment(task: ExperimentTask, design: ExperimentDesign, agent: ExperimentAgent, options?: RunOptions): Promise<{
    baseline: ExperimentRun;
    treatments: ExperimentRun[];
}>;
/**
 * Resume options for incomplete runs.
 */
export interface ResumeOptions extends RunOptions {
    /** Run ID to resume */
    runId: string;
    /** Starting iteration (defaults to last completed + 1) */
    startIteration?: number;
}
/**
 * Check if a run can be resumed.
 */
export declare function canResumeRun(runId: string, options?: {
    logDir?: string;
}): boolean;
/**
 * Get the last completed iteration for a run.
 */
export declare function getLastIteration(runId: string, options?: {
    logDir?: string;
}): number;
/**
 * Create a simple mock agent for testing.
 */
export declare function createMockAgent(options?: {
    /** Probability of improving each iteration */
    improvementProbability?: number;
    /** Initial quality score */
    initialScore?: number;
    /** Target quality score for passing */
    targetScore?: number;
    /** Random seed */
    seed?: number;
}): ExperimentAgent;
/**
 * Estimate time remaining for a batch.
 */
export declare function estimateTimeRemaining(completedRuns: number, totalRuns: number, elapsedMs: number): number;
/**
 * Format a duration in milliseconds to human-readable string.
 */
export declare function formatDuration(ms: number): string;
//# sourceMappingURL=runner.d.ts.map