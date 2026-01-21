import { describe, it, expect } from 'vitest'
import type { Metrics, QualityGateCache, NormalizedMetrics } from '../src/types.js'
import {
  DEFAULT_QUALITY_WEIGHTS,
  normalizeMetrics,
  computeQualityScore,
  buildTrajectory,
  trajectorySparkline,
  formatTrajectorySummary,
} from '../src/trajectory.js'

describe('trajectory module', () => {
  describe('DEFAULT_QUALITY_WEIGHTS', () => {
    it('has weights for all normalized metrics', () => {
      expect(DEFAULT_QUALITY_WEIGHTS.coverageBranches).toBe(0.20)
      expect(DEFAULT_QUALITY_WEIGHTS.coverageStatements).toBe(0.15)
      expect(DEFAULT_QUALITY_WEIGHTS.bugsPerKsloc).toBe(0.10)
      expect(DEFAULT_QUALITY_WEIGHTS.typescriptErrors).toBe(0.01)
    })

    it('has weights that sum to approximately 1', () => {
      const sum = Object.values(DEFAULT_QUALITY_WEIGHTS).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 1)
    })
  })

  describe('normalizeMetrics', () => {
    it('normalizes coverage metrics', () => {
      const metrics: Metrics = {
        coverage: {
          unit: {
            branches: 80,
            statements: 85,
            lines: 82,
            functions: 75,
          },
        },
        sloc: 1000,
      } as Metrics

      const normalized = normalizeMetrics(metrics)

      expect(normalized.coverageBranches).toBe(80)
      expect(normalized.coverageStatements).toBe(85)
      expect(normalized.coverageLines).toBe(82)
      expect(normalized.coverageFunctions).toBe(75)
    })

    it('normalizes sonarqube counts to per-kSLOC', () => {
      const metrics: Metrics = {
        sonarqube: {
          bugs: 10,
          vulnerabilities: 5,
          codeSmells: 100,
          blocker: 2,
          critical: 3,
          major: 20,
          minor: 50,
          duplications: 5,
        },
        sloc: 2000, // 2k SLOC
      } as Metrics

      const normalized = normalizeMetrics(metrics)

      // Values should be halved (per 1k SLOC when we have 2k)
      expect(normalized.bugsPerKsloc).toBe(5)
      expect(normalized.vulnerabilitiesPerKsloc).toBe(2.5)
      expect(normalized.smellsPerKsloc).toBe(50)
      expect(normalized.duplications).toBe(5)
    })

    it('handles missing metrics with defaults', () => {
      const metrics: Metrics = {} as Metrics

      const normalized = normalizeMetrics(metrics)

      expect(normalized.coverageBranches).toBe(0)
      expect(normalized.bugsPerKsloc).toBe(0)
      expect(normalized.typescriptErrors).toBe(0)
    })

    it('uses provided SLOC over metrics.sloc', () => {
      const metrics: Metrics = {
        sonarqube: { bugs: 10 },
        sloc: 2000,
      } as Metrics

      // Override with 1000 SLOC
      const normalized = normalizeMetrics(metrics, 1000)

      expect(normalized.bugsPerKsloc).toBe(10) // 10 bugs / 1kSLOC
    })

    it('uses default SLOC when none provided', () => {
      const metrics: Metrics = {
        sonarqube: { bugs: 10 },
      } as Metrics

      const normalized = normalizeMetrics(metrics)

      // Default 1000 SLOC
      expect(normalized.bugsPerKsloc).toBe(10)
    })

    it('prefers union coverage over unit coverage', () => {
      const metrics: Metrics = {
        coverage: {
          unit: { branches: 50, statements: 50, lines: 50, functions: 50 },
          union: { branches: 80, statements: 80, lines: 80, functions: 80 },
        },
      } as Metrics

      const normalized = normalizeMetrics(metrics)

      expect(normalized.coverageBranches).toBe(80)
    })

    it('uses rootCauses when available', () => {
      const metrics: Metrics = {
        typescript: { errors: 10, rootCauses: 3 },
        eslint: { errors: 20, rootCauses: 5 },
      } as Metrics

      const normalized = normalizeMetrics(metrics)

      expect(normalized.typescriptErrors).toBe(3)
      expect(normalized.eslintErrors).toBe(5)
    })
  })

  describe('computeQualityScore', () => {
    it('computes higher score for better metrics', () => {
      const good: NormalizedMetrics = {
        coverageBranches: 90,
        coverageStatements: 90,
        coverageLines: 90,
        coverageFunctions: 90,
        duplications: 0,
        bugsPerKsloc: 0,
        vulnerabilitiesPerKsloc: 0,
        smellsPerKsloc: 0,
        blockerPerKsloc: 0,
        criticalPerKsloc: 0,
        majorPerKsloc: 0,
        minorPerKsloc: 0,
        typescriptErrors: 0,
        eslintErrors: 0,
      }

      const bad: NormalizedMetrics = {
        coverageBranches: 30,
        coverageStatements: 30,
        coverageLines: 30,
        coverageFunctions: 30,
        duplications: 50,
        bugsPerKsloc: 10,
        vulnerabilitiesPerKsloc: 5,
        smellsPerKsloc: 100,
        blockerPerKsloc: 5,
        criticalPerKsloc: 10,
        majorPerKsloc: 50,
        minorPerKsloc: 100,
        typescriptErrors: 10,
        eslintErrors: 20,
      }

      const goodScore = computeQualityScore(good)
      const badScore = computeQualityScore(bad)

      expect(goodScore).toBeGreaterThan(badScore)
    })

    it('uses custom weights when provided', () => {
      const metrics: NormalizedMetrics = {
        coverageBranches: 100,
        coverageStatements: 0,
        coverageLines: 0,
        coverageFunctions: 0,
        duplications: 0,
        bugsPerKsloc: 0,
        vulnerabilitiesPerKsloc: 0,
        smellsPerKsloc: 0,
        blockerPerKsloc: 0,
        criticalPerKsloc: 0,
        majorPerKsloc: 0,
        minorPerKsloc: 0,
        typescriptErrors: 0,
        eslintErrors: 0,
      }

      const heavyBranches = computeQualityScore(metrics, { coverageBranches: 1 })
      const lightBranches = computeQualityScore(metrics, { coverageBranches: 0.01 })

      expect(heavyBranches).toBeGreaterThan(lightBranches)
    })

    it('penalizes any errors sharply', () => {
      const noErrors: NormalizedMetrics = {
        coverageBranches: 50,
        coverageStatements: 50,
        coverageLines: 50,
        coverageFunctions: 50,
        duplications: 0,
        bugsPerKsloc: 0,
        vulnerabilitiesPerKsloc: 0,
        smellsPerKsloc: 0,
        blockerPerKsloc: 0,
        criticalPerKsloc: 0,
        majorPerKsloc: 0,
        minorPerKsloc: 0,
        typescriptErrors: 0,
        eslintErrors: 0,
      }

      const withErrors: NormalizedMetrics = {
        ...noErrors,
        typescriptErrors: 1,
      }

      const noErrorScore = computeQualityScore(noErrors)
      const withErrorScore = computeQualityScore(withErrors)

      expect(noErrorScore).toBeGreaterThan(withErrorScore)
    })
  })

  describe('buildTrajectory', () => {
    it('builds trajectory from cache entries', () => {
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {
          'commit1': {
            timestamp: 1000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'fail', failedRules: [] },
            metrics: {
              coverage: { unit: { branches: 50, statements: 50, lines: 50, functions: 50 } },
            } as Metrics,
          },
          'commit2': {
            timestamp: 2000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'pass', failedRules: [] },
            metrics: {
              coverage: { unit: { branches: 80, statements: 80, lines: 80, functions: 80 } },
            } as Metrics,
          },
        },
      }

      const trajectory = buildTrajectory(cache)

      expect(trajectory.points.length).toBe(2)
      expect(trajectory.points[0].key).toBe('commit1')
      expect(trajectory.points[1].key).toBe('commit2')
      expect(trajectory.points[1].qualityScore).toBeGreaterThan(trajectory.points[0].qualityScore)
    })

    it('returns empty trajectory for empty cache', () => {
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {},
      }

      const trajectory = buildTrajectory(cache)

      expect(trajectory.points).toEqual([])
      expect(trajectory.totalDescent).toBe(0)
      expect(trajectory.convergenceState).toBe('stagnating')
    })

    it('sorts entries by timestamp', () => {
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {
          'later': {
            timestamp: 2000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'pass', failedRules: [] },
            metrics: {} as Metrics,
          },
          'earlier': {
            timestamp: 1000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'fail', failedRules: [] },
            metrics: {} as Metrics,
          },
        },
      }

      const trajectory = buildTrajectory(cache)

      expect(trajectory.points[0].key).toBe('earlier')
      expect(trajectory.points[1].key).toBe('later')
    })

    it('counts monotonic and regression steps', () => {
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {
          'a': {
            timestamp: 1000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'fail', failedRules: [] },
            metrics: { coverage: { unit: { branches: 30, statements: 30, lines: 30, functions: 30 } } } as Metrics,
          },
          'b': {
            timestamp: 2000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'fail', failedRules: [] },
            metrics: { coverage: { unit: { branches: 60, statements: 60, lines: 60, functions: 60 } } } as Metrics,
          },
          'c': {
            timestamp: 3000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'fail', failedRules: [] },
            metrics: { coverage: { unit: { branches: 40, statements: 40, lines: 40, functions: 40 } } } as Metrics,
          },
        },
      }

      const trajectory = buildTrajectory(cache)

      expect(trajectory.monotonicSteps).toBeGreaterThanOrEqual(1)
      expect(trajectory.regressionSteps).toBeGreaterThanOrEqual(1)
    })

    it('returns converged state when stable at high score', () => {
      // To trigger 'converged': passed=true, qualityScore>70, and recentVariance<1
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {
          'a': {
            timestamp: 1000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'pass', failedRules: [] },
            metrics: { coverage: { unit: { branches: 90, statements: 90, lines: 90, functions: 90 } } } as Metrics,
          },
          'b': {
            timestamp: 2000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'pass', failedRules: [] },
            // Stable scores - variance < 1
            metrics: { coverage: { unit: { branches: 90, statements: 90, lines: 90, functions: 90 } } } as Metrics,
          },
          'c': {
            timestamp: 3000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'pass', failedRules: [] },
            metrics: { coverage: { unit: { branches: 90, statements: 90, lines: 90, functions: 90 } } } as Metrics,
          },
        },
      }

      const trajectory = buildTrajectory(cache)

      expect(trajectory.convergenceState).toBe('converged')
    })

    it('returns stagnating for single point trajectory', () => {
      // Tests the points.length < 2 branch
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {
          'single': {
            timestamp: 1000,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'fail', failedRules: [] },
            metrics: { coverage: { unit: { branches: 50, statements: 50, lines: 50, functions: 50 } } } as Metrics,
          },
        },
      }

      const trajectory = buildTrajectory(cache)

      expect(trajectory.convergenceState).toBe('stagnating')
    })
  })

  describe('trajectorySparkline', () => {
    it('returns sparkline for trajectory', () => {
      const trajectory = {
        points: [
          { key: 'a', timestamp: 1, metrics: {} as NormalizedMetrics, qualityScore: 20, passed: false },
          { key: 'b', timestamp: 2, metrics: {} as NormalizedMetrics, qualityScore: 50, passed: false },
          { key: 'c', timestamp: 3, metrics: {} as NormalizedMetrics, qualityScore: 80, passed: true },
        ],
        totalDescent: 60,
        averageStepSize: 30,
        monotonicSteps: 2,
        regressionSteps: 0,
        convergenceState: 'improving' as const,
      }

      const sparkline = trajectorySparkline(trajectory)

      expect(sparkline.length).toBe(3)
      // Should show ascending pattern
      expect(sparkline).toMatch(/[▁▂▃▄▅▆▇█]+/)
    })

    it('returns placeholder for empty trajectory', () => {
      const trajectory = {
        points: [],
        totalDescent: 0,
        averageStepSize: 0,
        monotonicSteps: 0,
        regressionSteps: 0,
        convergenceState: 'stagnating' as const,
      }

      const sparkline = trajectorySparkline(trajectory)

      expect(sparkline).toBe('(no data)')
    })
  })

  describe('formatTrajectorySummary', () => {
    it('formats trajectory summary', () => {
      const trajectory = {
        points: [
          { key: 'abc123def456', timestamp: 1000, metrics: {} as NormalizedMetrics, qualityScore: 50, passed: false },
          { key: 'xyz789abc012', timestamp: 2000, metrics: {} as NormalizedMetrics, qualityScore: 75, passed: true },
        ],
        totalDescent: 25,
        averageStepSize: 25,
        monotonicSteps: 1,
        regressionSteps: 0,
        convergenceState: 'improving' as const,
      }

      const summary = formatTrajectorySummary(trajectory)

      expect(summary).toContain('Trajectory Analysis')
      expect(summary).toContain('Points: 2')
      expect(summary).toContain('Total descent: 25.00')
      expect(summary).toContain('Convergence: improving')
      expect(summary).toContain('First point')
      expect(summary).toContain('Last point')
      expect(summary).toContain('improved by 25.00')
    })

    it('handles empty trajectory', () => {
      const trajectory = {
        points: [],
        totalDescent: 0,
        averageStepSize: 0,
        monotonicSteps: 0,
        regressionSteps: 0,
        convergenceState: 'stagnating' as const,
      }

      const summary = formatTrajectorySummary(trajectory)

      expect(summary).toContain('Points: 0')
      expect(summary).not.toContain('First point')
    })
  })
})
