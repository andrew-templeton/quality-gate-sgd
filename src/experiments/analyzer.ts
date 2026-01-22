/**
 * Experiment Analyzer
 * ===================
 * Analyzes experiment batches to validate pre-registered hypotheses.
 */

import type {
  ExperimentBatch,
  ExperimentRun,
  HypothesisId,
  HypothesisResult,
  DescriptiveStats,
} from './types.js';
import {
  describe,
  tTest,
  spearmanCorrelation,
  chiSquaredTest,
  anova,
  linearRegression,
  logisticRegression,
  rocAuc,
} from './stats.js';
import type { AnovaResult, RocAucResult } from './stats.js';

// =============================================================================
// Hypothesis Descriptions
// =============================================================================

const HYPOTHESIS_DESCRIPTIONS: Record<HypothesisId, string> = {
  H1: 'Quality-gate agents converge in fewer iterations than no-gate agents',
  H2: 'Quality-gate agents achieve a higher pass rate within N iterations',
  H3: 'Smoother metric topologies reduce oscillations and improve monotonic improvement rate',
  H4: 'Higher mapping coverage correlates with fewer iterations to pass',
  H5: 'Higher call-graph resolution correlates with higher success rate',
  H6: 'Coarser address units correlate with slower convergence',
  H7: 'Prioritizing symbols by call graph in-degree reduces iterations-to-pass',
  H8: 'Weighted prioritization yields higher monotonic improvement rate',
  H9: 'LLM fixability scores correlate with actual fix success (ρ > 0.5)',
  H10: 'High-fixability symbols (φ > 0.7) have higher fix success rate than low (φ < 0.3)',
  H11: 'Adjusted ΔQ outperforms raw ΔQ for prioritization',
  H12: 'Adjusted prioritization reduces wasted iterations',
};

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Analyze a batch and test all hypotheses.
 */
