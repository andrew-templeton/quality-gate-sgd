/**
 * Trajectory Analysis Module
 * Analyzes quality metric descent behavior over time
 *
 * Key insight: The cache already stores full metric snapshots keyed by state.
 * This module extracts trajectory data and analyzes descent behavior.
 */

import type {
  Metrics,
  NormalizedMetrics,
  TrajectoryPoint,
  Trajectory,
  ConvergenceState,
  QualityGateCache,
  CacheEntry,
} from './types.js';

// =============================================================================
// Default Weights for Quality Score Computation
// =============================================================================

/**
 * Default weights for computing a single quality score from normalized metrics.
 * Higher weights = more important for descent.
 * Coverage metrics get high weights (smooth gradients, primary objectives).
 * Per-kSLOC metrics get moderate weights (secondary objectives).
 * Raw counts get low weights (poor continuity, used as constraints).
 */
export const DEFAULT_QUALITY_WEIGHTS: Record<keyof NormalizedMetrics, number> = {
  // Coverage (smooth, primary objectives)
  coverageBranches: 0.20,
  coverageStatements: 0.15,
  coverageLines: 0.10,
  coverageFunctions: 0.10,
  duplications: 0.05, // Lower is better, inverted in score

  // Per-kSLOC (smoother than raw counts)
  bugsPerKsloc: 0.10,
  vulnerabilitiesPerKsloc: 0.08,
  smellsPerKsloc: 0.05,
  blockerPerKsloc: 0.05,
  criticalPerKsloc: 0.05,
  majorPerKsloc: 0.03,
  minorPerKsloc: 0.02,

  // Raw counts (poor continuity, low weight)
  typescriptErrors: 0.01,
  eslintErrors: 0.01,
};

// =============================================================================
// Normalization Functions
// =============================================================================

/**
 * Normalize raw metrics to continuous, per-kSLOC values.
 * This improves local continuity by transforming discrete counts to densities.
 *
 * @param metrics - Raw metrics from quality gate
 * @param sloc - Source lines of code (default to 1000 if unknown to avoid division by zero)
 * @returns NormalizedMetrics with per-kSLOC values
 */
export function normalizeMetrics(
  metrics: Metrics,
  sloc?: number
): NormalizedMetrics {
  // Use provided SLOC, fallback to metrics.sloc, or default to 1000
  const ksloc = (sloc ?? metrics.sloc ?? 1000) / 1000;

  // Avoid division by zero
  const safeKsloc = ksloc > 0 ? ksloc : 1;

  // Extract coverage (already percentages, just need safe defaults)
  const coverage = metrics.coverage?.union ?? metrics.coverage?.unit;

  return {
    // Coverage percentages (already continuous)
    coverageBranches: coverage?.branches ?? 0,
    coverageStatements: coverage?.statements ?? 0,
    coverageLines: coverage?.lines ?? 0,
    coverageFunctions: coverage?.functions ?? 0,
    duplications: metrics.sonarqube?.duplications ?? 0,

    // Normalize counts to per-kSLOC
    bugsPerKsloc: (metrics.sonarqube?.bugs ?? 0) / safeKsloc,
    vulnerabilitiesPerKsloc: (metrics.sonarqube?.vulnerabilities ?? 0) / safeKsloc,
    smellsPerKsloc: (metrics.sonarqube?.codeSmells ?? 0) / safeKsloc,
    blockerPerKsloc: (metrics.sonarqube?.blocker ?? 0) / safeKsloc,
    criticalPerKsloc: (metrics.sonarqube?.critical ?? 0) / safeKsloc,
    majorPerKsloc: (metrics.sonarqube?.major ?? 0) / safeKsloc,
    minorPerKsloc: (metrics.sonarqube?.minor ?? 0) / safeKsloc,

    // Use root-cause counts when available (better continuity)
    // Fall back to raw counts if root-cause extraction failed
    typescriptErrors: metrics.typescript?.rootCauses ?? metrics.typescript?.errors ?? 0,
    eslintErrors: metrics.eslint?.rootCauses ?? metrics.eslint?.errors ?? 0,
  };
}

