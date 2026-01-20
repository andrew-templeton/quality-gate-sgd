import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SEVERITY_WEIGHTS,
  getSeverityWeight,
  sumSeverityWeights,
  normalizeSeverityScore,
  computeGradientDirection,
} from '../src/severity.js'
import type { FailedRule } from '../src/types.js'

describe('severity module', () => {
  describe('DEFAULT_SEVERITY_WEIGHTS', () => {
    it('defines weights for SonarQube severity levels', () => {
      expect(DEFAULT_SEVERITY_WEIGHTS['sonarqube.blocker']).toBe(100)
      expect(DEFAULT_SEVERITY_WEIGHTS['sonarqube.critical']).toBe(80)
      expect(DEFAULT_SEVERITY_WEIGHTS['sonarqube.major']).toBe(60)
      expect(DEFAULT_SEVERITY_WEIGHTS['sonarqube.minor']).toBe(40)
      expect(DEFAULT_SEVERITY_WEIGHTS['sonarqube.info']).toBe(20)
    })

    it('defines weights for coverage metrics', () => {
      expect(DEFAULT_SEVERITY_WEIGHTS['coverage.branches']).toBe(55)
      expect(DEFAULT_SEVERITY_WEIGHTS['coverage.statements']).toBe(45)
    })

    it('defines weights for linting issues', () => {
      expect(DEFAULT_SEVERITY_WEIGHTS['eslint.errors']).toBe(70)
      expect(DEFAULT_SEVERITY_WEIGHTS['typescript.errors']).toBe(75)
    })
  })

  describe('getSeverityWeight', () => {
    it('returns weight for known metric path', () => {
      expect(getSeverityWeight('sonarqube.blocker')).toBe(100)
      expect(getSeverityWeight('coverage.branches')).toBe(55)
      expect(getSeverityWeight('eslint.errors')).toBe(70)
    })

    it('uses custom weights when provided', () => {
      const customWeights = {
        'sonarqube.blocker': 150,
        'custom.metric': 42,
      }

      expect(getSeverityWeight('sonarqube.blocker', customWeights)).toBe(150)
      expect(getSeverityWeight('custom.metric', customWeights)).toBe(42)
    })

    it('falls back to default when custom weight not found', () => {
      const customWeights = {
        'custom.metric': 42,
      }

      expect(getSeverityWeight('sonarqube.blocker', customWeights)).toBe(100)
    })

    it('matches partial paths', () => {
      // 'coverage.unit.branches' should match 'coverage.branches' pattern
      expect(getSeverityWeight('coverage.unit.branches')).toBe(55)
    })

    it('returns default fallback for unknown paths', () => {
      expect(getSeverityWeight('completely.unknown.path')).toBe(50)
    })
  })

  describe('sumSeverityWeights', () => {
    it('sums weights for failed rules', () => {
      const failedRules: FailedRule[] = [
        { rule: 'sonarqube.blocker', actual: 1, threshold: 0, message: 'test' },
        { rule: 'sonarqube.critical', actual: 2, threshold: 0, message: 'test' },
      ]

      const total = sumSeverityWeights(failedRules)

      expect(total).toBe(180) // 100 + 80
    })

    it('handles monotonic rule format with prefix', () => {
      const failedRules: FailedRule[] = [
        { rule: 'up:coverage.branches', actual: 50, threshold: 80, message: 'test' },
        { rule: 'down:sonarqube.bugs', actual: 5, threshold: 0, message: 'test' },
      ]

      const total = sumSeverityWeights(failedRules)

      expect(total).toBe(55 + 85) // coverage.branches + sonarqube.bugs
    })

    it('returns 0 for empty array', () => {
      const total = sumSeverityWeights([])

      expect(total).toBe(0)
    })

    it('uses custom weights when provided', () => {
      const failedRules: FailedRule[] = [
        { rule: 'custom.metric', actual: 1, threshold: 0, message: 'test' },
      ]
      const customWeights = {
        'custom.metric': 99,
      }

      const total = sumSeverityWeights(failedRules, customWeights)

      expect(total).toBe(99)
    })
  })

  describe('normalizeSeverityScore', () => {
    it('normalizes score to 0-1 range', () => {
      expect(normalizeSeverityScore(0)).toBe(0)
      expect(normalizeSeverityScore(250, 500)).toBe(0.5)
      expect(normalizeSeverityScore(500, 500)).toBe(1)
    })

    it('caps at 1 for scores above max', () => {
      expect(normalizeSeverityScore(1000, 500)).toBe(1)
    })

    it('uses default max of 500', () => {
      expect(normalizeSeverityScore(250)).toBe(0.5)
    })
  })

  describe('computeGradientDirection', () => {
    it('returns sorted metric paths by severity', () => {
      const failedRules: FailedRule[] = [
        { rule: 'sonarqube.minor', actual: 1, threshold: 0, message: 'test' }, // 40
        { rule: 'sonarqube.blocker', actual: 1, threshold: 0, message: 'test' }, // 100
        { rule: 'sonarqube.major', actual: 1, threshold: 0, message: 'test' }, // 60
      ]

      const direction = computeGradientDirection(failedRules)

      expect(direction).toEqual([
        'sonarqube.blocker',
        'sonarqube.major',
        'sonarqube.minor',
      ])
    })

    it('handles monotonic rule prefixes', () => {
      const failedRules: FailedRule[] = [
        { rule: 'up:coverage.branches', actual: 50, threshold: 80, message: 'test' }, // 55
        { rule: 'down:eslint.errors', actual: 10, threshold: 0, message: 'test' }, // 70
      ]

      const direction = computeGradientDirection(failedRules)

      expect(direction).toEqual([
        'eslint.errors',
        'coverage.branches',
      ])
    })

    it('returns empty array for no failures', () => {
      const direction = computeGradientDirection([])

      expect(direction).toEqual([])
    })

    it('uses custom weights for sorting', () => {
      const failedRules: FailedRule[] = [
        { rule: 'metric.a', actual: 1, threshold: 0, message: 'test' },
        { rule: 'metric.b', actual: 1, threshold: 0, message: 'test' },
      ]
      const customWeights = {
        'metric.a': 10,
        'metric.b': 90,
      }

      const direction = computeGradientDirection(failedRules, customWeights)

      expect(direction).toEqual(['metric.b', 'metric.a'])
    })
  })
})
