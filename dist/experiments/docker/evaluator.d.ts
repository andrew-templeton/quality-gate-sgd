/**
 * Docker-based SWE-bench Evaluator
 * =================================
 * Runs real SWE-bench evaluations using Docker containers.
 *
 * This evaluator:
 * 1. Pulls pre-built SWE-bench Docker images from Epoch AI registry
 * 2. Applies LLM-generated patches to the repository
 * 3. Runs the test suite
 * 4. Returns pass/fail results based on test outcomes
 *
 * Registry: ghcr.io/epoch-research/swe-bench.eval.<arch>.<instance_id>
 */
export interface EvaluationResult {
    /** Instance ID from SWE-bench */
    instanceId: string;
    /** Whether the patch resolved the issue */
    resolved: boolean;
    /** Number of tests that now pass (FAIL_TO_PASS) */
    testsFixed: number;
    /** Total tests in FAIL_TO_PASS */
    totalTestsToFix: number;
    /** Number of tests that still pass (PASS_TO_PASS) */
    testsStillPassing: number;
    /** Total tests in PASS_TO_PASS */
    totalTestsToKeep: number;
    /** Execution time in milliseconds */
    durationMs: number;
    /** Error message if evaluation failed */
    error?: string;
    /** Raw test output */
    testOutput?: string;
}
export interface EvaluatorConfig {
    /** Docker image registry (default: ghcr.io/epoch-research) */
    registry?: string;
    /** Architecture (default: auto-detect) */
    arch?: 'x86_64' | 'arm64';
    /** Timeout for container execution in ms (default: 300000 = 5 min) */
    timeout?: number;
    /** Working directory for temp files */
    workDir?: string;
    /** Whether to pull images if not present (default: true) */
    pullImages?: boolean;
    /** Whether to remove containers after use (default: true) */
    cleanup?: boolean;
    /** Verbose logging */
    verbose?: boolean;
}
export interface PatchToEvaluate {
    /** SWE-bench instance ID */
    instanceId: string;
    /** The patch content (unified diff format) */
    patch: string;
    /** Test patch to apply (updates test expectations) */
    testPatch?: string;
    /** Test files to verify (from SWE-bench FAIL_TO_PASS) */
    failToPass?: string[];
    /** Tests that should still pass (from PASS_TO_PASS) */
    passToPass?: string[];
}
/**
 * Get the Docker image name for a SWE-bench instance.
 */
export declare function getImageName(instanceId: string, config?: EvaluatorConfig): string;
/**
 * Check if a Docker image exists locally.
 */
export declare function imageExists(imageName: string): boolean;
/**
 * Pull a Docker image.
 */
export declare function pullImage(imageName: string, verbose?: boolean): Promise<boolean>;
/**
 * Ensure image is available, pulling if necessary.
 */
export declare function ensureImage(instanceId: string, config?: EvaluatorConfig): Promise<{
    available: boolean;
    imageName: string;
}>;
/**
 * Run evaluation in a Docker container.
 */
export declare function evaluatePatch(patchInfo: PatchToEvaluate, config?: EvaluatorConfig): Promise<EvaluationResult>;
/**
 * Evaluate multiple patches in sequence.
 */
export declare function evaluatePatches(patches: PatchToEvaluate[], config?: EvaluatorConfig, onProgress?: (completed: number, total: number, result: EvaluationResult) => void): Promise<EvaluationResult[]>;
/**
 * Compute aggregate statistics from evaluation results.
 */
export declare function computeEvaluationStats(results: EvaluationResult[]): {
    total: number;
    resolved: number;
    failed: number;
    errored: number;
    resolutionRate: number;
    avgDurationMs: number;
};
/**
 * Check if Docker is available.
 */
export declare function isDockerAvailable(): boolean;
/**
 * Get Docker info.
 */
export declare function getDockerInfo(): {
    version: string;
    available: boolean;
};
//# sourceMappingURL=evaluator.d.ts.map