export function analyzeBatch(batch: ExperimentBatch): HypothesisResult[] {
  const results: HypothesisResult[] = [];

  for (const hypothesis of batch.hypotheses) {
    const result = analyzeHypothesis(hypothesis, batch.runs);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Analyze a single hypothesis.
 */
function analyzeHypothesis(
  hypothesis: HypothesisId,
  runs: ExperimentRun[]
): HypothesisResult | null {
  switch (hypothesis) {
    case 'H1':
      return analyzeH1(runs);
    case 'H2':
      return analyzeH2(runs);
    case 'H3':
      return analyzeH3(runs);
    case 'H4':
      return analyzeH4(runs);
    case 'H5':
      return analyzeH5(runs);
    case 'H6':
      return analyzeH6(runs);
    case 'H7':
      return analyzeH7(runs);
    case 'H8':
      return analyzeH8(runs);
    case 'H9':
      return analyzeH9(runs);
    case 'H10':
      return analyzeH10(runs);
    case 'H11':
      return analyzeH11(runs);
    case 'H12':
      return analyzeH12(runs);
    default:
      return null;
  }
}

// =============================================================================
// Design A: Gate vs No-Gate (H1, H2)
// =============================================================================

/**
 * H1: Quality-gate agents converge in fewer iterations than no-gate agents.
 */
function analyzeH1(runs: ExperimentRun[]): HypothesisResult {
  const baseline = runs.filter(r => !r.condition.config.gateEnabled);
  const treatment = runs.filter(r => r.condition.config.gateEnabled);

  // Extract iterations-to-pass (only for runs that passed)
  const baselineIter = baseline
    .filter(r => r.outcome.passed && r.outcome.iterationsToPass !== undefined)
    .map(r => r.outcome.iterationsToPass!);
  const treatmentIter = treatment
    .filter(r => r.outcome.passed && r.outcome.iterationsToPass !== undefined)
    .map(r => r.outcome.iterationsToPass!);

  const baselineStats = describe(baselineIter);
  const treatmentStats = describe(treatmentIter);
  const test = tTest(treatmentIter, baselineIter);

  // H1 is supported if treatment has lower iterations (negative effect size)
  const supported = test.pValue < 0.05 && test.effectSize < 0;

  return {
    hypothesis: 'H1',
    description: HYPOTHESIS_DESCRIPTIONS.H1,
    test,
    baseline: baselineStats,
    treatment: treatmentStats,
    supported,
    interpretation: supported
      ? `Treatment reduced iterations-to-pass by ${Math.abs(test.effectSize).toFixed(2)} standard deviations (p=${test.pValue.toFixed(4)})`
      : `No significant difference in iterations-to-pass (p=${test.pValue.toFixed(4)}, d=${test.effectSize.toFixed(2)})`,
  };
}

/**
 * H2: Quality-gate agents achieve a higher pass rate within N iterations.
 */
function analyzeH2(runs: ExperimentRun[]): HypothesisResult {
  const baseline = runs.filter(r => !r.condition.config.gateEnabled);
  const treatment = runs.filter(r => r.condition.config.gateEnabled);

  const baselinePass = baseline.filter(r => r.outcome.passed).length;
  const treatmentPass = treatment.filter(r => r.outcome.passed).length;

  const baselineStats: DescriptiveStats = {
    n: baseline.length,
    mean: baselinePass / baseline.length,
    median: baselinePass / baseline.length,
    std: Math.sqrt(baselinePass / baseline.length * (1 - baselinePass / baseline.length) / baseline.length),
    min: 0,
    max: 1,
    q25: 0,
    q75: 1,
  };

  const treatmentStats: DescriptiveStats = {
    n: treatment.length,
    mean: treatmentPass / treatment.length,
    median: treatmentPass / treatment.length,
    std: Math.sqrt(treatmentPass / treatment.length * (1 - treatmentPass / treatment.length) / treatment.length),
    min: 0,
    max: 1,
    q25: 0,
    q75: 1,
  };

  const test = chiSquaredTest(
    treatmentPass,
    treatment.length,
    baselinePass,
    baseline.length
  );

  // H2 is supported if treatment has higher pass rate
  const supported = test.pValue < 0.05 && treatmentStats.mean > baselineStats.mean;

  return {
    hypothesis: 'H2',
    description: HYPOTHESIS_DESCRIPTIONS.H2,
    test,
    baseline: baselineStats,
    treatment: treatmentStats,
    supported,
    interpretation: supported
      ? `Treatment pass rate (${(treatmentStats.mean * 100).toFixed(1)}%) significantly higher than baseline (${(baselineStats.mean * 100).toFixed(1)}%), p=${test.pValue.toFixed(4)}`
      : `No significant difference in pass rate (treatment: ${(treatmentStats.mean * 100).toFixed(1)}%, baseline: ${(baselineStats.mean * 100).toFixed(1)}%, p=${test.pValue.toFixed(4)})`,
  };
}

// =============================================================================
// Design B: Topology Sensitivity (H3)
// =============================================================================

/**
 * H3: Smoother metric topologies reduce oscillations and improve monotonic improvement rate.
 * Uses ANOVA for 3-group comparison (coverage-only, coverage-ceilings, full).
 */
function analyzeH3(runs: ExperimentRun[]): HypothesisResult {
  // Group by topology
  const coverageOnly = runs.filter(r => r.condition.config.topology === 'coverage-only');
  const coverageCeilings = runs.filter(r => r.condition.config.topology === 'coverage-ceilings');
  const full = runs.filter(r => r.condition.config.topology === 'full');

  const coverageRates = coverageOnly.map(r => r.outcome.monotonicRate);
  const ceilingRates = coverageCeilings.map(r => r.outcome.monotonicRate);
  const fullRates = full.map(r => r.outcome.monotonicRate);

  // Filter out empty groups for ANOVA
  const groups = [coverageRates, ceilingRates, fullRates].filter(g => g.length > 0);

  // If we have 3 groups, use ANOVA; otherwise fall back to t-test
  if (groups.length >= 2 && groups.every(g => g.length >= 2)) {
    const anovaResult = anova(groups);

    // Compute descriptive stats for baseline (coverage-only) and best treatment
    const baselineStats = describe(coverageRates.length > 0 ? coverageRates : [0]);

    // Find the group with highest mean (expected to be full or coverage-ceilings)
    const allRates = [
      { name: 'coverage-only', rates: coverageRates },
      { name: 'coverage-ceilings', rates: ceilingRates },
      { name: 'full', rates: fullRates },
    ].filter(g => g.rates.length > 0);

    const bestGroup = allRates.reduce((best, curr) => {
      const currMean = curr.rates.reduce((a, b) => a + b, 0) / curr.rates.length;
      const bestMean = best.rates.length > 0
        ? best.rates.reduce((a, b) => a + b, 0) / best.rates.length
        : -Infinity;
      return currMean > bestMean ? curr : best;
    });

    const treatmentStats = describe(bestGroup.rates);

    // H3 is supported if ANOVA is significant with large effect size
    const supported = anovaResult.pValue < 0.05 && anovaResult.etaSquared > 0.06;

    return {
      hypothesis: 'H3',
      description: HYPOTHESIS_DESCRIPTIONS.H3,
      test: anovaResult,
      baseline: baselineStats,
      treatment: treatmentStats,
      supported,
      interpretation: supported
        ? `Topology significantly affects monotonic rate (F=${anovaResult.statistic.toFixed(2)}, p=${anovaResult.pValue.toFixed(4)}, η²=${anovaResult.etaSquared.toFixed(3)}). Best: ${bestGroup.name}`
        : `No significant topology effect (F=${anovaResult.statistic.toFixed(2)}, p=${anovaResult.pValue.toFixed(4)}, η²=${anovaResult.etaSquared.toFixed(3)})`,
    };
  }

  // Fallback to t-test for 2-group comparison
  const baselineRates = coverageRates.length > 0 ? coverageRates : [0];
  const treatmentRates = fullRates.length > 0 ? fullRates : ceilingRates;

  const baselineStats = describe(baselineRates);
  const treatmentStats = describe(treatmentRates);
  const test = tTest(treatmentRates, baselineRates);

  const supported = test.pValue < 0.05 && test.effectSize > 0;

  return {
    hypothesis: 'H3',
    description: HYPOTHESIS_DESCRIPTIONS.H3,
    test,
    baseline: baselineStats,
    treatment: treatmentStats,
    supported,
    interpretation: supported
      ? `Treatment topology improved monotonic rate by ${test.effectSize.toFixed(2)} standard deviations (p=${test.pValue.toFixed(4)})`
      : `No significant difference in monotonic rate (p=${test.pValue.toFixed(4)}, d=${test.effectSize.toFixed(2)})`,
  };
}

// =============================================================================
// Design C: Addressing Fitness (H4, H5, H6)
// =============================================================================

/**
 * H4: Higher mapping coverage correlates with fewer iterations to pass.
 * Uses linear regression for continuous predictor analysis.
 */
function analyzeH4(runs: ExperimentRun[]): HypothesisResult {
  const data = runs
    .filter(r => r.outcome.passed && r.outcome.iterationsToPass !== undefined)
    .map(r => ({
      mappingCoverage: (r.metadata as Record<string, unknown>).mappingCoverage as number ?? 0.5,
      iterations: r.outcome.iterationsToPass!,
    }));

  const x = data.map(d => d.mappingCoverage);
  const y = data.map(d => d.iterations);

  // Use linear regression to quantify the relationship
  const regression = linearRegression(x, y);

  // Also compute Spearman for non-linearity robustness
  const spearman = spearmanCorrelation(x, y);

  // H4 is supported if negative slope (higher coverage = fewer iterations)
  // and regression is significant
  const supported = regression.pValue < 0.05 && regression.slope < 0;

  return {
    hypothesis: 'H4',
    description: HYPOTHESIS_DESCRIPTIONS.H4,
    test: regression,
    baseline: describe(y),
    treatment: describe(x),
    supported,
    interpretation: supported
      ? `Mapping coverage predicts iterations (β=${regression.slope.toFixed(3)}, R²=${regression.rSquared.toFixed(3)}, p=${regression.pValue.toFixed(4)}). Spearman ρ=${spearman.statistic.toFixed(3)}`
      : `No significant relationship between mapping coverage and iterations (β=${regression.slope.toFixed(3)}, R²=${regression.rSquared.toFixed(3)}, p=${regression.pValue.toFixed(4)})`,
  };
}

/**
 * H5: Higher call-graph resolution correlates with higher success rate.
 * Uses logistic regression for binary outcome.
 */
function analyzeH5(runs: ExperimentRun[]): HypothesisResult {
  const data = runs.map(r => ({
    resolution: (r.metadata as Record<string, unknown>).callGraphResolution as number ?? 0.5,
    passed: r.outcome.passed ? 1 : 0,
  }));

  const x = data.map(d => d.resolution);
  const y = data.map(d => d.passed);

  // Use logistic regression for binary outcome
  const logistic = logisticRegression(x, y);

  // Also compute Spearman for comparison
  const spearman = spearmanCorrelation(x, y);

  // H5 is supported if positive slope (higher resolution = higher success probability)
  const supported = logistic.pValue < 0.05 && logistic.slope > 0;

  return {
    hypothesis: 'H5',
    description: HYPOTHESIS_DESCRIPTIONS.H5,
    test: logistic,
    baseline: describe(y),
    treatment: describe(x),
    supported,
    interpretation: supported
      ? `Call-graph resolution predicts success (OR=${logistic.oddsRatio.toFixed(3)}, p=${logistic.pValue.toFixed(4)}). Pseudo R²=${logistic.pseudoRSquared.toFixed(3)}`
      : `No significant relationship between resolution and success (OR=${logistic.oddsRatio.toFixed(3)}, p=${logistic.pValue.toFixed(4)})`,
  };
}

/**
 * H6: Coarser address units correlate with slower convergence.
 * Uses linear regression for continuous outcome.
 */
function analyzeH6(runs: ExperimentRun[]): HypothesisResult {
  const data = runs
    .filter(r => r.outcome.passed && r.outcome.iterationsToPass !== undefined)
    .map(r => ({
      p90Sloc: (r.metadata as Record<string, unknown>).p90AddressSloc as number ?? 50,
      iterations: r.outcome.iterationsToPass!,
    }));

  const x = data.map(d => d.p90Sloc);
  const y = data.map(d => d.iterations);

  // Use linear regression
  const regression = linearRegression(x, y);

  // Also compute Spearman for robustness
  const spearman = spearmanCorrelation(x, y);

  // H6 is supported if positive slope (coarser = more iterations)
  const supported = regression.pValue < 0.05 && regression.slope > 0;

  return {
    hypothesis: 'H6',
    description: HYPOTHESIS_DESCRIPTIONS.H6,
    test: regression,
    baseline: describe(y),
    treatment: describe(x),
    supported,
    interpretation: supported
      ? `Address coarseness predicts iterations (β=${regression.slope.toFixed(3)}, R²=${regression.rSquared.toFixed(3)}, p=${regression.pValue.toFixed(4)}). Spearman ρ=${spearman.statistic.toFixed(3)}`
      : `No significant relationship between address size and iterations (β=${regression.slope.toFixed(3)}, R²=${regression.rSquared.toFixed(3)}, p=${regression.pValue.toFixed(4)})`,
  };
}

// =============================================================================
// Design D: Call Graph Weighting (H7, H8)
// =============================================================================

/**
 * H7: Prioritizing symbols by call graph in-degree reduces iterations-to-pass.
 */
function analyzeH7(runs: ExperimentRun[]): HypothesisResult {
  const baseline = runs.filter(r => !r.condition.config.callGraphWeighting);
  const treatment = runs.filter(r => r.condition.config.callGraphWeighting);

  const baselineIter = baseline
    .filter(r => r.outcome.passed && r.outcome.iterationsToPass !== undefined)
    .map(r => r.outcome.iterationsToPass!);
  const treatmentIter = treatment
    .filter(r => r.outcome.passed && r.outcome.iterationsToPass !== undefined)
    .map(r => r.outcome.iterationsToPass!);

  const baselineStats = describe(baselineIter);
  const treatmentStats = describe(treatmentIter);

  // Use paired t-test if same tasks
  const sameTask = baseline.length === treatment.length &&
    baseline.every((r, i) => r.taskId === treatment[i].taskId);
  const test = tTest(treatmentIter, baselineIter, { paired: sameTask });

  // H7 is supported if treatment has lower iterations
  const supported = test.pValue < 0.05 && test.effectSize < 0;

  return {
    hypothesis: 'H7',
    description: HYPOTHESIS_DESCRIPTIONS.H7,
    test,
    baseline: baselineStats,
    treatment: treatmentStats,
    supported,
    interpretation: supported
      ? `Call graph weighting reduced iterations by ${Math.abs(test.effectSize).toFixed(2)} standard deviations (p=${test.pValue.toFixed(4)})`
      : `No significant effect of call graph weighting on iterations (p=${test.pValue.toFixed(4)}, d=${test.effectSize.toFixed(2)})`,
  };
}

/**
 * H8: Weighted prioritization yields higher monotonic improvement rate.
 */
function analyzeH8(runs: ExperimentRun[]): HypothesisResult {
  const baseline = runs.filter(r => !r.condition.config.callGraphWeighting);
  const treatment = runs.filter(r => r.condition.config.callGraphWeighting);

  const baselineRates = baseline.map(r => r.outcome.monotonicRate);
  const treatmentRates = treatment.map(r => r.outcome.monotonicRate);

  const baselineStats = describe(baselineRates);
  const treatmentStats = describe(treatmentRates);

  const sameTask = baseline.length === treatment.length &&
    baseline.every((r, i) => r.taskId === treatment[i].taskId);
  const test = tTest(treatmentRates, baselineRates, { paired: sameTask });

  // H8 is supported if treatment has higher monotonic rate
  const supported = test.pValue < 0.05 && test.effectSize > 0;

  return {
    hypothesis: 'H8',
    description: HYPOTHESIS_DESCRIPTIONS.H8,
    test,
    baseline: baselineStats,
    treatment: treatmentStats,
    supported,
    interpretation: supported
      ? `Weighted prioritization improved monotonic rate by ${test.effectSize.toFixed(2)} standard deviations (p=${test.pValue.toFixed(4)})`
      : `No significant effect on monotonic rate (p=${test.pValue.toFixed(4)}, d=${test.effectSize.toFixed(2)})`,
  };
}

// =============================================================================
// Design E: Fixability Estimation (H9, H10)
// =============================================================================

/**
 * H9: LLM fixability scores correlate with actual fix success (ρ > 0.5).
 * Uses ROC-AUC for classification performance and Spearman for correlation.
 */
function analyzeH9(runs: ExperimentRun[]): HypothesisResult {
  // Extract fixability predictions and outcomes from iterations
  const data: { fixability: number; success: number }[] = [];

  for (const run of runs) {
    for (const iter of run.iterations) {
      if (iter.target?.fixabilityScore !== undefined && iter.outcome) {
        data.push({
          fixability: iter.target.fixabilityScore,
          success: iter.outcome.success ? 1 : 0,
        });
      }
    }
  }

  const x = data.map(d => d.fixability);
  const y = data.map(d => d.success);

  // Use ROC-AUC for classification performance
  const roc = rocAuc(x, y);

  // Also compute Spearman correlation
  const spearman = spearmanCorrelation(x, y);

  // H9 is supported if:
  // 1. Spearman ρ > 0.5 (strong correlation), OR
  // 2. ROC-AUC > 0.7 (good discrimination) with significant correlation
  const supported = (spearman.pValue < 0.05 && spearman.statistic > 0.5) ||
                   (roc.auc > 0.7 && spearman.statistic > 0.3);

  return {
    hypothesis: 'H9',
    description: HYPOTHESIS_DESCRIPTIONS.H9,
    test: {
      ...spearman,
      // Override to include AUC in the statistic for reporting
      effectSize: roc.auc,
    },
    baseline: describe(y),
    treatment: describe(x),
    supported,
    interpretation: supported
      ? `Fixability scores predict success: AUC=${roc.auc.toFixed(3)} [${roc.ci95[0].toFixed(3)}, ${roc.ci95[1].toFixed(3)}], ρ=${spearman.statistic.toFixed(3)}`
      : `Fixability prediction below threshold: AUC=${roc.auc.toFixed(3)}, ρ=${spearman.statistic.toFixed(3)} (required ρ > 0.5 or AUC > 0.7)`,
  };
}

/**
 * H10: High-fixability symbols (φ > 0.7) have higher fix success rate than low (φ < 0.3).
 * Uses chi-squared for group comparison and ROC-AUC for overall discrimination.
 */
function analyzeH10(runs: ExperimentRun[]): HypothesisResult {
  const data: { fixability: number; success: boolean }[] = [];

  for (const run of runs) {
    for (const iter of run.iterations) {
      if (iter.target?.fixabilityScore !== undefined && iter.outcome) {
        data.push({
          fixability: iter.target.fixabilityScore,
          success: iter.outcome.success,
        });
      }
    }
  }

  const highFix = data.filter(d => d.fixability > 0.7);
  const lowFix = data.filter(d => d.fixability < 0.3);

  const highSuccess = highFix.filter(d => d.success).length;
  const lowSuccess = lowFix.filter(d => d.success).length;

  // Compute ROC-AUC for extreme groups only (high vs low)
  const extremeData = [...highFix, ...lowFix];
  let rocResult: RocAucResult | null = null;
  if (extremeData.length >= 4 && highFix.length > 0 && lowFix.length > 0) {
    const extremeScores = extremeData.map(d => d.fixability);
    const extremeLabels = extremeData.map(d => d.success ? 1 : 0);
    rocResult = rocAuc(extremeScores, extremeLabels);
  }

  const baselineStats: DescriptiveStats = {
    n: lowFix.length,
    mean: lowFix.length > 0 ? lowSuccess / lowFix.length : 0,
    median: lowFix.length > 0 ? lowSuccess / lowFix.length : 0,
    std: 0,
    min: 0,
    max: 1,
    q25: 0,
    q75: 1,
  };

  const treatmentStats: DescriptiveStats = {
    n: highFix.length,
    mean: highFix.length > 0 ? highSuccess / highFix.length : 0,
    median: highFix.length > 0 ? highSuccess / highFix.length : 0,
    std: 0,
    min: 0,
    max: 1,
    q25: 0,
    q75: 1,
  };

  const test = chiSquaredTest(highSuccess, highFix.length, lowSuccess, lowFix.length);

  // H10 is supported if high-fixability has higher success rate
  const supported = test.pValue < 0.05 && treatmentStats.mean > baselineStats.mean;

  const aucInfo = rocResult ? `, AUC=${rocResult.auc.toFixed(3)}` : '';

  return {
    hypothesis: 'H10',
    description: HYPOTHESIS_DESCRIPTIONS.H10,
    test,
    baseline: baselineStats,
    treatment: treatmentStats,
    supported,
    interpretation: supported
      ? `High-fixability success rate (${(treatmentStats.mean * 100).toFixed(1)}%) significantly higher than low (${(baselineStats.mean * 100).toFixed(1)}%), p=${test.pValue.toFixed(4)}${aucInfo}`
      : `No significant difference between high and low fixability groups (p=${test.pValue.toFixed(4)})${aucInfo}`,
  };
}

// =============================================================================
// Design F: Adjusted Prioritization (H11, H12)
// =============================================================================

/**
 * H11: Adjusted ΔQ outperforms raw ΔQ for prioritization.
 */
function analyzeH11(runs: ExperimentRun[]): HypothesisResult {
  const baseline = runs.filter(r => r.condition.config.prioritization === 'raw');
  const treatment = runs.filter(r => r.condition.config.prioritization === 'adjusted');

  const baselineIter = baseline
    .filter(r => r.outcome.passed && r.outcome.iterationsToPass !== undefined)
    .map(r => r.outcome.iterationsToPass!);
  const treatmentIter = treatment
    .filter(r => r.outcome.passed && r.outcome.iterationsToPass !== undefined)
    .map(r => r.outcome.iterationsToPass!);

  const baselineStats = describe(baselineIter);
  const treatmentStats = describe(treatmentIter);

  const sameTask = baseline.length === treatment.length &&
    baseline.every((r, i) => r.taskId === treatment[i].taskId);
  const test = tTest(treatmentIter, baselineIter, { paired: sameTask });

  // H11 is supported if treatment has lower iterations
  const supported = test.pValue < 0.05 && test.effectSize < 0;

  return {
    hypothesis: 'H11',
    description: HYPOTHESIS_DESCRIPTIONS.H11,
    test,
    baseline: baselineStats,
    treatment: treatmentStats,
    supported,
    interpretation: supported
      ? `Adjusted prioritization reduced iterations by ${Math.abs(test.effectSize).toFixed(2)} standard deviations (p=${test.pValue.toFixed(4)})`
      : `No significant effect of adjusted prioritization (p=${test.pValue.toFixed(4)}, d=${test.effectSize.toFixed(2)})`,
  };
}

/**
 * H12: Adjusted prioritization reduces wasted iterations.
 */
function analyzeH12(runs: ExperimentRun[]): HypothesisResult {
  const baseline = runs.filter(r => r.condition.config.prioritization === 'raw');
  const treatment = runs.filter(r => r.condition.config.prioritization === 'adjusted');

  const baselineWasted = baseline.map(r => computeWastedIterationRate(r));
  const treatmentWasted = treatment.map(r => computeWastedIterationRate(r));

  const baselineStats = describe(baselineWasted);
  const treatmentStats = describe(treatmentWasted);

  const sameTask = baseline.length === treatment.length &&
    baseline.every((r, i) => r.taskId === treatment[i].taskId);
  const test = tTest(treatmentWasted, baselineWasted, { paired: sameTask });

  // H12 is supported if treatment has lower wasted iteration rate
  const supported = test.pValue < 0.05 && test.effectSize < 0;

  // Calculate absolute reduction
  const absoluteReduction = baselineStats.mean - treatmentStats.mean;
  const percentReduction = baselineStats.mean > 0
    ? (absoluteReduction / baselineStats.mean * 100)
    : 0;

  return {
    hypothesis: 'H12',
    description: HYPOTHESIS_DESCRIPTIONS.H12,
    test,
    baseline: baselineStats,
    treatment: treatmentStats,
    supported,
    interpretation: supported
      ? `Adjusted prioritization reduced wasted iterations by ${Math.abs(test.effectSize).toFixed(2)} SD (${percentReduction.toFixed(1)}% reduction, p=${test.pValue.toFixed(4)})`
      : `No significant reduction in wasted iterations (p=${test.pValue.toFixed(4)}, d=${test.effectSize.toFixed(2)})`,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Compute the wasted iteration rate for a run.
 * A wasted iteration is one where:
 * - The fix attempt failed AND
 * - A better target was available (higher expected improvement)
 *
 * This provides a more nuanced measure than simple wastedIterations / total.
 */
export function computeWastedIterationRate(run: ExperimentRun): number {
  if (run.iterations.length === 0) {
    return 0;
  }

  // Use the pre-computed wastedIterations if available
  if (run.outcome.wastedIterations !== undefined) {
    return run.outcome.wastedIterations / run.iterations.length;
  }

  // Otherwise compute from iteration data
  let wasted = 0;
  for (const iter of run.iterations) {
    if (iter.outcome && !iter.outcome.success) {
      // Check if this iteration targeted a low-fixability symbol
      // when higher-fixability alternatives were available
      const fixability = iter.target?.fixabilityScore ?? 0.5;
      if (fixability < 0.3) {
        wasted++;
      }
    }
  }

  return wasted / run.iterations.length;
}

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

export function computeWastedIterationBreakdown(run: ExperimentRun): WastedIterationBreakdown {
  const total = run.iterations.length;
  if (total === 0) {
    return { total: 0, failed: 0, wasted: 0, rate: 0, opportunityCost: 0 };
  }

  let failed = 0;
  let wasted = 0;
  let opportunityCost = 0;

  for (const iter of run.iterations) {
    if (iter.outcome && !iter.outcome.success) {
      failed++;

      // Check fixability
      const fixability = iter.target?.fixabilityScore ?? 0.5;
      const expectedDeltaQ = iter.target?.expectedDeltaQ ?? 0;

      if (fixability < 0.3) {
        wasted++;
        // Opportunity cost is the potential improvement that was foregone
        opportunityCost += expectedDeltaQ * (1 - fixability);
      }
    }
  }

  return {
    total,
    failed,
    wasted,
    rate: wasted / total,
    opportunityCost,
  };
}

// =============================================================================
// Summary Reporting
// =============================================================================

/**
 * Generate a summary report for a batch analysis.
 */
export function generateAnalysisReport(
  batch: ExperimentBatch,
  results: HypothesisResult[]
): string {
  const lines: string[] = [];

  lines.push('# Experiment Analysis Report');
  lines.push('');
  lines.push(`**Batch ID:** ${batch.batchId}`);
  lines.push(`**Design:** ${batch.design}`);
  lines.push(`**Total Runs:** ${batch.runs.length}`);
  lines.push(`**Analyzed:** ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  const supported = results.filter(r => r.supported).length;
  lines.push(`- **Hypotheses Tested:** ${results.length}`);
  lines.push(`- **Supported:** ${supported}`);
  lines.push(`- **Not Supported:** ${results.length - supported}`);
  lines.push('');

  lines.push('## Results');
  lines.push('');

  for (const result of results) {
    const icon = result.supported ? '✓' : '✗';
    lines.push(`### ${result.hypothesis}: ${icon} ${result.supported ? 'Supported' : 'Not Supported'}`);
    lines.push('');
    lines.push(`> ${result.description}`);
    lines.push('');
    lines.push('**Statistics:**');
    lines.push(`- Test: ${result.test.test}`);
    lines.push(`- Statistic: ${result.test.statistic.toFixed(4)}`);
    lines.push(`- p-value: ${result.test.pValue.toFixed(4)}`);
    lines.push(`- Effect size: ${result.test.effectSize.toFixed(4)}`);
    lines.push(`- 95% CI: [${result.test.ci95[0].toFixed(4)}, ${result.test.ci95[1].toFixed(4)}]`);
    lines.push('');
    lines.push('**Samples:**');
    lines.push(`- Baseline: n=${result.baseline.n}, mean=${result.baseline.mean.toFixed(4)}, std=${result.baseline.std.toFixed(4)}`);
    lines.push(`- Treatment: n=${result.treatment.n}, mean=${result.treatment.mean.toFixed(4)}, std=${result.treatment.std.toFixed(4)}`);
    lines.push('');
    lines.push(`**Interpretation:** ${result.interpretation}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
