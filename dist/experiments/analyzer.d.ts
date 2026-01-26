/**
 * Experiment Analyzer
 * ===================
 * Analyzes experiment batches to validate pre-registered hypotheses.
 */
import type { ExperimentBatch, ExperimentRun, HypothesisResult } from './types.js';
/**
 * Analyze a batch and test all hypotheses.
 */
export declare function analyzeBatch(batch: ExperimentBatch): HypothesisResult[];
/**
 * Compute the wasted iteration rate for a run.
 * A wasted iteration is one where:
 * - The fix attempt failed AND
 * - A better target was available (higher expected improvement)
 *
 * This provides a more nuanced measure than simple wastedIterations / total.
 */
export declare function computeWastedIterationRate(run: ExperimentRun): number;
/**
 * Compute detailed wasted iteration breakdown for a run.
 */
export interface WastedIterationBreakdown {
    /** Total iterations */
    total: number;
    /** Failed iterations */
    failed: number;
    /** Wasted iterations (failed on low-fixability targets) */
    wasted: number;
    /** Wasted iteration rate */
    rate: number;
    /** Opportunity cost: potential improvements missed */
    opportunityCost: number;
}
export declare function computeWastedIterationBreakdown(run: ExperimentRun): WastedIterationBreakdown;
/**
 * Generate a summary report for a batch analysis.
 */
export declare function generateAnalysisReport(batch: ExperimentBatch, results: HypothesisResult[]): string;
//# sourceMappingURL=analyzer.d.ts.map