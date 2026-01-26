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
  FileChange,
  HarnessOptions,
} from './harness.js';

export {
  createAgentHarness,
  createMockMetricsProvider,
  createMockExecutor,
} from './harness.js';

// LLM Executor (Production)
export type { LLMExecutorConfig } from './llm-executor.js';

export {
  createLLMExecutor,
  createGPT5MiniExecutor,
  createGPT5NanoExecutor,
  createGPT52Executor,
  createCustomEndpointExecutor,
  extractReasoning,
  reasoningToPatch,
} from './llm-executor.js';

// Quality Gate
export type {
  PatchQualityMetrics,
  PatchProposalReasoning,
  QualityGateConfig,
  QualityGateResult,
} from './swebench/quality-gate.js';

export {
  evaluatePatchQuality,
  evaluateQualityGate,
  generateQualityFeedback,
  DEFAULT_QUALITY_GATE,
} from './swebench/quality-gate.js';

// Code Retrieval
export type {
  CodeRetrievalConfig,
  RetrievedFile,
  CodeContext,
} from './swebench/code-retrieval.js';

export {
  extractFilePaths,
  retrieveCodeContext,
  formatCodeContext,
  DEFAULT_RETRIEVAL_CONFIG,
} from './swebench/code-retrieval.js';

// SWE-bench Integration
export type {
  SWEBenchInstance,
  SWEBenchTask,
  TestSpec,
  DatasetSplit,
  DatasetOptions,
  DatasetMetadata,
  EvaluationResult as SWEBenchEvaluationResult,
  EvaluationOptions as SWEBenchEvaluationOptions,
  PatchResult,
  PatchOptions,
  RepoSetupResult,
  RepoSetupOptions,
  TestResult as SWEBenchTestResult,
} from './swebench/index.js';

export {
  loadFromFile as loadSWEBenchFile,
  loadTasks as loadSWEBenchTasks,
  instanceToTask as sweBenchInstanceToTask,
  filterByRepo as filterSWEBenchByRepo,
  filterByTestCount as filterSWEBenchByTestCount,
  stratifiedSample as stratifiedSWEBenchSample,
  getUniqueRepos as getSWEBenchRepos,
  groupByRepo as groupSWEBenchByRepo,
  computeDatasetStats as computeSWEBenchStats,
  setupRepository,
  cleanupRepository,
  applyPatch,
  applyGoldPatch,
  applyTestPatch,
  reverseGoldPatch,
  evaluateTask as evaluateSWEBenchTask,
  evaluateTaskFull as evaluateSWEBenchTaskFull,
  verifyGoldPatch,
  evaluateBatch as evaluateSWEBenchBatch,
  summarizeEvaluations as summarizeSWEBenchEvaluations,
  // Downloader
  downloadSplit as downloadSWEBenchSplit,
  downloadSplits as downloadSWEBenchSplits,
  downloadAll as downloadSWEBenchAll,
  checkLocalSplits as checkSWEBenchLocalSplits,
  getLocalPath as getSWEBenchLocalPath,
  getDatasetInfo as getSWEBenchDatasetInfo,
  formatBytes,
  progressBar,
} from './swebench/index.js';

// Docker-based SWE-bench Evaluator
export type {
  EvaluationResult as DockerEvaluationResult,
  EvaluatorConfig as DockerEvaluatorConfig,
  PatchToEvaluate,
} from './docker/evaluator.js';

export {
  getImageName as getDockerImageName,
  imageExists as dockerImageExists,
  pullImage as pullDockerImage,
  ensureImage as ensureDockerImage,
  evaluatePatch as evaluatePatchInDocker,
  evaluatePatches as evaluatePatchesInDocker,
  computeEvaluationStats as computeDockerEvaluationStats,
  isDockerAvailable,
  getDockerInfo,
} from './docker/evaluator.js';
