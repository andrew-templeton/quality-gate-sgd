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
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// =============================================================================
// Docker Image Management
// =============================================================================
/**
 * Get the Docker image name for a SWE-bench instance.
 */
export function getImageName(instanceId, config = {}) {
    const registry = config.registry ?? 'ghcr.io/epoch-research';
    const arch = config.arch ?? detectArch();
    return `${registry}/swe-bench.eval.${arch}.${instanceId}:latest`;
}
/**
 * Auto-detect system architecture.
 */
function detectArch() {
    const arch = os.arch();
    if (arch === 'arm64' || arch === 'aarch64') {
        return 'arm64';
    }
    return 'x86_64';
}
/**
 * Check if a Docker image exists locally.
 */
export function imageExists(imageName) {
    try {
        execSync(`docker image inspect ${imageName}`, { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Pull a Docker image.
 */
export async function pullImage(imageName, verbose = false) {
    return new Promise((resolve) => {
        if (verbose) {
            console.error(`Pulling image: ${imageName}`);
        }
        const pull = spawn('docker', ['pull', imageName], {
            stdio: verbose ? 'inherit' : 'pipe',
        });
        pull.on('close', (code) => {
            resolve(code === 0);
        });
        pull.on('error', () => {
            resolve(false);
        });
    });
}
/**
 * Ensure image is available, pulling if necessary.
 */
export async function ensureImage(instanceId, config = {}) {
    const imageName = getImageName(instanceId, config);
    if (imageExists(imageName)) {
        return { available: true, imageName };
    }
    if (config.pullImages !== false) {
        const pulled = await pullImage(imageName, config.verbose);
        return { available: pulled, imageName };
    }
    return { available: false, imageName };
}
// =============================================================================
// Patch Application and Test Execution
// =============================================================================
/**
 * Run evaluation in a Docker container.
 */
export async function evaluatePatch(patchInfo, config = {}) {
    const startTime = Date.now();
    const timeout = config.timeout ?? 300000; // 5 minutes default
    const workDir = config.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'swebench-'));
    const cleanup = config.cleanup !== false;
    // Ensure image is available
    const { available, imageName } = await ensureImage(patchInfo.instanceId, config);
    if (!available) {
        return {
            instanceId: patchInfo.instanceId,
            resolved: false,
            testsFixed: 0,
            totalTestsToFix: patchInfo.failToPass?.length ?? 0,
            testsStillPassing: 0,
            totalTestsToKeep: patchInfo.passToPass?.length ?? 0,
            durationMs: Date.now() - startTime,
            error: `Docker image not available: ${imageName}`,
        };
    }
    // Write patch to temp file
    const patchFile = path.join(workDir, 'patch.diff');
    fs.writeFileSync(patchFile, patchInfo.patch);
    // Write test patch if present
    const testPatchFile = path.join(workDir, 'test_patch.diff');
    if (patchInfo.testPatch) {
        fs.writeFileSync(testPatchFile, patchInfo.testPatch);
    }
    // Create evaluation script
    const evalScript = createEvalScript(patchInfo);
    const scriptFile = path.join(workDir, 'evaluate.sh');
    fs.writeFileSync(scriptFile, evalScript, { mode: 0o755 });
    // Run container
    const containerName = `swebench-eval-${patchInfo.instanceId}-${Date.now()}`;
    try {
        const result = await runContainer({
            imageName,
            containerName,
            patchFile,
            testPatchFile: patchInfo.testPatch ? testPatchFile : undefined,
            scriptFile,
            workDir,
            timeout,
            verbose: config.verbose,
        });
        return {
            instanceId: patchInfo.instanceId,
            resolved: result.resolved,
            testsFixed: result.testsFixed,
            totalTestsToFix: patchInfo.failToPass?.length ?? 0,
            testsStillPassing: result.testsStillPassing,
            totalTestsToKeep: patchInfo.passToPass?.length ?? 0,
            durationMs: Date.now() - startTime,
            testOutput: result.output,
        };
    }
    catch (error) {
        return {
            instanceId: patchInfo.instanceId,
            resolved: false,
            testsFixed: 0,
            totalTestsToFix: patchInfo.failToPass?.length ?? 0,
            testsStillPassing: 0,
            totalTestsToKeep: patchInfo.passToPass?.length ?? 0,
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        };
    }
    finally {
        // Cleanup
        if (cleanup) {
            try {
                execSync(`docker rm -f ${containerName}`, { stdio: 'pipe' });
            }
            catch {
                // Ignore cleanup errors
            }
            try {
                fs.rmSync(workDir, { recursive: true, force: true });
            }
            catch {
                // Ignore cleanup errors
            }
        }
    }
}
/**
 * Detect the project type from instance ID.
 */
function detectProjectType(instanceId) {
    if (instanceId.startsWith('django__django')) {
        return 'django';
    }
    return 'pytest';
}
/**
 * Format a test name for Django's test runner.
 * Django tests look like: test_method (module.path.TestClass)
 * We need to convert to: module.path.TestClass.test_method
 */
function formatDjangoTest(test) {
    // Match pattern: test_name (module.path.ClassName)
    const match = test.match(/^(\w+)\s+\(([^)]+)\)$/);
    if (match) {
        const [, testMethod, modulePath] = match;
        return `${modulePath}.${testMethod}`;
    }
    // Already in dotted format or file path
    return test;
}
/**
 * Create the evaluation shell script to run inside the container.
 */
function createEvalScript(patchInfo) {
    const failToPass = patchInfo.failToPass ?? [];
    const passToPass = patchInfo.passToPass ?? [];
    const projectType = detectProjectType(patchInfo.instanceId);
    // Generate test runner command based on project type
    const getTestCommand = (test) => {
        if (projectType === 'django') {
            const formattedTest = formatDjangoTest(test);
            return `cd /testbed/tests && python runtests.py ${formattedTest} --verbosity 2`;
        }
        return `python -m pytest "${test}" -x --tb=short`;
    };
    const hasTestPatch = !!patchInfo.testPatch;
    return `#!/bin/bash
set -e

# Activate conda environment
source /opt/miniconda3/etc/profile.d/conda.sh
conda activate testbed

# Navigate to repo
cd /testbed

# Apply patch
echo "=== Applying patch ==="
git apply /patch.diff 2>&1 || {
  echo "PATCH_FAILED"
  exit 1
}
echo "Patch applied successfully"

${hasTestPatch ? `# Apply test patch (updates test expectations)
echo "=== Applying test patch ==="
git apply /test_patch.diff 2>&1 || {
  echo "TEST_PATCH_FAILED (continuing anyway)"
}
echo "Test patch applied"` : '# No test patch to apply'}

# Run tests
echo "=== Running tests ==="

FAIL_TO_PASS_FIXED=0
FAIL_TO_PASS_TOTAL=${failToPass.length}

${failToPass.map((test, i) => `
# Test ${i + 1}: ${test}
echo "Running FAIL_TO_PASS test: ${test}"
if ${getTestCommand(test)} 2>&1; then
  echo "TEST_PASSED: ${test}"
  FAIL_TO_PASS_FIXED=$((FAIL_TO_PASS_FIXED + 1))
else
  echo "TEST_FAILED: ${test}"
fi
`).join('\n')}

PASS_TO_PASS_OK=0
PASS_TO_PASS_TOTAL=${passToPass.length}

${passToPass.map((test, i) => `
# Regression test ${i + 1}: ${test}
echo "Running PASS_TO_PASS test: ${test}"
if ${getTestCommand(test)} 2>&1; then
  echo "REGRESSION_PASSED: ${test}"
  PASS_TO_PASS_OK=$((PASS_TO_PASS_OK + 1))
else
  echo "REGRESSION_FAILED: ${test}"
fi
`).join('\n')}

echo "=== Results ==="
echo "FAIL_TO_PASS: $FAIL_TO_PASS_FIXED / $FAIL_TO_PASS_TOTAL"
echo "PASS_TO_PASS: $PASS_TO_PASS_OK / $PASS_TO_PASS_TOTAL"

# Check if resolved (all FAIL_TO_PASS tests now pass)
if [ "$FAIL_TO_PASS_FIXED" -eq "$FAIL_TO_PASS_TOTAL" ] && [ "$FAIL_TO_PASS_TOTAL" -gt 0 ]; then
  echo "RESOLVED: true"
else
  echo "RESOLVED: false"
fi
`;
}
/**
 * Run a Docker container and capture output.
 */
async function runContainer(options) {
    const { imageName, containerName, patchFile, testPatchFile, scriptFile, timeout, verbose } = options;
    return new Promise((resolve, reject) => {
        const args = [
            'run',
            '--name', containerName,
            '--rm',
            '-v', `${patchFile}:/patch.diff:ro`,
        ];
        // Add test patch mount if present
        if (testPatchFile) {
            args.push('-v', `${testPatchFile}:/test_patch.diff:ro`);
        }
        args.push('-v', `${scriptFile}:/evaluate.sh:ro`, imageName, '/bin/bash', '/evaluate.sh');
        if (verbose) {
            console.error(`Running: docker ${args.join(' ')}`);
        }
        const docker = spawn('docker', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        let stderr = '';
        docker.stdout.on('data', (data) => {
            output += data.toString();
            if (verbose) {
                process.stderr.write(data);
            }
        });
        docker.stderr.on('data', (data) => {
            stderr += data.toString();
            if (verbose) {
                process.stderr.write(data);
            }
        });
        const timer = setTimeout(() => {
            docker.kill('SIGKILL');
            reject(new Error(`Container timed out after ${timeout}ms`));
        }, timeout);
        docker.on('close', (code) => {
            clearTimeout(timer);
            // Parse output
            const resolved = output.includes('RESOLVED: true');
            const failToPassMatch = output.match(/FAIL_TO_PASS: (\d+) \/ (\d+)/);
            const passToPassMatch = output.match(/PASS_TO_PASS: (\d+) \/ (\d+)/);
            const testsFixed = failToPassMatch ? parseInt(failToPassMatch[1], 10) : 0;
            const testsStillPassing = passToPassMatch ? parseInt(passToPassMatch[1], 10) : 0;
            if (output.includes('PATCH_FAILED')) {
                reject(new Error('Failed to apply patch'));
                return;
            }
            resolve({
                resolved,
                testsFixed,
                testsStillPassing,
                output: output + stderr,
            });
        });
        docker.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
// =============================================================================
// Batch Evaluation
// =============================================================================
/**
 * Evaluate multiple patches in sequence.
 */
export async function evaluatePatches(patches, config = {}, onProgress) {
    const results = [];
    for (let i = 0; i < patches.length; i++) {
        const result = await evaluatePatch(patches[i], config);
        results.push(result);
        onProgress?.(i + 1, patches.length, result);
    }
    return results;
}
/**
 * Compute aggregate statistics from evaluation results.
 */
export function computeEvaluationStats(results) {
    const resolved = results.filter(r => r.resolved).length;
    const errored = results.filter(r => r.error).length;
    const failed = results.length - resolved - errored;
    const avgDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
    return {
        total: results.length,
        resolved,
        failed,
        errored,
        resolutionRate: results.length > 0 ? resolved / results.length : 0,
        avgDurationMs,
    };
}
// =============================================================================
// Utilities
// =============================================================================
/**
 * Check if Docker is available.
 */
export function isDockerAvailable() {
    try {
        execSync('docker --version', { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Get Docker info.
 */
export function getDockerInfo() {
    try {
        const version = execSync('docker --version', { encoding: 'utf-8' }).trim();
        return { version, available: true };
    }
    catch {
        return { version: '', available: false };
    }
}
//# sourceMappingURL=evaluator.js.map