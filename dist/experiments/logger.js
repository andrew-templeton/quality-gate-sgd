/**
 * Experiment Logger
 * =================
 * Records experiment trajectories to disk for later analysis.
 * Supports streaming writes for crash-resilient logging.
 */
import { writeFileSync, appendFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
// =============================================================================
// Configuration
// =============================================================================
const DEFAULT_LOG_DIR = '.quality-gate/experiments';
let activeLogger = null;
// =============================================================================
// Experiment Lifecycle
// =============================================================================
/**
 * Start a new experiment run.
 * Creates log file and initializes state.
 */
export function startExperimentRun(taskId, condition, options = {}) {
    if (activeLogger) {
        throw new Error(`Experiment run ${activeLogger.runId} is already active. Call endExperimentRun() first.`);
    }
    const logDir = options.logDir ?? DEFAULT_LOG_DIR;
    const runId = options.runId ?? randomUUID();
    const startTime = Date.now();
    // Create log directory
    const fullLogDir = join(process.cwd(), logDir);
    if (!existsSync(fullLogDir)) {
        mkdirSync(fullLogDir, { recursive: true });
    }
    // Create log file path
    const logPath = join(fullLogDir, `${runId}.jsonl`);
    // Initialize state
    activeLogger = {
        runId,
        taskId,
        condition,
        startTime,
        iterations: [],
        logPath,
        currentIteration: 0,
    };
    // Write header record
    const header = {
        type: 'header',
        runId,
        taskId,
        condition,
        startTime,
        metadata: getMetadata(),
    };
    writeFileSync(logPath, JSON.stringify(header) + '\n');
    return runId;
}
/**
 * Log a single iteration.
 * Appends to log file immediately for crash resilience.
 */
export function logIteration(metrics, qualityScore, passed, options = {}) {
    if (!activeLogger) {
        throw new Error('No active experiment run. Call startExperimentRun() first.');
    }
    activeLogger.currentIteration++;
    const prevScore = activeLogger.iterations.length > 0
        ? activeLogger.iterations[activeLogger.iterations.length - 1].qualityScore
        : qualityScore;
    const record = {
        iteration: activeLogger.currentIteration,
        timestamp: Date.now(),
        durationMs: options.durationMs ?? 0,
        metrics,
        qualityScore,
        passed,
        target: options.target,
        outcome: options.outcome,
        delta: qualityScore - prevScore,
    };
    activeLogger.iterations.push(record);
    // Append to log file
    const logRecord = { type: 'iteration', ...record };
    appendFileSync(activeLogger.logPath, JSON.stringify(logRecord) + '\n');
    return record;
}
/**
 * End the current experiment run.
 * Computes final outcome and writes footer.
 */
export function endExperimentRun(stopReason = 'manual') {
    if (!activeLogger) {
        throw new Error('No active experiment run.');
    }
    const endTime = Date.now();
    const outcome = computeOutcome(activeLogger.iterations, stopReason);
    const run = {
        runId: activeLogger.runId,
        taskId: activeLogger.taskId,
        condition: activeLogger.condition,
        startTime: activeLogger.startTime,
        endTime,
        iterations: activeLogger.iterations,
        outcome,
        metadata: getMetadata(),
    };
    // Write footer record
    const footer = {
        type: 'footer',
        endTime,
        outcome,
    };
    appendFileSync(activeLogger.logPath, JSON.stringify(footer) + '\n');
    // Write complete run as single JSON file
    const completePath = activeLogger.logPath.replace('.jsonl', '.json');
    writeFileSync(completePath, JSON.stringify(run, null, 2));
    // Clear state
    const result = run;
    activeLogger = null;
    return result;
}
/**
 * Get the current experiment run ID.
 */
export function getCurrentRunId() {
    return activeLogger?.runId ?? null;
}
/**
 * Get the current iteration number.
 */
export function getCurrentIteration() {
    return activeLogger?.currentIteration ?? 0;
}
// =============================================================================
// Outcome Computation
// =============================================================================
function computeOutcome(iterations, stopReason) {
    if (iterations.length === 0) {
        return {
            passed: false,
            finalScore: 0,
            totalImprovement: 0,
            monotonicRate: 0,
            wastedIterations: 0,
            stopReason,
        };
    }
    const first = iterations[0];
    const last = iterations[iterations.length - 1];
    // Find when it first passed (if ever)
    let iterationsToPass;
    for (let i = 0; i < iterations.length; i++) {
        if (iterations[i].passed) {
            iterationsToPass = i + 1;
            break;
        }
    }
    // Count monotonic improvements and wasted iterations
    let monotonicSteps = 0;
    let wastedIterations = 0;
    for (let i = 1; i < iterations.length; i++) {
        const delta = iterations[i].qualityScore - iterations[i - 1].qualityScore;
        if (delta > 0.01) {
            monotonicSteps++;
        }
        else if (Math.abs(delta) < 0.01) {
            wastedIterations++;
        }
    }
    const totalSteps = Math.max(1, iterations.length - 1);
    const monotonicRate = monotonicSteps / totalSteps;
    return {
        passed: last.passed,
        iterationsToPass,
        finalScore: last.qualityScore,
        totalImprovement: last.qualityScore - first.qualityScore,
        monotonicRate,
        wastedIterations,
        stopReason,
    };
}
// =============================================================================
// Metadata
// =============================================================================
function getMetadata() {
    let experimentCommit = 'unknown';
    try {
        const { execSync } = require('child_process');
        experimentCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    }
    catch {
        // Ignore git errors
    }
    let packageVersion = 'unknown';
    try {
        const pkgPath = join(__dirname, '../../package.json');
        if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            packageVersion = pkg.version;
        }
    }
    catch {
        // Ignore package.json errors
    }
    return {
        experimentCommit,
        packageVersion,
        nodeVersion: process.version,
        platform: process.platform,
    };
}
// =============================================================================
// Batch Management
// =============================================================================
/**
 * Create a new experiment batch.
 */
