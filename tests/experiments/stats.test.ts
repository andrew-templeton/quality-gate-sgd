import { describe as viDescribe, it, expect } from 'vitest'
import {
  describe,
  tTest,
  pearsonCorrelation,
  spearmanCorrelation,
  chiSquaredTest,
  anova,
  linearRegression,
  logisticRegression,
  rocAuc,
} from '../../src/experiments/stats.js'

viDescribe('describe', () => {
  it('computes descriptive statistics correctly', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    const stats = describe(data)

    expect(stats.n).toBe(10)
    expect(stats.mean).toBeCloseTo(5.5, 5)
    expect(stats.median).toBeCloseTo(5.5, 5)
    expect(stats.min).toBe(1)
    expect(stats.max).toBe(10)
    expect(stats.std).toBeCloseTo(3.0277, 3)
  })

  it('handles empty array', () => {
    const stats = describe([])

    expect(stats.n).toBe(0)
    expect(stats.mean).toBeNaN()
  })

  it('handles single element', () => {
    const stats = describe([42])

    expect(stats.n).toBe(1)
    expect(stats.mean).toBe(42)
    expect(stats.median).toBe(42)
    expect(stats.min).toBe(42)
    expect(stats.max).toBe(42)
  })

  it('computes quartiles correctly', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

    const stats = describe(data)

    expect(stats.q25).toBeCloseTo(3.75, 2)
    expect(stats.q75).toBeCloseTo(9.25, 2)
  })
})

viDescribe('tTest', () => {
  it('detects significant difference between groups', () => {
    const group1 = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
    const group2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    const result = tTest(group1, group2)

    expect(result.test).toBe('welch-t-test')
    expect(result.pValue).toBeLessThan(0.05)
    expect(result.effectSize).toBeGreaterThan(0)
    expect(result.n).toEqual([10, 10])
  })

  it('returns non-significant for similar groups', () => {
    const group1 = [5.1, 4.9, 5.2, 5.0, 4.8, 5.1, 4.9, 5.0]
    const group2 = [5.0, 5.1, 4.9, 5.0, 5.2, 4.8, 5.1, 4.9]

    const result = tTest(group1, group2)

    expect(result.pValue).toBeGreaterThan(0.05)
    expect(Math.abs(result.effectSize)).toBeLessThan(0.5)
  })

  it('computes confidence intervals', () => {
    const group1 = [10, 12, 14, 16, 18]
    const group2 = [5, 6, 7, 8, 9]

    const result = tTest(group1, group2)

    // CI should not include zero for significant difference
    expect(result.ci95[0]).toBeGreaterThan(0)
    expect(result.ci95[1]).toBeGreaterThan(result.ci95[0])
  })

  it('handles paired t-test', () => {
    const before = [10, 12, 14, 16, 18]
    const after = [12, 14, 16, 18, 20]

    const result = tTest(after, before, { paired: true })

    expect(result.test).toBe('paired-t-test')
    expect(result.pValue).toBeLessThan(0.05)
  })
})

viDescribe('pearsonCorrelation', () => {
  it('detects perfect positive correlation', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [2, 4, 6, 8, 10]

    const result = pearsonCorrelation(x, y)

    expect(result.test).toBe('pearson-r')
    expect(result.statistic).toBeCloseTo(1.0, 5)
    expect(result.pValue).toBeLessThan(0.01)
  })

  it('detects perfect negative correlation', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [10, 8, 6, 4, 2]

    const result = pearsonCorrelation(x, y)

    expect(result.statistic).toBeCloseTo(-1.0, 5)
    expect(result.pValue).toBeLessThan(0.01)
  })

  it('detects no correlation', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [3, 1, 4, 1, 5]

    const result = pearsonCorrelation(x, y)

    expect(Math.abs(result.statistic)).toBeLessThan(0.5)
  })

  it('computes confidence intervals', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = [2, 3, 5, 6, 8, 9, 11, 12, 14, 15]

    const result = pearsonCorrelation(x, y)

    expect(result.ci95[0]).toBeLessThan(result.statistic)
    expect(result.ci95[1]).toBeGreaterThan(result.statistic)
  })
})

viDescribe('spearmanCorrelation', () => {
  it('detects monotonic relationship', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [1, 4, 9, 16, 25] // y = x^2, monotonic but not linear

    const result = spearmanCorrelation(x, y)

    expect(result.test).toBe('spearman-rho')
    expect(result.statistic).toBeCloseTo(1.0, 5)
  })

  it('handles ties in ranks', () => {
    const x = [1, 1, 2, 2, 3]
    const y = [1, 2, 2, 3, 3]

    const result = spearmanCorrelation(x, y)

    expect(result.statistic).toBeGreaterThan(0)
  })
})

