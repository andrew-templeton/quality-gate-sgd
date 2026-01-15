/**
 * MCP Tool Handlers
 * =================
 * Implements the tool handlers for the MCP server.
 */
import { extractAllMetrics } from '../metrics.js';
import { loadRules, evaluateRules } from '../rules.js';
import { loadCache, findBaselineEntry, getCacheKey, } from '../cache.js';
import { computeFitness, computeGradient, suggestNextFixes } from '../fitness.js';
import { extractLocatedIssues, aggregateToTargets, formatTargetsForJson, } from '../targets/index.js';
import { buildTrajectory, formatTrajectorySummary } from '../trajectory.js';
import { getAllDimensions, getDimension } from '../dimensions/index.js';
// =============================================================================
// Tool Definitions
// =============================================================================
export const TOOLS = [
    {
        name: 'quality_gate_run',
        description: 'Run the quality gate and return pass/fail status with detailed metrics. Use this to check if code meets quality standards.',
        inputSchema: {
            type: 'object',
            properties: {
                coverageOnly: {
                    type: 'boolean',
                    description: 'Skip SonarQube analysis, only use coverage/TypeScript/ESLint metrics',
                    default: false,
                },
            },
        },
    },
    {
        name: 'quality_gate_score',
        description: 'Get the current fitness score (0-100) representing overall code quality. Higher is better.',
        inputSchema: {
            type: 'object',
            properties: {
                coverageOnly: {
                    type: 'boolean',
                    description: 'Skip SonarQube analysis',
                    default: false,
                },
            },
        },
    },
    {
        name: 'quality_gate_suggest',
        description: 'Get optimization targets ranked by expected fitness gain (ΔQ). Supports three granularity levels: "dimension" (which metric to improve), "file" (which file to fix), or "symbol" (which function/class). File and symbol modes provide cross-dimension analysis - a single target may address coverage gaps, errors, AND code smells simultaneously.',
        inputSchema: {
            type: 'object',
            properties: {
                granularity: {
                    type: 'string',
                    enum: ['dimension', 'file', 'symbol'],
                    description: 'Level of detail: "dimension" = which metric, "file" = which file, "symbol" = which function/class',
                    default: 'file',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of targets to return',
                    default: 5,
                },
                coverageOnly: {
                    type: 'boolean',
                    description: 'Skip SonarQube analysis',
                    default: false,
                },
            },
        },
    },
    {
        name: 'quality_gate_trajectory',
        description: 'Get the quality improvement trajectory showing how code quality has changed over time.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'quality_gate_explain',
        description: 'Explain a quality dimension or concept. Useful for understanding what metrics mean.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    description: 'The dimension path (e.g., "coverage.unit.branches") or concept (e.g., "fitness", "monotonic") to explain',
                },
            },
            required: ['topic'],
        },
    },
];
export async function handleRun(args) {
    const skipSonarQube = args.coverageOnly ?? false;
    try {
        const rules = loadRules();
        const requiredScripts = rules.rules.requiredScripts || ['quality'];
        const metrics = extractAllMetrics({
            scriptsToRun: requiredScripts,
            skipSonarQube,
        });
        const cache = loadCache();
        const { key: cacheKey, isWIP } = getCacheKey();
        const baselineEntry = findBaselineEntry(cache, rules, isWIP);
        const result = evaluateRules(rules, metrics, baselineEntry);
        const fitness = computeFitness(metrics);
        const response = {
            status: result.status,
            fitnessScore: Math.round(fitness * 10) / 10,
            metrics: formatMetricsSummary(metrics),
            failedRules: result.failedRules.map(f => ({
                type: f.type,
                rule: f.rule,
                message: f.message,
            })),
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error running quality gate: ${error}` }],
        };
    }
}
export async function handleScore(args) {
    const skipSonarQube = args.coverageOnly ?? false;
    try {
        const rules = loadRules();
        const requiredScripts = rules.rules.requiredScripts || ['quality'];
        const metrics = extractAllMetrics({
            scriptsToRun: requiredScripts,
            skipSonarQube,
        });
        const score = computeFitness(metrics);
        const gradient = computeGradient(metrics);
        const response = {
            score: Math.round(score * 10) / 10,
            breakdown: gradient.slice(0, 10).map(g => ({
                dimension: g.dimension,
                displayName: g.displayName,
                currentValue: g.currentValue,
                direction: g.direction,
                priority: Math.round(g.priority * 1000) / 1000,
            })),
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error computing score: ${error}` }],
        };
    }
}
export async function handleSuggest(args) {
    const granularity = args.granularity ?? 'file';
    const limit = args.limit ?? 5;
    const skipSonarQube = args.coverageOnly ?? false;
    try {
        const rules = loadRules();
        const requiredScripts = rules.rules.requiredScripts || ['quality'];
        const metrics = extractAllMetrics({
            scriptsToRun: requiredScripts,
            skipSonarQube,
        });
        const currentScore = computeFitness(metrics);
        // Dimension-level suggestions (original behavior)
        if (granularity === 'dimension') {
            const suggestions = suggestNextFixes(metrics, limit);
            const response = {
                mode: 'dimension',
                currentScore: Math.round(currentScore * 10) / 10,
                suggestions: suggestions.map(s => ({
                    dimension: s.dimension,
                    displayName: s.displayName,
                    rationale: s.rationale,
                    currentValue: s.currentValue,
                    targetValue: s.targetValue,
                    estimatedGain: Math.round(s.estimatedGain * 1000) / 1000,
                })),
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
        }
        // File-level or symbol-level: extract located issues and aggregate
        const extractedIssues = extractLocatedIssues({
            skipSonarQube,
            skipTypescript: false,
            skipEslint: false,
        });
        const targetGranularity = granularity === 'symbol' ? 'symbol' : 'file';
        const targets = aggregateToTargets(extractedIssues, {
            granularity: targetGranularity,
            limit,
        });
        const response = {
            mode: granularity,
            currentScore: Math.round(currentScore * 10) / 10,
            issuesSummary: {
                total: extractedIssues.totalCount,
                coverage: extractedIssues.summary.coverage,
                typescript: extractedIssues.summary.typescript,
                eslint: extractedIssues.summary.eslint,
                sonarqube: extractedIssues.summary.sonarqube,
            },
            ...formatTargetsForJson(targets),
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error generating suggestions: ${error}` }],
        };
    }
}
export async function handleTrajectory() {
    try {
        const cache = loadCache();
        const trajectory = buildTrajectory(cache);
        const response = {
            pointCount: trajectory.points.length,
            convergenceState: trajectory.convergenceState,
            totalDescent: Math.round(trajectory.totalDescent * 100) / 100,
            averageStepSize: Math.round(trajectory.averageStepSize * 100) / 100,
            monotonicSteps: trajectory.monotonicSteps,
            regressionSteps: trajectory.regressionSteps,
            summary: formatTrajectorySummary(trajectory),
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error building trajectory: ${error}` }],
        };
    }
}
export async function handleExplain(args) {
    const topic = args.topic.toLowerCase();
    // Try to find dimension
    const dimension = getDimension(args.topic) ?? getDimension(`coverage.unit.${topic}`);
    if (dimension) {
        const explanation = {
            path: dimension.path,
            displayName: dimension.displayName,
            description: dimension.description,
            unit: dimension.unit,
            direction: dimension.direction,
            continuity: dimension.continuity,
            defaultWeight: dimension.defaultWeight,
            category: dimension.category,
            tips: getDirectionTips(dimension.direction),
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(explanation, null, 2) }],
        };
    }
    // Built-in explanations for concepts
    const concepts = {
        fitness: `The fitness score (0-100) is a weighted combination of all quality dimensions. Higher scores mean better code quality. The score is computed using:
- Coverage metrics (higher is better, weighted heavily)
- Error counts (lower is better, exponential decay)
The fitness function creates a smooth optimization landscape for quality improvement.`,
        monotonic: `Monotonic rules enforce that metrics can only improve, never regress. This creates a "ratchet" effect:
- "direction: up" means the metric must stay at or above the baseline
- "direction: down" means the metric must stay at or below the baseline
This prevents quality backsliding between commits.`,
        floor: `Floors are minimum acceptable values for metrics. The quality gate fails if any floor is violated. Example: coverage.unit.branches >= 70 means branch coverage must be at least 70%.`,
        ceiling: `Ceilings are maximum acceptable values for metrics. The quality gate fails if any ceiling is violated. Example: typescript.errors <= 0 means no TypeScript errors are allowed.`,
        gradient: `The gradient shows which dimension improvements will have the largest impact on fitness score. Higher priority means:
- Larger weight in fitness function
- More room for improvement
- Better ROI for development effort
Use the suggest command to see prioritized improvements.`,
        convergence: `Convergence describes the trajectory toward quality targets:
- "improving": Consistent quality gains over time
- "converged": Quality targets met or nearly met
- "stagnating": No progress in recent iterations
- "oscillating": Quality bouncing up and down
The trajectory command shows detailed convergence analysis.`,
    };
    if (concepts[topic]) {
        return {
            content: [{ type: 'text', text: concepts[topic] }],
        };
    }
    // List available topics
    const allDimensions = getAllDimensions().map(d => d.path);
    return {
        content: [{
                type: 'text',
                text: `Unknown topic: "${args.topic}"\n\nAvailable dimension paths:\n${allDimensions.slice(0, 20).join('\n')}\n\nAvailable concepts:\n${Object.keys(concepts).join('\n')}`,
            }],
    };
}
// =============================================================================
// Helpers
// =============================================================================
function formatMetricsSummary(metrics) {
    const summary = {};
    if (metrics.coverage?.unit) {
        summary.coverage = {
            branches: Math.round(metrics.coverage.unit.branches * 10) / 10,
            statements: Math.round(metrics.coverage.unit.statements * 10) / 10,
        };
    }
    if (metrics.typescript) {
        summary.typescript = {
            errors: metrics.typescript.errors,
            rootCauses: metrics.typescript.rootCauses,
        };
    }
    if (metrics.eslint) {
        summary.eslint = {
            errors: metrics.eslint.errors,
            warnings: metrics.eslint.warnings,
        };
    }
    if (metrics.sonarqube) {
        summary.sonarqube = {
            bugs: metrics.sonarqube.bugs,
            vulnerabilities: metrics.sonarqube.vulnerabilities,
            codeSmells: metrics.sonarqube.codeSmells,
        };
    }
    return summary;
}
function getDirectionTips(direction) {
    if (direction === 'higher-better') {
        return 'Increase this metric to improve quality. Add tests for uncovered code paths.';
    }
    return 'Decrease this metric to improve quality. Fix or suppress the reported issues.';
}
//# sourceMappingURL=tools.js.map