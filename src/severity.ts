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

// =============================================================================
// Default Severity Weights
// =============================================================================

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
export const DEFAULT_SEVERITY_WEIGHTS: Record<string, number> = {
  // SonarQube severity levels (highest priority)
  'sonarqube.blocker': 100,
  'sonarqube.critical': 80,
  'sonarqube.major': 60,
  'sonarqube.minor': 40,
  'sonarqube.info': 20,

  // SonarQube issue types
  'sonarqube.bugs': 85,
  'sonarqube.vulnerabilities': 90,
  'sonarqube.codeSmells': 50,

  // Coverage metrics (importance varies by type)
  'coverage.branches': 55,
  'coverage.statements': 45,
  'coverage.functions': 50,
  'coverage.lines': 40,

  // Coverage by suite
  'coverage.unit.branches': 55,
  'coverage.unit.statements': 45,
  'coverage.unit.functions': 50,
  'coverage.unit.lines': 40,
  'coverage.lambda.branches': 55,
  'coverage.lambda.statements': 45,
  'coverage.union.branches': 55,

  // Linting issues
  'eslint.errors': 70,
  'eslint.warnings': 35,
  'typescript.errors': 75,
  'typescript.warnings': 30,

  // Duplications
  'sonarqube.duplications': 30,
};

// =============================================================================
// Severity Weight Functions
// =============================================================================

/**
 * Get the severity weight for a metric path.
 * Falls back to a default weight if the metric is not in the weights map.
 *
 * @param metricPath - Dot-notation path (e.g., 'sonarqube.blocker')
 * @param customWeights - Optional custom weights to override defaults
 * @returns The severity weight (0-100)
 */
export function getSeverityWeight(
  metricPath: string,
  customWeights?: Record<string, number>
): number {
  // Check custom weights first
  if (customWeights && metricPath in customWeights) {
    return customWeights[metricPath];
  }

  // Check default weights
  if (metricPath in DEFAULT_SEVERITY_WEIGHTS) {
    return DEFAULT_SEVERITY_WEIGHTS[metricPath];
  }

  // Try to match partial paths (e.g., 'coverage.branches' for 'coverage.unit.branches')
  for (const [key, weight] of Object.entries(DEFAULT_SEVERITY_WEIGHTS)) {
    if (metricPath.endsWith(key) || key.endsWith(metricPath.split('.').pop() || '')) {
      return weight;
    }
  }

  // Default fallback weight
  return 50;
}

/**
 * Sum the severity weights for a list of failed rules.
 * This provides a composite severity score for a file or evaluation.
 *
 * @param failedRules - Array of failed rules with rule paths
 * @param customWeights - Optional custom weights to override defaults
 * @returns Total severity weight (higher = more severe issues)
 */
export function sumSeverityWeights(
  failedRules: FailedRule[],
  customWeights?: Record<string, number>
): number {
  let total = 0;

  for (const failure of failedRules) {
    // Extract the metric path from the rule
    // For monotonic rules, format is 'up:coverage.branches' or 'down:sonarqube.bugs'
    let metricPath = failure.rule;
    if (metricPath.includes(':')) {
      metricPath = metricPath.split(':')[1];
    }

    total += getSeverityWeight(metricPath, customWeights);
  }

  return total;
}

/**
 * Normalize severity score to 0-1 range.
 * Useful for combining with other priority dimensions.
 *
 * @param severityScore - Raw severity score from sumSeverityWeights
 * @param maxExpectedScore - Maximum expected score (default: 500)
 * @returns Normalized score between 0 and 1
 */
export function normalizeSeverityScore(
  severityScore: number,
  maxExpectedScore: number = 500
): number {
  return Math.min(severityScore / maxExpectedScore, 1);
}

/**
 * Get the gradient direction (sorted list of metrics by severity).
 * In discrete spaces, the gradient is simply the priority ordering.
 *
 * @param failedRules - Array of failed rules
 * @param customWeights - Optional custom weights
 * @returns Sorted array of metric paths, highest severity first
 */
export function computeGradientDirection(
  failedRules: FailedRule[],
  customWeights?: Record<string, number>
): string[] {
  return failedRules
    .map((f) => ({
      rule: f.rule.includes(':') ? f.rule.split(':')[1] : f.rule,
      weight: getSeverityWeight(
        f.rule.includes(':') ? f.rule.split(':')[1] : f.rule,
        customWeights
      ),
    }))
    .sort((a, b) => b.weight - a.weight)
    .map((f) => f.rule);
}