viDescribe('chiSquaredTest', () => {
  it('detects significant association', () => {
    // Treatment group: 80/100 success
    // Control group: 40/100 success
    const result = chiSquaredTest(80, 100, 40, 100)

    expect(result.test).toBe('chi-squared')
    expect(result.pValue).toBeLessThan(0.001)
    expect(result.effectSize).toBeGreaterThan(0)
    expect(result.df).toBe(1)
  })

  it('returns non-significant for similar proportions', () => {
    // Both groups: ~50% success
    const result = chiSquaredTest(48, 100, 52, 100)

    expect(result.pValue).toBeGreaterThan(0.05)
  })

  it('computes risk difference CI', () => {
    const result = chiSquaredTest(70, 100, 50, 100)

    // CI for risk difference (p1 - p2 = 0.20)
    expect(result.ci95[0]).toBeGreaterThan(0)
    expect(result.ci95[1]).toBeLessThan(0.4)
  })
})

viDescribe('anova', () => {
  it('detects significant difference between multiple groups', () => {
    const group1 = [10, 12, 14, 16, 18]
    const group2 = [20, 22, 24, 26, 28]
    const group3 = [30, 32, 34, 36, 38]

    const result = anova([group1, group2, group3])

    expect(result.test).toBe('one-way-anova')
    expect(result.pValue).toBeLessThan(0.001)
    expect(result.dfBetween).toBe(2)
    expect(result.dfWithin).toBe(12)
    expect(result.etaSquared).toBeGreaterThan(0.8) // Large effect
  })

  it('returns non-significant for similar groups', () => {
    const group1 = [10, 11, 10, 11, 10]
    const group2 = [10, 11, 11, 10, 10]
    const group3 = [11, 10, 10, 11, 11]

    const result = anova([group1, group2, group3])

    expect(result.pValue).toBeGreaterThan(0.05)
    expect(result.etaSquared).toBeLessThan(0.1) // Small effect
  })

  it('computes group means correctly', () => {
    const group1 = [10, 20, 30]
    const group2 = [40, 50, 60]

    const result = anova([group1, group2])

    expect(result.groupMeans[0]).toBeCloseTo(20, 5)
    expect(result.groupMeans[1]).toBeCloseTo(50, 5)
  })

  it('handles unequal group sizes', () => {
    const group1 = [10, 12, 14]
    const group2 = [20, 22, 24, 26, 28]
    const group3 = [30, 32]

    const result = anova([group1, group2, group3])

    expect(result.n).toEqual([3, 5, 2])
    expect(result.dfWithin).toBe(7) // 10 total - 3 groups
  })
})

viDescribe('linearRegression', () => {
  it('fits a perfect linear relationship', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [2, 4, 6, 8, 10]

    const result = linearRegression(x, y)

    expect(result.test).toBe('linear-regression')
    expect(result.slope).toBeCloseTo(2, 5)
    expect(result.intercept).toBeCloseTo(0, 5)
    expect(result.rSquared).toBeCloseTo(1, 5)
  })

  it('computes R-squared correctly', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.3, 13.9, 16.2, 18.0, 20.1]

    const result = linearRegression(x, y)

    expect(result.rSquared).toBeGreaterThan(0.99)
    expect(result.pValue).toBeLessThan(0.001)
  })

  it('computes confidence interval for slope', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [2, 4, 6, 8, 10]

    const result = linearRegression(x, y)

    // CI should be narrow for perfect fit
    expect(result.ci95[0]).toBeCloseTo(2, 1)
    expect(result.ci95[1]).toBeCloseTo(2, 1)
  })

  it('handles noisy data', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = [3, 5, 4, 8, 7, 10, 11, 12, 14, 15]

    const result = linearRegression(x, y)

    expect(result.slope).toBeGreaterThan(0)
    expect(result.rSquared).toBeGreaterThan(0.5)
    expect(result.rSquared).toBeLessThan(1)
  })

  it('returns residuals', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [2, 4, 6, 8, 10]

    const result = linearRegression(x, y)

    expect(result.residuals).toHaveLength(5)
    // For perfect fit, residuals should be near zero
    for (const r of result.residuals) {
      expect(Math.abs(r)).toBeLessThan(0.001)
    }
  })
})

