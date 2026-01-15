/**
 * Fitness Function
 * ================
 * Unified scalar fitness function Q: Metrics → ℝ
 * Also provides gradient computation for "best next fix" suggestions.
 */
import { getAllDimensions, getDimension } from './dimensions/index.js';
// =============================================================================
// Utility: Get Metric Value by Path
// =============================================================================
/**
 * Extract a metric value from the metrics object using dot-notation path.
 * Handles both builtin paths (e.g., "coverage.unit.branches") and
 * custom dimension paths (e.g., "custom.anyCount").
 */
export function getMetricValue(metrics, path) {
    // Handle custom dimensions specially
    // Custom dimension paths are "custom.<name>" and map to metrics.custom.<name>
    if (path.startsWith('custom.')) {
        const customKey = path.slice(7); // Remove "custom." prefix
        if (metrics.custom && customKey in metrics.custom) {
            return metrics.custom[customKey];
        }
        return undefined;
    }
    // Standard path traversal for builtin dimensions
    const parts = path.split('.');
    let current = metrics;
    for (const part of parts) {
        if (current === null || current === undefined)
            return undefined;
        if (typeof current !== 'object')
            return undefined;
        current = current[part];
    }
    if (typeof current === 'number')
        return current;
    return undefined;
}
// =============================================================================
// Default Config
// =============================================================================
/**
 * Build default fitness config from dimension registry.
 * Uses defaultWeight from each dimension.
 */
export function getDefaultFitnessConfig() {
    const weights = {};
    for (const dim of getAllDimensions()) {
        if (dim.defaultWeight > 0) {
            weights[dim.path] = dim.defaultWeight;
        }
    }
    return {
        weights,
        aggregation: 'weighted-sum',
    };
}
// =============================================================================
// Normalization
// =============================================================================
/**
 * Normalize a raw metric value to 0-100 scale based on direction.
 *
 * For higher-better (coverage): value is already 0-100
 * For lower-better (errors): use exponential decay so 0 errors = 100
 */
function normalizeValue(value, dim) {
    if (dim.direction === 'higher-better') {
        // Coverage: already 0-100 (clamp to be safe)
        return Math.max(0, Math.min(100, value));
    }
    else {
        // Errors: exp decay, 0 = 100, more errors = lower score
        // Using decay constant of 10 so ~10 errors ≈ 37 score, ~23 errors ≈ 10 score
        return 100 * Math.exp(-value / 10);
    }
}
// =============================================================================
// Fitness Computation
// =============================================================================
/**
 * Compute scalar fitness score from metrics.
 * Higher = better quality.
 *
 * @param metrics - Current metrics
 * @param config - Optional fitness config (uses defaults if not provided)
 * @returns Fitness score 0-100
 */
export function computeFitness(metrics, config) {
    const effectiveConfig = config ?? getDefaultFitnessConfig();
    const dimensions = getAllDimensions();
    if (effectiveConfig.aggregation === 'geometric-mean') {
        return computeGeometricMeanFitness(metrics, effectiveConfig, dimensions);
    }
    // Weighted sum (default)
    let totalScore = 0;
    let totalWeight = 0;
    for (const dim of dimensions) {
        const value = getMetricValue(metrics, dim.path);
        if (value === undefined)
            continue;
        const weight = effectiveConfig.weights[dim.path] ?? dim.defaultWeight;
        if (weight <= 0)
            continue;
        const normalized = normalizeValue(value, dim);
        totalScore += weight * normalized;
        totalWeight += weight;
    }
    // Normalize by total weight to get 0-100 score
    if (totalWeight === 0)
        return 0;
    return totalScore / totalWeight;
}
function computeGeometricMeanFitness(metrics, config, dimensions) {
    let product = 1;
    let count = 0;
    for (const dim of dimensions) {
        const value = getMetricValue(metrics, dim.path);
        if (value === undefined)
            continue;
        const weight = config.weights[dim.path] ?? dim.defaultWeight;
        if (weight <= 0)
            continue;
        const normalized = normalizeValue(value, dim);
        // Use weighted geometric mean: (x1^w1 * x2^w2 * ...)^(1/sum(wi))
        product *= Math.pow(Math.max(0.01, normalized), weight); // floor at 0.01 to avoid 0
        count += weight;
    }
    if (count === 0)
        return 0;
    return Math.pow(product, 1 / count);
}
// =============================================================================
// Gradient Computation
// =============================================================================
/**
 * Compute gradient: how much fitness improves for each dimension.
 * Returns components sorted by priority (highest first).
 *
 * @param metrics - Current metrics
 * @param config - Optional fitness config
 * @returns Gradient components, sorted by priority
 */
