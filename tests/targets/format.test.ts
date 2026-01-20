import { describe, it, expect } from 'vitest'
import {
  formatTarget,
  formatTargetList,
  formatTargetSuggestion,
  formatTargetsForJson,
  formatSymbolIssues,
  formatSymbolIssuesList,
  formatSymbolIssuesForJson,
} from '../../src/targets/format.js'
import type { OptimizationTarget, TargetSuggestion } from '../../src/targets/types.js'
import type { SymbolIssues, CodeSymbol } from '../../src/symbols/types.js'

function createTarget(overrides: Partial<OptimizationTarget> = {}): OptimizationTarget {
  return {
    file: 'src/test.ts',
    startLine: 1,
    endLine: 50,
    issues: [],
    breakdown: {
      coverage: undefined,
      typescript: undefined,
      eslint: undefined,
      sonarqube: undefined,
    },
    totalDeltaQ: 1.5,
    dimensionsAffected: ['coverage.unit.branches'],
    ...overrides,
  }
}

function createSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    id: 'src/test.ts::testFunc',
    file: 'src/test.ts',
    name: 'testFunc',
    qualifiedName: 'testFunc',
    kind: 'function',
    exported: true,
    span: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
    sloc: 10,
    ...overrides,
  }
}

function createSymbolIssues(overrides: Partial<SymbolIssues> = {}): SymbolIssues {
  return {
    symbol: createSymbol(),
    coverage: {
      branches: { total: 10, covered: 5, uncovered: 5, percentage: 50 },
      statements: { total: 20, covered: 15, uncovered: 5, percentage: 75 },
    },
    issues: {
      typescript: [],
      eslint: [],
      sonarqube: [],
      coverage: [],
    },
    totalIssueCount: 0,
    issueDensity: 0,
    coverageGap: 0.5,
    totalDeltaQ: 1.5,
    ...overrides,
  }
}

