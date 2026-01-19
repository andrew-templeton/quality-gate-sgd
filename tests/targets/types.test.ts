import { describe, it, expect } from 'vitest'
import type {
  LocatedIssue,
  OptimizationTarget,
  IssueSource,
  IssueSeverity,
} from '../../src/targets/types.js'

describe('LocatedIssue type', () => {
  it('accepts valid located issue', () => {
    const issue: LocatedIssue = {
      file: 'src/test.ts',
      line: 10,
      column: 5,
      source: 'typescript',
      dimension: 'typescript.errors',
      code: 'TS2345',
      severity: 'major',
      impact: {
        dimension: 'typescript.errors',
        delta: -1,
        direction: 'lower',
      },
      message: 'Type error',
    }

    expect(issue.file).toBe('src/test.ts')
    expect(issue.source).toBe('typescript')
  })

  it('accepts minimal located issue', () => {
    const issue: LocatedIssue = {
      file: 'test.ts',
      source: 'coverage',
      dimension: 'coverage.branches',
      impact: {
        dimension: 'coverage.branches',
        delta: 0.5,
        direction: 'higher',
      },
      message: 'Uncovered branch',
    }

    expect(issue.line).toBeUndefined()
    expect(issue.symbol).toBeUndefined()
  })

  it('accepts symbolId for unified analysis', () => {
    const issue: LocatedIssue = {
      file: 'src/service.ts',
      line: 25,
      symbolId: 'src/service.ts::UserService.handleRequest',
      source: 'eslint',
      dimension: 'eslint.errors',
      impact: {
        dimension: 'eslint.errors',
        delta: -1,
        direction: 'lower',
      },
      message: 'ESLint error',
    }

    expect(issue.symbolId).toBe('src/service.ts::UserService.handleRequest')
  })
})

describe('OptimizationTarget type', () => {
  it('accepts valid optimization target', () => {
    const target: OptimizationTarget = {
      file: 'src/test.ts',
      symbol: 'testFunction',
      startLine: 1,
      endLine: 10,
      issues: [],
      issueCount: 0,
      dimensionsAffected: ['coverage.branches', 'typescript.errors'],
      impacts: {
        'coverage.branches': 2.5,
        'typescript.errors': -3,
      },
      totalDeltaQ: 5.5,
      breakdown: {},
    }

    expect(target.dimensionsAffected).toHaveLength(2)
    expect(target.totalDeltaQ).toBe(5.5)
  })

  it('accepts target with graph weighting', () => {
    const target: OptimizationTarget = {
      file: 'src/core.ts',
      issues: [],
      issueCount: 5,
      dimensionsAffected: ['coverage.branches'],
      impacts: { 'coverage.branches': 1.0 },
      totalDeltaQ: 1.0,
      dependentCount: 10,
      centralityScore: 0.8,
      weightedDeltaQ: 4.5,
      breakdown: {},
    }

    expect(target.dependentCount).toBe(10)
    expect(target.weightedDeltaQ).toBe(4.5)
  })

  it('accepts target with full breakdown', () => {
    const target: OptimizationTarget = {
      file: 'src/test.ts',
      issues: [],
      issueCount: 10,
      dimensionsAffected: ['coverage.branches', 'typescript.errors', 'eslint.errors', 'sonarqube.codeSmells'],
      impacts: {},
      totalDeltaQ: 10.0,
      breakdown: {
        coverage: {
          uncoveredBranches: 5,
          uncoveredLines: 10,
          estimatedCoverageGain: 2.5,
        },
        typescript: {
          errorCount: 3,
          errorCodes: ['TS2345', 'TS2339'],
        },
        eslint: {
          errorCount: 1,
          warningCount: 2,
          rules: ['no-unused-vars'],
        },
        sonarqube: {
          bugs: 0,
          vulnerabilities: 0,
          codeSmells: 5,
          severityCounts: {
            blocker: 0,
            critical: 0,
            major: 3,
            minor: 2,
            info: 0,
          },
        },
      },
    }

    expect(target.breakdown.coverage?.uncoveredBranches).toBe(5)
    expect(target.breakdown.typescript?.errorCodes).toContain('TS2345')
    expect(target.breakdown.sonarqube?.severityCounts.major).toBe(3)
  })
})

describe('IssueSource type', () => {
  it('accepts valid sources', () => {
    const sources: IssueSource[] = ['coverage', 'typescript', 'eslint', 'sonarqube']
    expect(sources).toHaveLength(4)
  })
})

describe('IssueSeverity type', () => {
  it('accepts valid severities', () => {
    const severities: IssueSeverity[] = ['blocker', 'critical', 'major', 'minor', 'info']
    expect(severities).toHaveLength(5)
  })
})
