import { describe as viDescribe, it, expect } from 'vitest'
import {
  describe,
  tTest,
  pearsonCorrelation,
  spearmanCorrelation,
  chiSquaredTest,
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
