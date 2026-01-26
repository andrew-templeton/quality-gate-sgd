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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
// =============================================================================
// Constants
// =============================================================================
/**
 * Default timeout for operations (5 minutes).
 */
const DEFAULT_TIMEOUT = 5 * 60 * 1000;
/**
 * Test command templates by framework.
 */
const TEST_COMMANDS = {
    django: 'python -m pytest',
    pytest: 'python -m pytest',
    unittest: 'python -m unittest',
    nose: 'python -m nose',
    default: 'python -m pytest',
};
// =============================================================================
// Repository Setup
// =============================================================================
/**
 * Set up a repository for evaluation.
 * Clones the repo and checks out the base commit.
 */
export async function setupRepository(task, options) {
    const { targetDir, shallow = true, installDeps = false, setupCommands = [], timeout = DEFAULT_TIMEOUT, } = options;
    const startTime = Date.now();
    try {
        // Create target directory
        fs.mkdirSync(targetDir, { recursive: true });
        // Clone repository
        const cloneArgs = ['clone'];
        if (shallow) {
            cloneArgs.push('--depth', '1', '--no-single-branch');
        }
        cloneArgs.push(task.repoUrl, targetDir);
        await runCommand('git', cloneArgs, { cwd: path.dirname(targetDir), timeout });
        // Fetch the specific commit
        await runCommand('git', ['fetch', '--depth', '1', 'origin', task.baseCommit], {
            cwd: targetDir,
            timeout,
        });
        // Checkout base commit
        await runCommand('git', ['checkout', task.baseCommit], {
            cwd: targetDir,
            timeout,
        });
        // Install dependencies if requested
        if (installDeps) {
            // Try common Python dependency installation
            const requirementsPath = path.join(targetDir, 'requirements.txt');
            if (fs.existsSync(requirementsPath)) {
                await runCommand('pip', ['install', '-r', 'requirements.txt', '-q'], {
                    cwd: targetDir,
                    timeout,
                });
            }
            // Try setup.py
            const setupPath = path.join(targetDir, 'setup.py');
            if (fs.existsSync(setupPath)) {
                await runCommand('pip', ['install', '-e', '.', '-q'], {
                    cwd: targetDir,
                    timeout,
                });
            }
        }
        // Run custom setup commands
        for (const cmd of setupCommands) {
            const [command, ...args] = cmd.split(' ');
            await runCommand(command, args, { cwd: targetDir, timeout });
        }
        return {
            success: true,
            repoPath: targetDir,
            commit: task.baseCommit,
            durationMs: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            repoPath: targetDir,
            commit: task.baseCommit,
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Clean up a repository directory.
 */
export function cleanupRepository(repoPath) {
    if (fs.existsSync(repoPath)) {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }
}
// =============================================================================
// Patch Application
// =============================================================================
/**
 * Apply a patch to the repository.
 */
export async function applyPatch(options) {
    const { workDir, patch, dryRun = false, stripLevel = 1, reverse = false, } = options;
    if (!patch.trim()) {
        return {
            success: true,
            filesModified: [],
            output: 'Empty patch, nothing to apply',
        };
    }
    // Write patch to temp file
    const patchFile = path.join(workDir, '.tmp-patch.diff');
    fs.writeFileSync(patchFile, patch);
    try {
        const args = ['-p' + stripLevel];
        if (dryRun) {
            args.push('--dry-run');
        }
        if (reverse) {
            args.push('-R');
        }
        args.push('-i', patchFile);
        const output = await runCommand('patch', args, { cwd: workDir });
        // Parse modified files from output
        const filesModified = parsePatchOutput(output);
        return {
            success: true,
            filesModified,
            output,
        };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            filesModified: [],
            output: '',
            error: errorMsg,
        };
    }
    finally {
        // Clean up temp file
        if (fs.existsSync(patchFile)) {
            fs.unlinkSync(patchFile);
        }
    }
}
/**
 * Apply the gold patch for a task.
 */
export async function applyGoldPatch(task, workDir) {
    return applyPatch({
        workDir,
        patch: task.goldPatch,
    });
}
/**
 * Apply the test patch for a task.
 */
export async function applyTestPatch(task, workDir) {
    return applyPatch({
        workDir,
        patch: task.testPatch,
    });
}
/**
 * Reverse the gold patch.
 */
export async function reverseGoldPatch(task, workDir) {
    return applyPatch({
        workDir,
        patch: task.goldPatch,
        reverse: true,
    });
}
/**
 * Parse patch output to extract modified files.
 */
function parsePatchOutput(output) {
    const files = [];
    const regex = /patching file ['"]?([^'"]+)['"]?/gi;
    let match;
    while ((match = regex.exec(output)) !== null) {
        files.push(match[1]);
    }
    return files;
}
// =============================================================================
// Test Execution
// =============================================================================
/**
 * Evaluate a task attempt by running tests.
 */
export async function evaluateTask(task, options) {
    const { workDir, timeout = DEFAULT_TIMEOUT, applyTestPatch: shouldApplyTestPatch = true, testCommand, env = {}, captureOutput = true, } = options;
    const startTime = Date.now();
    try {
        // Apply test patch if needed
        if (shouldApplyTestPatch && task.testPatch) {
            const patchResult = await applyPatch({
                workDir,
                patch: task.testPatch,
            });
            if (!patchResult.success) {
                return {
                    instanceId: task.instanceId,
                    resolved: false,
                    failToPassResults: [],
                    passToPassResults: [],
                    hasRegression: false,
                    testsPassed: 0,
                    testsTotal: task.testSpec.failToPass.length + task.testSpec.passToPass.length,
                    durationMs: Date.now() - startTime,
                    error: `Failed to apply test patch: ${patchResult.error}`,
                };
            }
        }
        // Determine test command
        const cmd = testCommand ?? getTestCommand(task.framework);
        // Run FAIL_TO_PASS tests
        const failToPassResults = await runTests(task.testSpec.failToPass, cmd, workDir, { timeout, env, captureOutput });
        // Run PASS_TO_PASS tests
        const passToPassResults = await runTests(task.testSpec.passToPass, cmd, workDir, { timeout, env, captureOutput });
        // Determine resolution
        const allFailToPassPassed = failToPassResults.every(r => r.passed);
        const allPassToPassPassed = passToPassResults.every(r => r.passed);
        const hasRegression = !allPassToPassPassed;
        const resolved = allFailToPassPassed && allPassToPassPassed;
        const testsPassed = failToPassResults.filter(r => r.passed).length +
            passToPassResults.filter(r => r.passed).length;
        return {
            instanceId: task.instanceId,
            resolved,
            failToPassResults,
            passToPassResults,
            hasRegression,
            testsPassed,
            testsTotal: failToPassResults.length + passToPassResults.length,
            durationMs: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            instanceId: task.instanceId,
            resolved: false,
            failToPassResults: [],
            passToPassResults: [],
            hasRegression: false,
            testsPassed: 0,
            testsTotal: task.testSpec.failToPass.length + task.testSpec.passToPass.length,
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Run a list of tests.
 */
async function runTests(testIds, command, workDir, options) {
    const results = [];
    for (const testId of testIds) {
        const result = await runSingleTest(testId, command, workDir, options);
        results.push(result);
    }
    return results;
}
/**
 * Run a single test.
 */
async function runSingleTest(testId, command, workDir, options) {
    const startTime = Date.now();
    try {
        // Build full test command
        const fullCommand = `${command} ${testId}`;
        const [cmd, ...args] = fullCommand.split(' ').filter(Boolean);
        const output = await runCommand(cmd, args, {
            cwd: workDir,
            timeout: options.timeout,
            env: { ...process.env, ...options.env },
        });
        return {
            testId,
            passed: true,
            output: options.captureOutput ? output : undefined,
            durationMs: Date.now() - startTime,
        };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
            testId,
            passed: false,
            output: options.captureOutput ? errorMsg : undefined,
            durationMs: Date.now() - startTime,
        };
    }
}
/**
 * Get test command for a framework.
 */
function getTestCommand(framework) {
    if (framework && TEST_COMMANDS[framework]) {
        return TEST_COMMANDS[framework];
    }
    return TEST_COMMANDS.default;
}
// =============================================================================
// Evaluation Orchestration
// =============================================================================
/**
 * Full evaluation pipeline for a task.
 * Sets up repo, applies patches, runs tests, cleans up.
 */
export async function evaluateTaskFull(task, options) {
    const { baseDir, cleanup = true, timeout = DEFAULT_TIMEOUT, applyGold = false, } = options;
    const workDir = path.join(baseDir, task.instanceId);
    // Setup repository
    const setup = await setupRepository(task, {
        targetDir: workDir,
        shallow: true,
        timeout,
    });
    if (!setup.success) {
        return {
            setup,
            evaluation: {
                instanceId: task.instanceId,
                resolved: false,
                failToPassResults: [],
                passToPassResults: [],
                hasRegression: false,
                testsPassed: 0,
                testsTotal: 0,
                durationMs: 0,
                error: `Repository setup failed: ${setup.error}`,
            },
        };
    }
    // Apply gold patch if requested (for baseline testing)
    if (applyGold) {
        const goldResult = await applyGoldPatch(task, workDir);
        if (!goldResult.success) {
            if (cleanup) {
                cleanupRepository(workDir);
            }
            return {
                setup,
                evaluation: {
                    instanceId: task.instanceId,
                    resolved: false,
                    failToPassResults: [],
                    passToPassResults: [],
                    hasRegression: false,
                    testsPassed: 0,
                    testsTotal: 0,
                    durationMs: 0,
                    error: `Gold patch application failed: ${goldResult.error}`,
                },
            };
        }
    }
    // Run evaluation
    const evaluation = await evaluateTask(task, {
        workDir,
        timeout,
    });
    // Cleanup
    if (cleanup) {
        cleanupRepository(workDir);
    }
    return { setup, evaluation };
}
/**
 * Verify that gold patch resolves the task.
 * Useful for validating dataset integrity.
 */
export async function verifyGoldPatch(task, options) {
    const result = await evaluateTaskFull(task, {
        ...options,
        applyGold: true,
        cleanup: true,
    });
    return {
        valid: result.evaluation.resolved,
        evaluation: result.evaluation,
    };
}
// =============================================================================
// Command Execution
// =============================================================================
/**
 * Run a command and return output.
 */
async function runCommand(command, args, options = {}) {
    const { cwd, timeout = DEFAULT_TIMEOUT, env } = options;
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            cwd,
            env: env ?? process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        const timeoutId = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);
        proc.on('close', (code) => {
            clearTimeout(timeoutId);
            if (code === 0) {
                resolve(stdout);
            }
            else {
                reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
            }
        });
        proc.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}
// =============================================================================
// Batch Evaluation
// =============================================================================
/**
 * Evaluate multiple tasks.
 */
export async function evaluateBatch(tasks, options) {
    const { baseDir, parallelism = 1, timeout, onProgress, } = options;
    const results = [];
    let completed = 0;
    if (parallelism <= 1) {
        // Sequential evaluation
        for (const task of tasks) {
            const { evaluation } = await evaluateTaskFull(task, { baseDir, timeout });
            results.push(evaluation);
            completed++;
            onProgress?.(completed, tasks.length, evaluation);
        }
    }
    else {
        // Parallel evaluation with limited concurrency
        const queue = [...tasks];
        const executing = [];
        const processNext = async () => {
            while (queue.length > 0 && executing.length < parallelism) {
                const task = queue.shift();
                const promise = (async () => {
                    const { evaluation } = await evaluateTaskFull(task, { baseDir, timeout });
                    results.push(evaluation);
                    completed++;
                    onProgress?.(completed, tasks.length, evaluation);
                })();
                executing.push(promise);
                promise.finally(() => {
                    executing.splice(executing.indexOf(promise), 1);
                    processNext();
                });
            }
        };
        await processNext();
        await Promise.all(executing);
    }
    return results;
}
/**
 * Compute summary statistics from evaluation results.
 */
export function summarizeEvaluations(results) {
    const total = results.length;
    const resolved = results.filter(r => r.resolved).length;
    const withRegression = results.filter(r => r.hasRegression).length;
    const errors = results.filter(r => r.error !== undefined).length;
    const totalTestsPassed = results.reduce((sum, r) => sum + r.testsPassed, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    return {
        total,
        resolved,
        resolveRate: total > 0 ? resolved / total : 0,
        withRegression,
        errors,
        avgTestsPassed: total > 0 ? totalTestsPassed / total : 0,
        avgDurationMs: total > 0 ? totalDuration / total : 0,
    };
}
//# sourceMappingURL=evaluator.js.map