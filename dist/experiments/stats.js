/**
 * Statistical Analysis Functions
 * ==============================
 * Implements statistical tests for validating pre-registered hypotheses.
 * Includes t-tests, correlation, effect sizes, and confidence intervals.
 */
// =============================================================================
// Descriptive Statistics
// =============================================================================
/**
 * Compute descriptive statistics for a sample.
 */
export function describe(data) {
    if (data.length === 0) {
        return {
            n: 0,
            mean: NaN,
            median: NaN,
            std: NaN,
            min: NaN,
            max: NaN,
            q25: NaN,
            q75: NaN,
        };
    }
    const sorted = [...data].sort((a, b) => a - b);
    const n = data.length;
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    // Variance and standard deviation
    const variance = data.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1 || 1);
    const std = Math.sqrt(variance);
    // Percentiles
    const q = (p) => {
        const idx = (n - 1) * p;
        const lower = Math.floor(idx);
        const upper = Math.ceil(idx);
        const weight = idx - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };
    return {
        n,
        mean,
        median: q(0.5),
        std,
        min: sorted[0],
        max: sorted[n - 1],
        q25: q(0.25),
        q75: q(0.75),
    };
}
// =============================================================================
// T-Tests
// =============================================================================
/**
 * Two-sample t-test (Welch's t-test for unequal variances).
 * Tests H0: mean1 = mean2 vs H1: mean1 ≠ mean2
 */
export function tTest(sample1, sample2, options = {}) {
    if (options.paired) {
        return pairedTTest(sample1, sample2);
    }
    const stats1 = describe(sample1);
    const stats2 = describe(sample2);
    const n1 = stats1.n;
    const n2 = stats2.n;
    const m1 = stats1.mean;
    const m2 = stats2.mean;
    const v1 = stats1.std ** 2;
    const v2 = stats2.std ** 2;
    // Welch's t-test
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    const t = (m1 - m2) / se;
    // Welch-Satterthwaite degrees of freedom
    const num = (v1 / n1 + v2 / n2) ** 2;
    const denom = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
    const df = num / denom;
    // Two-tailed p-value
    const pValue = 2 * (1 - tCDF(Math.abs(t), df));
    // Cohen's d effect size
    const pooledStd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
    const effectSize = (m1 - m2) / pooledStd;
    // 95% CI for difference in means
    const tCrit = tQuantile(0.975, df);
    const ci95 = [
        m1 - m2 - tCrit * se,
        m1 - m2 + tCrit * se,
    ];
    return {
        test: 'welch-t-test',
        statistic: t,
        pValue,
        effectSize,
        ci95,
        df,
        n: [n1, n2],
    };
}
/**
 * Paired t-test for matched samples.
 */
function pairedTTest(sample1, sample2) {
    if (sample1.length !== sample2.length) {
        throw new Error('Paired t-test requires equal sample sizes');
    }
    // Compute differences
    const diffs = sample1.map((x, i) => x - sample2[i]);
    const diffStats = describe(diffs);
    const n = diffStats.n;
    const meanDiff = diffStats.mean;
    const seDiff = diffStats.std / Math.sqrt(n);
    const t = meanDiff / seDiff;
    const df = n - 1;
    const pValue = 2 * (1 - tCDF(Math.abs(t), df));
    // Cohen's d for paired samples
    const effectSize = meanDiff / diffStats.std;
    // 95% CI for mean difference
    const tCrit = tQuantile(0.975, df);
    const ci95 = [
        meanDiff - tCrit * seDiff,
        meanDiff + tCrit * seDiff,
    ];
    return {
        test: 'paired-t-test',
        statistic: t,
        pValue,
        effectSize,
        ci95,
        df,
        n,
    };
}
// =============================================================================
// Correlation
// =============================================================================
/**
 * Pearson correlation coefficient.
 */
