/**
 * Location-Aware Optimization Target Types
 * =========================================
 * Types for discrete-differentiable optimization targets.
 *
 * Key insight: Instead of just computing ∂Q/∂dimension, we compute
 * ∂Q/∂target where target = (file, symbol, issue_cluster).
 *
 * This gives us "discrete differentiability" - we can compute
 * "if I fix X, I expect Y improvement" for each enumerable move.
 */

import type { DimensionDirection } from '../dimensions/index.js';

// =============================================================================
// Issue Sources
// =============================================================================

/** Where an issue was detected */
export type IssueSource = 'coverage' | 'typescript' | 'eslint' | 'sonarqube';

/** Severity levels (aligned with SonarQube) */
export type IssueSeverity = 'blocker' | 'critical' | 'major' | 'minor' | 'info';

// =============================================================================
// Located Issue
// =============================================================================

/**
 * A single issue with its location in the codebase.
 *
 * This is the atomic unit - one error, one uncovered branch, one code smell.
 * We preserve location so we can aggregate by file/symbol later.
 */
export interface LocatedIssue {
  // ---------------------------------------------------------------------------
  // Location
  // ---------------------------------------------------------------------------

  /** Absolute or relative file path */
  file: string;

  /** Line number (1-indexed, if available) */
  line?: number;

  /** Column number (1-indexed, if available) */
  column?: number;

  /** Symbol name (function/class/method) if extractable */
  symbol?: string;

  /**
   * Unique symbol ID for cross-referencing with symbol table.
   * Format: "file.ts::ClassName.methodName" or "file.ts::functionName"
   *
   * This enables unified analysis across all quality axes by mapping
   * each issue to its containing symbol in the symbol graph.
   */
  symbolId?: string;

  /** End line for multi-line issues */
  endLine?: number;

  /** End column for multi-line issues */
  endColumn?: number;

  // ---------------------------------------------------------------------------
  // Source & Classification
  // ---------------------------------------------------------------------------

  /** Which tool detected this issue */
  source: IssueSource;

  /** Which quality dimension this affects */
  dimension: string;

  /** Rule/error code (e.g., "TS2345", "no-unused-vars", "S3776") */
  code?: string;

  /** Severity level */
  severity?: IssueSeverity;

  // ---------------------------------------------------------------------------
  // Impact
  // ---------------------------------------------------------------------------

  /**
   * What fixing this issue contributes to the dimension.
   *
   * For errors: delta = -1 (fixing removes one error)
   * For coverage: delta = estimated % gain per branch
   */
  impact: {
    dimension: string;
    delta: number;
    direction: DimensionDirection;
  };

  // ---------------------------------------------------------------------------
  // Human-Readable
  // ---------------------------------------------------------------------------

  /** Human-readable description of the issue */
  message: string;

  /** Additional context (e.g., expected vs actual type) */
  context?: string;
}

// =============================================================================
// Optimization Target
// =============================================================================

/**
 * An aggregated optimization target - a location where fixing issues
 * will improve the fitness score.
 *
 * Key insight: one target can address MULTIPLE dimensions simultaneously.
 * A function with poor coverage AND errors is more valuable than one
 * with just poor coverage.
 */
export interface OptimizationTarget {
  // ---------------------------------------------------------------------------
  // Location (Granularity depends on aggregation)
  // ---------------------------------------------------------------------------

  /** File path (always present) */
  file: string;

  /** Symbol name (function/class) - present for symbol-level granularity */
  symbol?: string;

  /** Start line of the symbol/region */
  startLine?: number;

  /** End line of the symbol/region */
  endLine?: number;

  // ---------------------------------------------------------------------------
  // Issues at this Target
  // ---------------------------------------------------------------------------

  /** All issues located at this target */
  issues: LocatedIssue[];

  /** Count of issues (for quick access) */
  issueCount: number;

  /** Which dimensions are affected by issues at this target */
  dimensionsAffected: string[];

  // ---------------------------------------------------------------------------
  // Cross-Dimension Impact Analysis
  // ---------------------------------------------------------------------------

