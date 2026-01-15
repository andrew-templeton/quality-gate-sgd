/**
 * Located Issue Extraction
 * ========================
 * Extracts issues with location information from all quality sources.
 *
 * Unlike the metrics extraction (which aggregates to counts), this preserves
 * the file:line:column information so we can compute target-space gradients.
 */
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { getConfig, getSonarAuthToken } from '../config.js';
/**
 * Extract uncovered branches and lines from coverage-final.json.
 *
 * Each uncovered branch becomes a LocatedIssue with estimated coverage impact.
 */
export function extractCoverageIssues(coverageDir) {
    const config = getConfig();
    const issues = [];
    // Try unit coverage first, then lambda
    const coveragePaths = [
        path.join(config.projectRoot, coverageDir ?? config.coverage.unitDir, 'coverage-final.json'),
        path.join(config.projectRoot, config.coverage.lambdaDir, 'coverage-final.json'),
    ];
    for (const coveragePath of coveragePaths) {
        if (!existsSync(coveragePath))
            continue;
        try {
            const data = JSON.parse(readFileSync(coveragePath, 'utf-8'));
            for (const [filePath, fileCoverage] of Object.entries(data)) {
                // Skip node_modules and test files
                if (filePath.includes('node_modules') || filePath.includes('.test.') || filePath.includes('.spec.')) {
                    continue;
                }
                // Count total branches for this file to estimate per-branch impact
                const totalBranches = Object.values(fileCoverage.branchMap).reduce((sum, branch) => sum + branch.locations.length, 0);
                // Extract uncovered branches
                for (const [branchId, branch] of Object.entries(fileCoverage.branchMap)) {
                    const hitCounts = fileCoverage.b[branchId] || [];
                    for (let i = 0; i < branch.locations.length; i++) {
                        const loc = branch.locations[i];
                        const hits = hitCounts[i] ?? 0;
                        if (hits === 0) {
                            // Estimate impact: each branch is roughly equal fraction of file's branch coverage
                            // If file has 10 branches and 5 uncovered, covering 1 branch adds ~10% to file's coverage
                            const estimatedImpact = totalBranches > 0 ? 100 / totalBranches : 1;
                            issues.push({
                                file: filePath,
                                line: loc.start.line,
                                column: loc.start.column,
                                endLine: loc.end.line,
                                endColumn: loc.end.column,
                                source: 'coverage',
                                dimension: 'coverage.unit.branches',
                                code: `branch-${branch.type}`,
                                impact: {
                                    dimension: 'coverage.unit.branches',
                                    delta: estimatedImpact / 100, // Fractional coverage gain
                                    direction: 'higher-better',
                                },
                                message: `Uncovered ${branch.type} branch`,
                                context: `Branch ${branchId}[${i}] at line ${loc.start.line}`,
                            });
                        }
                    }
                }
                // Extract uncovered functions
                for (const [fnId, fn] of Object.entries(fileCoverage.fnMap)) {
                    const hits = fileCoverage.f[fnId] ?? 0;
                    if (hits === 0) {
                        issues.push({
                            file: filePath,
                            line: fn.loc.start.line,
                            column: fn.loc.start.column,
                            endLine: fn.loc.end.line,
                            endColumn: fn.loc.end.column,
                            symbol: fn.name || `anonymous_${fnId}`,
                            source: 'coverage',
                            dimension: 'coverage.unit.functions',
                            code: 'uncovered-function',
                            impact: {
                                dimension: 'coverage.unit.functions',
                                delta: 0.5, // Rough estimate: covering a function helps
                                direction: 'higher-better',
                            },
                            message: `Uncovered function: ${fn.name || 'anonymous'}`,
                            context: `Function at line ${fn.loc.start.line}`,
                        });
                    }
                }
            }
        }
        catch (error) {
            // Silently skip if coverage file is malformed
            console.error(`Warning: Could not parse ${coveragePath}: ${error}`);
        }
    }
    return issues;
}
function parseTypescriptOutput(output) {
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
 * Extract TypeScript errors with location information.
 */
export function extractTypescriptIssues() {
    const config = getConfig();
    const result = spawnSync('npm', ['run', 'type-check'], {
        cwd: config.projectRoot,
        encoding: 'utf-8',
        shell: true,
        timeout: 60000,
    });
    const output = (result.stdout || '') + (result.stderr || '');
    const errors = parseTypescriptOutput(output);
    return errors.map((err) => ({
        file: err.file,
        line: err.line,
        column: err.column,
        source: 'typescript',
        dimension: 'typescript.errors',
        code: err.code,
        impact: {
            dimension: 'typescript.errors',
            delta: -1, // Fixing one error reduces count by 1
            direction: 'lower-better',
        },
        message: err.message,
        context: `${err.code}: ${err.message}`,
    }));
}
/**
 * Extract ESLint issues with location information.
 */
export function extractEslintIssues() {
    const config = getConfig();
    const result = spawnSync('npx', ['eslint', '--format', 'json', 'src/'], {
        cwd: config.projectRoot,
        encoding: 'utf-8',
        shell: true,
        timeout: 120000,
    });
    const issues = [];
    try {
        const output = result.stdout || '[]';
        const results = JSON.parse(output);
        for (const fileResult of results) {
            for (const msg of fileResult.messages) {
                const isError = msg.severity === 2;
                const dimension = isError ? 'eslint.errors' : 'eslint.warnings';
                issues.push({
                    file: fileResult.filePath,
                    line: msg.line,
                    column: msg.column,
                    endLine: msg.endLine,
                    endColumn: msg.endColumn,
                    source: 'eslint',
                    dimension,
                    code: msg.ruleId || 'unknown',
                    severity: isError ? 'major' : 'minor',
                    impact: {
                        dimension,
                        delta: -1, // Fixing one issue reduces count by 1
                        direction: 'lower-better',
                    },
                    message: msg.message,
                    context: msg.ruleId ? `Rule: ${msg.ruleId}` : undefined,
                });
            }
        }
    }
    catch {
        // If parsing fails, return empty
    }
    return issues;
}
function mapSonarSeverity(severity) {
    switch (severity.toUpperCase()) {
        case 'BLOCKER': return 'blocker';
        case 'CRITICAL': return 'critical';
        case 'MAJOR': return 'major';
        case 'MINOR': return 'minor';
        default: return 'info';
    }
}
function mapSonarTypeToDimension(type) {
    switch (type.toUpperCase()) {
        case 'BUG': return 'sonarqube.bugs';
        case 'VULNERABILITY': return 'sonarqube.vulnerabilities';
        case 'CODE_SMELL': return 'sonarqube.codeSmells';
        default: return 'sonarqube.codeSmells';
    }
}
/**
 * Extract SonarQube issues with location information.
 */
export function extractSonarqubeIssues() {
    const config = getConfig();
    const token = getSonarAuthToken();
    if (!token) {
        return [];
    }
    const issues = [];
    try {
        // Fetch all unresolved issues (paginated)
        let page = 1;
        const pageSize = 500;
        let hasMore = true;
        while (hasMore) {
            const params = new URLSearchParams({
                componentKeys: config.sonarqube.projectKey,
                ps: String(pageSize),
                p: String(page),
                resolved: 'false',
            });
            const result = spawnSync('curl', [
                '-s',
                '-u', `${token}:`,
                `${config.sonarqube.url}/api/issues/search?${params}`,
            ], {
                encoding: 'utf-8',
                timeout: 30000,
            });
            if (result.status !== 0 || !result.stdout) {
                break;
            }
            const response = JSON.parse(result.stdout);
            for (const issue of response.issues) {
                // Extract file path from component (format: projectKey:path/to/file.ts)
                const filePath = issue.component.replace(`${config.sonarqube.projectKey}:`, '');
                const dimension = mapSonarTypeToDimension(issue.type);
                const severity = mapSonarSeverity(issue.severity);
                issues.push({
                    file: filePath,
                    line: issue.line,
                    source: 'sonarqube',
                    dimension,
                    code: issue.rule,
                    severity,
                    impact: {
                        dimension,
                        delta: -1, // Fixing one issue reduces count by 1
                        direction: 'lower-better',
                    },
                    message: issue.message,
                    context: `Rule: ${issue.rule}, Type: ${issue.type}`,
                });
            }
            // Check if there are more pages
            const totalFetched = page * pageSize;
            hasMore = totalFetched < response.total && response.issues.length === pageSize;
            page++;
            // Safety limit to prevent infinite loops
            if (page > 10)
                break;
        }
    }
    catch {
        // If fetching fails, return empty
    }
    return issues;
}
// =============================================================================
// Combined Extraction
// =============================================================================
/**
 * Extract located issues from all sources.
 *
 * This is the main entry point for Phase 2 of the location-aware targets system.
 */
export function extractLocatedIssues(options = {}) {
    const coverage = extractCoverageIssues(options.coverageDir);
    const typescript = options.skipTypescript ? [] : extractTypescriptIssues();
    const eslint = options.skipEslint ? [] : extractEslintIssues();
    const sonarqube = options.skipSonarQube ? [] : extractSonarqubeIssues();
    return {
        coverage,
        typescript,
        eslint,
        sonarqube,
        totalCount: coverage.length + typescript.length + eslint.length + sonarqube.length,
        summary: {
            coverage: coverage.length,
            typescript: typescript.length,
            eslint: eslint.length,
            sonarqube: sonarqube.length,
        },
    };
}
//# sourceMappingURL=extract.js.map