export function pearsonCorrelation(x, y) {
    if (x.length !== y.length) {
        throw new Error('Arrays must have equal length');
    }
    const n = x.length;
    if (n < 3) {
        return {
            test: 'pearson-r',
            statistic: NaN,
            pValue: NaN,
            effectSize: NaN,
            ci95: [NaN, NaN],
            n,
        };
    }
    const xStats = describe(x);
    const yStats = describe(y);
    // Covariance
    const cov = x.reduce((acc, xi, i) => acc + (xi - xStats.mean) * (y[i] - yStats.mean), 0) / (n - 1);
    // Correlation
    const r = cov / (xStats.std * yStats.std);
    // t-statistic for testing r = 0
    const t = r * Math.sqrt((n - 2) / (1 - r ** 2));
    const df = n - 2;
    const pValue = 2 * (1 - tCDF(Math.abs(t), df));
    // Fisher's z transformation for CI
    const z = 0.5 * Math.log((1 + r) / (1 - r));
    const seZ = 1 / Math.sqrt(n - 3);
    const zLow = z - 1.96 * seZ;
    const zHigh = z + 1.96 * seZ;
    const ci95 = [
        (Math.exp(2 * zLow) - 1) / (Math.exp(2 * zLow) + 1),
        (Math.exp(2 * zHigh) - 1) / (Math.exp(2 * zHigh) + 1),
    ];
    return {
        test: 'pearson-r',
        statistic: r,
        pValue,
        effectSize: r, // r is its own effect size
        ci95,
        df,
        n,
    };
}
/**
 * Spearman rank correlation.
 */
export function spearmanCorrelation(x, y) {
    if (x.length !== y.length) {
        throw new Error('Arrays must have equal length');
    }
    const n = x.length;
    if (n < 3) {
        return {
            test: 'spearman-rho',
            statistic: NaN,
            pValue: NaN,
            effectSize: NaN,
            ci95: [NaN, NaN],
            n,
        };
    }
    // Convert to ranks
    const rankX = toRanks(x);
    const rankY = toRanks(y);
    // Compute Pearson correlation on ranks
    const result = pearsonCorrelation(rankX, rankY);
    return {
        ...result,
        test: 'spearman-rho',
    };
}
/**
 * Convert values to ranks (average rank for ties).
 */
function toRanks(values) {
    const indexed = values.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(values.length);
    let i = 0;
    while (i < indexed.length) {
        let j = i;
        // Find all tied values
        while (j < indexed.length && indexed[j].v === indexed[i].v) {
            j++;
        }
        // Assign average rank to ties
        const avgRank = (i + j + 1) / 2;
        for (let k = i; k < j; k++) {
            ranks[indexed[k].i] = avgRank;
        }
        i = j;
    }
    return ranks;
}
// =============================================================================
// Chi-Squared Test
// =============================================================================
/**
 * Chi-squared test for independence (2x2 contingency table).
 */
export function chiSquaredTest(group1Success, group1Total, group2Success, group2Total) {
    const a = group1Success;
    const b = group1Total - group1Success;
    const c = group2Success;
    const d = group2Total - group2Success;
    const total = a + b + c + d;
    // Expected values
    const eA = ((a + b) * (a + c)) / total;
    const eB = ((a + b) * (b + d)) / total;
    const eC = ((c + d) * (a + c)) / total;
    const eD = ((c + d) * (b + d)) / total;
    // Chi-squared statistic
    const chi2 = (a - eA) ** 2 / eA + (b - eB) ** 2 / eB +
        (c - eC) ** 2 / eC + (d - eD) ** 2 / eD;
    const df = 1;
    const pValue = 1 - chiSquaredCDF(chi2, df);
    // Phi coefficient (effect size for 2x2 table)
    const phi = (a * d - b * c) / Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
    // Risk difference CI
    const p1 = group1Success / group1Total;
    const p2 = group2Success / group2Total;
    const diff = p1 - p2;
    const seDiff = Math.sqrt(p1 * (1 - p1) / group1Total + p2 * (1 - p2) / group2Total);
    const ci95 = [diff - 1.96 * seDiff, diff + 1.96 * seDiff];
    return {
        test: 'chi-squared',
        statistic: chi2,
        pValue,
        effectSize: phi,
        ci95,
        df,
        n: [group1Total, group2Total],
    };
}
// =============================================================================
// Distribution Functions (Approximations)
// =============================================================================
/**
 * Student's t CDF approximation.
 */
