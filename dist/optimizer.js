/**
 * Optimizer Module
 * ================
 * Computes file priorities for LLM agent guidance using a multi-dimensional
 * priority function that combines coverage, ease of testing, impact, and severity.
 *
 * This implements the mathematical framework for "weighted gradient descent" where:
 * - Objective metrics (coverage, bugs) create the gradient (what to optimize)
 * - Weighting metrics (impact, ease) focus the gradient (where to optimize)
 *
 * The composite priority function is:
 *   priority = w_cov * coverageGap + w_ease * easeOfTesting + w_impact * importance + w_sev * severityScore
 */
import { sumSeverityWeights, normalizeSeverityScore } from './severity.js';
// =============================================================================
// Default Priority Weights
// =============================================================================
/**
 * Default weights for the four priority dimensions.
 * These can be customized to emphasize different aspects of quality.
 *
 * Default strategy prioritizes:
 * 1. Impact (0.30) - Critical code that affects many files
 * 2. Coverage (0.30) - Files needing more tests
 * 3. Ease (0.25) - Leaf nodes that are simpler to test
 * 4. Severity (0.15) - Files with more/worse violations
 */
export const DEFAULT_PRIORITY_WEIGHTS = {
    coverage: 0.30,
    ease: 0.25,
    impact: 0.30,
    severity: 0.15,
};
// =============================================================================
// Priority Computation
// =============================================================================
/**
 * Compute the coverage gap for a file.
 * Uses branch coverage as the primary metric (most meaningful for quality).
 *
 * @param coverage - File coverage metrics (optional)
 * @returns Coverage gap between 0 (fully covered) and 1 (no coverage)
 */
function computeCoverageGap(coverage) {
    if (!coverage) {
        return 1; // No coverage = maximum gap
    }
    // Use branches as primary metric, fall back to statements
    const primaryCoverage = coverage.branches ?? coverage.statements ?? 0;
    return 1 - primaryCoverage / 100;
}
/**
 * Compute the ease of testing for a file based on its degree.
 * Lower degree = easier to test (fewer dependencies to mock).
 *
 * @param degree - Dependency degree (0 = leaf node)
 * @returns Ease score between 0 (hard to test) and 1 (easy to test)
 */
function computeEaseOfTesting(degree) {
    return 1 / (1 + degree);
}
/**
 * Compute the priority score for a single file.
 *
 * @param file - File info with degree, impact, and coverage
 * @param failedRules - Array of failed rules (for severity calculation)
 * @param weights - Priority dimension weights
 * @param customSeverityWeights - Optional custom severity weights
 * @returns PrioritizedFile with priority score and components
 */
export function computePriority(file, failedRules = [], weights = DEFAULT_PRIORITY_WEIGHTS, customSeverityWeights) {
    // Compute individual components
    const coverageGap = computeCoverageGap(file.coverage);
    const easeOfTesting = computeEaseOfTesting(file.degree);
    const importance = file.impact;
    // Compute severity from failed rules (normalized to 0-1)
    const rawSeverity = sumSeverityWeights(failedRules, customSeverityWeights);
    const severityScore = normalizeSeverityScore(rawSeverity);
    // Compute weighted priority
    const priority = weights.coverage * coverageGap +
        weights.ease * easeOfTesting +
        weights.impact * importance +
        weights.severity * severityScore;
    return {
        file,
        priority,
        components: {
            coverageGap,
            easeOfTesting,
            importance,
            severityScore,
        },
    };
}
/**
 * Prioritize all files based on the composite priority function.
 * Returns files sorted by priority (highest first).
 *
 * @param files - Map of file paths to FileInfo
 * @param failedRules - Array of failed rules (optional, for severity)
 * @param weights - Priority dimension weights
 * @param threshold - Minimum coverage threshold to include (default: 100 = all files)
 * @returns Array of PrioritizedFile sorted by priority descending
 */
export function prioritizeFiles(files, failedRules = [], weights = DEFAULT_PRIORITY_WEIGHTS, threshold = 100) {
    const prioritized = [];
    for (const [, fileInfo] of files) {
        // Filter by coverage threshold
        const coverage = fileInfo.coverage;
        if (coverage) {
            const minCoverage = Math.min(coverage.branches, coverage.statements, coverage.functions, coverage.lines);
            if (minCoverage >= threshold) {
                continue; // Skip files meeting threshold
            }
        }
        // Compute priority
        const prioritizedFile = computePriority(fileInfo, failedRules, weights);
        prioritized.push(prioritizedFile);
    }
    // Sort by priority descending (highest priority first)
    prioritized.sort((a, b) => b.priority - a.priority);
    return prioritized;
}
// =============================================================================
// Strategic Insights
// =============================================================================
/**
 * Categorize files by their strategic importance.
 *
 * Categories:
 * - Critical Foundation: High impact + low degree (test first)
 * - Integration Layer: High impact + high degree (test after deps)
 * - Isolated Utilities: Low impact + low degree (test opportunistically)
 * - Complex Isolated: Low impact + high degree (defer or skip)
 */
export function categorizeFiles(files) {
    const categories = {
        criticalFoundation: [],
        integrationLayer: [],
        isolatedUtilities: [],
        complexIsolated: [],
    };
    // Compute median values for categorization
    const allFiles = [...files.values()];
    const medianImpact = median(allFiles.map((f) => f.impact));
    const medianDegree = median(allFiles.map((f) => f.degree));
    for (const file of allFiles) {
        const highImpact = file.impact >= medianImpact;
        const highDegree = file.degree >= medianDegree;
        if (highImpact && !highDegree) {
            categories.criticalFoundation.push(file);
        }
        else if (highImpact && highDegree) {
            categories.integrationLayer.push(file);
        }
        else if (!highImpact && !highDegree) {
            categories.isolatedUtilities.push(file);
        }
        else {
            categories.complexIsolated.push(file);
        }
    }
    return categories;
}
/**
 * Calculate median of an array of numbers.
 */
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}
// =============================================================================
// Gradient Direction
// =============================================================================
/**
 * Get the "gradient direction" - the ordered list of files to work on.
 * This is the discrete analog of a gradient in continuous optimization.
 *
 * @param prioritizedFiles - Array of prioritized files (already sorted)
 * @param limit - Maximum number of files to return
 * @returns Array of file paths in priority order
 */
export function getGradientDirection(prioritizedFiles, limit = 10) {
    return prioritizedFiles.slice(0, limit).map((pf) => pf.file.path);
}
/**
 * Format prioritized files for display.
 * Useful for CLI output and LLM context.
 */
export function formatPrioritizedFiles(prioritizedFiles, srcDir, limit = 20) {
    const lines = [];
    const top = prioritizedFiles.slice(0, limit);
    for (const pf of top) {
        const relPath = pf.file.path.replace(srcDir + '/', '');
        const cov = pf.file.coverage;
        const covStr = cov
            ? `B:${cov.branches.toFixed(0)}% F:${cov.functions.toFixed(0)}% S:${cov.statements.toFixed(0)}%`
            : 'NO COVERAGE';
        lines.push(`[D${pf.file.degree} I${(pf.file.impact * 100).toFixed(0)}%] ${relPath}`);
        lines.push(`  Priority: ${pf.priority.toFixed(3)} | ${covStr}`);
        lines.push(`  Components: cov=${pf.components.coverageGap.toFixed(2)} ease=${pf.components.easeOfTesting.toFixed(2)} ` +
            `impact=${pf.components.importance.toFixed(2)} sev=${pf.components.severityScore.toFixed(2)}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=optimizer.js.map