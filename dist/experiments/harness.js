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
import { computeFitness, computeGradient } from '../fitness.js';
import { extractLocatedIssues } from '../targets/extract.js';
import { aggregateToSymbolsWithOptions } from '../targets/aggregate.js';
import { extractSymbols } from '../symbols/extractor.js';
// =============================================================================
// Agent Harness Implementation
// =============================================================================
/**
 * Create an agent harness that wraps metrics/suggestion infrastructure.
 */
export function createAgentHarness(options) {
    const { metricsProvider, executor, targetScore = 90, topTargets = 10, } = options;
    // State
    let currentTask = null;
    let currentConfig = null;
    let currentMetrics = null;
    let currentScore = 0;
    let previousScore = 0;
    let symbolTable = options.symbolTable ?? null;
    let availableTargets = [];
    /**
     * Build or refresh the symbol table.
     */
    async function refreshSymbolTable() {
        if (symbolTable)
            return; // Use provided table
        const sourceFiles = metricsProvider.getSourceFiles
            ? await metricsProvider.getSourceFiles()
            : [];
        if (sourceFiles.length > 0) {
            symbolTable = extractSymbols({
                include: sourceFiles.map(f => f.replace(/\\/g, '/')),
            });
        }
    }
    /**
     * Extract and rank targets based on configuration.
     */
    async function computeTargets(config) {
        if (!currentMetrics)
            return [];
        // No suggestions if gate disabled
        if (!config.gateEnabled)
            return [];
        // Dimension-level suggestions (fastest)
        if (config.granularity === 'dimension') {
            const gradient = computeGradient(currentMetrics);
            return gradient.slice(0, topTargets).map((g, i) => ({
                type: 'dimension',
                id: g.dimension,
                expectedDeltaQ: g.estimatedImprovement,
            }));
        }
        // Symbol or file level - need to extract issues
        try {
            const extracted = await extractLocatedIssues({
                coverageDir: metricsProvider.getProjectRoot(),
            });
            // Combine all issues into a single array
            const allIssues = [
                ...extracted.coverage,
                ...extracted.typescript,
                ...extracted.eslint,
                ...extracted.sonarqube,
            ];
            // Symbol level
            if (config.granularity === 'symbol' && symbolTable) {
                const symbols = aggregateToSymbolsWithOptions(extracted, symbolTable, {
                    includeGraphWeights: config.callGraphWeighting,
                    includeCallGraphWeights: config.callGraphWeighting,
                });
                return symbols.slice(0, topTargets).map(symbolToSuggestion);
            }
            // File level fallback
            // Group issues by file and compute ΔQ
            const byFile = new Map();
            for (const issue of allIssues) {
                if (!issue.file)
                    continue;
                const existing = byFile.get(issue.file);
                if (existing) {
                    existing.issues.push(issue);
                    existing.deltaQ += issue.impact.delta * 0.1; // Rough estimate
                }
                else {
                    byFile.set(issue.file, {
                        issues: [issue],
                        deltaQ: issue.impact.delta * 0.1,
                    });
                }
            }
            const fileTargets = Array.from(byFile.entries())
                .map(([file, data]) => ({
                type: 'file',
                id: file,
                expectedDeltaQ: data.deltaQ,
            }))
                .sort((a, b) => b.expectedDeltaQ - a.expectedDeltaQ);
            return fileTargets.slice(0, topTargets);
        }
        catch {
            // Fall back to dimension level
            const gradient = computeGradient(currentMetrics);
            return gradient.slice(0, topTargets).map((g) => ({
                type: 'dimension',
                id: g.dimension,
                expectedDeltaQ: g.estimatedImprovement,
            }));
        }
    }
    /**
     * Convert SymbolIssues to TargetSuggestion.
     */
    function symbolToSuggestion(symbol) {
        return {
            type: 'symbol',
            id: symbol.symbol.qualifiedName,
            expectedDeltaQ: symbol.totalDeltaQ,
            weightedDeltaQ: symbol.weightedDeltaQ,
            adjustedDeltaQ: symbol.adjustedDeltaQ,
            fixabilityScore: symbol.fixabilityScore,
        };
    }
    /**
     * Check if gate passes with current score.
     */
    function checkPassed() {
        return currentScore >= targetScore;
    }
    // Agent implementation
    return {
        async initialize(task, config) {
            currentTask = task;
            currentConfig = config;
            currentMetrics = await metricsProvider.extractMetrics();
            currentScore = computeFitness(currentMetrics);
            previousScore = currentScore;
            // Build symbol table if needed
            if (config.granularity === 'symbol') {
                await refreshSymbolTable();
            }
            // Compute initial targets
            availableTargets = await computeTargets(config);
        },
        async getSuggestion(config) {
            // No suggestions if gate disabled
            if (!config.gateEnabled)
                return null;
            // Return top target
            if (availableTargets.length > 0) {
                return availableTargets[0];
            }
            return null;
        },
        async executeIteration(iteration, suggestion, config) {
            if (!currentTask || !currentMetrics) {
                return {
                    success: false,
                    actualDeltaQ: 0,
                    targetMatched: false,
                    error: 'Agent not initialized',
                };
            }
            previousScore = currentScore;
            // Build context for executor
            const context = {
                iteration,
                currentScore,
                targetScore,
                availableTargets: config.gateEnabled ? availableTargets : undefined,
                metrics: currentMetrics,
                feedbackEnabled: config.gateEnabled,
                config,
            };
            // Execute fix attempt
            let result;
            try {
                result = await executor.attemptFix(currentTask, suggestion, context);
            }
            catch (error) {
                return {
                    success: false,
                    actualDeltaQ: 0,
                    targetMatched: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
            if (!result.attempted || !result.modified) {
                return {
                    success: false,
                    actualDeltaQ: 0,
                    targetMatched: false,
                    error: result.error,
                };
            }
            // Re-extract metrics after fix
            currentMetrics = await metricsProvider.extractMetrics();
            currentScore = computeFitness(currentMetrics);
            const actualDeltaQ = currentScore - previousScore;
            // Refresh targets for next iteration
            availableTargets = await computeTargets(config);
            return {
                success: actualDeltaQ > 0,
                actualDeltaQ,
                targetMatched: suggestion !== null,
            };
        },
        async evaluate(config) {
            if (!currentMetrics) {
                return {
                    metrics: {},
                    qualityScore: 0,
                    passed: false,
                };
            }
            // Flatten metrics for recording
            const flatMetrics = flattenMetrics(currentMetrics);
            return {
                metrics: flatMetrics,
                qualityScore: currentScore,
                passed: checkPassed(),
            };
        },
        async cleanup() {
            currentTask = null;
            currentConfig = null;
            currentMetrics = null;
            currentScore = 0;
            previousScore = 0;
            symbolTable = options.symbolTable ?? null;
            availableTargets = [];
        },
    };
}
// =============================================================================
// Utilities
// =============================================================================
/**
 * Flatten nested metrics to a Record<string, number>.
 */
function flattenMetrics(metrics, prefix = '') {
    const result = {};
    for (const [key, value] of Object.entries(metrics)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'number') {
            result[path] = value;
        }
        else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenMetrics(value, path));
        }
    }
    return result;
}
/**
 * Create a simple mock metrics provider for testing.
 */
