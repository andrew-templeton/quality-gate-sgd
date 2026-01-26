/**
 * SWE-bench Types
 * ===============
 * Type definitions for SWE-bench dataset integration.
 *
 * SWE-bench tasks consist of:
 * - A repository at a specific commit
 * - A problem statement (issue description)
 * - A gold patch (expected solution)
 * - Test files to verify the fix
 */
import type { ExperimentTask } from '../runner.js';
/**
 * Raw SWE-bench task instance from the dataset.
 * This matches the schema in the official SWE-bench dataset files.
 */
export interface SWEBenchInstance {
    /** Unique instance identifier (e.g., "django__django-11099") */
    instance_id: string;
    /** Repository name (e.g., "django/django") */
    repo: string;
    /** Base commit hash to apply patch to */
    base_commit: string;
    /** Problem statement / issue description */
    problem_statement: string;
    /** Hints about the solution (optional) */
    hints_text?: string;
    /** Unix timestamp of creation */
    created_at: string;
    /** Git patch to apply for the gold solution */
    patch: string;
    /** Git patch for test files */
    test_patch: string;
    /** Version identifier */
    version?: string;
    /** Environment setup script */
    environment_setup_commit?: string;
    /** FAIL_TO_PASS: tests that should pass after fix */
    FAIL_TO_PASS: string;
    /** PASS_TO_PASS: tests that should still pass after fix */
    PASS_TO_PASS: string;
}
/**
 * Parsed test specification from SWE-bench instance.
 */
export interface TestSpec {
    /** Tests that should pass after the fix (were failing before) */
    failToPass: string[];
    /** Tests that should continue passing (regression tests) */
    passToPass: string[];
}
/**
 * Processed SWE-bench task ready for experiment execution.
 */
export interface SWEBenchTask extends ExperimentTask {
    /** Original SWE-bench instance ID */
    instanceId: string;
    /** Repository URL */
    repoUrl: string;
    /** Base commit to checkout */
    baseCommit: string;
    /** Problem statement for the agent */
    problemStatement: string;
    /** Optional hints */
    hints?: string;
    /** Gold patch (for evaluation, not shown to agent) */
    goldPatch: string;
    /** Test patch to apply before evaluation */
    testPatch: string;
    /** Parsed test specifications */
    testSpec: TestSpec;
    /** Repository language/framework info */
    framework?: string;
    /** Difficulty tier (if available) */
    difficulty?: 'easy' | 'medium' | 'hard';
}
/**
 * SWE-bench dataset split options.
 */
export type DatasetSplit = 'dev' | 'test' | 'lite' | 'verified';
/**
 * Dataset loading options.
 */
export interface DatasetOptions {
    /** Which split to load */
    split?: DatasetSplit;
    /** Path to local dataset file (overrides split) */
    localPath?: string;
    /** Filter to specific repositories */
    repos?: string[];
    /** Filter to specific instance IDs */
    instanceIds?: string[];
    /** Maximum number of tasks to load */
    limit?: number;
    /** Shuffle tasks before limiting */
    shuffle?: boolean;
    /** Random seed for shuffling */
    seed?: number;
    /** Filter by difficulty (if available in metadata) */
    difficulty?: 'easy' | 'medium' | 'hard';
}
/**
 * Dataset metadata.
 */
export interface DatasetMetadata {
    /** Dataset name/source */
    name: string;
    /** Split identifier */
    split: DatasetSplit;
    /** Total tasks in dataset */
    totalTasks: number;
    /** Tasks loaded (after filtering) */
    loadedTasks: number;
    /** Unique repositories */
    repositories: string[];
    /** Load timestamp */
    loadedAt: number;
}
/**
 * Result of evaluating a single test.
 */
export interface TestResult {
    /** Test identifier */
    testId: string;
    /** Whether the test passed */
    passed: boolean;
    /** Test output/error message */
    output?: string;
    /** Execution time (ms) */
    durationMs?: number;
}
/**
 * Result of evaluating a SWE-bench task attempt.
 */
export interface EvaluationResult {
    /** Instance ID */
    instanceId: string;
    /** Overall success: all FAIL_TO_PASS tests now pass */
    resolved: boolean;
    /** FAIL_TO_PASS tests that now pass */
    failToPassResults: TestResult[];
    /** PASS_TO_PASS tests that still pass */
    passToPassResults: TestResult[];
    /** Whether any regression occurred */
    hasRegression: boolean;
    /** Count of tests that changed state */
    testsPassed: number;
    testsTotal: number;
    /** Evaluation duration (ms) */
    durationMs: number;
    /** Error during evaluation (if any) */
    error?: string;
}
/**
 * Options for running evaluation.
 */
export interface EvaluationOptions {
    /** Working directory containing the repo */
    workDir: string;
    /** Timeout for test execution (ms) */
    timeout?: number;
    /** Whether to apply test patch first */
    applyTestPatch?: boolean;
    /** Custom test command (overrides default) */
    testCommand?: string;
    /** Environment variables for tests */
    env?: Record<string, string>;
    /** Whether to capture test output */
    captureOutput?: boolean;
    /** Whether to run tests in parallel */
    parallel?: boolean;
}
/**
 * Result of applying a patch.
 */
export interface PatchResult {
    /** Whether patch applied successfully */
    success: boolean;
    /** Files modified by the patch */
    filesModified: string[];
    /** Patch output */
    output: string;
    /** Error message if failed */
    error?: string;
}
/**
 * Options for applying patches.
 */
export interface PatchOptions {
    /** Working directory */
    workDir: string;
    /** Patch content */
    patch: string;
    /** Whether to do a dry run */
    dryRun?: boolean;
    /** Strip level for patch (default: 1) */
    stripLevel?: number;
    /** Whether to reverse the patch */
    reverse?: boolean;
}
/**
 * Repository setup result.
 */
export interface RepoSetupResult {
    /** Whether setup succeeded */
    success: boolean;
    /** Path to the setup repository */
    repoPath: string;
    /** Commit hash checked out */
    commit: string;
    /** Setup duration (ms) */
    durationMs: number;
    /** Error message if failed */
    error?: string;
}
/**
 * Options for repository setup.
 */
export interface RepoSetupOptions {
    /** Target directory for clone */
    targetDir: string;
    /** Whether to do shallow clone */
    shallow?: boolean;
    /** Whether to install dependencies */
    installDeps?: boolean;
    /** Custom setup commands */
    setupCommands?: string[];
    /** Timeout for setup (ms) */
    timeout?: number;
}
//# sourceMappingURL=types.d.ts.map