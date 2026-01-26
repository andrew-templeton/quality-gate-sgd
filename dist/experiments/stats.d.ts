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
/**
 * One-way ANOVA result.
 */
export interface AnovaResult extends StatisticalTest {
    /** Group means */
    groupMeans: number[];
    /** Between-group sum of squares */
    ssBetween: number;
    /** Within-group sum of squares */
    ssWithin: number;
    /** Between-group degrees of freedom */
    dfBetween: number;
    /** Within-group degrees of freedom */
    dfWithin: number;
    /** Mean square between */
    msBetween: number;
    /** Mean square within */
    msWithin: number;
    /** Eta-squared effect size */
    etaSquared: number;
}
/**
 * One-way ANOVA for comparing means across multiple groups.
 * Tests H0: all group means are equal.
 */
export declare function anova(groups: number[][]): AnovaResult;
/**
 * Linear regression result.
 */
export interface RegressionResult extends StatisticalTest {
    /** Intercept (b0) */
    intercept: number;
    /** Slope (b1) */
    slope: number;
    /** R-squared */
    rSquared: number;
    /** Adjusted R-squared */
    adjRSquared: number;
    /** Standard error of the estimate */
    standardError: number;
    /** Standard error of the slope */
    slopeStdError: number;
    /** Residuals */
    residuals: number[];
}
/**
 * Simple linear regression: y = b0 + b1*x
 * Returns slope, intercept, R², and significance test for slope.
 */
export declare function linearRegression(x: number[], y: number[]): RegressionResult;
/**
 * Logistic regression result.
 */
export interface LogisticRegressionResult extends StatisticalTest {
    /** Intercept (b0) */
    intercept: number;
    /** Slope (b1) */
    slope: number;
    /** Odds ratio (exp(slope)) */
    oddsRatio: number;
    /** Log-likelihood */
    logLikelihood: number;
    /** Null log-likelihood */
    nullLogLikelihood: number;
    /** McFadden's pseudo R-squared */
    pseudoRSquared: number;
}
/**
 * Simple logistic regression: log(p/(1-p)) = b0 + b1*x
 * Uses Newton-Raphson for maximum likelihood estimation.
 */
export declare function logisticRegression(x: number[], y: number[]): LogisticRegressionResult;
/**
 * ROC-AUC result.
 */
export interface RocAucResult extends StatisticalTest {
    /** Area under the curve */
    auc: number;
    /** ROC curve points (fpr, tpr) */
    rocCurve: Array<{
        fpr: number;
        tpr: number;
        threshold: number;
    }>;
    /** Standard error of AUC (DeLong) */
    aucStdError: number;
}
/**
 * Compute ROC curve and AUC for binary classification.
 * Scores should be higher for positive class.
 */
export declare function rocAuc(scores: number[], labels: number[]): RocAucResult;
//# sourceMappingURL=stats.d.ts.map