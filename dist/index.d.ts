/**
 * quality-gate-sgd
 * ================
 * Deterministic quality gates for stochastic gradient descent behavior from LLM agents.
 *
 * This package provides:
 * - Quality gate evaluation with floors, ceilings, and monotonic rules
 * - SonarQube integration for code quality metrics
 * - Coverage aggregation from multiple test suites
 * - Intelligent caching with content-aware hashing
 * - Dependency graph analysis for test prioritization
 * - Priority computation for LLM agent guidance
 */
export type { QualityGateCache, CacheEntry, Metrics, AllCoverageMetrics, CoverageMetrics, TypescriptMetrics, EslintMetrics, SonarqubeMetrics, BundleMetrics, RootCause, RootCauseGroup, QualityRules, MonotonicRule, EvaluationResult, FailedRule, FileInfo, OptimizationConfig, PriorityWeights, PrioritizedFile, } from './types.js';
export { type QualityGateConfig, getConfig, loadConfig, resetConfig, getSonarAuthToken, getSonarCurlAuth, } from './config.js';
export { loadRules, computeRulesHash, evaluateRules, isCacheValid, } from './rules.js';
export { extractAllCoverageMetrics, extractCoverageMetrics, extractSonarqubeMetrics, isSonarqubeAvailable, runSonarqubeScan, getTopSonarIssues, type SonarIssue, extractTypescriptMetrics, extractEslintMetrics, runScript, runScripts, extractSloc, extractAllMetrics, extractAllMetricsAsync, } from './metrics.js';
export { getCurrentCommitHash, getBaselineCommitHash, getCacheKey, isWIPKey, loadCache, saveCache, getCacheEntry, setCacheEntry, createCacheEntry, findBaselineEntry, pruneOldEntries, } from './cache.js';
export { DEFAULT_SEVERITY_WEIGHTS, getSeverityWeight, sumSeverityWeights, } from './severity.js';
export { buildDependencyGraph, buildDependentCounts, getAllTypeScriptFiles, extractLocalImports, calculateDegrees, attachCoverageData, } from './dependency-graph.js';
export { computePriority, prioritizeFiles, DEFAULT_PRIORITY_WEIGHTS, } from './optimizer.js';
export { listIssues } from './list-issues.js';
export { runInit } from './init.js';
export type { DimensionDef, DimensionUnit, DimensionDirection, DimensionContinuity, DimensionCategory, } from './dimensions/index.js';
export { BUILTIN_DIMENSIONS, registerDimension, clearCustomDimensions, getDimension, getAllDimensions, getValidPaths, validatePath, getDimensionsByCategory, getDimensionsByContinuity, getSmoothDimensions, getConstraintDimensions, formatDimensionsTable, generateDimensionsDoc, loadCustomDimensions, extractCustomMetric, registerCustomDimensions, extractAllCustomMetrics, } from './dimensions/index.js';
export type { CustomDimensionConfig, ScriptExtractor, } from './dimensions/index.js';
export type { FitnessConfig, FitnessAggregation, GradientComponent, FitnessSuggestion, } from './fitness.js';
export { getDefaultFitnessConfig, computeFitness, computeGradient, suggestNextFix, suggestNextFixes, formatFitnessScore, formatGradientTable, formatSuggestion, getMetricValue, } from './fitness.js';
export type { NormalizedMetrics, TrajectoryPoint, Trajectory, ConvergenceState, } from './types.js';
export { normalizeMetrics, computeQualityScore, DEFAULT_QUALITY_WEIGHTS, buildTrajectory, trajectorySparkline, formatTrajectorySummary, } from './trajectory.js';
export { createMcpServer, runMcpServer, TOOLS, handleRun, handleScore, handleSuggest, handleTrajectory, handleExplain, RESOURCES, readResource, } from './mcp/index.js';
export type { ExperimentDesign, HypothesisId, ExperimentCondition, ExperimentConfig, IterationRecord, TargetSuggestion, IterationOutcome, ExperimentRun, RunOutcome, RunMetadata, StatisticalTest, DescriptiveStats, HypothesisResult, ExperimentBatch, } from './experiments/index.js';
export { startExperimentRun, logIteration, endExperimentRun, getCurrentRunId, getCurrentIteration, createBatch, addRunToBatch, saveBatch, loadBatch, loadRun, listRuns, describe, tTest, pearsonCorrelation, spearmanCorrelation, chiSquaredTest, analyzeBatch, generateAnalysisReport, sparkline, visualizeRun, compareRuns, visualizeBatch, visualizeResults, boxPlot, comparativeBoxPlots, iterationTimeline, resultsTable, } from './experiments/index.js';
//# sourceMappingURL=index.d.ts.map