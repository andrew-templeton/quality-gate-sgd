/**
 * Optimization Target Aggregation
 * ================================
 * Aggregates located issues into optimization targets with computed ΔQ.
 *
 * The key insight: one target (file/symbol) can address MULTIPLE dimensions.
 * We compute totalDeltaQ as the weighted sum of impacts across all dimensions.
 */

import { getDefaultFitnessConfig } from '../fitness.js';
import { getDimension } from '../dimensions/index.js';
import type {
  LocatedIssue,
  ExtractedIssues,
  OptimizationTarget,
  AggregateTargetsOptions,
  IssueSeverity,
} from './types.js';

// =============================================================================
// Constants
// =============================================================================

/** Decay constant for error dimension normalization (from fitness.ts) */
const ERROR_DECAY_CONSTANT = 10;

// =============================================================================
// ΔQ Computation
// =============================================================================

/**
 * Compute the change in fitness score for a given impact.
 *
 * This mirrors the normalization logic in fitness.ts:
 * - For higher-better dimensions: delta directly contributes to fitness
 * - For lower-better dimensions: uses exponential decay
 *
 * @param impact - The impact to compute ΔQ for
 * @param currentValue - Current value of the dimension (for lower-better calc)
 * @returns The change in fitness score
 */
function computeImpactDeltaQ(
  impact: LocatedIssue['impact'],
  currentValue?: number
): number {
  const config = getDefaultFitnessConfig();
  const dim = getDimension(impact.dimension);

  if (!dim) return 0;

  const weight = config.weights[impact.dimension] ?? dim.defaultWeight;

  if (impact.direction === 'higher-better') {
    // Coverage: delta is direct % gain, contributes linearly
    return weight * impact.delta;
  } else {
    // Errors: fixing one error, use derivative of exp(-x/10)
    // d/dx[exp(-x/10)] = -1/10 * exp(-x/10)
    // Since we're REDUCING errors (improving), the gain is positive
    // Approximate: current normalized = 100 * exp(-value/10)
    // After fix: 100 * exp(-(value-1)/10)
    // Delta = 100 * (exp(-(value-1)/10) - exp(-value/10))
    //       = 100 * exp(-value/10) * (exp(1/10) - 1)
    //       ≈ 100 * exp(-value/10) * 0.105

    // Without knowing current value, use average-case estimate
    const assumedValue = currentValue ?? 5; // Assume ~5 errors as baseline
    const beforeNorm = 100 * Math.exp(-assumedValue / ERROR_DECAY_CONSTANT);
    const afterNorm = 100 * Math.exp(-(assumedValue - 1) / ERROR_DECAY_CONSTANT);

    return weight * (afterNorm - beforeNorm) / 100;
  }
}

/**
 * Compute total ΔQ for an optimization target.
 *
 * Sums the ΔQ contributions from all issues at this target.
 */
export function computeTargetDeltaQ(issues: LocatedIssue[]): number {
  let totalDeltaQ = 0;

  // Group impacts by dimension to avoid double-counting
  const impactsByDimension = new Map<string, number>();

  for (const issue of issues) {
    const dim = issue.impact.dimension;
    const currentTotal = impactsByDimension.get(dim) ?? 0;
    impactsByDimension.set(dim, currentTotal + issue.impact.delta);
  }

  // Compute ΔQ for each dimension's total impact
  for (const [dimension, totalDelta] of impactsByDimension) {
    const dim = getDimension(dimension);
    if (!dim) continue;

    const config = getDefaultFitnessConfig();
    const weight = config.weights[dimension] ?? dim.defaultWeight;

    if (dim.direction === 'higher-better') {
      // Coverage: direct contribution
      totalDeltaQ += weight * totalDelta;
    } else {
      // Errors: each reduction helps (use simple approximation)
      // More errors fixed = more improvement, but diminishing returns
      const errorCount = Math.abs(totalDelta);
      const avgGainPerError = 0.105; // exp(1/10) - 1
      totalDeltaQ += weight * avgGainPerError * errorCount;
    }
  }

  return totalDeltaQ;
}

// =============================================================================
// Breakdown Computation
// =============================================================================

/**
 * Compute the breakdown for an optimization target.
 */
