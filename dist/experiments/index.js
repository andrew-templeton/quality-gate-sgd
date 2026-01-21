/**
 * Experiment Infrastructure
 * =========================
 * Trajectory logging, analysis, and visualization for validating
 * pre-registered hypotheses H1-H12.
 *
 * @module experiments
 */
// Logger
export { startExperimentRun, logIteration, endExperimentRun, getCurrentRunId, getCurrentIteration, createBatch, addRunToBatch, saveBatch, loadBatch, loadRun, listRuns, } from './logger.js';
// Statistics
export { describe, tTest, pearsonCorrelation, spearmanCorrelation, chiSquaredTest, } from './stats.js';
// Analysis
export { analyzeBatch, generateAnalysisReport, } from './analyzer.js';
// Visualization
export { sparkline, visualizeRun, compareRuns, visualizeBatch, visualizeResults, boxPlot, comparativeBoxPlots, iterationTimeline, resultsTable, } from './visualize.js';
//# sourceMappingURL=index.js.map