function tCDF(t, df) {
    // Approximation using normal for large df
    if (df > 100) {
        return normalCDF(t);
    }
    // Regularized incomplete beta function approximation
    const x = df / (df + t * t);
    return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
}
/**
 * Student's t quantile approximation.
 */
function tQuantile(p, df) {
    // Use Newton-Raphson to find t such that tCDF(t, df) = p
    // Start with normal approximation
    let t = normalQuantile(p);
    for (let i = 0; i < 10; i++) {
        const cdf = tCDF(t, df);
        const pdf = tPDF(t, df);
        if (pdf < 1e-10)
            break;
        t = t - (cdf - p) / pdf;
    }
    return t;
}
/**
 * Student's t PDF.
 */
function tPDF(t, df) {
    const coef = gamma((df + 1) / 2) / (Math.sqrt(df * Math.PI) * gamma(df / 2));
    return coef * Math.pow(1 + t * t / df, -(df + 1) / 2);
}
/**
 * Standard normal CDF.
 */
function normalCDF(x) {
    return 0.5 * (1 + erf(x / Math.sqrt(2)));
}
/**
 * Standard normal quantile (probit function).
 */
function normalQuantile(p) {
    // Rational approximation (Abramowitz and Stegun 26.2.23)
    if (p <= 0)
        return -Infinity;
    if (p >= 1)
        return Infinity;
    if (p === 0.5)
        return 0;
    const sign = p < 0.5 ? -1 : 1;
    const pp = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(pp));
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;
    const num = c0 + c1 * t + c2 * t * t;
    const den = 1 + d1 * t + d2 * t * t + d3 * t * t * t;
    return sign * (t - num / den);
}
/**
 * Chi-squared CDF approximation.
 */
function chiSquaredCDF(x, df) {
    if (x <= 0)
        return 0;
    return gammainc(df / 2, x / 2);
}
/**
 * Error function approximation.
 */
function erf(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + p * x);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}
/**
 * Gamma function approximation (Stirling's approximation).
 */
function gamma(z) {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    }
    z -= 1;
    const g = 7;
    const c = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) {
        x += c[i] / (z + i);
    }
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
/**
 * Lower incomplete gamma function (regularized).
 */
function gammainc(a, x) {
    if (x < 0 || a <= 0)
        return 0;
    // Series expansion for small x
    if (x < a + 1) {
        let sum = 1 / a;
        let term = sum;
        for (let n = 1; n < 100; n++) {
            term *= x / (a + n);
            sum += term;
            if (Math.abs(term) < 1e-10 * Math.abs(sum))
                break;
        }
        return sum * Math.exp(-x + a * Math.log(x) - Math.log(gamma(a)));
    }
    // Continued fraction for large x
    return 1 - gammainc_upper(a, x);
}
/**
 * Upper incomplete gamma function (regularized).
 */
function gammainc_upper(a, x) {
    // Continued fraction expansion
    let f = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / f;
    let h = d;
    for (let i = 1; i < 100; i++) {
        const an = -i * (i - a);
        const bn = f + 2 * i;
        d = bn + an * d;
        if (Math.abs(d) < 1e-30)
            d = 1e-30;
        c = bn + an / c;
        if (Math.abs(c) < 1e-30)
            c = 1e-30;
        d = 1 / d;
        const delta = d * c;
        h *= delta;
        if (Math.abs(delta - 1) < 1e-10)
            break;
    }
    return Math.exp(-x + a * Math.log(x) - Math.log(gamma(a))) * h;
}
/**
 * One-way ANOVA for comparing means across multiple groups.
 * Tests H0: all group means are equal.
 */
