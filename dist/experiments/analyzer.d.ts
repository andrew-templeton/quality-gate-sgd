/**
 * Experiment Analyzer
 * ===================
 * Analyzes experiment batches to validate pre-registered hypotheses.
 */
import type { ExperimentBatch, HypothesisResult } from './types.js';
/**
 * Analyze a batch and test all hypotheses.
 */
export declare function analyzeBatch(batch: ExperimentBatch): HypothesisResult[];
/**
 * Generate a summary report for a batch analysis.
 */
export declare function generateAnalysisReport(batch: ExperimentBatch, results: HypothesisResult[]): string;
//# sourceMappingURL=analyzer.d.ts.map