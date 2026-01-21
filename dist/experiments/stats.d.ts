/**
 * Statistical Analysis Functions
 * ==============================
 * Implements statistical tests for validating pre-registered hypotheses.
 * Includes t-tests, correlation, effect sizes, and confidence intervals.
 */
import type { DescriptiveStats, StatisticalTest } from './types.js';
/**
 * Compute descriptive statistics for a sample.
 */
export declare function describe(data: number[]): DescriptiveStats;
/**
 * Two-sample t-test (Welch's t-test for unequal variances).
 * Tests H0: mean1 = mean2 vs H1: mean1 ≠ mean2
 */
export declare function tTest(sample1: number[], sample2: number[], options?: {
    paired?: boolean;
}): StatisticalTest;
/**
 * Pearson correlation coefficient.
 */
export declare function pearsonCorrelation(x: number[], y: number[]): StatisticalTest;
/**
 * Spearman rank correlation.
 */
export declare function spearmanCorrelation(x: number[], y: number[]): StatisticalTest;
/**
 * Chi-squared test for independence (2x2 contingency table).
 */
export declare function chiSquaredTest(group1Success: number, group1Total: number, group2Success: number, group2Total: number): StatisticalTest;
//# sourceMappingURL=stats.d.ts.map