export function anova(groups) {
    const k = groups.length; // Number of groups
    const ns = groups.map(g => g.length);
    const N = ns.reduce((a, b) => a + b, 0); // Total sample size
    // Group means and grand mean
    const groupMeans = groups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
    const grandMean = groups.flat().reduce((a, b) => a + b, 0) / N;
    // Between-group sum of squares
    const ssBetween = groups.reduce((acc, g, i) => {
        return acc + g.length * (groupMeans[i] - grandMean) ** 2;
    }, 0);
    // Within-group sum of squares
    const ssWithin = groups.reduce((acc, g, i) => {
        return acc + g.reduce((a, x) => a + (x - groupMeans[i]) ** 2, 0);
    }, 0);
    // Degrees of freedom
    const dfBetween = k - 1;
    const dfWithin = N - k;
    // Mean squares
    const msBetween = ssBetween / dfBetween;
    const msWithin = ssWithin / dfWithin;
    // F-statistic
    const F = msBetween / msWithin;
    // P-value from F-distribution
    const pValue = 1 - fCDF(F, dfBetween, dfWithin);
    // Effect size: eta-squared
    const etaSquared = ssBetween / (ssBetween + ssWithin);
    return {
        test: 'one-way-anova',
        statistic: F,
        pValue,
        effectSize: etaSquared,
        ci95: [NaN, NaN], // CI not typically reported for ANOVA
        df: dfBetween,
        n: ns,
        groupMeans,
        ssBetween,
        ssWithin,
        dfBetween,
        dfWithin,
        msBetween,
        msWithin,
        etaSquared,
    };
}
/**
 * Simple linear regression: y = b0 + b1*x
 * Returns slope, intercept, R², and significance test for slope.
 */
export function linearRegression(x, y) {
    if (x.length !== y.length) {
        throw new Error('Arrays must have equal length');
    }
    const n = x.length;
    if (n < 3) {
        return {
            test: 'linear-regression',
            statistic: NaN,
            pValue: NaN,
            effectSize: NaN,
            ci95: [NaN, NaN],
            n,
            intercept: NaN,
            slope: NaN,
            rSquared: NaN,
            adjRSquared: NaN,
            standardError: NaN,
            slopeStdError: NaN,
            residuals: [],
        };
    }
    const xMean = x.reduce((a, b) => a + b, 0) / n;
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    // Sums of squares and cross-products
    let ssX = 0, ssY = 0, ssXY = 0;
    for (let i = 0; i < n; i++) {
        ssX += (x[i] - xMean) ** 2;
        ssY += (y[i] - yMean) ** 2;
        ssXY += (x[i] - xMean) * (y[i] - yMean);
    }
    // Slope and intercept
    const slope = ssXY / ssX;
    const intercept = yMean - slope * xMean;
    // Predicted values and residuals
    const residuals = y.map((yi, i) => yi - (intercept + slope * x[i]));
    // Sum of squared residuals (error)
    const ssResidual = residuals.reduce((a, r) => a + r ** 2, 0);
    // R-squared
    const rSquared = 1 - ssResidual / ssY;
    const adjRSquared = 1 - (1 - rSquared) * (n - 1) / (n - 2);
    // Standard error of the estimate
    const standardError = Math.sqrt(ssResidual / (n - 2));
    // Standard error of the slope
    const slopeStdError = standardError / Math.sqrt(ssX);
    // T-statistic for slope (H0: slope = 0)
    const t = slope / slopeStdError;
    const df = n - 2;
    const pValue = 2 * (1 - tCDF(Math.abs(t), df));
    // 95% CI for slope
    const tCrit = tQuantile(0.975, df);
    const ci95 = [
        slope - tCrit * slopeStdError,
        slope + tCrit * slopeStdError,
    ];
    return {
        test: 'linear-regression',
        statistic: t,
        pValue,
        effectSize: rSquared,
        ci95,
        df,
        n,
        intercept,
        slope,
        rSquared,
        adjRSquared,
        standardError,
        slopeStdError,
        residuals,
    };
}
/**
 * Simple logistic regression: log(p/(1-p)) = b0 + b1*x
 * Uses Newton-Raphson for maximum likelihood estimation.
 */
