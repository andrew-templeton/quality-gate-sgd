/**
 * Type definitions for the Quality Gate system
 * Schema Version: 1
 */

// =============================================================================
// Cache Schema
// =============================================================================

export interface QualityGateCache {
  schemaVersion: 1;
  entries: Record<string, CacheEntry>;
}

export interface CacheEntry {
  timestamp: number;
  rulesVersion: string;
  rulesHash: string;

  evaluation: {
    status: 'pass' | 'fail';
    failedRules: string[];
  };

  metrics: Metrics;
}

export interface Metrics {
  coverage?: AllCoverageMetrics;
  typescript?: TypescriptMetrics;
  eslint?: EslintMetrics;
  sonarqube?: SonarqubeMetrics;
  bundle?: BundleMetrics;
  scripts: Record<string, 'pass' | 'fail'>;
  sloc?: number; // Source lines of code for normalization
  /** Custom user-defined metrics (path without "custom." prefix → value) */
  custom?: Record<string, number>;
}

// =============================================================================
// Normalized Metrics (for SGD continuity)
// =============================================================================

/**
 * Normalized metrics for smoother gradient descent behavior.
 * Discrete counts are transformed to per-kSLOC densities.
 */
export interface NormalizedMetrics {
  // Already continuous (percentages)
  coverageBranches: number;
  coverageStatements: number;
  coverageLines: number;
  coverageFunctions: number;
  duplications: number;

  // Normalized to per-kSLOC (smoother than raw counts)
  bugsPerKsloc: number;
  vulnerabilitiesPerKsloc: number;
  smellsPerKsloc: number;
  blockerPerKsloc: number;
  criticalPerKsloc: number;
  majorPerKsloc: number;
  minorPerKsloc: number;

  // Raw counts (for reference, not optimization)
  typescriptErrors: number;
  eslintErrors: number;
}

// =============================================================================
// Trajectory Types (for descent analysis)
// =============================================================================

export interface TrajectoryPoint {
  key: string; // commit hash or wip:hash
  timestamp: number;
  metrics: NormalizedMetrics;
  qualityScore: number; // Single scalar for descent tracking
  passed: boolean;
}

export interface Trajectory {
  points: TrajectoryPoint[];
  totalDescent: number; // Sum of quality improvements
  averageStepSize: number; // Mean |Δquality|
  monotonicSteps: number; // Steps that improved
  regressionSteps: number; // Steps that worsened
  convergenceState: ConvergenceState;
}

export type ConvergenceState =
  | 'improving' // Consistent descent
  | 'converged' // At or near target
  | 'stagnating' // No progress
  | 'oscillating'; // Back and forth

export interface AllCoverageMetrics {
  lambda?: CoverageMetrics;
  unit?: CoverageMetrics;
  union?: CoverageMetrics;
}

export interface CoverageMetrics {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface TypescriptMetrics {
  errors: number;
  warnings: number;
  // Root-cause counts for improved local continuity
  rootCauses?: number; // Distinct (file, code, symbolPath) combinations
}

export interface EslintMetrics {
  errors: number;
  warnings: number;
  // Root-cause counts for improved local continuity
  rootCauses?: number; // Distinct (file, ruleId, symbolPath) combinations
}

// =============================================================================
// Root-Cause Analysis Types
// =============================================================================

/**
 * A root cause identifies the source of potentially cascading errors.
 * Multiple errors with the same root cause count as ONE issue.
 */
export interface RootCause {
  file: string;
  code: string; // Error code (TS2345, @typescript-eslint/no-unused-vars)
  symbolPath?: string; // Path to affected symbol (e.g., "Foo.bar.baz")
  line?: number; // Line number (for grouping nearby issues)
}

/**
 * Groups errors by root cause to restore local continuity.
 * Cascading errors from one root cause = one unit of improvement when fixed.
 */
export interface RootCauseGroup {
  rootCause: RootCause;
  errorCount: number; // How many raw errors map to this root cause
  messages: string[]; // Sample error messages
}

export interface SonarqubeMetrics {
  bugs: number;
  vulnerabilities: number;
  codeSmells: number;
  coverage: number;
  duplications: number;
  // Severity breakdown
  blocker: number;
  critical: number;
  major: number;
  minor: number;
  info: number;
}

export interface BundleMetrics {
  totalSize: number;
  chunks: Record<string, number>;
}

// =============================================================================
// Rules Schema
// =============================================================================

export interface QualityRules {
  version: string;
  description: string;
  rules: {
    floors?: Record<string, number>;
    ceilings?: Record<string, number>;
    monotonic?: MonotonicRule[];
    requiredScripts?: string[];
  };
}

export interface MonotonicRule {
  direction: 'up' | 'down';
  metrics: string[];
}

// =============================================================================
// Evaluation Results
// =============================================================================

export interface EvaluationResult {
  status: 'pass' | 'fail';
  failedRules: FailedRule[];
}

export interface FailedRule {
  type: 'floor' | 'ceiling' | 'monotonic' | 'script';
  rule: string;
  message: string;
  baseline?: number;
  current?: number;
}

// =============================================================================
// Dependency Graph Types
// =============================================================================

export interface FileInfo {
  path: string;
  degree: number;
  localDependencies: string[];
  dependencyCount: number;
  directDependents: number;
  indirectDependents: number;
  impact: number;
  coverage?: CoverageMetrics;
}

// =============================================================================
// Optimization Types
// =============================================================================

export interface OptimizationConfig {
  strategy: 'greedy' | 'sampled';
  candidates?: number;
  severityWeights?: Record<string, number>;
  priorityWeights?: PriorityWeights;
}

export interface PriorityWeights {
  coverage: number;
  ease: number;
  impact: number;
  severity: number;
}

export interface PrioritizedFile {
  file: FileInfo;
  priority: number;
  components: {
    coverageGap: number;
    easeOfTesting: number;
    importance: number;
    severityScore: number;
  };
}
