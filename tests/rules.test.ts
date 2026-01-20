import { describe, it, expect, afterEach } from 'vitest'
import {
  loadRules,
  computeRulesHash,
  evaluateRules,
  isCacheValid,
} from '../src/rules.js'
import { resetConfig } from '../src/config.js'
import type { QualityRules, Metrics, CacheEntry } from '../src/types.js'

describe('loadRules', () => {
  afterEach(() => {
    resetConfig()
  })

  it('loads rules from rules.json', () => {
    const rules = loadRules()

    expect(rules.version).toBeDefined()
    expect(rules.rules).toBeDefined()
    expect(rules.rules.floors).toBeDefined()
  })

  it('throws error when rules file does not exist', () => {
    process.env.QUALITY_RULES_FILE = '/nonexistent/rules.json'
    resetConfig()

    expect(() => loadRules()).toThrow('Rules file not found')
  })
})

describe('computeRulesHash', () => {
  it('returns consistent hash for same rules', () => {
    const rules: QualityRules = {
      version: '1.0.0',
      rules: {
        floors: { 'coverage.branches': 80 },
      },
    }

    const hash1 = computeRulesHash(rules)
    const hash2 = computeRulesHash(rules)

    expect(hash1).toBe(hash2)
  })

  it('returns different hash for different rules', () => {
    const rules1: QualityRules = {
      version: '1.0.0',
      rules: {
        floors: { 'coverage.branches': 80 },
      },
    }

    const rules2: QualityRules = {
      version: '1.0.0',
      rules: {
        floors: { 'coverage.branches': 90 },
      },
    }

    const hash1 = computeRulesHash(rules1)
    const hash2 = computeRulesHash(rules2)

    expect(hash1).not.toBe(hash2)
  })

  it('returns a 16-character hash', () => {
    const rules: QualityRules = {
      version: '1.0.0',
      rules: {},
    }

    const hash = computeRulesHash(rules)

    expect(hash).toHaveLength(16)
  })
})