export function logisticRegression(x, y) {
    if (x.length !== y.length) {
        throw new Error('Arrays must have equal length');
    }
    const n = x.length;
    if (n < 3) {
        return {
            test: 'logistic-regression',
            statistic: NaN,
            pValue: NaN,
            effectSize: NaN,
            ci95: [NaN, NaN],
            n,
            intercept: NaN,
            slope: NaN,
            oddsRatio: NaN,
            logLikelihood: NaN,
            nullLogLikelihood: NaN,
            pseudoRSquared: NaN,
        };
    }
    // Validate y values are 0 or 1
    const validY = y.every(v => v === 0 || v === 1);
    if (!validY) {
        throw new Error('Logistic regression requires binary outcome (0 or 1)');
    }
    // Newton-Raphson iteration
    let b0 = 0;
    let b1 = 0;
    const maxIter = 25;
    const tolerance = 1e-8;
    for (let iter = 0; iter < maxIter; iter++) {
        // Compute predicted probabilities
        const p = x.map((xi) => {
            const z = b0 + b1 * xi;
            return 1 / (1 + Math.exp(-z));
        });
        // Gradient
        let g0 = 0, g1 = 0;
        for (let i = 0; i < n; i++) {
            const diff = y[i] - p[i];
            g0 += diff;
            g1 += diff * x[i];
        }
        // Hessian
        let h00 = 0, h01 = 0, h11 = 0;
        for (let i = 0; i < n; i++) {
            const w = p[i] * (1 - p[i]);
            h00 -= w;
            h01 -= w * x[i];
            h11 -= w * x[i] * x[i];
        }
        // Newton step (2x2 matrix inverse)
        const det = h00 * h11 - h01 * h01;
        if (Math.abs(det) < 1e-10)
            break;
        const db0 = (h11 * g0 - h01 * g1) / det;
        const db1 = (-h01 * g0 + h00 * g1) / det;
        b0 -= db0;
        b1 -= db1;
        if (Math.abs(db0) < tolerance && Math.abs(db1) < tolerance)
            break;
    }
    // Final predicted probabilities
    const pFinal = x.map((xi) => {
        const z = b0 + b1 * xi;
        return 1 / (1 + Math.exp(-z));
    });
    // Log-likelihood
    let logLikelihood = 0;
    for (let i = 0; i < n; i++) {
        const pi = Math.max(1e-10, Math.min(1 - 1e-10, pFinal[i]));
        logLikelihood += y[i] * Math.log(pi) + (1 - y[i]) * Math.log(1 - pi);
    }
    // Null log-likelihood (intercept only model)
    let ySum = 0;
    for (let i = 0; i < n; i++) {
        ySum += y[i];
    }
    const pNull = ySum / n;
    const nullLogLikelihood = n * (pNull * Math.log(pNull) + (1 - pNull) * Math.log(1 - pNull));
    // McFadden's pseudo R-squared
    const pseudoRSquared = 1 - logLikelihood / nullLogLikelihood;
    // Standard error of slope (from Hessian)
    const pForSE = x.map((xi) => {
        const z = b0 + b1 * xi;
        return 1 / (1 + Math.exp(-z));
    });
    let infoMatrix = 0;
    for (let i = 0; i < n; i++) {
        infoMatrix += pForSE[i] * (1 - pForSE[i]) * x[i] * x[i];
    }
    const slopeStdError = 1 / Math.sqrt(infoMatrix);
    // Wald test for slope
    const z = b1 / slopeStdError;
    const pValue = 2 * (1 - normalCDF(Math.abs(z)));
    // 95% CI for slope
    const ci95 = [
        b1 - 1.96 * slopeStdError,
        b1 + 1.96 * slopeStdError,
    ];
    return {
        test: 'logistic-regression',
        statistic: z,
        pValue,
        effectSize: pseudoRSquared,
        ci95,
        n,
        intercept: b0,
        slope: b1,
        oddsRatio: Math.exp(b1),
        logLikelihood,
        nullLogLikelihood,
        pseudoRSquared,
    };
}
/**
 * Compute ROC curve and AUC for binary classification.
 * Scores should be higher for positive class.
 */
