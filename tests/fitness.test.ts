import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Metrics } from '../src/types.js'

// Mock dimensions module
vi.mock('../src/dimensions/index.js', () => ({
  getAllDimensions: vi.fn(() => [
    {
      path: 'coverage.unit.branches',
      displayName: 'Branch Coverage',
      direction: 'higher-better',
      defaultWeight: 0.4,
    },
    {
      path: 'coverage.unit.statements',
      displayName: 'Statement Coverage',
      direction: 'higher-better',
      defaultWeight: 0.4,
    },
    {
      path: 'errors.lint',
      displayName: 'Lint Errors',
      direction: 'lower-better',
      defaultWeight: 0.2,
    },
  ]),
  getDimension: vi.fn((path: string) => {
    const dims: Record<string, unknown> = {
      'coverage.unit.branches': {
        path: 'coverage.unit.branches',
        displayName: 'Branch Coverage',
        direction: 'higher-better',
        defaultWeight: 0.4,
      },
      'coverage.unit.statements': {
        path: 'coverage.unit.statements',
        displayName: 'Statement Coverage',
        direction: 'higher-better',
        defaultWeight: 0.4,
      },
      'errors.lint': {
        path: 'errors.lint',
        displayName: 'Lint Errors',
        direction: 'lower-better',
        defaultWeight: 0.2,
      },
    }
    return dims[path]
  }),
}))

import {
  getMetricValue,
  getDefaultFitnessConfig,
  computeFitness,
  computeGradient,
  suggestNextFix,
  suggestNextFixes,
  formatFitnessScore,
  formatGradientTable,
  formatSuggestion,
} from '../src/fitness.js'

