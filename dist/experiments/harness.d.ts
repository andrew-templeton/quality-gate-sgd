/**
 * Agent Harness
 * =============
 * LLM agent wrapper that integrates with the quality gate system.
 * Can toggle gate feedback on/off for experimental manipulation.
 *
 * The harness provides:
 * - Metrics extraction and fitness computation
 * - Target suggestions based on configuration
 * - Iteration execution with pre/post evaluation
 */
import type { ExperimentConfig, TargetSuggestion } from './types.js';
import type { ExperimentTask, ExperimentAgent } from './runner.js';
import type { Metrics } from '../types.js';
import type { SymbolTable } from '../symbols/types.js';
/**
 * Metrics provider interface for fetching current metrics.
 * Implement this to integrate with your project's metric extraction.
 */
export interface MetricsProvider {
    /**
     * Extract all metrics for the current project state.
     */
    extractMetrics(): Promise<Metrics>;
    /**
     * Get the project root path.
     */
    getProjectRoot(): string;
    /**
     * Get source files for symbol extraction.
     */
    getSourceFiles?(): Promise<string[]>;
}
/**
 * LLM interface for executing fix attempts.
 * This is what the harness delegates actual code changes to.
 */
export interface LLMExecutor {
    /**
     * Attempt to fix a target.
     * Returns whether the fix was attempted (not necessarily successful).
     */
    attemptFix(task: ExperimentTask, suggestion: TargetSuggestion | null, context: FixContext): Promise<FixAttemptResult>;
}
/**
 * Context provided to the LLM for a fix attempt.
 */
export interface FixContext {
    /** Current iteration number */
    iteration: number;
    /** Current quality score */
    currentScore: number;
    /** Target score to pass */
    targetScore: number;
    /** All available targets (if suggestions enabled) */
    availableTargets?: TargetSuggestion[];
    /** Metrics at this iteration */
    metrics: Metrics;
    /** Whether gate feedback is enabled */
    feedbackEnabled: boolean;
    /** Experiment config */
    config: ExperimentConfig;
}
/**
 * A single file change from a fix attempt.
 */
export interface FileChange {
    /** Relative file path */
    filePath: string;
    /** Type of change */
    changeType: 'modify' | 'create' | 'delete';
    /** Original content (for modify/delete) */
    originalContent?: string;
    /** New content (for modify/create) */
    newContent?: string;
}
/**
 * Result of a fix attempt.
 */
export interface FixAttemptResult {
    /** Whether the attempt was made */
    attempted: boolean;
    /** If the target was modified */
    modified: boolean;
    /** Any error message */
    error?: string;
    /** File changes made (for patch generation) */
    changes?: FileChange[];
    /** Pre-computed unified diff patch */
    patch?: string;
}
/**
 * Options for creating an agent harness.
 */
export interface HarnessOptions {
    /** Provider for metrics extraction */
    metricsProvider: MetricsProvider;
    /** Executor for fix attempts */
    executor: LLMExecutor;
    /** Target quality score for passing */
    targetScore?: number;
    /** Number of top targets to include in suggestions */
    topTargets?: number;
    /** Pre-built symbol table (optional, will build if not provided) */
    symbolTable?: SymbolTable;
}
/**
 * Create an agent harness that wraps metrics/suggestion infrastructure.
 */
export declare function createAgentHarness(options: HarnessOptions): ExperimentAgent;
/**
 * Create a simple mock metrics provider for testing.
 */
export declare function createMockMetricsProvider(options?: {
    initialMetrics?: Partial<Metrics>;
    projectRoot?: string;
}): MetricsProvider;
/**
 * Create a mock LLM executor for testing.
 */
export declare function createMockExecutor(options?: {
    improvementProbability?: number;
    seed?: number;
}): LLMExecutor;
//# sourceMappingURL=harness.d.ts.map