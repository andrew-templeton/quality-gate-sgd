/**
 * Severity Weights Module
 * =======================
 * Defines the default severity weights for quality metrics.
 * These weights form the deterministic gradient direction for SGD-like optimization.
 *
 * In discrete spaces, the gradient degenerates to priority ordering.
 * Higher severity = higher priority = steeper gradient toward fixing.
 */
import type { FailedRule } from './types.js';
/**
 * Default severity weights for quality metrics.
 * Higher weight = higher priority = steeper gradient toward fixing.
 *
 * Weights are calibrated so that:
 * - Blockers are critical (100) - must fix first
 * - Critical issues are severe (80) - fix after blockers
 * - Major issues are important (60) - fix after critical
 * - Minor issues are low priority (40) - fix opportunistically
 * - Info issues are informational (20) - fix if convenient
 *
 * Coverage and linting issues are in the middle range to balance
 * security/reliability concerns with test coverage.
 */
export declare const DEFAULT_SEVERITY_WEIGHTS: Record<string, number>;
/**
 * Get the severity weight for a metric path.
 * Falls back to a default weight if the metric is not in the weights map.
 *
 * @param metricPath - Dot-notation path (e.g., 'sonarqube.blocker')
 * @param customWeights - Optional custom weights to override defaults
 * @returns The severity weight (0-100)
 */
export declare function getSeverityWeight(metricPath: string, customWeights?: Record<string, number>): number;
/**
 * Sum the severity weights for a list of failed rules.
 * This provides a composite severity score for a file or evaluation.
 *
 * @param failedRules - Array of failed rules with rule paths
 * @param customWeights - Optional custom weights to override defaults
 * @returns Total severity weight (higher = more severe issues)
 */
export declare function sumSeverityWeights(failedRules: FailedRule[], customWeights?: Record<string, number>): number;
/**
 * Normalize severity score to 0-1 range.
 * Useful for combining with other priority dimensions.
 *
 * @param severityScore - Raw severity score from sumSeverityWeights
 * @param maxExpectedScore - Maximum expected score (default: 500)
 * @returns Normalized score between 0 and 1
 */
export declare function normalizeSeverityScore(severityScore: number, maxExpectedScore?: number): number;
/**
 * Get the gradient direction (sorted list of metrics by severity).
 * In discrete spaces, the gradient is simply the priority ordering.
 *
 * @param failedRules - Array of failed rules
 * @param customWeights - Optional custom weights
 * @returns Sorted array of metric paths, highest severity first
 */
export declare function computeGradientDirection(failedRules: FailedRule[], customWeights?: Record<string, number>): string[];
//# sourceMappingURL=severity.d.ts.map