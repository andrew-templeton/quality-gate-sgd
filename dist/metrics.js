/**
 * Metrics Extraction Module
 * Extracts quality metrics from various sources
 */
import { spawnSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, getSonarCurlAuth } from './config.js';
import { extractAllCustomMetrics, registerCustomDimensions, } from './dimensions/index.js';
/**
 * Merge two coverage reports by file.
 * For files appearing in both reports, take the max coverage per file.
 * Then recalculate totals from merged file data.
 */
function mergeCoverageReports(unitData, lambdaData) {
    // Collect all file entries (excluding 'total')
    const mergedFiles = new Map();
    // Process unit test coverage
    if (unitData) {
        for (const [file, entry] of Object.entries(unitData)) {
            if (file === 'total' || !entry)
                continue;
            mergedFiles.set(file, entry);
        }
    }
    // Process lambda test coverage - take max covered for overlapping files
    if (lambdaData) {
        for (const [file, entry] of Object.entries(lambdaData)) {
            if (file === 'total' || !entry)
                continue;
            const existing = mergedFiles.get(file);
            if (!existing) {
                mergedFiles.set(file, entry);
            }
            else {
                // File exists in both - take max covered for each metric
                mergedFiles.set(file, {
                    statements: {
                        total: existing.statements.total,
                        covered: Math.max(existing.statements.covered, entry.statements.covered),
                        pct: 0, // Will recalculate
                    },
                    branches: {
                        total: existing.branches.total,
                        covered: Math.max(existing.branches.covered, entry.branches.covered),
                        pct: 0,
                    },
                    functions: {
                        total: existing.functions.total,
                        covered: Math.max(existing.functions.covered, entry.functions.covered),
                        pct: 0,
                    },
                    lines: {
                        total: existing.lines.total,
                        covered: Math.max(existing.lines.covered, entry.lines.covered),
                        pct: 0,
                    },
                });
            }
        }
    }
    if (mergedFiles.size === 0) {
        return undefined;
    }
    // Calculate totals from merged files
    let totalStatements = 0, coveredStatements = 0;
    let totalBranches = 0, coveredBranches = 0;
    let totalFunctions = 0, coveredFunctions = 0;
    let totalLines = 0, coveredLines = 0;
    for (const entry of Array.from(mergedFiles.values())) {
        totalStatements += entry.statements.total;
        coveredStatements += entry.statements.covered;
        totalBranches += entry.branches.total;
        coveredBranches += entry.branches.covered;
        totalFunctions += entry.functions.total;
        coveredFunctions += entry.functions.covered;
        totalLines += entry.lines.total;
        coveredLines += entry.lines.covered;
    }
    return {
        statements: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
        branches: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
        functions: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
        lines: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
    };
}
/**
 * Extract coverage from a single report's total.
 */
function extractFromTotal(data) {
    if (!data?.total)
        return undefined;
    return {
        statements: data.total.statements.pct,
        branches: data.total.branches.pct,
        functions: data.total.functions.pct,
        lines: data.total.lines.pct,
    };
}
/**
 * Load coverage data from both test suites.
 */
function loadCoverageData() {
    const config = getConfig();
    const unitPath = path.join(config.projectRoot, config.coverage.unitDir, config.coverage.summaryFile);
    const lambdaPath = path.join(config.projectRoot, config.coverage.lambdaDir, config.coverage.summaryFile);
    let unitData;
    let lambdaData;
    if (fs.existsSync(unitPath)) {
        try {
            unitData = JSON.parse(fs.readFileSync(unitPath, 'utf-8'));
        }
        catch {
            // Skip if invalid
        }
    }
    if (fs.existsSync(lambdaPath)) {
        try {
            lambdaData = JSON.parse(fs.readFileSync(lambdaPath, 'utf-8'));
        }
        catch {
            // Skip if invalid
        }
    }
    return { unitData, lambdaData };
}
/**
 * Extract all three coverage metrics: lambda-only, unit-only, and union.
 */
export function extractAllCoverageMetrics() {
    const { unitData, lambdaData } = loadCoverageData();
    return {
        lambda: extractFromTotal(lambdaData),
        unit: extractFromTotal(unitData),
        union: mergeCoverageReports(unitData, lambdaData),
    };
}
/**
 * Extract coverage metrics for quality gate.
 * Returns the union coverage for backward compatibility.
 * @deprecated Use extractAllCoverageMetrics() for full coverage data.
 */