export function rocAuc(scores, labels) {
    if (scores.length !== labels.length) {
        throw new Error('Arrays must have equal length');
    }
    const n = scores.length;
    if (n < 2) {
        return {
            test: 'roc-auc',
            statistic: NaN,
            pValue: NaN,
            effectSize: NaN,
            ci95: [NaN, NaN],
            n,
            auc: NaN,
            rocCurve: [],
            aucStdError: NaN,
        };
    }
    // Validate labels are 0 or 1
    const validLabels = labels.every(v => v === 0 || v === 1);
    if (!validLabels) {
        throw new Error('ROC-AUC requires binary labels (0 or 1)');
    }
    // Count positives and negatives
    const nPos = labels.filter(l => l === 1).length;
    const nNeg = n - nPos;
    if (nPos === 0 || nNeg === 0) {
        return {
            test: 'roc-auc',
            statistic: NaN,
            pValue: NaN,
            effectSize: NaN,
            ci95: [NaN, NaN],
            n,
            auc: NaN,
            rocCurve: [],
            aucStdError: NaN,
        };
    }
    // Sort by score descending
    const indexed = scores.map((s, i) => ({ score: s, label: labels[i] }));
    indexed.sort((a, b) => b.score - a.score);
    // Compute ROC curve points
    const rocCurve = [];
    let tp = 0, fp = 0;
    // Add initial point (0, 0)
    rocCurve.push({ fpr: 0, tpr: 0, threshold: Infinity });
    for (let i = 0; i < indexed.length; i++) {
        if (indexed[i].label === 1) {
            tp++;
        }
        else {
            fp++;
        }
        // Only add point if score changes or it's the last point
        if (i === indexed.length - 1 || indexed[i].score !== indexed[i + 1].score) {
            rocCurve.push({
                fpr: fp / nNeg,
                tpr: tp / nPos,
                threshold: indexed[i].score,
            });
        }
    }
    // Compute AUC using trapezoidal rule
    let auc = 0;
    for (let i = 1; i < rocCurve.length; i++) {
        const width = rocCurve[i].fpr - rocCurve[i - 1].fpr;
        const height = (rocCurve[i].tpr + rocCurve[i - 1].tpr) / 2;
        auc += width * height;
    }
    // DeLong standard error approximation
    // Simplified: SE ≈ sqrt(AUC * (1 - AUC) / min(nPos, nNeg))
    const aucStdError = Math.sqrt(auc * (1 - auc) * (1 / nPos + 1 / nNeg));
    // Z-test for AUC = 0.5
    const z = (auc - 0.5) / aucStdError;
    const pValue = 2 * (1 - normalCDF(Math.abs(z)));
    // 95% CI for AUC
    const ci95 = [
        Math.max(0, auc - 1.96 * aucStdError),
        Math.min(1, auc + 1.96 * aucStdError),
    ];
    return {
        test: 'roc-auc',
        statistic: auc,
        pValue,
        effectSize: auc, // AUC is its own effect size measure
        ci95,
        n,
        auc,
        rocCurve,
        aucStdError,
    };
}
// =============================================================================
// Additional Distribution Functions
// =============================================================================
/**
 * F-distribution CDF approximation.
 */
function fCDF(x, d1, d2) {
    if (x <= 0)
        return 0;
    const z = d1 * x / (d1 * x + d2);
    return incompleteBeta(d1 / 2, d2 / 2, z);
}
/**
 * Regularized incomplete beta function.
 */
function incompleteBeta(a, b, x) {
    if (x === 0)
        return 0;
    if (x === 1)
        return 1;
    const bt = Math.exp(Math.log(gamma(a + b)) - Math.log(gamma(a)) - Math.log(gamma(b)) +
        a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) {
        return bt * betacf(a, b, x) / a;
    }
    else {
        return 1 - bt * betacf(b, a, 1 - x) / b;
    }
}
/**
 * Continued fraction for incomplete beta.
 */
function betacf(a, b, x) {
    const MAXIT = 100;
    const EPS = 1e-10;
    let qab = a + b;
    let qap = a + 1;
    let qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30)
        d = 1e-30;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
        let m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < 1e-30)
            d = 1e-30;
        c = 1 + aa / c;
        if (Math.abs(c) < 1e-30)
            c = 1e-30;
        d = 1 / d;
        h *= d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < 1e-30)
            d = 1e-30;
        c = 1 + aa / c;
        if (Math.abs(c) < 1e-30)
            c = 1e-30;
        d = 1 / d;
        let del = d * c;
        h *= del;
        if (Math.abs(del - 1) < EPS)
            break;
    }
    return h;
}
//# sourceMappingURL=stats.js.map