export function computeGradient(metrics, config) {
    const effectiveConfig = config ?? getDefaultFitnessConfig();
    const dimensions = getAllDimensions();
    const components = [];
    // Calculate total weight for normalization
    let totalWeight = 0;
    for (const dim of dimensions) {
        const value = getMetricValue(metrics, dim.path);
        if (value === undefined)
            continue;
        const weight = effectiveConfig.weights[dim.path] ?? dim.defaultWeight;
        if (weight > 0)
            totalWeight += weight;
    }
    for (const dim of dimensions) {
        const value = getMetricValue(metrics, dim.path);
        if (value === undefined)
            continue;
        const weight = effectiveConfig.weights[dim.path] ?? dim.defaultWeight;
        if (weight <= 0)
            continue;
        // Estimate ΔQ for a 1-unit improvement
        let improvement;
        let rationale;
        if (dim.direction === 'higher-better') {
            // +1% coverage → improvement proportional to weight
            const currentNorm = normalizeValue(value, dim);
            const improvedNorm = normalizeValue(value + 1, dim);
            improvement = (weight / totalWeight) * (improvedNorm - currentNorm);
            if (value < 50) {
                rationale = `Low ${dim.displayName} (${value.toFixed(1)}%) - significant improvement potential`;
            }
            else if (value < 80) {
                rationale = `Moderate ${dim.displayName} (${value.toFixed(1)}%) - room for improvement`;
            }
            else {
                rationale = `Good ${dim.displayName} (${value.toFixed(1)}%) - diminishing returns`;
            }
        }
        else {
            // -1 error → improvement from exp decay derivative
            const currentNorm = normalizeValue(value, dim);
            const improvedNorm = normalizeValue(Math.max(0, value - 1), dim);
            improvement = (weight / totalWeight) * (improvedNorm - currentNorm);
            if (value > 10) {
                rationale = `High ${dim.displayName} count (${value}) - significant improvement potential`;
            }
            else if (value > 0) {
                rationale = `Some ${dim.displayName} (${value}) - each fix helps`;
            }
            else {
                rationale = `Zero ${dim.displayName} - already optimal`;
            }
        }
        components.push({
            dimension: dim.path,
            displayName: dim.displayName,
            currentValue: value,
            direction: dim.direction,
            estimatedImprovement: improvement,
            priority: improvement,
            rationale,
        });
    }
    // Sort by priority (highest first)
    return components.sort((a, b) => b.priority - a.priority);
}
// =============================================================================
// Suggestion (Best Next Fix)
// =============================================================================
/**
 * Get the recommended next fix based on gradient.
 *
 * @param metrics - Current metrics
 * @param config - Optional fitness config
 * @returns Suggestion for what to fix next
 */