export function extractCoverageMetrics() {
    const { unitData, lambdaData } = loadCoverageData();
    return mergeCoverageReports(unitData, lambdaData);
}
export function getTopSonarIssues(limit = 10) {
    const config = getConfig();
    const sonarUrl = config.sonarqube.url;
    const projectKey = config.sonarqube.projectKey;
    const authArg = getSonarCurlAuth();
    try {
        const result = execSync(`curl -s ${authArg} "${sonarUrl}/api/issues/search?componentKeys=${projectKey}&severities=BLOCKER,CRITICAL,MAJOR,MINOR&statuses=OPEN,CONFIRMED&ps=${limit}&s=SEVERITY"`, { encoding: 'utf-8', timeout: 10000 });
        const response = JSON.parse(result);
        if (!response.issues)
            return [];
        return response.issues.map((i) => ({
            severity: i.severity,
            type: i.type,
            message: i.message,
            component: i.component.replace(`${projectKey}:`, ''),
            line: i.line,
            rule: i.rule,
        }));
    }
    catch {
        return [];
    }
}
export function extractSonarqubeMetrics() {
    const config = getConfig();
    const sonarUrl = config.sonarqube.url;
    const projectKey = config.sonarqube.projectKey;
    const authArg = getSonarCurlAuth();
    const metrics = [
        'bugs',
        'vulnerabilities',
        'code_smells',
        'coverage',
        'duplicated_lines_density',
        // Severity breakdown
        'blocker_violations',
        'critical_violations',
        'major_violations',
        'minor_violations',
        'info_violations',
    ].join(',');
    try {
        const result = execSync(`curl -s ${authArg} "${sonarUrl}/api/measures/component?component=${projectKey}&metricKeys=${metrics}"`, { encoding: 'utf-8', timeout: 10000 });
        const response = JSON.parse(result);
        const measures = response.component?.measures;
        if (!measures || measures.length === 0) {
            return undefined;
        }
        const getValue = (metric) => {
            const m = measures.find((m) => m.metric === metric);
            return m ? parseFloat(m.value) : 0;
        };
        return {
            bugs: getValue('bugs'),
            vulnerabilities: getValue('vulnerabilities'),
            codeSmells: getValue('code_smells'),
            coverage: getValue('coverage'),
            duplications: getValue('duplicated_lines_density'),
            blocker: getValue('blocker_violations'),
            critical: getValue('critical_violations'),
            major: getValue('major_violations'),
            minor: getValue('minor_violations'),
            info: getValue('info_violations'),
        };
    }
    catch {
        return undefined;
    }
}
export function isSonarqubeAvailable() {
    const config = getConfig();
    try {
        execSync(`curl -s -o /dev/null -w "%{http_code}" ${config.sonarqube.url}`, {
            encoding: 'utf-8',
            timeout: 5000,
        });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Wait for a SonarQube analysis task to complete.
 * Polls the task API until status is SUCCESS, FAILED, or CANCELED.
 */
function waitForSonarTask(taskId, timeoutMs = 120000) {
    const config = getConfig();
    const sonarUrl = config.sonarqube.url;
    const authArg = getSonarCurlAuth();
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds
    while (Date.now() - startTime < timeoutMs) {
        try {
            const result = execSync(`curl -s ${authArg} "${sonarUrl}/api/ce/task?id=${taskId}"`, { encoding: 'utf-8', timeout: 10000 });
            const response = JSON.parse(result);
            const status = response.task?.status;
            if (status === 'SUCCESS') {
                return { success: true };
            }
            if (status === 'FAILED') {
                return {
                    success: false,
                    error: response.task?.errorMessage || 'Analysis task failed',
                };
            }
            if (status === 'CANCELED') {
                return { success: false, error: 'Analysis task was canceled' };
            }
            // Still in progress - wait and retry
        }
        catch {
            // Ignore transient errors during polling
        }
        // Sleep for poll interval
        execSync(`sleep ${pollInterval / 1000}`, { encoding: 'utf-8' });
    }
    return {
        success: false,
        error: 'Timed out waiting for analysis to complete',
    };
}
/**
 * Extract the task ID from SonarQube scanner's report-task.txt file.
 */
function getSonarTaskId() {
    const config = getConfig();
    const reportTaskPath = path.join(config.projectRoot, '.scannerwork/report-task.txt');
    if (!fs.existsSync(reportTaskPath)) {
        return undefined;
    }
    try {
        const content = fs.readFileSync(reportTaskPath, 'utf-8');
        // File contains lines like: ceTaskId=AZQxyz123...
        const match = content.match(/ceTaskId=([^\s\n]+)/);
        return match?.[1];
    }
    catch {
        return undefined;
    }
}
export function runSonarqubeScan() {
    const config = getConfig();
    const maxRetries = 2;
    let lastError = '';
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (attempt > 1) {
            console.error(`  Retry attempt ${attempt}/${maxRetries}...`);
            // Brief pause before retry
            spawnSync('sleep', ['5'], { shell: true });
        }
        // Run npm run sonar which handles the full scan (with locking)
        const result = spawnSync('npm', ['run', 'sonar'], {
            cwd: config.projectRoot,
            encoding: 'utf-8',
            shell: true,
            timeout: 300000, // 5 minutes for scan
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const errorOutput = (result.stderr || '') + (result.stdout || '');
        if (result.status === 0) {
            // Scanner completed - now wait for the analysis task to finish
            const taskId = getSonarTaskId();
            if (!taskId) {
                // No task ID found - scan may have failed to submit
                // Check if SonarQube has metrics anyway (might be from previous scan)
                return { success: true };
            }
            // Wait for the analysis task to complete
            return waitForSonarTask(taskId);
        }
        // Check if this is a transient error worth retrying
        const isTransient = errorOutput.includes('WebSocket connection error') ||
            errorOutput.includes('Connection reset') ||
            errorOutput.includes('Broken pipe') ||
            errorOutput.includes('Another SonarQube analysis is already in progress');
        lastError = errorOutput.slice(-500);
        if (!isTransient || attempt === maxRetries) {
            return {
                success: false,
                error: lastError,
            };
        }
        // Transient error - will retry
        console.error(`  Transient error detected, will retry...`);
    }
    return {
        success: false,
        error: lastError,
    };
}
/**
 * Parse TypeScript error output into structured errors.
 * Format: src/file.ts(10,5): error TS2345: Message here
 */
function parseTypescriptErrors(output) {
    const errors = [];
    // Match: file(line,col): error TSxxxx: message
    const errorRegex = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
    let match;
    while ((match = errorRegex.exec(output)) !== null) {
        errors.push({
            file: match[1],
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            code: match[4],
            message: match[5],
        });
    }
    return errors;
}
/**
 * Count distinct root causes from TypeScript errors.
 * Root cause = unique (file, code) combination.
 *
 * Rationale: Cascading type errors often share the same error code in the same file.
 * For example, a missing property causes TS2339 on every access attempt.
 * Fixing the root cause fixes all instances.
 *
 * For finer granularity, we could also use symbol paths, but (file, code)
 * is a reasonable first approximation that restores local continuity.
 */
function countTypescriptRootCauses(errors) {
    const rootCauses = new Set();
    for (const err of errors) {
        // Group by file + error code
        // This collapses cascading errors from the same root cause
        const key = `${err.file}:${err.code}`;
        rootCauses.add(key);
    }
    return rootCauses.size;
}
export function extractTypescriptMetrics() {
    const config = getConfig();
    const result = spawnSync('npm', ['run', 'type-check'], {
        cwd: config.projectRoot,
        encoding: 'utf-8',
        shell: true,
        timeout: 60000,
    });
    const output = (result.stdout || '') + (result.stderr || '');
    // Parse structured errors
    const errors = parseTypescriptErrors(output);
    // Also do simple regex count as fallback (for non-standard output formats)
    const errorMatches = output.match(/error TS\d+/g) || [];
    const rawCount = Math.max(errors.length, errorMatches.length);
    return {
        errors: rawCount,
        warnings: 0, // TypeScript doesn't have warnings in strict mode
        rootCauses: countTypescriptRootCauses(errors),
    };
}
/**
 * Count distinct root causes from ESLint results.
 * Root cause = unique (file, ruleId) combination.
 *
 * Rationale: The same rule violation in the same file often indicates
 * a systematic issue that should be fixed once. For example, multiple
 * "no-unused-vars" in the same file might all be resolved by one refactor.
 */
function countEslintRootCauses(results) {
    const rootCauses = new Set();
    for (const fileResult of results) {
        for (const msg of fileResult.messages) {
            if (msg.severity === 2 && msg.ruleId) {
                // Only count errors, not warnings
                const key = `${fileResult.filePath}:${msg.ruleId}`;
                rootCauses.add(key);
            }
        }
    }
    return rootCauses.size;
}
export function extractEslintMetrics() {
    const config = getConfig();
    const result = spawnSync('npx', ['eslint', '--format', 'json', 'src/'], {
        cwd: config.projectRoot,
        encoding: 'utf-8',
        shell: true,
        timeout: 120000,
    });
    try {
        const output = result.stdout || '[]';
        const results = JSON.parse(output);
        let errors = 0;
        let warnings = 0;
        for (const r of results) {
            errors += r.errorCount || 0;
            warnings += r.warningCount || 0;
        }
        return {
            errors,
            warnings,
            rootCauses: countEslintRootCauses(results),
        };
    }
    catch {
        // If parsing fails, check exit code
        return {
            errors: result.status === 0 ? 0 : 1,
            warnings: 0,
            rootCauses: undefined, // Can't compute without parsed output
        };
    }
}
// =============================================================================
// Script Execution
// =============================================================================
export function runScript(script) {
    const config = getConfig();
    const timeout = config.scriptTimeouts[script] ?? config.defaultScriptTimeout;
    const result = spawnSync('npm', ['run', script], {
        cwd: config.projectRoot,
        encoding: 'utf-8',
        shell: true,
        timeout,
    });
    return result.status === 0 ? 'pass' : 'fail';
}
export function runScripts(scripts) {
    const results = {};
    for (const script of scripts) {
        results[script] = runScript(script);
    }
    return results;
}
// =============================================================================
// SLOC Extraction (Source Lines of Code)
// =============================================================================
/**
 * Count source lines of code in a directory.
 * Uses a simple heuristic: non-empty, non-comment lines in .ts/.tsx/.js/.jsx files.
 * For determinism, always scans the same directories with the same rules.
 */
export function extractSloc(srcDir) {
    const config = getConfig();
    const targetDir = srcDir ?? path.join(config.projectRoot, 'src');
    if (!fs.existsSync(targetDir)) {
        return 0;
    }
    let totalSloc = 0;
    function countLinesInFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            let sloc = 0;
            let inBlockComment = false;
            for (const line of lines) {
                const trimmed = line.trim();
                // Handle block comments
                if (inBlockComment) {
                    if (trimmed.includes('*/')) {
                        inBlockComment = false;
                    }
                    continue;
                }
                if (trimmed.startsWith('/*')) {
                    if (!trimmed.includes('*/')) {
                        inBlockComment = true;
                    }
                    continue;
                }
                // Skip empty lines and single-line comments
                if (trimmed === '' || trimmed.startsWith('//')) {
                    continue;
                }
                sloc++;
            }
            return sloc;
        }
        catch {
            return 0;
        }
    }
    function walkDirectory(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                // Skip node_modules, dist, coverage, .git, etc.
                if (entry.isDirectory() &&
                    !['node_modules', 'dist', 'coverage', '.git', '.next', 'build'].includes(entry.name)) {
                    walkDirectory(fullPath);
                }
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                        // Skip test files and type declaration files
                        if (!entry.name.includes('.test.') &&
                            !entry.name.includes('.spec.') &&
                            !entry.name.endsWith('.d.ts')) {
                            totalSloc += countLinesInFile(fullPath);
                        }
                    }
                }
            }
        }
        catch {
            // Skip directories we can't read
        }
    }
    walkDirectory(targetDir);
    return totalSloc;
}
export function extractAllMetrics(scriptsToRunOrOptions = ['quality']) {
    // Support both legacy array signature and new options object
    const options = Array.isArray(scriptsToRunOrOptions)
        ? { scriptsToRun: scriptsToRunOrOptions }
        : scriptsToRunOrOptions;
    const scriptsToRun = options.scriptsToRun ?? ['quality'];
    const skipSonarQube = options.skipSonarQube ?? false;
    const skipCustomDimensions = options.skipCustomDimensions ?? false;
    // Extract custom metrics if configs are provided and not skipped
    let custom;
    if (!skipCustomDimensions && options.customDimensions && options.customDimensions.length > 0) {
        custom = extractAllCustomMetrics(options.customDimensions);
    }
    return {
        coverage: extractAllCoverageMetrics(),
        typescript: extractTypescriptMetrics(),
        eslint: extractEslintMetrics(),
        sonarqube: skipSonarQube ? undefined : extractSonarqubeMetrics(),
        scripts: runScripts(scriptsToRun),
        sloc: extractSloc(),
        custom,
    };
}
/**
 * Async version of extractAllMetrics that loads custom dimensions from config.
 * Use this when you want automatic custom dimension discovery.
 */
export async function extractAllMetricsAsync(options = {}) {
    // Load and register custom dimensions if not already provided
    let customDimensions = options.customDimensions;
    if (!customDimensions && !options.skipCustomDimensions) {
        customDimensions = await registerCustomDimensions();
    }
    return extractAllMetrics({
        ...options,
        customDimensions,
    });
}
//# sourceMappingURL=metrics.js.map