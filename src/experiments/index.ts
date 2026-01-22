/**
 * Experiment Infrastructure
 * =========================
 * Trajectory logging, analysis, and visualization for validating
 * pre-registered hypotheses H1-H12.
 *
 * @module experiments
 */

// Types
export type {
  ExperimentDesign,
  HypothesisId,
  ExperimentCondition,
  ExperimentConfig,
  IterationRecord,
  TargetSuggestion,
  IterationOutcome,
  ExperimentRun,
  RunOutcome,
  RunMetadata,
  StatisticalTest,
  DescriptiveStats,
  HypothesisResult,
  ExperimentBatch,
} from './types.js';

// Logger
export {
  startExperimentRun,
  logIteration,
  endExperimentRun,
  getCurrentRunId,
  getCurrentIteration,
  createBatch,
  addRunToBatch,
  saveBatch,
  loadBatch,
  loadRun,
  listRuns,
} from './logger.js';

// Statistics
export type {
  AnovaResult,
  RegressionResult,
  LogisticRegressionResult,
  RocAucResult,
} from './stats.js';

export {
  describe,
  tTest,
  pearsonCorrelation,
  spearmanCorrelation,
  chiSquaredTest,
  anova,
  linearRegression,
  logisticRegression,
  rocAuc,
} from './stats.js';

// Analysis
export type { WastedIterationBreakdown } from './analyzer.js';

export {
  analyzeBatch,
  generateAnalysisReport,
  computeWastedIterationRate,
  computeWastedIterationBreakdown,
} from './analyzer.js';

// Visualization
export {
  sparkline,
  visualizeRun,
  compareRuns,
  visualizeBatch,
  visualizeResults,
  boxPlot,
  comparativeBoxPlots,
  iterationTimeline,
  resultsTable,
} from './visualize.js';

// Condition Factory
export type { DesignMetadata } from './conditions.js';

export {
  DEFAULT_EXPERIMENT_CONFIG,
  DESIGN_METADATA,
  createConditions,
  getBaselineCondition,
  getTreatmentConditions,
  validateCondition,
  canPairConditions,
  describeCondition,
  conditionLabel,
} from './conditions.js';

// Runner
export type {
  ExperimentTask,
  IterationEvaluationResult,
  ExperimentAgent,
  RunOptions,
  BatchOptions,
  ResumeOptions,
} from './runner.js';

export {
  executeRun,
  executeBatch,
  executeTaskAcrossConditions,
  executeBaselineVsTreatment,
  canResumeRun,
  getLastIteration,
  createMockAgent,
  estimateTimeRemaining,
  formatDuration,
} from './runner.js';

// Agent Harness
export type {
  MetricsProvider,
  LLMExecutor,
  FixContext,
  FixAttemptResult,
  HarnessOptions,
} from './harness.js';

export {
  createAgentHarness,
  createMockMetricsProvider,
  createMockExecutor,
} from './harness.js';
