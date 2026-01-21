/**
 * Experiment Infrastructure
 * =========================
 * Trajectory logging, analysis, and visualization for validating
 * pre-registered hypotheses H1-H12.
 *
 * @module experiments
 */
export type { ExperimentDesign, HypothesisId, ExperimentCondition, ExperimentConfig, IterationRecord, TargetSuggestion, IterationOutcome, ExperimentRun, RunOutcome, RunMetadata, StatisticalTest, DescriptiveStats, HypothesisResult, ExperimentBatch, } from './types.js';
export { startExperimentRun, logIteration, endExperimentRun, getCurrentRunId, getCurrentIteration, createBatch, addRunToBatch, saveBatch, loadBatch, loadRun, listRuns, } from './logger.js';
export { describe, tTest, pearsonCorrelation, spearmanCorrelation, chiSquaredTest, } from './stats.js';
export { analyzeBatch, generateAnalysisReport, } from './analyzer.js';
export { sparkline, visualizeRun, compareRuns, visualizeBatch, visualizeResults, boxPlot, comparativeBoxPlots, iterationTimeline, resultsTable, } from './visualize.js';
export type { DesignMetadata } from './conditions.js';
export { DEFAULT_EXPERIMENT_CONFIG, DESIGN_METADATA, createConditions, getBaselineCondition, getTreatmentConditions, validateCondition, canPairConditions, describeCondition, conditionLabel, } from './conditions.js';
//# sourceMappingURL=index.d.ts.map