// =============================================================================
// Quality Score Computation
// =============================================================================

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
export function computeQualityScore(
  normalized: NormalizedMetrics,
  weights: Partial<Record<keyof NormalizedMetrics, number>> = {}
): number {
  const w = { ...DEFAULT_QUALITY_WEIGHTS, ...weights };

  let score = 0;

  // Coverage contributions (higher is better)
  score += w.coverageBranches * normalized.coverageBranches;
  score += w.coverageStatements * normalized.coverageStatements;
  score += w.coverageLines * normalized.coverageLines;
  score += w.coverageFunctions * normalized.coverageFunctions;

  // Duplications (lower is better, so invert: 100 - duplications)
  score += w.duplications * (100 - normalized.duplications);

  // Per-kSLOC metrics (lower is better, so use inverse contribution)
  // We use exp(-x) to map 0 -> 1, higher values -> lower contribution
  // This creates smooth descent pressure toward zero
  score +=
    w.bugsPerKsloc * 100 * Math.exp(-normalized.bugsPerKsloc);
  score +=
    w.vulnerabilitiesPerKsloc * 100 * Math.exp(-normalized.vulnerabilitiesPerKsloc);
  score += w.smellsPerKsloc * 100 * Math.exp(-normalized.smellsPerKsloc / 10);
  score +=
    w.blockerPerKsloc * 100 * Math.exp(-normalized.blockerPerKsloc * 10);
  score +=
    w.criticalPerKsloc * 100 * Math.exp(-normalized.criticalPerKsloc * 5);
  score += w.majorPerKsloc * 100 * Math.exp(-normalized.majorPerKsloc);
  score += w.minorPerKsloc * 100 * Math.exp(-normalized.minorPerKsloc / 5);

  // Raw counts (use sharp penalty for any errors)
  score += w.typescriptErrors * 100 * (normalized.typescriptErrors === 0 ? 1 : 0);
  score += w.eslintErrors * 100 * (normalized.eslintErrors === 0 ? 1 : 0);

  return score;
}

// =============================================================================
// Trajectory Building
// =============================================================================

/**
 * Build a trajectory from cache entries.
 * Extracts chronologically ordered points with normalized metrics.
 *
 * @param cache - Quality gate cache
 * @returns Trajectory with analysis
 */
export function buildTrajectory(cache: QualityGateCache): Trajectory {
  // Extract entries and sort by timestamp
  const entries: Array<[string, CacheEntry]> = Object.entries(cache.entries).sort(
    (a, b) => a[1].timestamp - b[1].timestamp
  );

  if (entries.length === 0) {
    return {
      points: [],
      totalDescent: 0,
      averageStepSize: 0,
      monotonicSteps: 0,
      regressionSteps: 0,
      convergenceState: 'stagnating',
    };
  }

  // Convert to trajectory points
  const points: TrajectoryPoint[] = entries.map(([key, entry]) => {
    const normalized = normalizeMetrics(entry.metrics);
    const qualityScore = computeQualityScore(normalized);

    return {
      key,
      timestamp: entry.timestamp,
      metrics: normalized,
      qualityScore,
      passed: entry.evaluation.status === 'pass',
    };
  });

  // Analyze descent behavior
  let totalDescent = 0;
  let totalAbsChange = 0;
  let monotonicSteps = 0;
  let regressionSteps = 0;

  for (let i = 1; i < points.length; i++) {
    const delta = points[i].qualityScore - points[i - 1].qualityScore;
    totalDescent += delta;
    totalAbsChange += Math.abs(delta);

    if (delta > 0.1) {
      // Improvement (with small threshold for noise)
      monotonicSteps++;
    } else if (delta < -0.1) {
      // Regression
      regressionSteps++;
    }
  }

  const averageStepSize =
    points.length > 1 ? totalAbsChange / (points.length - 1) : 0;

  const convergenceState = analyzeConvergence(
    points,
    monotonicSteps,
    regressionSteps,
    averageStepSize
  );

  return {
    points,
    totalDescent,
    averageStepSize,
    monotonicSteps,
    regressionSteps,
    convergenceState,
  };
}