viDescribe('logisticRegression', () => {
  it('fits binary outcome data', () => {
    // x increases => probability of y=1 increases
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = [0, 0, 0, 0, 1, 0, 1, 1, 1, 1]

    const result = logisticRegression(x, y)

    expect(result.test).toBe('logistic-regression')
    expect(result.slope).toBeGreaterThan(0)
    expect(result.oddsRatio).toBeGreaterThan(1)
  })

  it('computes odds ratio correctly', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]

    const result = logisticRegression(x, y)

    // Odds ratio is exp(slope)
    expect(result.oddsRatio).toBeCloseTo(Math.exp(result.slope), 3)
  })

  it('detects positive relationship', () => {
    // Clear separation - higher x values correlate with y=1
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    const y = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]

    const result = logisticRegression(x, y)

    // Slope should be positive (higher x => higher prob of y=1)
    expect(result.slope).toBeGreaterThan(0)
    // Odds ratio should be > 1
    expect(result.oddsRatio).toBeGreaterThan(1)
    // Model should fit better than null (pseudo R-squared > 0)
    expect(result.pseudoRSquared).toBeGreaterThan(0)
  })

  it('computes pseudo R-squared', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = [0, 0, 0, 0, 1, 0, 1, 1, 1, 1]

    const result = logisticRegression(x, y)

    expect(result.pseudoRSquared).toBeGreaterThan(0)
    expect(result.pseudoRSquared).toBeLessThan(1)
  })

  it('throws for non-binary outcomes', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [0, 1, 2, 1, 0]

    expect(() => logisticRegression(x, y)).toThrow('binary outcome')
  })
})

viDescribe('rocAuc', () => {
  it('computes perfect AUC for perfect classifier', () => {
    const scores = [0.9, 0.8, 0.7, 0.6, 0.4, 0.3, 0.2, 0.1]
    const labels = [1, 1, 1, 1, 0, 0, 0, 0]

    const result = rocAuc(scores, labels)

    expect(result.test).toBe('roc-auc')
    expect(result.auc).toBeCloseTo(1.0, 5)
  })

  it('computes AUC of 0.5 for random classifier', () => {
    const scores = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    const labels = [1, 0, 1, 0, 1, 0, 1, 0]

    const result = rocAuc(scores, labels)

    expect(result.auc).toBeCloseTo(0.5, 1)
  })

  it('returns ROC curve points', () => {
    const scores = [0.9, 0.8, 0.7, 0.6, 0.4, 0.3, 0.2, 0.1]
    const labels = [1, 1, 1, 1, 0, 0, 0, 0]

    const result = rocAuc(scores, labels)

    expect(result.rocCurve.length).toBeGreaterThan(2)
    // First point should be (0, 0)
    expect(result.rocCurve[0].fpr).toBe(0)
    expect(result.rocCurve[0].tpr).toBe(0)
    // Last point should be (1, 1) or close
    const lastPoint = result.rocCurve[result.rocCurve.length - 1]
    expect(lastPoint.fpr).toBeCloseTo(1, 5)
    expect(lastPoint.tpr).toBeCloseTo(1, 5)
  })

  it('computes confidence interval', () => {
    // Use imperfect classifier so AUC is not exactly 1
    const scores = [0.9, 0.85, 0.8, 0.4, 0.7, 0.35, 0.3, 0.75, 0.2, 0.15]
    const labels = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]

    const result = rocAuc(scores, labels)

    // For imperfect classifier, CI should not include exact AUC at boundaries
    expect(result.auc).toBeLessThan(1)
    expect(result.ci95[0]).toBeLessThanOrEqual(result.auc)
    expect(result.ci95[1]).toBeGreaterThanOrEqual(result.auc)
  })

  it('handles imperfect classifier', () => {
    // Some misclassification
    const scores = [0.9, 0.8, 0.3, 0.7, 0.6, 0.4, 0.2, 0.5]
    const labels = [1, 1, 1, 1, 0, 0, 0, 0]

    const result = rocAuc(scores, labels)

    expect(result.auc).toBeGreaterThan(0.5)
    expect(result.auc).toBeLessThan(1)
  })

  it('throws for non-binary labels', () => {
    const scores = [0.9, 0.8, 0.7]
    const labels = [0, 1, 2]

    expect(() => rocAuc(scores, labels)).toThrow('binary labels')
  })

  it('handles all positive or all negative labels', () => {
    const scores = [0.9, 0.8, 0.7]
    const labels = [1, 1, 1]

    const result = rocAuc(scores, labels)

    expect(result.auc).toBeNaN()
  })
})