export function createBatch(design, hypotheses, options = {}) {
    const batchId = options.batchId ?? randomUUID();
    const batch = {
        batchId,
        design,
        hypotheses,
        runs: [],
        createdAt: Date.now(),
    };
    // Save batch metadata
    const logDir = options.logDir ?? DEFAULT_LOG_DIR;
    const batchPath = join(process.cwd(), logDir, `batch-${batchId}.json`);
    const batchDir = dirname(batchPath);
    if (!existsSync(batchDir)) {
        mkdirSync(batchDir, { recursive: true });
    }
    writeFileSync(batchPath, JSON.stringify(batch, null, 2));
    return batch;
}
/**
 * Add a completed run to a batch.
 */
export function addRunToBatch(batch, run) {
    batch.runs.push(run);
}
/**
 * Save batch to disk.
 */
export function saveBatch(batch, options = {}) {
    const logDir = options.logDir ?? DEFAULT_LOG_DIR;
    const batchPath = join(process.cwd(), logDir, `batch-${batch.batchId}.json`);
    writeFileSync(batchPath, JSON.stringify(batch, null, 2));
}
/**
 * Load a batch from disk.
 */
export function loadBatch(batchId, options = {}) {
    const logDir = options.logDir ?? DEFAULT_LOG_DIR;
    const batchPath = join(process.cwd(), logDir, `batch-${batchId}.json`);
    if (!existsSync(batchPath)) {
        return null;
    }
    const content = readFileSync(batchPath, 'utf-8');
    return JSON.parse(content);
}
/**
 * Load an experiment run from disk.
 */
export function loadRun(runId, options = {}) {
    const logDir = options.logDir ?? DEFAULT_LOG_DIR;
    const runPath = join(process.cwd(), logDir, `${runId}.json`);
    if (!existsSync(runPath)) {
        return null;
    }
    const content = readFileSync(runPath, 'utf-8');
    return JSON.parse(content);
}
/**
 * List all experiment runs in the log directory.
 */
export function listRuns(options = {}) {
    const logDir = options.logDir ?? DEFAULT_LOG_DIR;
    const fullDir = join(process.cwd(), logDir);
    if (!existsSync(fullDir)) {
        return [];
    }
    const { readdirSync } = require('fs');
    const files = readdirSync(fullDir);
    return files
        .filter((f) => f.endsWith('.json') && !f.startsWith('batch-'))
        .map((f) => f.replace('.json', ''));
}
//# sourceMappingURL=logger.js.map