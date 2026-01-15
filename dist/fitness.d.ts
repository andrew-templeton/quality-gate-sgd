/**
 * Fitness Function
 * ================
 * Unified scalar fitness function Q: Metrics → ℝ
 * Also provides gradient computation for "best next fix" suggestions.
 */
import type { Metrics } from './types.js';
export type FitnessAggregation = 'weighted-sum' | 'geometric-mean';
export interface FitnessConfig {
    /** Dimension path → weight (0-1, should sum to ~1) */
    weights: Record<string, number>;
    /** How to combine normalized dimension scores */
    aggregation: FitnessAggregation;
}
export interface GradientComponent {
    /** Dimension path */
    dimension: string;
    /** Display name for reporting */
    displayName: string;
    /** Current value of this dimension */
    currentValue: number;
    /** Direction for improvement */
    direction: 'higher-better' | 'lower-better';
    /** Estimated ΔQ if this dimension improves by 1 unit */
    estimatedImprovement: number;
    /** Higher = fix this first */
    priority: number;
    /** Rationale for why this dimension matters */
    rationale: string;
}
export interface FitnessSuggestion {
    /** Which dimension to focus on */
    dimension: string;
    /** Display name */
    displayName: string;
    /** Human-readable explanation */
    rationale: string;
    /** Estimated gain from improvement */
    estimatedGain: number;
    /** Current value */
    currentValue: number;
    /** Suggested target value */
    targetValue: number;
}
/**
 * Extract a metric value from the metrics object using dot-notation path.
 * Handles both builtin paths (e.g., "coverage.unit.branches") and
 * custom dimension paths (e.g., "custom.anyCount").
 */
export declare function getMetricValue(metrics: Metrics, path: string): number | undefined;
/**
 * Build default fitness config from dimension registry.
 * Uses defaultWeight from each dimension.
 */
export declare function getDefaultFitnessConfig(): FitnessConfig;
/**
 * Compute scalar fitness score from metrics.
 * Higher = better quality.
 *
 * @param metrics - Current metrics
 * @param config - Optional fitness config (uses defaults if not provided)
 * @returns Fitness score 0-100
 */
export declare function computeFitness(metrics: Metrics, config?: FitnessConfig): number;
/**
 * Compute gradient: how much fitness improves for each dimension.
 * Returns components sorted by priority (highest first).
 *
 * @param metrics - Current metrics
 * @param config - Optional fitness config
 * @returns Gradient components, sorted by priority
 */
export declare function computeGradient(metrics: Metrics, config?: FitnessConfig): GradientComponent[];
/**
 * Get the recommended next fix based on gradient.
 *
 * @param metrics - Current metrics
 * @param config - Optional fitness config
 * @returns Suggestion for what to fix next
 */
export declare function suggestNextFix(metrics: Metrics, config?: FitnessConfig): FitnessSuggestion | null;
/**
 * Get multiple suggestions, ordered by priority.
 *
 * @param metrics - Current metrics
 * @param limit - Maximum suggestions to return
 * @param config - Optional fitness config
 * @returns Array of suggestions
 */
export declare function suggestNextFixes(metrics: Metrics, limit?: number, config?: FitnessConfig): FitnessSuggestion[];
/**
 * Format fitness score for display.
 */
export declare function formatFitnessScore(score: number): string;
/**
 * Format gradient as a table string.
 */
export declare function formatGradientTable(gradient: GradientComponent[]): string;
/**
 * Format suggestion for display.
 */
export declare function formatSuggestion(suggestion: FitnessSuggestion): string;
//# sourceMappingURL=fitness.d.ts.map