export function createMockMetricsProvider(options = {}) {
    const metrics = {
        coverage: {
            unit: {
                lines: options.initialMetrics?.coverage?.unit?.lines ?? 50,
                branches: options.initialMetrics?.coverage?.unit?.branches ?? 50,
                functions: options.initialMetrics?.coverage?.unit?.functions ?? 50,
                statements: options.initialMetrics?.coverage?.unit?.statements ?? 50,
            },
        },
        typescript: {
            errors: options.initialMetrics?.typescript?.errors ?? 0,
            warnings: options.initialMetrics?.typescript?.warnings ?? 0,
        },
        eslint: {
            errors: options.initialMetrics?.eslint?.errors ?? 0,
            warnings: options.initialMetrics?.eslint?.warnings ?? 0,
        },
        scripts: {},
        ...options.initialMetrics,
    };
    return {
        async extractMetrics() {
            return metrics;
        },
        getProjectRoot() {
            return options.projectRoot ?? process.cwd();
        },
        async getSourceFiles() {
            return [];
        },
    };
}
/**
 * Create a mock LLM executor for testing.
 */
export function createMockExecutor(options = {}) {
    const { improvementProbability = 0.6, seed } = options;
    let rng = seed !== undefined ? seededRandom(seed) : Math.random;
    return {
        async attemptFix(task, suggestion, context) {
            // Simulate fix attempt
            const succeeded = rng() < improvementProbability;
            return {
                attempted: true,
                modified: succeeded,
            };
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
//# sourceMappingURL=harness.js.map