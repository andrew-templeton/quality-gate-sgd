/**
 * Experiment Visualization
 * ========================
 * ASCII-based visualization for experiment trajectories and results.
 */
import type { ExperimentRun, ExperimentBatch, HypothesisResult, IterationRecord } from './types.js';
/**
 * Generate ASCII sparkline from an array of values.
 */
export declare function sparkline(values: number[], options?: {
    width?: number;
}): string;
/**
 * Generate a summary visualization for a single run.
 */
export declare function visualizeRun(run: ExperimentRun): string;
/**
 * Generate a comparison view for two runs (e.g., baseline vs treatment).
 */
export declare function compareRuns(baseline: ExperimentRun, treatment: ExperimentRun): string;
/**
 * Generate a summary visualization for a batch.
 */
export declare function visualizeBatch(batch: ExperimentBatch): string;
/**
 * Generate a visual summary of hypothesis results.
 */
export declare function visualizeResults(results: HypothesisResult[]): string;
/**
 * Generate ASCII box plot for a distribution.
 */
export declare function boxPlot(values: number[], options?: {
    width?: number;
    label?: string;
}): string;
/**
 * Generate multiple box plots for comparison.
 */
export declare function comparativeBoxPlots(data: Array<{
    label: string;
    values: number[];
}>): string;
/**
 * Generate a timeline visualization for iterations.
 */
export declare function iterationTimeline(iterations: IterationRecord[]): string;
/**
 * Generate a markdown table summarizing all results.
 */
export declare function resultsTable(results: HypothesisResult[]): string;
//# sourceMappingURL=visualize.d.ts.map