function computeBreakdown(issues: LocatedIssue[]): OptimizationTarget['breakdown'] {
  const breakdown: OptimizationTarget['breakdown'] = {};

  // Coverage
  const coverageIssues = issues.filter(i => i.source === 'coverage');
  if (coverageIssues.length > 0) {
    const branchIssues = coverageIssues.filter(i => i.dimension === 'coverage.unit.branches');
    const lineIssues = coverageIssues.filter(i => i.dimension === 'coverage.unit.lines');
    const estimatedGain = coverageIssues.reduce((sum, i) => sum + i.impact.delta * 100, 0);

    breakdown.coverage = {
      uncoveredBranches: branchIssues.length,
      uncoveredLines: lineIssues.length,
      estimatedCoverageGain: Math.round(estimatedGain * 10) / 10,
    };
  }

  // TypeScript
  const tsIssues = issues.filter(i => i.source === 'typescript');
  if (tsIssues.length > 0) {
    const codes = [...new Set(tsIssues.map(i => i.code).filter(Boolean))] as string[];
    breakdown.typescript = {
      errorCount: tsIssues.length,
      errorCodes: codes,
    };
  }

  // ESLint
  const eslintIssues = issues.filter(i => i.source === 'eslint');
  if (eslintIssues.length > 0) {
    const errors = eslintIssues.filter(i => i.dimension === 'eslint.errors');
    const warnings = eslintIssues.filter(i => i.dimension === 'eslint.warnings');
    const rules = [...new Set(eslintIssues.map(i => i.code).filter(Boolean))] as string[];

    breakdown.eslint = {
      errorCount: errors.length,
      warningCount: warnings.length,
      rules,
    };
  }

  // SonarQube
  const sonarIssues = issues.filter(i => i.source === 'sonarqube');
  if (sonarIssues.length > 0) {
    const bugs = sonarIssues.filter(i => i.dimension === 'sonarqube.bugs').length;
    const vulns = sonarIssues.filter(i => i.dimension === 'sonarqube.vulnerabilities').length;
    const smells = sonarIssues.filter(i => i.dimension === 'sonarqube.codeSmells').length;

    const severityCounts: Record<IssueSeverity, number> = {
      blocker: 0,
      critical: 0,
      major: 0,
      minor: 0,
      info: 0,
    };

    for (const issue of sonarIssues) {
      if (issue.severity) {
        severityCounts[issue.severity]++;
      }
    }

    breakdown.sonarqube = {
      bugs,
      vulnerabilities: vulns,
      codeSmells: smells,
      severityCounts,
    };
  }

  return breakdown;
}

// =============================================================================
// Aggregation
// =============================================================================

/**
 * Aggregate located issues into optimization targets.
 *
 * Groups issues by file (or symbol if granularity='symbol'), computes
 * total ΔQ for each target, and returns sorted by impact.
 */
export function aggregateToTargets(
  extractedIssues: ExtractedIssues,
  options: AggregateTargetsOptions = { granularity: 'file' }
): OptimizationTarget[] {
  const { granularity, limit, minDeltaQ } = options;

  // Combine all issues
  const allIssues = [
    ...extractedIssues.coverage,
    ...extractedIssues.typescript,
    ...extractedIssues.eslint,
    ...extractedIssues.sonarqube,
  ];

  // Group by file (or symbol if granularity='symbol')
  const groups = new Map<string, LocatedIssue[]>();

  for (const issue of allIssues) {
    let key: string;

    if (granularity === 'symbol' && issue.symbol) {
      key = `${issue.file}::${issue.symbol}`;
    } else {
      key = issue.file;
    }

    const existing = groups.get(key) ?? [];
    existing.push(issue);
    groups.set(key, existing);
  }

  // Build optimization targets
  const targets: OptimizationTarget[] = [];

  for (const [key, issues] of groups) {
    // Parse key back to file/symbol
    const [file, symbol] = key.includes('::') ? key.split('::') : [key, undefined];

    // Compute impacts per dimension
    const impacts: Record<string, number> = {};
    for (const issue of issues) {
      const dim = issue.impact.dimension;
      impacts[dim] = (impacts[dim] ?? 0) + issue.impact.delta;
    }

    // Compute total ΔQ
    const totalDeltaQ = computeTargetDeltaQ(issues);

    // Skip if below threshold
    if (minDeltaQ !== undefined && totalDeltaQ < minDeltaQ) {
      continue;
    }

    // Compute breakdown
    const breakdown = computeBreakdown(issues);

    // Determine dimensions affected
    const dimensionsAffected = [...new Set(issues.map(i => i.dimension))];

    // Find line range
    const lines = issues.map(i => i.line).filter((l): l is number => l !== undefined);
    const startLine = lines.length > 0 ? Math.min(...lines) : undefined;
    const endLine = lines.length > 0 ? Math.max(...lines) : undefined;

    targets.push({
      file,
      symbol,
      startLine,
      endLine,
      issues,
      issueCount: issues.length,
      dimensionsAffected,
      impacts,
      totalDeltaQ,
      breakdown,
    });
  }

  // Sort by totalDeltaQ descending
  targets.sort((a, b) => b.totalDeltaQ - a.totalDeltaQ);

  // Apply limit
  if (limit !== undefined && limit > 0) {
    return targets.slice(0, limit);
  }

  return targets;
}