describe('evaluateRules', () => {
  describe('floor evaluation', () => {
    it('passes when metric is above floor', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          floors: { 'coverage.unit.branches': 80 },
        },
      }

      const metrics: Metrics = {
        coverage: {
          unit: { branches: 85, statements: 90, functions: 80, lines: 85 },
        },
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('pass')
      expect(result.failedRules).toHaveLength(0)
    })

    it('fails when metric is below floor', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          floors: { 'coverage.unit.branches': 80 },
        },
      }

      const metrics: Metrics = {
        coverage: {
          unit: { branches: 70, statements: 90, functions: 80, lines: 85 },
        },
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('fail')
      expect(result.failedRules).toHaveLength(1)
      expect(result.failedRules[0].type).toBe('floor')
      expect(result.failedRules[0].rule).toBe('coverage.unit.branches')
    })

    it('fails when metric is missing', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          floors: { 'coverage.unit.branches': 80 },
        },
      }

      const metrics: Metrics = {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('fail')
      expect(result.failedRules[0].message).toContain('not available')
    })
  })

  describe('ceiling evaluation', () => {
    it('passes when metric is below ceiling', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          ceilings: { 'typescript.errors': 0 },
        },
      }

      const metrics: Metrics = {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('pass')
    })

    it('fails when metric exceeds ceiling', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          ceilings: { 'typescript.errors': 0 },
        },
      }

      const metrics: Metrics = {
        coverage: {},
        typescript: { errors: 5, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('fail')
      expect(result.failedRules[0].type).toBe('ceiling')
    })

    it('ignores missing metrics for ceilings', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          ceilings: { 'sonarqube.bugs': 0 },
        },
      }

      const metrics: Metrics = {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('pass')
    })
  })

  describe('monotonic evaluation', () => {
    it('passes when metric increases (direction: up)', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          monotonic: [
            { direction: 'up', metrics: ['coverage.unit.branches'] },
          ],
        },
      }

      const currentMetrics: Metrics = {
        coverage: { unit: { branches: 85, statements: 90, functions: 80, lines: 85 } },
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const baselineEntry: CacheEntry = {
        timestamp: Date.now(),
                rulesHash: 'def',
        rulesVersion: '1.0.0',
        metrics: {
          coverage: { unit: { branches: 80, statements: 85, functions: 75, lines: 80 } },
          typescript: { errors: 0, warnings: 0, rootCauses: 0 },
          eslint: { errors: 0, warnings: 0, rootCauses: 0 },
          scripts: {},
          sloc: 1000,
        },
        evaluation: { status: 'pass', failedRules: [] },
      }

      const result = evaluateRules(rules, currentMetrics, baselineEntry)

      expect(result.status).toBe('pass')
    })

    it('fails when metric decreases (direction: up)', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          monotonic: [
            { direction: 'up', metrics: ['coverage.unit.branches'] },
          ],
        },
      }

      const currentMetrics: Metrics = {
        coverage: { unit: { branches: 75, statements: 90, functions: 80, lines: 85 } },
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const baselineEntry: CacheEntry = {
        timestamp: Date.now(),
                rulesHash: 'def',
        rulesVersion: '1.0.0',
        metrics: {
          coverage: { unit: { branches: 80, statements: 85, functions: 75, lines: 80 } },
          typescript: { errors: 0, warnings: 0, rootCauses: 0 },
          eslint: { errors: 0, warnings: 0, rootCauses: 0 },
          scripts: {},
          sloc: 1000,
        },
        evaluation: { status: 'pass', failedRules: [] },
      }

      const result = evaluateRules(rules, currentMetrics, baselineEntry)

      expect(result.status).toBe('fail')
      expect(result.failedRules[0].type).toBe('monotonic')
      expect(result.failedRules[0].message).toContain('decreased')
    })

    it('passes when metric decreases (direction: down)', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          monotonic: [
            { direction: 'down', metrics: ['typescript.errors'] },
          ],
        },
      }

      const currentMetrics: Metrics = {
        coverage: {},
        typescript: { errors: 2, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const baselineEntry: CacheEntry = {
        timestamp: Date.now(),
                rulesHash: 'def',
        rulesVersion: '1.0.0',
        metrics: {
          coverage: {},
          typescript: { errors: 5, warnings: 0, rootCauses: 0 },
          eslint: { errors: 0, warnings: 0, rootCauses: 0 },
          scripts: {},
          sloc: 1000,
        },
        evaluation: { status: 'pass', failedRules: [] },
      }

      const result = evaluateRules(rules, currentMetrics, baselineEntry)

      expect(result.status).toBe('pass')
    })

    it('skips monotonic evaluation when no baseline', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          monotonic: [
            { direction: 'up', metrics: ['coverage.unit.branches'] },
          ],
        },
      }

      const metrics: Metrics = {
        coverage: { unit: { branches: 50, statements: 60, functions: 50, lines: 55 } },
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics, undefined)

      expect(result.status).toBe('pass')
    })
  })

  describe('script evaluation', () => {
    it('passes when required scripts pass', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          requiredScripts: ['test'],
        },
      }

      const metrics: Metrics = {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: { test: 'pass' },
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('pass')
    })

    it('fails when required script fails', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          requiredScripts: ['test'],
        },
      }

      const metrics: Metrics = {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: { test: 'fail' },
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('fail')
      expect(result.failedRules[0].type).toBe('script')
    })

    it('fails when required script was not run', () => {
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {
          requiredScripts: ['test'],
        },
      }

      const metrics: Metrics = {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      }

      const result = evaluateRules(rules, metrics)

      expect(result.status).toBe('fail')
      expect(result.failedRules[0].message).toContain('was not run')
    })
  })
})

describe('isCacheValid', () => {
  it('returns true when hashes match', () => {
    const rules: QualityRules = {
      version: '1.0.0',
      rules: {
        floors: { 'coverage.branches': 80 },
      },
    }

    const entry: CacheEntry = {
      timestamp: Date.now(),
            rulesHash: computeRulesHash(rules),
      rulesVersion: '1.0.0',
      metrics: {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      },
      evaluation: { status: 'pass', failedRules: [] },
    }

    expect(isCacheValid(entry, rules)).toBe(true)
  })

  it('returns false when hashes differ', () => {
    const rules: QualityRules = {
      version: '1.0.0',
      rules: {
        floors: { 'coverage.branches': 80 },
      },
    }

    const entry: CacheEntry = {
      timestamp: Date.now(),
            rulesHash: 'different-hash',
      rulesVersion: '1.0.0',
      metrics: {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      },
      evaluation: { status: 'pass', failedRules: [] },
    }

    expect(isCacheValid(entry, rules)).toBe(false)
  })

  it('returns false when versions differ', () => {
    const rules: QualityRules = {
      version: '2.0.0',
      rules: {
        floors: { 'coverage.branches': 80 },
      },
    }

    const entry: CacheEntry = {
      timestamp: Date.now(),
            rulesHash: computeRulesHash(rules),
      rulesVersion: '1.0.0',
      metrics: {
        coverage: {},
        typescript: { errors: 0, warnings: 0, rootCauses: 0 },
        eslint: { errors: 0, warnings: 0, rootCauses: 0 },
        scripts: {},
        sloc: 1000,
      },
      evaluation: { status: 'pass', failedRules: [] },
    }

    expect(isCacheValid(entry, rules)).toBe(false)
  })
})