describe('fitness module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getMetricValue', () => {
    it('extracts nested values by path', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 75, statements: 80 },
        },
      } as Metrics

      expect(getMetricValue(metrics, 'coverage.unit.branches')).toBe(75)
      expect(getMetricValue(metrics, 'coverage.unit.statements')).toBe(80)
    })

    it('extracts custom dimension values', () => {
      const metrics: Metrics = {
        custom: {
          anyCount: 42,
        },
      } as Metrics

      expect(getMetricValue(metrics, 'custom.anyCount')).toBe(42)
    })

    it('returns undefined for missing paths', () => {
      const metrics: Metrics = {} as Metrics

      expect(getMetricValue(metrics, 'coverage.unit.branches')).toBeUndefined()
      expect(getMetricValue(metrics, 'nonexistent.path')).toBeUndefined()
    })

    it('returns undefined for non-numeric values', () => {
      const metrics = {
        some: { text: 'hello' },
      } as unknown as Metrics

      expect(getMetricValue(metrics, 'some.text')).toBeUndefined()
    })

    it('returns undefined for missing custom dimensions', () => {
      const metrics: Metrics = {} as Metrics

      expect(getMetricValue(metrics, 'custom.missing')).toBeUndefined()
    })
  })

  describe('getDefaultFitnessConfig', () => {
    it('builds config from dimensions with weights', () => {
      const config = getDefaultFitnessConfig()

      expect(config.aggregation).toBe('weighted-sum')
      expect(config.weights['coverage.unit.branches']).toBe(0.4)
      expect(config.weights['coverage.unit.statements']).toBe(0.4)
      expect(config.weights['errors.lint']).toBe(0.2)
    })
  })

  describe('computeFitness', () => {
    it('computes weighted sum fitness', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 80, statements: 80 },
        },
        errors: { lint: 0 },
      } as Metrics

      const fitness = computeFitness(metrics)

      // With 80% coverage (weighted 0.8 total) and 0 lint errors (100 normalized, weighted 0.2)
      // Score should be high
      expect(fitness).toBeGreaterThan(80)
    })

    it('returns 0 for empty metrics', () => {
      const metrics: Metrics = {} as Metrics

      const fitness = computeFitness(metrics)

      expect(fitness).toBe(0)
    })

    it('uses geometric mean when configured', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 80, statements: 80 },
        },
        errors: { lint: 0 },
      } as Metrics

      const config = {
        weights: {
          'coverage.unit.branches': 0.4,
          'coverage.unit.statements': 0.4,
          'errors.lint': 0.2,
        },
        aggregation: 'geometric-mean' as const,
      }

      const fitness = computeFitness(metrics, config)

      expect(fitness).toBeGreaterThan(0)
      expect(fitness).toBeLessThanOrEqual(100)
    })

    it('handles lower-better dimensions with exponential decay', () => {
      const metricsNoErrors: Metrics = {
        errors: { lint: 0 },
      } as Metrics

      const metricsManyErrors: Metrics = {
        errors: { lint: 20 },
      } as Metrics

      const fitnessNoErrors = computeFitness(metricsNoErrors, {
        weights: { 'errors.lint': 1 },
        aggregation: 'weighted-sum',
      })

      const fitnessManyErrors = computeFitness(metricsManyErrors, {
        weights: { 'errors.lint': 1 },
        aggregation: 'weighted-sum',
      })

      expect(fitnessNoErrors).toBe(100) // 0 errors = perfect
      expect(fitnessManyErrors).toBeLessThan(fitnessNoErrors)
    })
  })

  describe('computeGradient', () => {
    it('returns sorted gradient components', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 50, statements: 80 },
        },
        errors: { lint: 5 },
      } as Metrics

      const gradient = computeGradient(metrics)

      expect(gradient.length).toBeGreaterThan(0)
      // Should be sorted by priority (descending)
      for (let i = 1; i < gradient.length; i++) {
        expect(gradient[i - 1].priority).toBeGreaterThanOrEqual(gradient[i].priority)
      }
    })

    it('includes rationale for each component', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 30, statements: 90 },
        },
      } as Metrics

      const gradient = computeGradient(metrics)

      for (const comp of gradient) {
        expect(comp.rationale).toBeTruthy()
      }
    })

    it('returns empty array for no metrics', () => {
      const metrics: Metrics = {} as Metrics

      const gradient = computeGradient(metrics)

      expect(gradient).toEqual([])
    })
  })

  describe('suggestNextFix', () => {
    it('returns suggestion for top gradient component', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 50, statements: 80 },
        },
        errors: { lint: 5 },
      } as Metrics

      const suggestion = suggestNextFix(metrics)

      expect(suggestion).not.toBeNull()
      expect(suggestion!.dimension).toBeTruthy()
      expect(suggestion!.rationale).toBeTruthy()
      expect(typeof suggestion!.estimatedGain).toBe('number')
    })

    it('returns null for no metrics', () => {
      const metrics: Metrics = {} as Metrics

      const suggestion = suggestNextFix(metrics)

      expect(suggestion).toBeNull()
    })

    it('calculates reasonable target for higher-better', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 70, statements: 70 },
        },
      } as Metrics

      const suggestion = suggestNextFix(metrics)

      expect(suggestion).not.toBeNull()
      expect(suggestion!.targetValue).toBeGreaterThan(suggestion!.currentValue)
      expect(suggestion!.targetValue).toBeLessThanOrEqual(100)
    })
  })

  describe('suggestNextFixes', () => {
    it('returns multiple suggestions', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 50, statements: 60 },
        },
        errors: { lint: 10 },
      } as Metrics

      const suggestions = suggestNextFixes(metrics, 3)

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.length).toBeLessThanOrEqual(3)
    })

    it('skips optimal dimensions', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 100, statements: 100 },
        },
        errors: { lint: 0 },
      } as Metrics

      const suggestions = suggestNextFixes(metrics, 5)

      // All dimensions are optimal, should return empty or minimal suggestions
      expect(suggestions.length).toBe(0)
    })
  })

  describe('formatFitnessScore', () => {
    it('formats score with bar and number', () => {
      const formatted = formatFitnessScore(75)

      expect(formatted).toContain('75.0')
      expect(formatted).toContain('/100')
      expect(formatted).toContain('█')
      expect(formatted).toContain('░')
    })

    it('shows full bar for 100', () => {
      const formatted = formatFitnessScore(100)

      expect(formatted).toContain('100.0')
      expect(formatted).not.toContain('░')
    })

    it('shows empty bar for 0', () => {
      const formatted = formatFitnessScore(0)

      expect(formatted).toContain('0.0')
      expect(formatted).not.toContain('█')
    })
  })

  describe('formatGradientTable', () => {
    it('formats gradient as markdown table', () => {
      const gradient = [
        {
          dimension: 'coverage.unit.branches',
          displayName: 'Branch Coverage',
          currentValue: 75,
          direction: 'higher-better' as const,
          estimatedImprovement: 0.01,
          priority: 0.01,
          rationale: 'test',
        },
      ]

      const table = formatGradientTable(gradient)

      expect(table).toContain('| Dimension |')
      expect(table).toContain('Branch Coverage')
      expect(table).toContain('75.0%')
      expect(table).toContain('↑')
    })

    it('returns message for empty gradient', () => {
      const table = formatGradientTable([])

      expect(table).toContain('No gradient components')
    })

    it('formats lower-better dimensions with count', () => {
      const gradient = [
        {
          dimension: 'errors.lint',
          displayName: 'Lint Errors',
          currentValue: 5,
          direction: 'lower-better' as const,
          estimatedImprovement: 0.02,
          priority: 0.02,
          rationale: 'test',
        },
      ]

      const table = formatGradientTable(gradient)

      expect(table).toContain('5')
      expect(table).toContain('↓')
    })
  })

  describe('formatSuggestion', () => {
    it('formats suggestion with all details', () => {
      const suggestion = {
        dimension: 'coverage.unit.branches',
        displayName: 'Branch Coverage',
        rationale: 'Improve coverage to increase quality',
        estimatedGain: 0.5,
        currentValue: 70,
        targetValue: 80,
      }

      const formatted = formatSuggestion(suggestion)

      expect(formatted).toContain('Branch Coverage')
      expect(formatted).toContain('Improve coverage')
      expect(formatted).toContain('Current: 70')
      expect(formatted).toContain('Target:  80')
      expect(formatted).toContain('+0.500')
    })
  })
})
