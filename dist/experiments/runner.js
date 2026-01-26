/**
 * Experiment Runner
 * =================
 * Orchestrates experiment runs across conditions and tasks.
 * Supports single runs, batch execution, and parallel processing.
 */
import { startExperimentRun, logIteration, endExperimentRun, createBatch, addRunToBatch, saveBatch, loadRun, } from './logger.js';
import { createConditions, DESIGN_METADATA } from './conditions.js';
// =============================================================================
// Single Run Executor
// =============================================================================
/**
 * Execute a single experiment run.
 */
export async function executeRun(task, condition, agent, options = {}) {
    const { config } = condition;
    const { logDir, runId, onProgress, onIteration, abortOnError = false } = options;
    // Initialize agent
    await agent.initialize(task, config);
    // Start logging
    const actualRunId = startExperimentRun(task.id, condition, { logDir, runId });
    try {
        // Initial evaluation
        let evaluation = await agent.evaluate(config);
        let previousScore = evaluation.qualityScore;
        // Log initial state as iteration 0
        const initialRecord = logIteration(evaluation.metrics, evaluation.qualityScore, evaluation.passed, { durationMs: 0 });
        onIteration?.(initialRecord);
        // Main loop
        for (let i = 1; i <= config.maxIterations; i++) {
            const iterStart = Date.now();
            // Get suggestion if gate is enabled
            let suggestion = null;
            if (config.gateEnabled && agent.getSuggestion) {
                suggestion = await agent.getSuggestion(config);
            }
            // Execute iteration
            let outcome;
            try {
                outcome = await agent.executeIteration(i, suggestion, config);
            }
            catch (error) {
                outcome = {
                    success: false,
                    actualDeltaQ: 0,
                    targetMatched: false,
                    error: error instanceof Error ? error.message : String(error),
                };
                if (abortOnError) {
                    throw error;
                }
            }
            // Evaluate new state
            evaluation = await agent.evaluate(config);
            const durationMs = Date.now() - iterStart;
            // Log iteration
            const record = logIteration(evaluation.metrics, evaluation.qualityScore, evaluation.passed, {
                target: suggestion ?? undefined,
                outcome,
                durationMs,
            });
            onIteration?.(record);
            onProgress?.(i, config.maxIterations, evaluation.metrics);
            previousScore = evaluation.qualityScore;
            // Check for early termination
            if (evaluation.passed) {
                return endExperimentRun('passed');
            }
        }
        // Max iterations reached
        return endExperimentRun('max_iterations');
    }
    catch (error) {
        // End run with error
        const run = endExperimentRun('error');
        throw error;
    }
    finally {
        // Cleanup
        await agent.cleanup();
    }
}
// =============================================================================
// Batch Runner
// =============================================================================
/**
 * Execute a batch of runs for a design.
 */
export async function executeBatch(design, tasks, agent, options = {}) {
    const { parallelism = 1, continueOnFailure = true, onRunComplete, batchId, logDir, ...runOptions } = options;
    // Create conditions
    const conditions = createConditions(design, {
        seed: options.runId ? parseInt(options.runId, 16) : undefined,
    });
    // Create batch
    const metadata = DESIGN_METADATA[design];
    const batch = createBatch(design, metadata.hypotheses, { batchId, logDir });
    // Generate all run specs
    const runSpecs = [];
    let index = 0;
    for (const task of tasks) {
        for (const condition of conditions) {
            runSpecs.push({ task, condition, index: index++ });
        }
    }
    const totalRuns = runSpecs.length;
    // Execute runs
    if (parallelism <= 1) {
        // Sequential execution
        for (const spec of runSpecs) {
            try {
                const run = await executeRun(spec.task, spec.condition, agent, {
                    ...runOptions,
                    logDir,
                });
                addRunToBatch(batch, run);
                onRunComplete?.(run, spec.index, totalRuns);
            }
            catch (error) {
                if (!continueOnFailure) {
                    throw error;
                }
                console.error(`Run failed for task ${spec.task.id}, condition ${spec.condition.name}:`, error);
            }
        }
    }
    else {
        // Parallel execution
        await executeParallel(runSpecs, agent, batch, {
            parallelism,
            continueOnFailure,
            onRunComplete,
            totalRuns,
            runOptions: { ...runOptions, logDir },
        });
    }
    // Save batch
    saveBatch(batch, { logDir });
    return batch;
}
/**
 * Execute runs in parallel with limited concurrency.
 */