export function suggestNextFix(metrics, config) {
    const gradient = computeGradient(metrics, config);
    if (gradient.length === 0) {
        return null;
    }
    const top = gradient[0];
    const dim = getDimension(top.dimension);
    if (!dim) {
        return null;
    }
    // Calculate a reasonable target
    let targetValue;
    let rationale;
    if (dim.direction === 'higher-better') {
        // For coverage, suggest +10% or 80%, whichever is closer
        targetValue = Math.min(100, Math.max(top.currentValue + 10, 80));
        rationale = `Increasing ${dim.displayName} from ${top.currentValue.toFixed(1)}% to ${targetValue.toFixed(1)}% ` +
            `will provide the largest fitness improvement. ` +
            `Each percentage point gained contributes ~${(top.estimatedImprovement).toFixed(3)} to the fitness score.`;
    }
    else {
        // For errors, suggest reducing by 50% or to 0, whichever is more
        targetValue = Math.floor(top.currentValue / 2);
        rationale = `Reducing ${dim.displayName} from ${top.currentValue} to ${targetValue} ` +
            `will provide the largest fitness improvement. ` +
            `Each issue fixed contributes ~${(top.estimatedImprovement).toFixed(3)} to the fitness score.`;
    }
    return {
        dimension: top.dimension,
        displayName: top.displayName,
        rationale,
        estimatedGain: top.estimatedImprovement * Math.abs(targetValue - top.currentValue),
        currentValue: top.currentValue,
        targetValue,
    };
}
// =============================================================================
// Top N Suggestions
// =============================================================================
/**
 * Get multiple suggestions, ordered by priority.
 *
 * @param metrics - Current metrics
 * @param limit - Maximum suggestions to return
 * @param config - Optional fitness config
 * @returns Array of suggestions
 */
export function suggestNextFixes(metrics, limit = 5, config) {
    const gradient = computeGradient(metrics, config);
    const suggestions = [];
    for (const comp of gradient.slice(0, limit)) {
        const dim = getDimension(comp.dimension);
        if (!dim)
            continue;
        // Skip dimensions that are already optimal
        if (dim.direction === 'higher-better' && comp.currentValue >= 99)
            continue;
        if (dim.direction === 'lower-better' && comp.currentValue <= 0)
            continue;
        let targetValue;
        let rationale;
        if (dim.direction === 'higher-better') {
            targetValue = Math.min(100, comp.currentValue + 10);
            rationale = `Improve ${dim.displayName} by ${(targetValue - comp.currentValue).toFixed(1)} percentage points`;
        }
        else {
            targetValue = Math.max(0, Math.floor(comp.currentValue / 2));
            rationale = `Fix ${comp.currentValue - targetValue} ${dim.displayName.toLowerCase()}`;
        }
        suggestions.push({
            dimension: comp.dimension,
            displayName: comp.displayName,
            rationale,
            estimatedGain: comp.estimatedImprovement * Math.abs(targetValue - comp.currentValue),
            currentValue: comp.currentValue,
            targetValue,
        });
    }
    return suggestions;
}
// =============================================================================
// Formatting
// =============================================================================
/**
 * Format fitness score for display.
 */
export function formatFitnessScore(score) {
    const bar = '█'.repeat(Math.floor(score / 5)) + '░'.repeat(20 - Math.floor(score / 5));
    return `${bar} ${score.toFixed(1)}/100`;
}
/**
 * Format gradient as a table string.
 */
export function formatGradientTable(gradient) {
    if (gradient.length === 0) {
        return 'No gradient components (no metrics available)';
    }
    const lines = [
        '| Dimension | Current | Direction | ΔQ/unit | Priority |',
        '|-----------|---------|-----------|---------|----------|',
    ];
    for (const comp of gradient) {
        const dir = comp.direction === 'higher-better' ? '↑' : '↓';
        const value = comp.direction === 'higher-better'
            ? `${comp.currentValue.toFixed(1)}%`
            : `${comp.currentValue}`;
        lines.push(`| ${comp.displayName} | ${value} | ${dir} | ${comp.estimatedImprovement.toFixed(4)} | ${comp.priority.toFixed(4)} |`);
    }
    return lines.join('\n');
}
/**
 * Format suggestion for display.
 */
export function formatSuggestion(suggestion) {
    const lines = [
        `## Suggested Next Fix: ${suggestion.displayName}`,
        '',
        suggestion.rationale,
        '',
        `Current: ${suggestion.currentValue}`,
        `Target:  ${suggestion.targetValue}`,
        `Expected fitness gain: +${suggestion.estimatedGain.toFixed(3)}`,
    ];
    return lines.join('\n');
}
//# sourceMappingURL=fitness.js.map