  /**
   * Impact per dimension.
   *
   * Maps dimension path → total delta if all issues at this target are fixed.
   * Example: { "coverage.unit.branches": 2.5, "typescript.errors": -3 }
   */
  impacts: Record<string, number>;

  /**
   * Total expected change in fitness score (ΔQ).
   *
   * Computed as weighted sum of normalized impacts across all dimensions.
   * Higher = fixing this target helps more.
   */
  totalDeltaQ: number;

  // ---------------------------------------------------------------------------
  // Graph-Based Weighting (Optional)
  // ---------------------------------------------------------------------------

  /** Number of files that depend on this file */
  dependentCount?: number;

  /**
   * Centrality score from dependency graph.
   * Higher = more central, more impactful to fix.
   */
  centralityScore?: number;

  /**
   * Graph-weighted total ΔQ.
   * totalDeltaQ * (1 + log(dependentCount + 1))
   */
  weightedDeltaQ?: number;

  // ---------------------------------------------------------------------------
  // Breakdown for Reporting
  // ---------------------------------------------------------------------------

  /**
   * Per-source issue summary for human-readable output.
   */
  breakdown: {
    coverage?: {
      uncoveredBranches: number;
      uncoveredLines: number;
      estimatedCoverageGain: number;
    };
    typescript?: {
      errorCount: number;
      errorCodes: string[];
    };
    eslint?: {
      errorCount: number;
      warningCount: number;
      rules: string[];
    };
    sonarqube?: {
      bugs: number;
      vulnerabilities: number;
      codeSmells: number;
      severityCounts: Record<IssueSeverity, number>;
    };
  };
}

// =============================================================================
// Extraction Options
// =============================================================================

/** Options for extracting located issues */
export interface ExtractLocatedIssuesOptions {
  /** Skip SonarQube (coverage-only mode) */
  skipSonarQube?: boolean;

  /** Skip ESLint */
  skipEslint?: boolean;

  /** Skip TypeScript */
  skipTypescript?: boolean;

  /** Coverage directory to look for coverage-final.json */
  coverageDir?: string;

  /**
   * Symbol table for enriching issues with symbol information.
   *
   * When provided, each issue will be annotated with its containing
   * symbol's ID, enabling unified cross-axis analysis.
   */
  symbolTable?: import('../symbols/types.js').SymbolTable;
}

/** Result of extracting located issues from all sources */
export interface ExtractedIssues {
  coverage: LocatedIssue[];
  typescript: LocatedIssue[];
  eslint: LocatedIssue[];
  sonarqube: LocatedIssue[];

  /** Total issue count across all sources */
  totalCount: number;

  /** Summary by source */
  summary: {
    coverage: number;
    typescript: number;
    eslint: number;
    sonarqube: number;
  };
}

// =============================================================================
// Aggregation Options
// =============================================================================

/** Granularity for aggregating issues into targets */
export type TargetGranularity = 'file' | 'symbol';

/** Options for aggregating issues to targets */
export interface AggregateTargetsOptions {
  /** How fine-grained to aggregate */
  granularity: TargetGranularity;

  /** Include dependency graph weighting */
  includeGraphWeights?: boolean;

  /** Maximum targets to return */
  limit?: number;

  /** Minimum totalDeltaQ to include */
  minDeltaQ?: number;
}

// =============================================================================
// Target Suggestion
// =============================================================================

/**
 * A suggestion for what to fix next, with full context.
 */
export interface TargetSuggestion {
  /** The optimization target */
  target: OptimizationTarget;

  /** Rank (1 = highest priority) */
  rank: number;

  /** Human-readable rationale */
  rationale: string;

  /** Expected fitness gain */
  expectedGain: number;

  /** Detailed breakdown per dimension */
  dimensionBreakdown: Array<{
    dimension: string;
    displayName: string;
    currentIssues: number;
    expectedDelta: number;
    deltaQ: number;
  }>;

  /** Actionable guidance */
  guidance?: string;
}
