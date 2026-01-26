/**
 * SWE-bench Evaluator
 * ===================
 * Utilities for evaluating SWE-bench task attempts.
 *
 * Handles:
 * - Repository setup and checkout
 * - Patch application (gold patches, test patches, agent patches)
 * - Test execution with result parsing
 * - Resolution determination
 */
import type { SWEBenchTask, EvaluationResult, EvaluationOptions, PatchResult, PatchOptions, RepoSetupResult, RepoSetupOptions } from './types.js';
/**
 * Set up a repository for evaluation.
 * Clones the repo and checks out the base commit.
 */
export declare function setupRepository(task: SWEBenchTask, options: RepoSetupOptions): Promise<RepoSetupResult>;
/**
 * Clean up a repository directory.
 */
export declare function cleanupRepository(repoPath: string): void;
/**
 * Apply a patch to the repository.
 */
export declare function applyPatch(options: PatchOptions): Promise<PatchResult>;
/**
 * Apply the gold patch for a task.
 */
export declare function applyGoldPatch(task: SWEBenchTask, workDir: string): Promise<PatchResult>;
/**
 * Apply the test patch for a task.
 */
export declare function applyTestPatch(task: SWEBenchTask, workDir: string): Promise<PatchResult>;
/**
 * Reverse the gold patch.
 */
export declare function reverseGoldPatch(task: SWEBenchTask, workDir: string): Promise<PatchResult>;
/**
 * Evaluate a task attempt by running tests.
 */
export declare function evaluateTask(task: SWEBenchTask, options: EvaluationOptions): Promise<EvaluationResult>;
/**
 * Full evaluation pipeline for a task.
 * Sets up repo, applies patches, runs tests, cleans up.
 */
export declare function evaluateTaskFull(task: SWEBenchTask, options: {
    baseDir: string;
    cleanup?: boolean;
    timeout?: number;
    applyGold?: boolean;
}): Promise<{
    setup: RepoSetupResult;
    evaluation: EvaluationResult;
}>;
/**
 * Verify that gold patch resolves the task.
 * Useful for validating dataset integrity.
 */
export declare function verifyGoldPatch(task: SWEBenchTask, options: {
    baseDir: string;
    timeout?: number;
}): Promise<{
    valid: boolean;
    evaluation: EvaluationResult;
}>;
/**
 * Evaluate multiple tasks.
 */
export declare function evaluateBatch(tasks: SWEBenchTask[], options: {
    baseDir: string;
    parallelism?: number;
    timeout?: number;
    onProgress?: (completed: number, total: number, result: EvaluationResult) => void;
}): Promise<EvaluationResult[]>;
/**
 * Compute summary statistics from evaluation results.
 */
export declare function summarizeEvaluations(results: EvaluationResult[]): {
    total: number;
    resolved: number;
    resolveRate: number;
    withRegression: number;
    errors: number;
    avgTestsPassed: number;
    avgDurationMs: number;
};
//# sourceMappingURL=evaluator.d.ts.map