// =============================================================================
// Convergence Analysis
// =============================================================================

/**
 * Analyze convergence state from trajectory metrics.
 */
function analyzeConvergence(
  points: TrajectoryPoint[],
  monotonicSteps: number,
  regressionSteps: number,
  averageStepSize: number
): ConvergenceState {
  if (points.length < 2) {
    return 'stagnating';
  }

  const lastPoint = points[points.length - 1];
  const totalSteps = points.length - 1;

  // Check if converged (passed with high score and small recent changes)
  if (lastPoint.passed && lastPoint.qualityScore > 70) {
    // Check if stable (last few steps have small changes)
    const recentSteps = points.slice(-3);
    const recentVariance =
      recentSteps.length > 1
        ? recentSteps.reduce((sum, p, i, arr) => {
            if (i === 0) return 0;
            return sum + Math.abs(p.qualityScore - arr[i - 1].qualityScore);
          }, 0) /
          (recentSteps.length - 1)
        : 0;

    if (recentVariance < 1) {
      return 'converged';
    }
  }

  // Calculate monotonicity ratio
  const monotonicity = monotonicSteps / totalSteps;
  const regressionRatio = regressionSteps / totalSteps;

  // Oscillating: many regressions relative to improvements
  if (regressionRatio > 0.3 && monotonicSteps > 0) {
    return 'oscillating';
  }

  // Improving: mostly monotonic descent
  if (monotonicity > 0.5 || averageStepSize > 0.5) {
    return 'improving';
  }

  // Stagnating: little movement
  return 'stagnating';
}

// =============================================================================
// Trajectory Visualization
// =============================================================================

/**
 * Generate ASCII sparkline visualization of trajectory.
 * Shows quality score descent over time.
 */
export function trajectorySparkline(trajectory: Trajectory): string {
  if (trajectory.points.length === 0) {
    return '(no data)';
  }

  const chars = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
  const scores = trajectory.points.map((p) => p.qualityScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  return scores
    .map((s) => {
      const normalized = (s - min) / range;
      const index = Math.min(Math.floor(normalized * chars.length), chars.length - 1);
      return chars[index];
    })
    .join('');
}

/**
 * Format trajectory summary for CLI output.
 */
export function formatTrajectorySummary(trajectory: Trajectory): string {
  const lines: string[] = [];

  lines.push('=== Trajectory Analysis ===\n');

  // Basic stats
  lines.push(`Points: ${trajectory.points.length}`);
  lines.push(`Total descent: ${trajectory.totalDescent.toFixed(2)}`);
  lines.push(`Average step size: ${trajectory.averageStepSize.toFixed(2)}`);
  lines.push(`Monotonic steps: ${trajectory.monotonicSteps}`);
  lines.push(`Regression steps: ${trajectory.regressionSteps}`);
  lines.push(`Convergence: ${trajectory.convergenceState}`);
  lines.push('');

  // Sparkline
  lines.push(`Trajectory: ${trajectorySparkline(trajectory)}`);
  lines.push('');

  // First and last points
  if (trajectory.points.length > 0) {
    const first = trajectory.points[0];
    const last = trajectory.points[trajectory.points.length - 1];

    lines.push('First point:');
    lines.push(`  Key: ${first.key.slice(0, 12)}...`);
    lines.push(`  Score: ${first.qualityScore.toFixed(2)}`);
    lines.push(`  Passed: ${first.passed}`);
    lines.push('');

    lines.push('Last point:');
    lines.push(`  Key: ${last.key.slice(0, 12)}...`);
    lines.push(`  Score: ${last.qualityScore.toFixed(2)}`);
    lines.push(`  Passed: ${last.passed}`);
    lines.push('');

    // Delta summary
    const improvement = last.qualityScore - first.qualityScore;
    const direction = improvement > 0 ? 'improved' : improvement < 0 ? 'regressed' : 'unchanged';
    lines.push(`Overall: ${direction} by ${Math.abs(improvement).toFixed(2)} points`);
  }

  return lines.join('\n');
}