describe('formatTarget', () => {
  it('formats basic target', () => {
    const target = createTarget()
    const result = formatTarget(target)

    expect(result).toContain('src/test.ts')
    expect(result).toContain('ΔQ')
    expect(result).toContain('1.500')
  })

  it('includes rank when provided', () => {
    const target = createTarget()
    const result = formatTarget(target, 1)

    expect(result).toContain('### 1. src/test.ts')
  })

  it('formats symbol info', () => {
    const target = createTarget({
      symbol: 'myFunction',
      startLine: 10,
      endLine: 25,
    })
    const result = formatTarget(target)

    expect(result).toContain('Symbol: myFunction')
    expect(result).toContain('lines 10-25')
  })

  it('formats coverage breakdown', () => {
    const target = createTarget({
      breakdown: {
        coverage: {
          uncoveredBranches: 5,
          uncoveredLines: 10,
          estimatedCoverageGain: 15.5,
        },
        typescript: undefined,
        eslint: undefined,
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('Coverage: 5 uncovered branches')
    expect(result).toContain('10 uncovered lines')
    expect(result).toContain('+15.5%')
  })

  it('formats typescript breakdown', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: {
          errorCount: 3,
          errorCodes: ['TS2345', 'TS2339', 'TS2322'],
        },
        eslint: undefined,
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('TypeScript: 3 errors')
    expect(result).toContain('TS2345')
  })

  it('formats eslint breakdown', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: undefined,
        eslint: {
          errorCount: 2,
          warningCount: 5,
          rules: ['no-unused-vars', 'no-console'],
        },
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('ESLint: 2 errors')
    expect(result).toContain('5 warnings')
  })

  it('formats sonarqube breakdown', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: undefined,
        eslint: undefined,
        sonarqube: {
          bugs: 2,
          vulnerabilities: 1,
          codeSmells: 5,
          rules: [],
        },
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('SonarQube: 2 bugs')
    expect(result).toContain('1 vulnerability')
    expect(result).toContain('5 code smells')
  })

  it('shows weighted deltaQ when different from total', () => {
    const target = createTarget({
      totalDeltaQ: 1.5,
      weightedDeltaQ: 2.0,
    })
    const result = formatTarget(target)

    expect(result).toContain('+1.500')
    expect(result).toContain('graph-weighted: +2.000')
  })

  it('shows multiple dimensions affected', () => {
    const target = createTarget({
      dimensionsAffected: ['coverage.unit.branches', 'typescript.errors', 'eslint.errors'],
    })
    const result = formatTarget(target)

    expect(result).toContain('Addresses 3 dimensions')
  })

  it('shows dependent count when available', () => {
    const target = createTarget({
      dependentCount: 5,
    })
    const result = formatTarget(target)

    expect(result).toContain('Dependents: 5 files depend on this module')
  })

  it('handles single typescript error correctly', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: {
          errorCount: 1,
          errorCodes: ['TS2345'],
        },
        eslint: undefined,
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('TypeScript: 1 error')
    expect(result).not.toContain('1 errors')
  })

  it('handles more than 3 typescript error codes', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: {
          errorCount: 5,
          errorCodes: ['TS2345', 'TS2339', 'TS2322', 'TS2416', 'TS7006'],
        },
        eslint: undefined,
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('+2 more')
  })

  it('handles single eslint error correctly', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: undefined,
        eslint: {
          errorCount: 1,
          warningCount: 0,
          rules: ['no-unused-vars'],
        },
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('ESLint: 1 error')
    expect(result).not.toContain('1 errors')
  })

  it('handles single eslint warning correctly', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: undefined,
        eslint: {
          errorCount: 0,
          warningCount: 1,
          rules: ['no-console'],
        },
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('ESLint: 1 warning')
    expect(result).not.toContain('1 warnings')
  })

  it('handles single sonarqube bug correctly', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: undefined,
        eslint: undefined,
        sonarqube: {
          bugs: 1,
          vulnerabilities: 0,
          codeSmells: 0,
          rules: [],
        },
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('SonarQube: 1 bug')
    expect(result).not.toContain('1 bugs')
  })

  it('handles single sonarqube vulnerability correctly', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: undefined,
        eslint: undefined,
        sonarqube: {
          bugs: 0,
          vulnerabilities: 1,
          codeSmells: 0,
          rules: [],
        },
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('1 vulnerability')
    expect(result).not.toContain('1 vulnerabilities')
  })

  it('handles single sonarqube code smell correctly', () => {
    const target = createTarget({
      breakdown: {
        coverage: undefined,
        typescript: undefined,
        eslint: undefined,
        sonarqube: {
          bugs: 0,
          vulnerabilities: 0,
          codeSmells: 1,
          rules: [],
        },
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('1 code smell')
    expect(result).not.toContain('1 code smells')
  })

  it('handles only branches uncovered (no lines)', () => {
    const target = createTarget({
      breakdown: {
        coverage: {
          uncoveredBranches: 5,
          uncoveredLines: 0,
          estimatedCoverageGain: 10.0,
        },
        typescript: undefined,
        eslint: undefined,
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).toContain('5 uncovered branches')
    expect(result).not.toContain('uncovered lines')
  })

  it('handles only lines uncovered (no branches)', () => {
    const target = createTarget({
      breakdown: {
        coverage: {
          uncoveredBranches: 0,
          uncoveredLines: 10,
          estimatedCoverageGain: 8.0,
        },
        typescript: undefined,
        eslint: undefined,
        sonarqube: undefined,
      },
    })
    const result = formatTarget(target)

    expect(result).not.toContain('uncovered branches')
    expect(result).toContain('10 uncovered lines')
  })

  it('does not show weighted deltaQ when same as total', () => {
    const target = createTarget({
      totalDeltaQ: 1.5,
      weightedDeltaQ: 1.5,
    })
    const result = formatTarget(target)

    expect(result).toContain('+1.500')
    expect(result).not.toContain('graph-weighted')
  })
})

describe('formatTargetList', () => {
  it('formats empty list', () => {
    const result = formatTargetList([])

    expect(result).toContain('No optimization targets found')
  })

  it('formats multiple targets', () => {
    const targets = [
      createTarget({ file: 'src/a.ts', totalDeltaQ: 2.0 }),
      createTarget({ file: 'src/b.ts', totalDeltaQ: 1.0 }),
    ]
    const result = formatTargetList(targets)

    expect(result).toContain('src/a.ts')
    expect(result).toContain('src/b.ts')
    expect(result).toContain('2 targets')
  })

  it('shows total potential deltaQ', () => {
    const targets = [
      createTarget({ totalDeltaQ: 2.0 }),
      createTarget({ totalDeltaQ: 1.5 }),
    ]
    const result = formatTargetList(targets)

    expect(result).toContain('potential ΔQ: +3.500')
  })

  it('uses custom title when provided', () => {
    const targets = [createTarget()]
    const result = formatTargetList(targets, { title: 'Custom Title' })

    expect(result).toContain('## Custom Title')
  })

  it('hides total when showTotal is false', () => {
    const targets = [createTarget()]
    const result = formatTargetList(targets, { showTotal: false })

    expect(result).not.toContain('Total:')
  })
})

describe('formatTargetSuggestion', () => {
  it('formats suggestion with rationale', () => {
    const suggestion: TargetSuggestion = {
      target: createTarget(),
      rank: 1,
      rationale: 'This file has the most uncovered branches',
      expectedGain: 1.5,
      dimensionBreakdown: [],
    }
    const result = formatTargetSuggestion(suggestion)

    expect(result).toContain('This file has the most uncovered branches')
    expect(result).toContain('Expected fitness gain: +1.500')
    expect(result).toContain('### 1.')
  })

  it('shows location when symbol has startLine', () => {
    const suggestion: TargetSuggestion = {
      target: createTarget({
        symbol: 'myFunction',
        file: 'src/utils.ts',
        startLine: 42,
      }),
      rank: 2,
      rationale: 'High impact fix',
      expectedGain: 2.0,
      dimensionBreakdown: [],
    }
    const result = formatTargetSuggestion(suggestion)

    expect(result).toContain('Location: src/utils.ts:42')
  })

  it('shows dimension breakdown', () => {
    const suggestion: TargetSuggestion = {
      target: createTarget(),
      rank: 1,
      rationale: 'Multiple issues',
      expectedGain: 3.0,
      dimensionBreakdown: [
        { dimension: 'coverage.unit.branches', displayName: 'Branch Coverage', expectedDelta: 15.5, deltaQ: 1.5 },
        { dimension: 'typescript.errors', displayName: 'TypeScript Errors', expectedDelta: -3, deltaQ: 0.8 },
      ],
    }
    const result = formatTargetSuggestion(suggestion)

    expect(result).toContain('Breakdown:')
    expect(result).toContain('Branch Coverage: +15.5')
    expect(result).toContain('TypeScript Errors: -3')
  })

  it('shows guidance when provided', () => {
    const suggestion: TargetSuggestion = {
      target: createTarget(),
      rank: 1,
      rationale: 'Fix this first',
      expectedGain: 1.0,
      dimensionBreakdown: [],
      guidance: 'Start by adding unit tests for the helper functions.',
    }
    const result = formatTargetSuggestion(suggestion)

    expect(result).toContain('Guidance: Start by adding unit tests')
  })

  it('uses file when no symbol', () => {
    const suggestion: TargetSuggestion = {
      target: createTarget({ symbol: undefined }),
      rank: 1,
      rationale: 'File-level issue',
      expectedGain: 0.5,
      dimensionBreakdown: [],
    }
    const result = formatTargetSuggestion(suggestion)

    expect(result).toContain('### 1. src/test.ts')
  })
})

describe('formatTargetsForJson', () => {
  it('returns JSON-serializable object', () => {
    const targets = [createTarget()]
    const result = formatTargetsForJson(targets)

    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it('includes all target properties', () => {
    const targets = [createTarget({ file: 'src/test.ts', totalDeltaQ: 1.5 })]
    const result = formatTargetsForJson(targets) as { targets: Array<{ file: string; expectedDeltaQ: number }> }

    expect(result.targets[0].file).toBe('src/test.ts')
    expect(result.targets[0].expectedDeltaQ).toBe(1.5)
  })

  it('indicates graph weighting when present', () => {
    const targets = [createTarget({ weightedDeltaQ: 2.0 })]
    const result = formatTargetsForJson(targets) as { graphWeightingEnabled: boolean; targets: Array<{ weightedDeltaQ: number }> }

    expect(result.graphWeightingEnabled).toBe(true)
    expect(result.targets[0].weightedDeltaQ).toBe(2.0)
  })

  it('includes lineRange when startLine and endLine present', () => {
    const targets = [createTarget({ startLine: 10, endLine: 50 })]
    const result = formatTargetsForJson(targets) as { targets: Array<{ lineRange: { start: number; end: number } }> }

    expect(result.targets[0].lineRange).toEqual({ start: 10, end: 50 })
  })

  it('includes centralityScore when present', () => {
    const targets = [createTarget({ centralityScore: 0.85 })]
    const result = formatTargetsForJson(targets) as { targets: Array<{ centralityScore: number }> }

    expect(result.targets[0].centralityScore).toBe(0.85)
  })

  it('calculates total potential gain', () => {
    const targets = [
      createTarget({ totalDeltaQ: 1.5 }),
      createTarget({ totalDeltaQ: 2.5 }),
    ]
    const result = formatTargetsForJson(targets) as { totalPotentialGain: number }

    expect(result.totalPotentialGain).toBe(4.0)
  })
})

describe('formatSymbolIssues', () => {
  it('formats symbol with issues', () => {
    const entry = createSymbolIssues()
    const result = formatSymbolIssues(entry)

    expect(result).toContain('testFunc')
    expect(result).toContain('src/test.ts')
    expect(result).toContain('ΔQ')
  })

  it('includes rank when provided', () => {
    const entry = createSymbolIssues()
    const result = formatSymbolIssues(entry, 1)

    expect(result).toContain('### 1.')
  })

  it('shows coverage gap', () => {
    const entry = createSymbolIssues({
      coverageGap: 0.5,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('Coverage gap: 50.0% uncovered branches')
  })

  it('shows issue density', () => {
    const entry = createSymbolIssues({
      issueDensity: 0.25,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('Issue density: 0.25')
  })

  it('shows typescript issues', () => {
    const entry = createSymbolIssues({
      issues: {
        typescript: [
          { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS2345', message: 'Type error' },
        ],
        eslint: [],
        sonarqube: [],
        coverage: [],
      },
      totalIssueCount: 1,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('TypeScript')
  })

  it('shows fixability score when available', () => {
    const entry = createSymbolIssues({
      fixabilityScore: 0.8,
      adjustedDeltaQ: 1.2,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('Fixability: 80%')
    expect(result).toContain('adjusted ΔQ: +1.200')
  })

  it('shows weighted deltaQ when different from total', () => {
    const entry = createSymbolIssues({
      totalDeltaQ: 1.5,
      weightedDeltaQ: 2.5,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('+1.500')
    expect(result).toContain('graph-weighted: +2.500')
  })

  it('shows dependent count when available', () => {
    const entry = createSymbolIssues({
      dependentCount: 10,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('Dependents: 10 files depend on this module')
  })

  it('shows callers count when available', () => {
    const entry = createSymbolIssues({
      callersCount: 5,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('Callers: 5 symbols call this')
  })

  it('shows callees count when available', () => {
    const entry = createSymbolIssues({
      calleesCount: 3,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('Callees: 3 symbols called')
  })

  it('shows coverage issues with branches and functions', () => {
    const entry = createSymbolIssues({
      issues: {
        typescript: [],
        eslint: [],
        sonarqube: [],
        coverage: [
          { file: 'test.ts', source: 'coverage', dimension: 'coverage.unit.branches', code: 'branch-if', message: 'Uncovered branch' },
          { file: 'test.ts', source: 'coverage', dimension: 'coverage.unit.branches', code: 'branch-switch', message: 'Uncovered branch' },
          { file: 'test.ts', source: 'coverage', dimension: 'coverage.unit.functions', code: 'uncovered-function', message: 'Uncovered function' },
        ],
      },
      totalIssueCount: 3,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('2 uncovered branches')
    expect(result).toContain('1 uncovered functions')
  })

  it('shows eslint errors and warnings', () => {
    const entry = createSymbolIssues({
      issues: {
        typescript: [],
        eslint: [
          { file: 'test.ts', source: 'eslint', dimension: 'eslint.errors', code: 'no-unused-vars', message: 'Error' },
          { file: 'test.ts', source: 'eslint', dimension: 'eslint.errors', code: 'no-undef', message: 'Error' },
          { file: 'test.ts', source: 'eslint', dimension: 'eslint.warnings', code: 'no-console', message: 'Warning' },
        ],
        sonarqube: [],
        coverage: [],
      },
      totalIssueCount: 3,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('ESLint: 2 errors, 1 warning')
  })

  it('shows sonarqube bugs, vulnerabilities, and smells', () => {
    const entry = createSymbolIssues({
      issues: {
        typescript: [],
        eslint: [],
        sonarqube: [
          { file: 'test.ts', source: 'sonarqube', dimension: 'sonarqube.bugs', code: 'S1234', message: 'Bug' },
          { file: 'test.ts', source: 'sonarqube', dimension: 'sonarqube.vulnerabilities', code: 'S5678', message: 'Vuln' },
          { file: 'test.ts', source: 'sonarqube', dimension: 'sonarqube.vulnerabilities', code: 'S5679', message: 'Vuln' },
          { file: 'test.ts', source: 'sonarqube', dimension: 'sonarqube.codeSmells', code: 'S9999', message: 'Smell' },
        ],
        coverage: [],
      },
      totalIssueCount: 4,
    })
    const result = formatSymbolIssues(entry)

    // Verify SonarQube output contains bug, vulnerability, and smell counts
    expect(result).toContain('SonarQube:')
    expect(result).toContain('1 bug')
    expect(result).toMatch(/2 vulnerabilit/) // handles "vulnerabilities" or potential typo
    expect(result).toContain('1 smell')
  })

  it('shows cross-cutting indicator when multiple axes have issues', () => {
    const entry = createSymbolIssues({
      issues: {
        typescript: [
          { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS2345', message: 'Error' },
        ],
        eslint: [
          { file: 'test.ts', source: 'eslint', dimension: 'eslint.errors', code: 'no-undef', message: 'Error' },
        ],
        sonarqube: [],
        coverage: [
          { file: 'test.ts', source: 'coverage', dimension: 'coverage.unit.branches', code: 'branch-if', message: 'Branch' },
        ],
      },
      totalIssueCount: 3,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('Cross-cutting: Issues from 3 axes')
  })

  it('handles more than 3 typescript error codes', () => {
    const entry = createSymbolIssues({
      issues: {
        typescript: [
          { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS2345', message: 'Error 1' },
          { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS2339', message: 'Error 2' },
          { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS2322', message: 'Error 3' },
          { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS7006', message: 'Error 4' },
          { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS2416', message: 'Error 5' },
        ],
        eslint: [],
        sonarqube: [],
        coverage: [],
      },
      totalIssueCount: 5,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('+2 more')
  })

  it('handles single eslint error correctly', () => {
    const entry = createSymbolIssues({
      issues: {
        typescript: [],
        eslint: [
          { file: 'test.ts', source: 'eslint', dimension: 'eslint.errors', code: 'no-undef', message: 'Error' },
        ],
        sonarqube: [],
        coverage: [],
      },
      totalIssueCount: 1,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('ESLint: 1 error')
    expect(result).not.toContain('1 errors')
  })

  it('handles single eslint warning correctly', () => {
    const entry = createSymbolIssues({
      issues: {
        typescript: [],
        eslint: [
          { file: 'test.ts', source: 'eslint', dimension: 'eslint.warnings', code: 'no-console', message: 'Warn' },
        ],
        sonarqube: [],
        coverage: [],
      },
      totalIssueCount: 1,
    })
    const result = formatSymbolIssues(entry)

    expect(result).toContain('ESLint: 1 warning')
    expect(result).not.toContain('1 warnings')
  })
})

describe('formatSymbolIssuesList', () => {
  it('formats empty list', () => {
    const result = formatSymbolIssuesList([])

    expect(result).toContain('No symbols')
  })

  it('formats multiple entries', () => {
    const entries = [
      createSymbolIssues({ symbol: createSymbol({ name: 'funcA', qualifiedName: 'funcA' }), totalDeltaQ: 2.0 }),
      createSymbolIssues({ symbol: createSymbol({ name: 'funcB', qualifiedName: 'funcB' }), totalDeltaQ: 1.0 }),
    ]
    const result = formatSymbolIssuesList(entries)

    expect(result).toContain('funcA')
    expect(result).toContain('funcB')
  })

  it('uses custom title when provided', () => {
    const entries = [createSymbolIssues()]
    const result = formatSymbolIssuesList(entries, { title: 'Custom Symbol List' })

    expect(result).toContain('## Custom Symbol List')
  })

  it('hides total when showTotal is false', () => {
    const entries = [createSymbolIssues()]
    const result = formatSymbolIssuesList(entries, { showTotal: false })

    expect(result).not.toContain('Total:')
    expect(result).not.toContain('Average density')
  })

  it('shows summary with totals', () => {
    const entries = [
      createSymbolIssues({ totalDeltaQ: 2.0, issueDensity: 0.2, totalIssueCount: 5 }),
      createSymbolIssues({ totalDeltaQ: 1.0, issueDensity: 0.4, totalIssueCount: 3 }),
    ]
    const result = formatSymbolIssuesList(entries)

    expect(result).toContain('Total: 2 symbols, 8 issues')
    expect(result).toContain('Average density: 0.300')
    expect(result).toContain('Potential ΔQ: +3.000')
  })
})

describe('formatSymbolIssuesForJson', () => {
  it('returns JSON-serializable object', () => {
    const entries = [createSymbolIssues()]
    const result = formatSymbolIssuesForJson(entries)

    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it('includes symbol info', () => {
    const entries = [createSymbolIssues()]
    const result = formatSymbolIssuesForJson(entries) as { symbols: Array<{ symbolId: string }> }

    expect(result.symbols[0].symbolId).toBe('src/test.ts::testFunc')
  })

  it('indicates graph weighting when present', () => {
    const entries = [createSymbolIssues({ weightedDeltaQ: 2.0 })]
    const result = formatSymbolIssuesForJson(entries) as { graphWeighted: boolean; totalWeightedGain: number }

    expect(result.graphWeighted).toBe(true)
    expect(result.totalWeightedGain).toBe(2.0)
  })

  it('includes all metrics in output', () => {
    const entries = [createSymbolIssues({
      centralityScore: 0.75,
      weightingSource: 'call-graph',
      callersCount: 5,
      calleesCount: 3,
      fixabilityScore: 0.8,
      adjustedDeltaQ: 1.2,
    })]
    const result = formatSymbolIssuesForJson(entries) as {
      symbols: Array<{
        metrics: {
          centralityScore: number;
          weightingSource: string;
          callersCount: number;
          calleesCount: number;
          fixabilityScore: number;
          adjustedDeltaQ: number;
        }
      }>
    }

    expect(result.symbols[0].metrics.centralityScore).toBe(0.75)
    expect(result.symbols[0].metrics.weightingSource).toBe('call-graph')
    expect(result.symbols[0].metrics.callersCount).toBe(5)
    expect(result.symbols[0].metrics.calleesCount).toBe(3)
    expect(result.symbols[0].metrics.fixabilityScore).toBe(0.8)
    expect(result.symbols[0].metrics.adjustedDeltaQ).toBe(1.2)
  })

  it('calculates average issue density', () => {
    const entries = [
      createSymbolIssues({ issueDensity: 0.2 }),
      createSymbolIssues({ issueDensity: 0.4 }),
    ]
    const result = formatSymbolIssuesForJson(entries) as { averageIssueDensity: number }

    // Rounded to 3 decimal places: (0.2 + 0.4) / 2 = 0.3
    expect(result.averageIssueDensity).toBeCloseTo(0.3, 3)
  })

  it('handles empty entries for average density', () => {
    const result = formatSymbolIssuesForJson([]) as { averageIssueDensity: number }

    expect(result.averageIssueDensity).toBe(0)
  })

  it('includes issue counts by category', () => {
    const entries = [createSymbolIssues({
      issues: {
        typescript: [{ file: 'a.ts', source: 'typescript', dimension: 'd', message: 'm' }],
        eslint: [{ file: 'a.ts', source: 'eslint', dimension: 'd', message: 'm' }, { file: 'a.ts', source: 'eslint', dimension: 'd', message: 'm' }],
        sonarqube: [],
        coverage: [{ file: 'a.ts', source: 'coverage', dimension: 'd', message: 'm' }],
      },
      totalIssueCount: 4,
    })]
    const result = formatSymbolIssuesForJson(entries) as {
      symbols: Array<{
        issueCounts: {
          coverage: number;
          typescript: number;
          eslint: number;
          sonarqube: number;
          total: number;
        }
      }>
    }

    expect(result.symbols[0].issueCounts.typescript).toBe(1)
    expect(result.symbols[0].issueCounts.eslint).toBe(2)
    expect(result.symbols[0].issueCounts.coverage).toBe(1)
    expect(result.symbols[0].issueCounts.sonarqube).toBe(0)
    expect(result.symbols[0].issueCounts.total).toBe(4)
  })
})
