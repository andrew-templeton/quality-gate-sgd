import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileInfo } from '../src/types.js'

// Mock severity module
vi.mock('../src/severity.js', () => ({
  sumSeverityWeights: vi.fn(() => 100),
  normalizeSeverityScore: vi.fn((score: number) => score / 500),
}))

import {
  DEFAULT_PRIORITY_WEIGHTS,
  computePriority,
  prioritizeFiles,
  categorizeFiles,
  getGradientDirection,
  formatPrioritizedFiles,
} from '../src/optimizer.js'

describe('optimizer module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('DEFAULT_PRIORITY_WEIGHTS', () => {
    it('has weights that sum to 1', () => {
      const sum =
        DEFAULT_PRIORITY_WEIGHTS.coverage +
        DEFAULT_PRIORITY_WEIGHTS.ease +
        DEFAULT_PRIORITY_WEIGHTS.impact +
        DEFAULT_PRIORITY_WEIGHTS.severity

      expect(sum).toBe(1)
    })

    it('prioritizes coverage and impact equally', () => {
      expect(DEFAULT_PRIORITY_WEIGHTS.coverage).toBe(0.30)
      expect(DEFAULT_PRIORITY_WEIGHTS.impact).toBe(0.30)
    })
  })

  describe('computePriority', () => {
    it('computes priority with all components', () => {
      const file: FileInfo = {
        path: '/src/test.ts',
        degree: 2,
        impact: 0.5,
        coverage: {
          branches: 50,
          statements: 60,
          functions: 70,
          lines: 80,
        },
      }

      const result = computePriority(file)

      expect(result.file).toBe(file)
      expect(typeof result.priority).toBe('number')
      expect(result.priority).toBeGreaterThan(0)
      expect(result.components.coverageGap).toBe(0.5) // 1 - 50/100
      expect(result.components.easeOfTesting).toBeCloseTo(1 / 3) // 1 / (1 + 2)
      expect(result.components.importance).toBe(0.5)
    })

    it('returns max coverage gap for no coverage', () => {
      const file: FileInfo = {
        path: '/src/test.ts',
        degree: 0,
        impact: 0.5,
      }

      const result = computePriority(file)

      expect(result.components.coverageGap).toBe(1)
    })

    it('uses custom weights when provided', () => {
      const file: FileInfo = {
        path: '/src/test.ts',
        degree: 0,
        impact: 1,
        coverage: {
          branches: 100,
          statements: 100,
          functions: 100,
          lines: 100,
        },
      }

      const customWeights = {
        coverage: 0,
        ease: 0,
        impact: 1,
        severity: 0,
      }

      const result = computePriority(file, [], customWeights)

      // With full coverage, impact 1, and only impact weighted
      expect(result.priority).toBe(1)
    })

    it('computes ease based on degree', () => {
      const leafFile: FileInfo = {
        path: '/src/leaf.ts',
        degree: 0,
        impact: 0.5,
      }

      const highDegreeFile: FileInfo = {
        path: '/src/complex.ts',
        degree: 10,
        impact: 0.5,
      }

      const leafResult = computePriority(leafFile)
      const complexResult = computePriority(highDegreeFile)

      expect(leafResult.components.easeOfTesting).toBe(1) // 1 / (1 + 0)
      expect(complexResult.components.easeOfTesting).toBeCloseTo(1 / 11) // 1 / (1 + 10)
    })
  })

  describe('prioritizeFiles', () => {
    it('returns files sorted by priority descending', () => {
      const files = new Map<string, FileInfo>([
        ['/src/low.ts', { path: '/src/low.ts', degree: 5, impact: 0.1 }],
        ['/src/high.ts', { path: '/src/high.ts', degree: 0, impact: 1 }],
        ['/src/mid.ts', { path: '/src/mid.ts', degree: 2, impact: 0.5 }],
      ])

      const result = prioritizeFiles(files)

      expect(result.length).toBe(3)
      // Should be sorted by priority (descending)
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].priority).toBeGreaterThanOrEqual(result[i].priority)
      }
    })

    it('filters files meeting coverage threshold', () => {
      const files = new Map<string, FileInfo>([
        ['/src/covered.ts', {
          path: '/src/covered.ts',
          degree: 0,
          impact: 1,
          coverage: { branches: 100, statements: 100, functions: 100, lines: 100 },
        }],
        ['/src/uncovered.ts', {
          path: '/src/uncovered.ts',
          degree: 0,
          impact: 1,
          coverage: { branches: 50, statements: 50, functions: 50, lines: 50 },
        }],
      ])

      const result = prioritizeFiles(files, [], DEFAULT_PRIORITY_WEIGHTS, 80)

      expect(result.length).toBe(1)
      expect(result[0].file.path).toBe('/src/uncovered.ts')
    })

    it('includes files without coverage', () => {
      const files = new Map<string, FileInfo>([
        ['/src/nocov.ts', { path: '/src/nocov.ts', degree: 0, impact: 1 }],
      ])

      const result = prioritizeFiles(files)

      expect(result.length).toBe(1)
    })

    it('uses statements fallback when branches is undefined', () => {
      // Tests the fallback path: coverage.branches ?? coverage.statements ?? 0
      const files = new Map<string, FileInfo>([
        ['/src/statementsOnly.ts', {
          path: '/src/statementsOnly.ts',
          degree: 0,
          impact: 1,
          // Coverage without branches - should fall back to statements
          coverage: { statements: 50, functions: 50, lines: 50 } as { statements: number; functions: number; lines: number; branches?: number },
        }],
      ])

      const result = prioritizeFiles(files)

      expect(result.length).toBe(1)
      // File should be included since 50% coverage is below default threshold
    })
  })

  describe('categorizeFiles', () => {
    it('categorizes by impact and degree', () => {
      const files = new Map<string, FileInfo>([
        ['/src/critical.ts', { path: '/src/critical.ts', degree: 0, impact: 1 }],
        ['/src/integration.ts', { path: '/src/integration.ts', degree: 10, impact: 1 }],
        ['/src/utility.ts', { path: '/src/utility.ts', degree: 0, impact: 0 }],
        ['/src/complex.ts', { path: '/src/complex.ts', degree: 10, impact: 0 }],
      ])

      const categories = categorizeFiles(files)

      expect(categories.criticalFoundation.length).toBeGreaterThanOrEqual(1)
      expect(categories.integrationLayer.length).toBeGreaterThanOrEqual(1)
      expect(categories.isolatedUtilities.length).toBeGreaterThanOrEqual(1)
      expect(categories.complexIsolated.length).toBeGreaterThanOrEqual(1)
    })

    it('handles empty map', () => {
      const files = new Map<string, FileInfo>()

      const categories = categorizeFiles(files)

      expect(categories.criticalFoundation).toEqual([])
      expect(categories.integrationLayer).toEqual([])
      expect(categories.isolatedUtilities).toEqual([])
      expect(categories.complexIsolated).toEqual([])
    })

    it('handles single file', () => {
      const files = new Map<string, FileInfo>([
        ['/src/only.ts', { path: '/src/only.ts', degree: 0, impact: 1 }],
      ])

      const categories = categorizeFiles(files)

      const totalFiles =
        categories.criticalFoundation.length +
        categories.integrationLayer.length +
        categories.isolatedUtilities.length +
        categories.complexIsolated.length

      expect(totalFiles).toBe(1)
    })
  })

  describe('getGradientDirection', () => {
    it('returns file paths in priority order', () => {
      const prioritized = [
        { file: { path: '/src/first.ts', degree: 0, impact: 1 }, priority: 0.9, components: {} as never },
        { file: { path: '/src/second.ts', degree: 0, impact: 0.5 }, priority: 0.5, components: {} as never },
        { file: { path: '/src/third.ts', degree: 0, impact: 0.1 }, priority: 0.1, components: {} as never },
      ]

      const direction = getGradientDirection(prioritized)

      expect(direction).toEqual(['/src/first.ts', '/src/second.ts', '/src/third.ts'])
    })

    it('respects limit parameter', () => {
      const prioritized = [
        { file: { path: '/src/1.ts', degree: 0, impact: 1 }, priority: 1, components: {} as never },
        { file: { path: '/src/2.ts', degree: 0, impact: 0.9 }, priority: 0.9, components: {} as never },
        { file: { path: '/src/3.ts', degree: 0, impact: 0.8 }, priority: 0.8, components: {} as never },
      ]

      const direction = getGradientDirection(prioritized, 2)

      expect(direction).toEqual(['/src/1.ts', '/src/2.ts'])
    })

    it('handles empty array', () => {
      const direction = getGradientDirection([])

      expect(direction).toEqual([])
    })
  })

  describe('formatPrioritizedFiles', () => {
    it('formats files for display', () => {
      const prioritized = [
        {
          file: {
            path: '/src/test.ts',
            degree: 2,
            impact: 0.75,
            coverage: {
              branches: 50,
              statements: 60,
              functions: 70,
              lines: 80,
            },
          },
          priority: 0.65,
          components: {
            coverageGap: 0.5,
            easeOfTesting: 0.33,
            importance: 0.75,
            severityScore: 0.2,
          },
        },
      ]

      const formatted = formatPrioritizedFiles(prioritized, '/src')

      expect(formatted).toContain('test.ts')
      expect(formatted).toContain('D2')
      expect(formatted).toContain('I75%')
      expect(formatted).toContain('Priority')
      expect(formatted).toContain('B:50%')
    })

    it('shows NO COVERAGE for files without coverage', () => {
      const prioritized = [
        {
          file: {
            path: '/src/nocov.ts',
            degree: 0,
            impact: 1,
          },
          priority: 1,
          components: {
            coverageGap: 1,
            easeOfTesting: 1,
            importance: 1,
            severityScore: 0,
          },
        },
      ]

      const formatted = formatPrioritizedFiles(prioritized, '/src')

      expect(formatted).toContain('NO COVERAGE')
    })

    it('respects limit parameter', () => {
      const prioritized = Array.from({ length: 50 }, (_, i) => ({
        file: { path: `/src/file${i}.ts`, degree: 0, impact: 1 },
        priority: 1,
        components: { coverageGap: 1, easeOfTesting: 1, importance: 1, severityScore: 0 },
      }))

      const formatted = formatPrioritizedFiles(prioritized, '/src', 5)

      // Should only have 5 files
      const fileMatches = formatted.match(/file\d+\.ts/g)
      expect(fileMatches?.length).toBe(5)
    })
  })
})
