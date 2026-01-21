/**
 * Experiment Types
 * ================
 * Type definitions for experiment tracking and trajectory logging.
 * Supports validation of pre-registered hypotheses H1-H12.
 */

// =============================================================================
// Experiment Configuration
// =============================================================================

/**
 * Experimental design from PREREG.md
 */
export type ExperimentDesign = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/**
 * Pre-registered hypothesis identifiers
 */
export type HypothesisId =
  | 'H1' | 'H2'   // Design A: Gate vs No-Gate
  | 'H3'         // Design B: Topology Sensitivity
  | 'H4' | 'H5' | 'H6'  // Design C: Addressing Fitness
  | 'H7' | 'H8'  // Design D: Call Graph Weighting
  | 'H9' | 'H10' // Design E: Fixability Validity
  | 'H11' | 'H12'; // Design F: Adjusted Prioritization

/**
 * Experimental condition/treatment
 */
export interface ExperimentCondition {
  /** Condition name (e.g., "baseline", "treatment") */
  name: string;
  /** Design this condition belongs to */
  design: ExperimentDesign;
  /** Configuration overrides for this condition */
  config: ExperimentConfig;
}

/**
 * Configuration for an experiment run
 */
export interface ExperimentConfig {
  /** Maximum iterations before stopping */
  maxIterations: number;
  /** Whether quality gate feedback is enabled */
  gateEnabled: boolean;
  /** Topology variant (for Design B) */
  topology?: 'coverage-only' | 'coverage-ceilings' | 'full';
  /** Whether call graph weighting is enabled (for Design D) */
  callGraphWeighting?: boolean;
  /** Whether fixability estimation is enabled (for Design E/F) */
  fixabilityEnabled?: boolean;
  /** Prioritization mode (for Design F) */
  prioritization?: 'raw' | 'weighted' | 'adjusted';
  /** Granularity mode */
  granularity?: 'dimension' | 'file' | 'symbol';
  /** Random seed for reproducibility */
  seed?: number;
}

// =============================================================================
// Trajectory Logging
// =============================================================================

/**
 * A single iteration within an experiment run.
 */
export interface IterationRecord {
  /** Iteration number (1-indexed) */
  iteration: number;
  /** Timestamp when iteration started */
  timestamp: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Raw metrics at this point */
  metrics: Record<string, number>;
  /** Quality score (scalar summary) */
  qualityScore: number;
  /** Whether gate passed at this iteration */
  passed: boolean;
  /** Target suggested by optimizer (if any) */
  target?: TargetSuggestion;
  /** Outcome of fix attempt */
  outcome?: IterationOutcome;
  /** Delta from previous iteration */
  delta?: number;
}

/**
 * Target suggestion made by the optimizer
 */
export interface TargetSuggestion {
  /** Type of target */
  type: 'dimension' | 'file' | 'symbol';
  /** Target identifier */
  id: string;
  /** Expected ΔQ if fixed */
  expectedDeltaQ: number;
  /** Weighted ΔQ (if call graph weighting enabled) */
  weightedDeltaQ?: number;
  /** Adjusted ΔQ (if fixability enabled) */
  adjustedDeltaQ?: number;
  /** Fixability score (if estimated) */
  fixabilityScore?: number;
}

/**
 * Outcome of a fix attempt
 */
export interface IterationOutcome {
  /** Whether the fix was successful (quality improved) */
  success: boolean;
  /** Actual ΔQ observed */
  actualDeltaQ: number;
  /** Whether it was the suggested target */
  targetMatched: boolean;
  /** Any errors encountered */
  error?: string;
}

/**
 * Complete record of a single experiment run
 */
export interface ExperimentRun {
  /** Unique run identifier */
  runId: string;
  /** Task identifier (e.g., SWE-bench task ID) */
  taskId: string;
  /** Experiment condition */
  condition: ExperimentCondition;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime: number;
  /** All iterations */
  iterations: IterationRecord[];
  /** Final outcome */
  outcome: RunOutcome;
  /** System metadata */
  metadata: RunMetadata;
}

/**
 * Final outcome of an experiment run
 */
export interface RunOutcome {
  /** Whether the gate was passed within max iterations */
  passed: boolean;
  /** Iterations to pass (undefined if not passed) */
  iterationsToPass?: number;
  /** Final quality score */
  finalScore: number;
  /** Total improvement from start */
  totalImprovement: number;
  /** Monotonic improvement rate */
  monotonicRate: number;
  /** Wasted iterations (no improvement) */
  wastedIterations: number;
  /** Reason for stopping */
  stopReason: 'passed' | 'max_iterations' | 'error' | 'manual';
}

/**
 * Metadata about the system and environment
 */
export interface RunMetadata {
  /** Git commit of the experiment code */
  experimentCommit: string;
  /** quality-gate-sgd version */
  packageVersion: string;
  /** LLM model used */
  llmModel?: string;
  /** Random seed used */
  seed?: number;
  /** Node.js version */
  nodeVersion: string;
  /** Platform (darwin, linux, etc.) */
  platform: string;
  /** Symbol mapping coverage rate (for H4) */
  mappingCoverage?: number;
  /** Call graph resolution rate (for H5) */
  callGraphResolution?: number;
  /** P90 address SLOC (for H6) */
  p90AddressSloc?: number;
  /** Custom metadata for extensibility */
  [key: string]: string | number | undefined;
}

// =============================================================================
// Statistical Analysis Types
// =============================================================================

/**
 * Result of a statistical test
 */
export interface StatisticalTest {
  /** Test name */
  test: string;
  /** Test statistic */
  statistic: number;
  /** P-value */
  pValue: number;
  /** Effect size (Cohen's d, correlation, etc.) */
  effectSize: number;
  /** Confidence interval */
  ci95: [number, number];
  /** Degrees of freedom (if applicable) */
  df?: number;
  /** Sample sizes */
  n: number | [number, number];
}

/**
 * Descriptive statistics for a sample
 */
export interface DescriptiveStats {
  n: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q25: number;
  q75: number;
}

/**
 * Hypothesis test result
 */
export interface HypothesisResult {
  /** Hypothesis identifier */
  hypothesis: HypothesisId;
  /** Description of the hypothesis */
  description: string;
  /** Statistical test performed */
  test: StatisticalTest;
  /** Descriptive stats for control/baseline */
  baseline: DescriptiveStats;
  /** Descriptive stats for treatment */
  treatment: DescriptiveStats;
  /** Whether hypothesis is supported at α = 0.05 */
  supported: boolean;
  /** Interpretation */
  interpretation: string;
}

// =============================================================================
// Experiment Batch Types
// =============================================================================

/**
 * Collection of runs for a complete experiment
 */
export interface ExperimentBatch {
  /** Batch identifier */
  batchId: string;
  /** Experiment design */
  design: ExperimentDesign;
  /** Hypotheses being tested */
  hypotheses: HypothesisId[];
  /** All runs in this batch */
  runs: ExperimentRun[];
  /** When the batch was created */
  createdAt: number;
  /** When analysis was last run */
  analyzedAt?: number;
  /** Hypothesis results */
  results?: HypothesisResult[];
}
