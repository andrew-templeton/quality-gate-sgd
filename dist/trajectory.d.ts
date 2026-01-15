/**
 * Trajectory Analysis Module
 * Analyzes quality metric descent behavior over time
 *
 * Key insight: The cache already stores full metric snapshots keyed by state.
 * This module extracts trajectory data and analyzes descent behavior.
 */
import type { Metrics, NormalizedMetrics, Trajectory, QualityGateCache } from './types.js';
/**
 * Default weights for computing a single quality score from normalized metrics.
 * Higher weights = more important for descent.
 * Coverage metrics get high weights (smooth gradients, primary objectives).
 * Per-kSLOC metrics get moderate weights (secondary objectives).
 * Raw counts get low weights (poor continuity, used as constraints).
 */
export declare const DEFAULT_QUALITY_WEIGHTS: Record<keyof NormalizedMetrics, number>;
/**
 * Normalize raw metrics to continuous, per-kSLOC values.
 * This improves local continuity by transforming discrete counts to densities.
 *
 * @param metrics - Raw metrics from quality gate
 * @param sloc - Source lines of code (default to 1000 if unknown to avoid division by zero)
 * @returns NormalizedMetrics with per-kSLOC values
 */
export declare function normalizeMetrics(metrics: Metrics, sloc?: number): NormalizedMetrics;
/**
 * Compute a single quality score from normalized metrics.
 * Higher score = better quality (for visualization).
 *
 * The score combines coverage (higher is better) with issue density (lower is better).
 * We invert the "lower is better" metrics so all contributions are positive.
 *
 * @param normalized - Normalized metrics
 * @param weights - Optional custom weights
 * @returns Single scalar quality score (0-100 scale)
 */
export declare function computeQualityScore(normalized: NormalizedMetrics, weights?: Partial<Record<keyof NormalizedMetrics, number>>): number;
/**
 * Build a trajectory from cache entries.
 * Extracts chronologically ordered points with normalized metrics.
 *
 * @param cache - Quality gate cache
 * @returns Trajectory with analysis
 */
export declare function buildTrajectory(cache: QualityGateCache): Trajectory;
/**
 * Generate ASCII sparkline visualization of trajectory.
 * Shows quality score descent over time.
 */
export declare function trajectorySparkline(trajectory: Trajectory): string;
/**
 * Format trajectory summary for CLI output.
 */
export declare function formatTrajectorySummary(trajectory: Trajectory): string;
//# sourceMappingURL=trajectory.d.ts.map