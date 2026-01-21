import { describe, it, expect } from 'vitest'
import {
  sparkline,
  boxPlot,
  visualizeResults,
  resultsTable,
} from '../../src/experiments/visualize.js'
import type { HypothesisResult, StatisticalTest, DescriptiveStats } from '../../src/experiments/types.js'

describe('sparkline', () => {
  it('generates sparkline from values', () => {
    const values = [0, 25, 50, 75, 100]

    const result = sparkline(values)

    expect(result.length).toBe(5)
    // First char should be lowest, last should be highest
    expect(result[0]).toBe('▁')
    expect(result[4]).toBe('█')
  })

  it('handles constant values', () => {
    const values = [50, 50, 50, 50]

    const result = sparkline(values)

    // All same value should use consistent char
    expect(result.split('').every(c => c === result[0])).toBe(true)
  })

  it('handles empty array', () => {
    const result = sparkline([])

    expect(result).toBe('(no data)')
  })

  it('resamples when width specified', () => {
    const values = Array.from({ length: 100 }, (_, i) => i)

    const result = sparkline(values, { width: 20 })

    expect(result.length).toBe(20)
  })
})

describe('boxPlot', () => {
  it('generates ASCII box plot', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    const result = boxPlot(values, { label: 'Test' })

    expect(result).toContain('Test')
    expect(result).toContain('█')
    expect(result).toContain('|')
  })

  it('handles empty values', () => {
    const result = boxPlot([], { label: 'Empty' })

    expect(result).toContain('(no data)')
  })
})

describe('visualizeResults', () => {
  it('generates results visualization', () => {
    const mockTest: StatisticalTest = {
      test: 'welch-t-test',
      statistic: 2.5,
      pValue: 0.02,
      effectSize: 0.8,
      ci95: [0.2, 1.4],
      df: 18,
      n: [10, 10],
    }

    const mockStats: DescriptiveStats = {
      n: 10,
      mean: 5,
      median: 5,
      std: 1,
      min: 3,
      max: 7,
      q25: 4,
      q75: 6,
    }

    const results: HypothesisResult[] = [
      {
        hypothesis: 'H1',
        description: 'Test hypothesis',
        test: mockTest,
        baseline: mockStats,
        treatment: { ...mockStats, mean: 7 },
        supported: true,
        interpretation: 'Hypothesis supported',
      },
    ]

    const output = visualizeResults(results)

    expect(output).toContain('H1')
    expect(output).toContain('SUPPORTED')
    expect(output).toContain('Effect')
  })

  it('shows not supported for failed hypotheses', () => {
    const mockTest: StatisticalTest = {
      test: 'welch-t-test',
      statistic: 0.5,
      pValue: 0.6,
      effectSize: 0.1,
      ci95: [-0.5, 0.7],
      df: 18,
      n: [10, 10],
    }

    const mockStats: DescriptiveStats = {
      n: 10,
      mean: 5,
      median: 5,
      std: 1,
      min: 3,
      max: 7,
      q25: 4,
      q75: 6,
    }

    const results: HypothesisResult[] = [
      {
        hypothesis: 'H2',
        description: 'Failed hypothesis',
        test: mockTest,
        baseline: mockStats,
        treatment: mockStats,
        supported: false,
        interpretation: 'Not significant',
      },
    ]

    const output = visualizeResults(results)

    expect(output).toContain('NOT SUPPORTED')
  })
})

describe('resultsTable', () => {
  it('generates markdown table', () => {
    const mockTest: StatisticalTest = {
      test: 'welch-t-test',
      statistic: 2.5,
      pValue: 0.02,
      effectSize: 0.8,
      ci95: [0.2, 1.4],
      df: 18,
      n: [10, 10],
    }

    const mockStats: DescriptiveStats = {
      n: 10,
      mean: 5,
      median: 5,
      std: 1,
      min: 3,
      max: 7,
      q25: 4,
      q75: 6,
    }

    const results: HypothesisResult[] = [
      {
        hypothesis: 'H1',
        description: 'Test',
        test: mockTest,
        baseline: mockStats,
        treatment: mockStats,
        supported: true,
        interpretation: 'Supported',
      },
      {
        hypothesis: 'H2',
        description: 'Test 2',
        test: { ...mockTest, pValue: 0.0001 },
        baseline: mockStats,
        treatment: mockStats,
        supported: true,
        interpretation: 'Supported',
      },
    ]

    const table = resultsTable(results)

    expect(table).toContain('| Hypothesis |')
    expect(table).toContain('| H1 |')
    expect(table).toContain('| H2 |')
    expect(table).toContain('0.020')
    expect(table).toContain('<0.001')
  })
})