async function executeParallel(runSpecs, agent, batch, options) {
    const { parallelism, continueOnFailure, onRunComplete, totalRuns, runOptions } = options;
    // Semaphore for limiting concurrency
    let running = 0;
    const queue = [...runSpecs];
    const results = [];
    await new Promise((resolve, reject) => {
        const processNext = async () => {
            if (queue.length === 0) {
                if (running === 0) {
                    resolve();
                }
                return;
            }
            if (running >= parallelism) {
                return;
            }
            const spec = queue.shift();
            running++;
            try {
                const run = await executeRun(spec.task, spec.condition, agent, runOptions);
                addRunToBatch(batch, run);
                results.push({ run });
                onRunComplete?.(run, spec.index, totalRuns);
            }
            catch (error) {
                results.push({ error: error });
                if (!continueOnFailure) {
                    reject(error);
                    return;
                }
                console.error(`Run failed for task ${spec.task.id}, condition ${spec.condition.name}:`, error);
            }
            finally {
                running--;
                processNext();
            }
        };
        // Start initial batch
        for (let i = 0; i < Math.min(parallelism, queue.length); i++) {
            processNext();
        }
    });
}
// =============================================================================
// Cross-Condition Runner
// =============================================================================
/**
 * Run all conditions for a single task.
 * Useful for paired comparisons (same task, different conditions).
 */
export async function executeTaskAcrossConditions(task, design, agent, options = {}) {
    const conditions = createConditions(design);
    const runs = [];
    for (const condition of conditions) {
        const run = await executeRun(task, condition, agent, options);
        runs.push(run);
    }
    return runs;
}
/**
 * Run baseline and treatment conditions for a single task.
 * Returns [baseline, ...treatments] for easy comparison.
 */
export async function executeBaselineVsTreatment(task, design, agent, options = {}) {
    const runs = await executeTaskAcrossConditions(task, design, agent, options);
    return {
        baseline: runs[0],
        treatments: runs.slice(1),
    };
}
/**
 * Check if a run can be resumed.
 */
export function canResumeRun(runId, options = {}) {
    const run = loadRun(runId, options);
    if (!run) {
        return false;
    }
    // Can resume if not passed and not at max iterations
    return !run.outcome.passed && run.outcome.stopReason !== 'passed';
}
/**
 * Get the last completed iteration for a run.
 */
export function getLastIteration(runId, options = {}) {
    const run = loadRun(runId, options);
    if (!run) {
        return 0;
    }
    return run.iterations.length;
}
// =============================================================================
// Utility Functions
// =============================================================================
/**
 * Create a simple mock agent for testing.
 */
export function createMockAgent(options = {}) {
    const { improvementProbability = 0.6, initialScore = 50, targetScore = 90, seed, } = options;
    let currentScore = initialScore;
    let rng = seed !== undefined ? seededRandom(seed) : Math.random;
    return {
        async initialize() {
            currentScore = initialScore;
            if (seed !== undefined) {
                rng = seededRandom(seed);
            }
        },
        async getSuggestion() {
            return {
                type: 'symbol',
                id: `mock-symbol-${Math.floor(rng() * 100)}`,
                expectedDeltaQ: 5,
            };
        },
        async executeIteration() {
            const improved = rng() < improvementProbability;
            const delta = improved ? 2 + rng() * 8 : -(rng() * 3);
            currentScore = Math.max(0, Math.min(100, currentScore + delta));
            return {
                success: improved,
                actualDeltaQ: delta,
                targetMatched: true,
            };
        },
        async evaluate() {
            return {
                metrics: {
                    quality: currentScore,
                    coverage: currentScore,
                },
                qualityScore: currentScore,
                passed: currentScore >= targetScore,
            };
        },
        async cleanup() {
            // No cleanup needed
        },
    };
}
/**
 * Simple seeded random number generator.
 */
function seededRandom(seed) {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}
/**
 * Estimate time remaining for a batch.
 */
export function estimateTimeRemaining(completedRuns, totalRuns, elapsedMs) {
    if (completedRuns === 0) {
        return Infinity;
    }
    const avgTimePerRun = elapsedMs / completedRuns;
    const remainingRuns = totalRuns - completedRuns;
    return avgTimePerRun * remainingRuns;
}
/**
 * Format a duration in milliseconds to human-readable string.
 */
export function formatDuration(ms) {
    if (!Number.isFinite(ms)) {
        return 'unknown';
    }
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}
//# sourceMappingURL=runner.js.map