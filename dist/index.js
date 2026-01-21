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
// =============================================================================
// Configuration
// =============================================================================
export { getConfig, loadConfig, resetConfig, getSonarAuthToken, getSonarCurlAuth, } from './config.js';
// =============================================================================
// Rules Engine
// =============================================================================
export { loadRules, computeRulesHash, evaluateRules, isCacheValid, } from './rules.js';
// =============================================================================
// Metrics Extraction
// =============================================================================
export { 
// Coverage
extractAllCoverageMetrics, extractCoverageMetrics, 
// SonarQube
extractSonarqubeMetrics, isSonarqubeAvailable, runSonarqubeScan, getTopSonarIssues, 
// TypeScript & ESLint
extractTypescriptMetrics, extractEslintMetrics, 
// Scripts
runScript, runScripts, 
// SLOC extraction
extractSloc, 
// Full extraction
extractAllMetrics, extractAllMetricsAsync, } from './metrics.js';
// =============================================================================
// Cache System
// =============================================================================
export { 
// Git utilities
getCurrentCommitHash, getBaselineCommitHash, getCacheKey, isWIPKey, 
// Cache I/O
loadCache, saveCache, 
// Cache entry operations
getCacheEntry, setCacheEntry, createCacheEntry, findBaselineEntry, pruneOldEntries, } from './cache.js';
// =============================================================================
// Severity Weights (SGD Gradient)
// =============================================================================
export { DEFAULT_SEVERITY_WEIGHTS, getSeverityWeight, sumSeverityWeights, } from './severity.js';
// =============================================================================
// Dependency Graph Analysis
// =============================================================================
export { 
// Graph building
buildDependencyGraph, buildDependentCounts, 
// File analysis
getAllTypeScriptFiles, extractLocalImports, calculateDegrees, 
// Coverage integration
attachCoverageData, } from './dependency-graph.js';
// =============================================================================
// Optimizer (Priority Computation)
// =============================================================================
export { 
// Priority computation
computePriority, prioritizeFiles, 
// Default weights
DEFAULT_PRIORITY_WEIGHTS, } from './optimizer.js';
// =============================================================================
// Issue Listing
// =============================================================================
export { listIssues } from './list-issues.js';
// =============================================================================
// Initialization
// =============================================================================
export { runInit } from './init.js';
export { 
// Constants
BUILTIN_DIMENSIONS, 
// Registration
registerDimension, clearCustomDimensions, 
// Lookup
getDimension, getAllDimensions, getValidPaths, validatePath, 
// Filtering
getDimensionsByCategory, getDimensionsByContinuity, getSmoothDimensions, getConstraintDimensions, 
// Documentation
formatDimensionsTable, generateDimensionsDoc, 
// Custom dimensions
loadCustomDimensions, extractCustomMetric, registerCustomDimensions, extractAllCustomMetrics, } from './dimensions/index.js';
export { 
// Config
getDefaultFitnessConfig, 
// Computation
computeFitness, computeGradient, 
// Suggestions
suggestNextFix, suggestNextFixes, 
// Formatting
formatFitnessScore, formatGradientTable, formatSuggestion, 
// Utility
getMetricValue, } from './fitness.js';
export { 
// Normalization
normalizeMetrics, 
// Quality score
computeQualityScore, DEFAULT_QUALITY_WEIGHTS, 
// Trajectory building
buildTrajectory, 
// Visualization
trajectorySparkline, formatTrajectorySummary, } from './trajectory.js';
// =============================================================================
// MCP Server (Model Context Protocol)
// =============================================================================
export { 
// Server
createMcpServer, runMcpServer, 
// Tools
TOOLS, handleRun, handleScore, handleSuggest, handleTrajectory, handleExplain, 
// Resources
RESOURCES, readResource, } from './mcp/index.js';
export { 
// Logger
startExperimentRun, logIteration, endExperimentRun, getCurrentRunId, getCurrentIteration, createBatch, addRunToBatch, saveBatch, loadBatch, loadRun, listRuns, 
// Statistics
describe, tTest, pearsonCorrelation, spearmanCorrelation, chiSquaredTest, 
// Analysis
analyzeBatch, generateAnalysisReport, 
// Visualization
sparkline, visualizeRun, compareRuns, visualizeBatch, visualizeResults, boxPlot, comparativeBoxPlots, iterationTimeline, resultsTable, } from './experiments/index.js';
//# sourceMappingURL=index.js.map