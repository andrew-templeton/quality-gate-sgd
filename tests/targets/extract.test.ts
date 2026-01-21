import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import {
  extractCoverageIssues,
  extractTypescriptIssues,
  extractEslintIssues,
  extractSonarqubeIssues,
  extractLocatedIssues,
} from '../../src/targets/extract.js'
import type { SymbolTable, CodeSymbol } from '../../src/symbols/types.js'

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

// Mock child_process
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}))

// Mock config
vi.mock('../../src/config.js', () => ({
  getConfig: vi.fn(() => ({
    projectRoot: '/test/project',
    coverage: {
      unitDir: 'coverage',
      lambdaDir: 'coverage-lambda',
      summaryFile: 'coverage-summary.json',
    },
    sonarqube: {
      url: 'http://localhost:9000',
      projectKey: 'test-project',
    },
  })),
  getSonarAuthToken: vi.fn(() => 'test-token'),
}))

// Mock symbols/mapper
vi.mock('../../src/symbols/mapper.js', () => ({
  mapLocationToSymbol: vi.fn(),
}))

describe('extractCoverageIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no coverage files exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const issues = extractCoverageIssues()

    expect(issues).toEqual([])
  })

  it('extracts issues from coverage-final.json (Istanbul format)', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-final.json')
    )

    // Istanbul coverage format with branchMap and hit counts
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      '/test/project/src/file.ts': {
        path: '/test/project/src/file.ts',
        statementMap: { '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } } },
        fnMap: {},
        branchMap: {
          '0': {
            type: 'if',
            loc: { start: { line: 5, column: 2 }, end: { line: 5, column: 20 } },
            locations: [
              { start: { line: 5, column: 2 }, end: { line: 5, column: 10 } },
              { start: { line: 5, column: 12 }, end: { line: 5, column: 20 } },
            ],
          },
        },
        s: { '0': 1 },
        f: {},
        b: { '0': [1, 0] }, // First branch covered, second uncovered
      },
    }))

    const issues = extractCoverageIssues('/test/project/coverage')

    expect(issues.length).toBeGreaterThan(0)
    // Should create issues for uncovered branches
    expect(issues.some(i => i.source === 'coverage')).toBe(true)
  })

  it('skips test files in coverage', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.test.ts': {
        statements: { total: 100, covered: 80, pct: 80 },
        branches: { total: 20, covered: 10, pct: 50 },
        functions: { total: 10, covered: 8, pct: 80 },
        lines: { total: 100, covered: 85, pct: 85 },
      },
    }))

    const issues = extractCoverageIssues('/test/project/coverage')

    // Should skip test files
    expect(issues.every(i => !i.file.includes('.test.'))).toBe(true)
  })

  it('skips node_modules in coverage', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/node_modules/lib/index.ts': {
        statements: { total: 100, covered: 80, pct: 80 },
        branches: { total: 20, covered: 10, pct: 50 },
        functions: { total: 10, covered: 8, pct: 80 },
        lines: { total: 100, covered: 85, pct: 85 },
      },
    }))

    const issues = extractCoverageIssues('/test/project/coverage')

    expect(issues.every(i => !i.file.includes('node_modules'))).toBe(true)
  })

  it('extracts uncovered functions from coverage-final.json', () => {
    // Only return true for the first coverage-final.json path (unit coverage)
    let existsCallCount = 0
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      existsCallCount++
      // Only return true for the first coverage-final.json check (unit coverage)
      return String(p).includes('coverage-final.json') && existsCallCount === 1
    })

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      '/test/project/src/utils.ts': {
        path: '/test/project/src/utils.ts',
        statementMap: {},
        fnMap: {
          '0': {
            name: 'helperFunc',
            decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 15 } },
            loc: { start: { line: 1, column: 0 }, end: { line: 5, column: 1 } },
          },
          '1': {
            name: '', // anonymous function
            decl: { start: { line: 10, column: 0 }, end: { line: 10, column: 10 } },
            loc: { start: { line: 10, column: 0 }, end: { line: 15, column: 1 } },
          },
        },
        branchMap: {},
        s: {},
        f: { '0': 0, '1': 0 }, // both uncovered
        b: {},
      },
    }))

    const issues = extractCoverageIssues()

    // Should have 2 uncovered function issues
    const funcIssues = issues.filter(i => i.code === 'uncovered-function')
    expect(funcIssues.length).toBe(2)
    expect(funcIssues[0].symbol).toBe('helperFunc')
    expect(funcIssues[1].symbol).toContain('anonymous') // anonymous_1
  })

  it('handles malformed coverage-final.json gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-final.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json {{{')

    const issues = extractCoverageIssues()

    expect(issues).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Could not parse')
    )

    consoleSpy.mockRestore()
  })

  it('uses coverage-summary.json fallback when coverage-final.json has no issues', () => {
    // First call returns coverage-final.json path match, but the file has no uncovered items
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p)
      return pathStr.includes('coverage-final.json') || pathStr.includes('coverage-summary.json')
    })

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const pathStr = String(p)
      if (pathStr.includes('coverage-final.json')) {
        // Return coverage with all branches covered
        return JSON.stringify({
          '/test/project/src/file.ts': {
            path: '/test/project/src/file.ts',
            statementMap: {},
            fnMap: {},
            branchMap: {
              '0': {
                type: 'if',
                loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
                locations: [{ start: { line: 1, column: 0 }, end: { line: 1, column: 10 } }],
              },
            },
            s: {},
            f: {},
            b: { '0': [1] }, // branch covered
          },
        })
      }
      // Return coverage-summary.json with uncovered branches
      return JSON.stringify({
        total: { branches: { total: 10, covered: 5, pct: 50 } },
        '/test/project/src/other.ts': {
          statements: { total: 10, covered: 8, pct: 80 },
          branches: { total: 10, covered: 5, pct: 50 },
          functions: { total: 2, covered: 2, pct: 100 },
          lines: { total: 10, covered: 8, pct: 80 },
        },
      })
    })

    const issues = extractCoverageIssues()

    // Should fall back to summary and find branch issues
    expect(issues.some(i => i.file.includes('other.ts'))).toBe(true)
  })

  it('handles coverage with zero total branches/functions', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 0, covered: 0, pct: 100 } },
      '/test/project/src/empty.ts': {
        statements: { total: 0, covered: 0, pct: 100 },
        branches: { total: 0, covered: 0, pct: 100 },
        functions: { total: 0, covered: 0, pct: 100 },
        lines: { total: 0, covered: 0, pct: 100 },
      },
    }))

    const issues = extractCoverageIssues()

    // Should not create issues for files with no branches/functions
    expect(issues).toEqual([])
  })

  it('skips spec files in coverage', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.spec.ts': {
        statements: { total: 100, covered: 80, pct: 80 },
        branches: { total: 20, covered: 10, pct: 50 },
        functions: { total: 10, covered: 8, pct: 80 },
        lines: { total: 100, covered: 85, pct: 85 },
      },
    }))

    const issues = extractCoverageIssues()

    expect(issues.every(i => !i.file.includes('.spec.'))).toBe(true)
  })

  it('calculates correct impact for uncovered branches', () => {
    // Only return true for the first coverage-final.json path (unit coverage)
    let existsCallCount = 0
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      existsCallCount++
      // Only return true for the first coverage-final.json check (unit coverage)
      return String(p).includes('coverage-final.json') && existsCallCount === 1
    })

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      '/test/project/src/file.ts': {
        path: '/test/project/src/file.ts',
        statementMap: {},
        fnMap: {},
        branchMap: {
          '0': {
            type: 'if',
            loc: { start: { line: 5, column: 0 }, end: { line: 5, column: 20 } },
            locations: [
              { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } },
              { start: { line: 5, column: 12 }, end: { line: 5, column: 20 } },
            ],
          },
          '1': {
            type: 'cond-expr',
            loc: { start: { line: 10, column: 0 }, end: { line: 10, column: 30 } },
            locations: [
              { start: { line: 10, column: 0 }, end: { line: 10, column: 15 } },
              { start: { line: 10, column: 17 }, end: { line: 10, column: 30 } },
            ],
          },
        },
        s: {},
        f: {},
        b: {
          '0': [1, 0], // first covered, second uncovered
          '1': [0, 0], // both uncovered
        },
      },
    }))

    const issues = extractCoverageIssues()

    // Should have 3 uncovered branch issues (1 from branch 0, 2 from branch 1)
    const branchIssues = issues.filter(i => i.code?.startsWith('branch-'))
    expect(branchIssues.length).toBe(3)

    // Each branch should have impact = 100 / total_branches = 100 / 4 = 25%
    // So delta should be 0.25
    expect(branchIssues[0].impact?.delta).toBe(0.25)
  })
})

describe('extractTypescriptIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when type-check passes', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractTypescriptIssues()

    expect(issues).toEqual([])
  })

  it('parses TypeScript errors into issues', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: `src/file.ts(10,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/file.ts(20,3): error TS2339: Property 'foo' does not exist on type 'Bar'.`,
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractTypescriptIssues()

    expect(issues.length).toBe(2)
    expect(issues[0].file).toContain('src/file.ts')
    expect(issues[0].line).toBe(10)
    expect(issues[0].column).toBe(5)
    expect(issues[0].source).toBe('typescript')
    expect(issues[0].code).toBe('TS2345')
  })
})

describe('extractEslintIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when eslint passes', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractEslintIssues()

    expect(issues).toEqual([])
  })

  it('parses ESLint JSON output into issues', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: JSON.stringify([
        {
          filePath: '/test/project/src/file.ts',
          errorCount: 1,
          warningCount: 1,
          messages: [
            {
              ruleId: 'no-unused-vars',
              severity: 2,
              message: 'Variable x is defined but never used',
              line: 10,
              column: 5,
            },
            {
              ruleId: 'no-console',
              severity: 1,
              message: 'Unexpected console statement',
              line: 15,
              column: 1,
            },
          ],
        },
      ]),
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractEslintIssues()

    expect(issues.length).toBe(2)
    expect(issues[0].source).toBe('eslint')
    expect(issues[0].code).toBe('no-unused-vars')
    // ESLint errors map to eslint.errors dimension
    expect(issues[0].dimension).toBe('eslint.errors')
    expect(issues[1].dimension).toBe('eslint.warnings')
  })

  it('handles invalid JSON output gracefully', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: 'not valid json',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractEslintIssues()

    expect(issues).toEqual([])
  })
})

describe('extractSonarqubeIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no token configured', async () => {
    const { getSonarAuthToken } = await import('../../src/config.js')
    vi.mocked(getSonarAuthToken).mockReturnValue(undefined)

    const issues = extractSonarqubeIssues()

    expect(issues).toEqual([])
  })

  it('extracts SonarQube issues with correct severity mapping', async () => {
    const { spawnSync } = await import('child_process')
    const { getSonarAuthToken } = await import('../../src/config.js')
    vi.mocked(getSonarAuthToken).mockReturnValue('test-token')

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({
        total: 3,
        issues: [
          {
            key: 'issue1',
            component: 'test-project:src/file.ts',
            line: 10,
            message: 'Bug found',
            severity: 'BLOCKER',
            type: 'BUG',
            rule: 'typescript:S1234',
          },
          {
            key: 'issue2',
            component: 'test-project:src/file.ts',
            line: 20,
            message: 'Vulnerability found',
            severity: 'CRITICAL',
            type: 'VULNERABILITY',
            rule: 'typescript:S5678',
          },
          {
            key: 'issue3',
            component: 'test-project:src/file.ts',
            line: 30,
            message: 'Code smell',
            severity: 'MINOR',
            type: 'CODE_SMELL',
            rule: 'typescript:S9999',
          },
        ],
      }),
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractSonarqubeIssues()

    expect(issues.length).toBe(3)
    expect(issues[0].severity).toBe('blocker')
    expect(issues[0].dimension).toBe('sonarqube.bugs')
    expect(issues[1].severity).toBe('critical')
    expect(issues[1].dimension).toBe('sonarqube.vulnerabilities')
    expect(issues[2].severity).toBe('minor')
    expect(issues[2].dimension).toBe('sonarqube.codeSmells')
  })

  it('handles MAJOR and INFO severity levels', async () => {
    const { spawnSync } = await import('child_process')
    const { getSonarAuthToken } = await import('../../src/config.js')
    vi.mocked(getSonarAuthToken).mockReturnValue('test-token')

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({
        total: 2,
        issues: [
          {
            key: 'issue1',
            component: 'test-project:src/file.ts',
            line: 10,
            message: 'Major issue',
            severity: 'MAJOR',
            type: 'CODE_SMELL',
            rule: 'typescript:S1234',
          },
          {
            key: 'issue2',
            component: 'test-project:src/file.ts',
            line: 20,
            message: 'Info level',
            severity: 'INFO',
            type: 'CODE_SMELL',
            rule: 'typescript:S5678',
          },
        ],
      }),
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractSonarqubeIssues()

    expect(issues[0].severity).toBe('major')
    expect(issues[1].severity).toBe('info')
  })

  it('paginates through multiple pages of issues', async () => {
    const { spawnSync } = await import('child_process')
    const { getSonarAuthToken } = await import('../../src/config.js')
    vi.mocked(getSonarAuthToken).mockReturnValue('test-token')

    let callCount = 0
    vi.mocked(spawnSync).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First page - returns 500 issues (full page)
        return {
          status: 0,
          stdout: JSON.stringify({
            total: 600,
            issues: Array(500).fill(null).map((_, i) => ({
              key: `issue${i}`,
              component: 'test-project:src/file.ts',
              line: i,
              message: `Issue ${i}`,
              severity: 'MINOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            })),
          }),
          stderr: '',
          pid: 123,
          signal: null,
          output: [],
        }
      }
      // Second page - returns 100 issues (partial page, signals end)
      return {
        status: 0,
        stdout: JSON.stringify({
          total: 600,
          issues: Array(100).fill(null).map((_, i) => ({
            key: `issue${500 + i}`,
            component: 'test-project:src/file.ts',
            line: 500 + i,
            message: `Issue ${500 + i}`,
            severity: 'MINOR',
            type: 'CODE_SMELL',
            rule: 'typescript:S1234',
          })),
        }),
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      }
    })

    const issues = extractSonarqubeIssues()

    expect(issues.length).toBe(600)
    expect(callCount).toBe(2) // Should have made 2 API calls
  })

  it('handles curl failure gracefully', async () => {
    const { spawnSync } = await import('child_process')
    const { getSonarAuthToken } = await import('../../src/config.js')
    vi.mocked(getSonarAuthToken).mockReturnValue('test-token')

    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'Connection refused',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractSonarqubeIssues()

    expect(issues).toEqual([])
  })

  it('handles invalid JSON response gracefully', async () => {
    const { spawnSync } = await import('child_process')
    const { getSonarAuthToken } = await import('../../src/config.js')
    vi.mocked(getSonarAuthToken).mockReturnValue('test-token')

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'not valid json',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractSonarqubeIssues()

    expect(issues).toEqual([])
  })

  it('handles unknown issue type as code smell', async () => {
    const { spawnSync } = await import('child_process')
    const { getSonarAuthToken } = await import('../../src/config.js')
    vi.mocked(getSonarAuthToken).mockReturnValue('test-token')

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({
        total: 1,
        issues: [
          {
            key: 'issue1',
            component: 'test-project:src/file.ts',
            line: 10,
            message: 'Unknown type issue',
            severity: 'MINOR',
            type: 'UNKNOWN_TYPE',
            rule: 'typescript:S1234',
          },
        ],
      }),
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const issues = extractSonarqubeIssues()

    expect(issues[0].dimension).toBe('sonarqube.codeSmells')
  })

  it('respects safety limit of 10 pages', async () => {
    const { spawnSync } = await import('child_process')
    const { getSonarAuthToken } = await import('../../src/config.js')
    vi.mocked(getSonarAuthToken).mockReturnValue('test-token')

    let callCount = 0
    vi.mocked(spawnSync).mockImplementation(() => {
      callCount++
      // Always return full page to trigger pagination
      return {
        status: 0,
        stdout: JSON.stringify({
          total: 10000, // Large total
          issues: Array(500).fill(null).map((_, i) => ({
            key: `issue${(callCount - 1) * 500 + i}`,
            component: 'test-project:src/file.ts',
            line: i,
            message: `Issue`,
            severity: 'MINOR',
            type: 'CODE_SMELL',
            rule: 'typescript:S1234',
          })),
        }),
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      }
    })

    const issues = extractSonarqubeIssues()

    // Should stop at 10 pages even though more exist
    expect(callCount).toBe(10)
    expect(issues.length).toBe(5000) // 10 pages * 500 issues
  })
})

describe('extractLocatedIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('combines issues from all sources', async () => {
    const { spawnSync } = await import('child_process')

    // Mock coverage exists
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.ts': {
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 1, pct: 50 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    // Mock type-check
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (String(args).includes('type-check')) {
        return {
          status: 1,
          stdout: `src/file.ts(10,5): error TS2345: Type error.`,
          stderr: '',
          pid: 123,
          signal: null,
          output: [],
        }
      }
      // ESLint
      return {
        status: 0,
        stdout: '[]',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      }
    })

    const result = extractLocatedIssues()

    expect(result.totalCount).toBeGreaterThan(0)
    // Should have coverage issues
    expect(result.coverage.length).toBeGreaterThan(0)
    // Should have typescript issue
    expect(result.typescript.length).toBe(1)
  })

  it('tracks counts per source', async () => {
    const { spawnSync } = await import('child_process')

    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractLocatedIssues()

    expect(result).toHaveProperty('coverage')
    expect(result).toHaveProperty('typescript')
    expect(result).toHaveProperty('eslint')
    expect(result).toHaveProperty('sonarqube')
    expect(result).toHaveProperty('totalCount')
  })

  it('respects skipSonarQube option', async () => {
    const { spawnSync, execSync } = await import('child_process')

    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    extractLocatedIssues({ skipSonarQube: true })

    // execSync should not be called for SonarQube
    expect(execSync).not.toHaveBeenCalled()
  })

  it('respects skipTypescript option', async () => {
    const { spawnSync } = await import('child_process')

    vi.mocked(fs.existsSync).mockReturnValue(false)
    // Track calls to spawnSync
    const calls: string[][] = []
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      calls.push([String(cmd), ...(args || []).map(String)])
      return {
        status: 0,
        stdout: '[]',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      }
    })

    extractLocatedIssues({ skipTypescript: true })

    // Should not have called type-check
    expect(calls.some(c => c.includes('type-check'))).toBe(false)
  })

  it('respects skipEslint option', async () => {
    const { spawnSync } = await import('child_process')

    vi.mocked(fs.existsSync).mockReturnValue(false)
    const calls: string[][] = []
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      calls.push([String(cmd), ...(args || []).map(String)])
      return {
        status: 0,
        stdout: '[]',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      }
    })

    extractLocatedIssues({ skipEslint: true })

    // Should not have called eslint
    expect(calls.some(c => c.includes('eslint'))).toBe(false)
  })

  it('enriches issues with symbol information when symbolTable provided', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (String(args).includes('type-check')) {
        return {
          status: 1,
          stdout: `src/file.ts(10,5): error TS2345: Type error.`,
          stderr: '',
          pid: 123,
          signal: null,
          output: [],
        }
      }
      return {
        status: 0,
        stdout: '[]',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      }
    })

    // Mock mapLocationToSymbol to return a symbol
    vi.mocked(mapLocationToSymbol).mockReturnValue({
      id: 'src/file.ts::myFunction',
      file: 'src/file.ts',
      name: 'myFunction',
      qualifiedName: 'myFunction',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 20, endColumn: 1 },
      sloc: 20,
    })

    // Create a minimal symbol table
    const symbolTable: SymbolTable = {
      symbols: new Map(),
      byFile: new Map(),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({ symbolTable })

    // Should have called mapLocationToSymbol for the typescript issue
    expect(mapLocationToSymbol).toHaveBeenCalled()

    // The issue should have symbol info
    expect(result.typescript[0].symbolId).toBe('src/file.ts::myFunction')
  })

  it('returns summary with correct counts', async () => {
    const { spawnSync } = await import('child_process')

    // Only return true for the first coverage-summary.json path (unit coverage)
    let existsCallCount = 0
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p)
      if (pathStr.includes('coverage-summary.json')) {
        existsCallCount++
        // Only return true for the first coverage-summary.json check (unit coverage)
        return existsCallCount === 1
      }
      return false
    })
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.ts': {
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 1, pct: 50 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (String(args).includes('type-check')) {
        return {
          status: 1,
          stdout: `src/a.ts(1,1): error TS2345: Error 1.
src/b.ts(2,2): error TS2345: Error 2.`,
          stderr: '',
          pid: 123,
          signal: null,
          output: [],
        }
      }
      if (String(args).includes('eslint')) {
        return {
          status: 1,
          stdout: JSON.stringify([{
            filePath: '/test/src/file.ts',
            errorCount: 1,
            warningCount: 0,
            messages: [{ ruleId: 'no-unused-vars', severity: 2, message: 'Unused', line: 1, column: 1 }],
          }]),
          stderr: '',
          pid: 123,
          signal: null,
          output: [],
        }
      }
      return {
        status: 0,
        stdout: '[]',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      }
    })

    const result = extractLocatedIssues({ skipSonarQube: true })

    expect(result.summary.coverage).toBe(2) // branches + functions
    expect(result.summary.typescript).toBe(2)
    expect(result.summary.eslint).toBe(1)
    expect(result.summary.sonarqube).toBe(0)
    expect(result.totalCount).toBe(5)
  })

  it('handles file-level issues without line numbers for symbol enrichment', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    // Set up coverage-summary which creates file-level issues (no line numbers)
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.ts': {
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    // mapLocationToSymbol shouldn't be called for file-level issues
    vi.mocked(mapLocationToSymbol).mockReturnValue(null)

    // Create a symbol table with a symbol in the file
    const fileSymbol: CodeSymbol = {
      id: '/test/project/src/file.ts::main',
      file: '/test/project/src/file.ts',
      name: 'main',
      qualifiedName: 'main',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 50, endColumn: 1 },
      sloc: 50,
    }

    const symbolTable: SymbolTable = {
      symbols: new Map([[fileSymbol.id, fileSymbol]]),
      byFile: new Map([['/test/project/src/file.ts', [fileSymbol]]]),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // File-level coverage issues should be enriched with primary symbol
    expect(result.coverage.length).toBeGreaterThan(0)
    expect(result.coverage[0].symbolId).toBe('/test/project/src/file.ts::main')
  })

  it('handles file-level issues with path suffix matching', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    // Coverage-summary with a different path format than symbol table
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      'src/file.ts': { // Relative path in coverage
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    vi.mocked(mapLocationToSymbol).mockReturnValue(null)

    // Symbol table has absolute path
    const fileSymbol: CodeSymbol = {
      id: '/test/project/src/file.ts::main',
      file: '/test/project/src/file.ts', // Absolute path
      name: 'main',
      qualifiedName: 'main',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 50, endColumn: 1 },
      sloc: 50,
    }

    const symbolTable: SymbolTable = {
      symbols: new Map([[fileSymbol.id, fileSymbol]]),
      byFile: new Map([['/test/project/src/file.ts', [fileSymbol]]]),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // Should match via suffix matching (file.ts ends with src/file.ts)
    expect(result.coverage.length).toBeGreaterThan(0)
    expect(result.coverage[0].symbolId).toBe('/test/project/src/file.ts::main')
  })

  it('selects largest top-level symbol as primary for file', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.ts': {
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    vi.mocked(mapLocationToSymbol).mockReturnValue(null)

    // Create symbol table with multiple symbols - one large, one small
    const smallSymbol: CodeSymbol = {
      id: '/test/project/src/file.ts::helper',
      file: '/test/project/src/file.ts',
      name: 'helper',
      qualifiedName: 'helper',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
      sloc: 5, // Small
    }

    const largeSymbol: CodeSymbol = {
      id: '/test/project/src/file.ts::main',
      file: '/test/project/src/file.ts',
      name: 'main',
      qualifiedName: 'main',
      kind: 'function',
      exported: true,
      span: { startLine: 10, startColumn: 0, endLine: 100, endColumn: 1 },
      sloc: 90, // Large
    }

    const symbolTable: SymbolTable = {
      symbols: new Map([
        [smallSymbol.id, smallSymbol],
        [largeSymbol.id, largeSymbol],
      ]),
      byFile: new Map([['/test/project/src/file.ts', [smallSymbol, largeSymbol]]]),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // Should select the largest symbol as primary
    expect(result.coverage[0].symbolId).toBe('/test/project/src/file.ts::main')
  })

  it('handles nested symbols - selects largest top-level', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.ts': {
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    vi.mocked(mapLocationToSymbol).mockReturnValue(null)

    // Create class with nested method
    const classSymbol: CodeSymbol = {
      id: '/test/project/src/file.ts::MyClass',
      file: '/test/project/src/file.ts',
      name: 'MyClass',
      qualifiedName: 'MyClass',
      kind: 'class',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 50, endColumn: 1 },
      sloc: 50,
    }

    const methodSymbol: CodeSymbol = {
      id: '/test/project/src/file.ts::MyClass.method',
      file: '/test/project/src/file.ts',
      name: 'method',
      qualifiedName: 'MyClass.method',
      kind: 'method',
      exported: false,
      parent: classSymbol.id, // Has parent
      span: { startLine: 10, startColumn: 2, endLine: 20, endColumn: 3 },
      sloc: 10,
    }

    const symbolTable: SymbolTable = {
      symbols: new Map([
        [classSymbol.id, classSymbol],
        [methodSymbol.id, methodSymbol],
      ]),
      byFile: new Map([['/test/project/src/file.ts', [classSymbol, methodSymbol]]]),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // Should select the top-level class, not the nested method
    expect(result.coverage[0].symbolId).toBe('/test/project/src/file.ts::MyClass')
  })

  it('handles file with no symbols - returns undefined', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/unknown.ts': {
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    vi.mocked(mapLocationToSymbol).mockReturnValue(null)

    // Empty symbol table
    const symbolTable: SymbolTable = {
      symbols: new Map(),
      byFile: new Map(),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // Should have coverage issues but no symbol
    expect(result.coverage.length).toBeGreaterThan(0)
    expect(result.coverage[0].symbolId).toBeUndefined()
  })

  it('caches primary symbol lookups per file', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    // Coverage-summary with multiple issues from the same file
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.ts': {
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 1, pct: 50 }, // Also uncovered functions
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    vi.mocked(mapLocationToSymbol).mockReturnValue(null)

    const fileSymbol: CodeSymbol = {
      id: '/test/project/src/file.ts::main',
      file: '/test/project/src/file.ts',
      name: 'main',
      qualifiedName: 'main',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 50, endColumn: 1 },
      sloc: 50,
    }

    const symbolTable: SymbolTable = {
      symbols: new Map([[fileSymbol.id, fileSymbol]]),
      byFile: new Map([['/test/project/src/file.ts', [fileSymbol]]]),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // Should have multiple coverage issues all with the same symbol
    // (branches + functions from both unit and lambda coverage if both are checked)
    expect(result.coverage.length).toBeGreaterThanOrEqual(2)
    // All issues from this file should have the same cached symbol
    const fileIssues = result.coverage.filter(i => i.file === '/test/project/src/file.ts')
    expect(fileIssues.length).toBeGreaterThanOrEqual(2)
    expect(fileIssues.every(i => i.symbolId === '/test/project/src/file.ts::main')).toBe(true)
  })

  it('handles path matching via includes for partial paths', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    // Coverage has a path that doesn't end with the table path, but includes it
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/different/root/src/file.ts': { // Different root
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    vi.mocked(mapLocationToSymbol).mockReturnValue(null)

    // Symbol table has path that shares common substring
    const fileSymbol: CodeSymbol = {
      id: 'src/file.ts::main',
      file: 'src/file.ts', // Relative path that is included in coverage path
      name: 'main',
      qualifiedName: 'main',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 50, endColumn: 1 },
      sloc: 50,
    }

    const symbolTable: SymbolTable = {
      symbols: new Map([[fileSymbol.id, fileSymbol]]),
      byFile: new Map([['src/file.ts', [fileSymbol]]]),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // Should match via includes
    expect(result.coverage.length).toBeGreaterThan(0)
    expect(result.coverage[0].symbolId).toBe('src/file.ts::main')
  })

  it('falls back to largest symbol when no top-level symbols exist', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('coverage-summary.json')
    )
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      total: { branches: { total: 10, covered: 5, pct: 50 } },
      '/test/project/src/file.ts': {
        statements: { total: 10, covered: 8, pct: 80 },
        branches: { total: 4, covered: 2, pct: 50 },
        functions: { total: 2, covered: 2, pct: 100 },
        lines: { total: 10, covered: 8, pct: 80 },
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    vi.mocked(mapLocationToSymbol).mockReturnValue(null)

    // All symbols have parents (no top-level)
    const parentId = '/test/project/src/file.ts::Parent'
    const smallNested: CodeSymbol = {
      id: '/test/project/src/file.ts::small',
      file: '/test/project/src/file.ts',
      name: 'small',
      qualifiedName: 'Parent.small',
      kind: 'method',
      exported: false,
      parent: parentId,
      span: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
      sloc: 5,
    }

    const largeNested: CodeSymbol = {
      id: '/test/project/src/file.ts::large',
      file: '/test/project/src/file.ts',
      name: 'large',
      qualifiedName: 'Parent.large',
      kind: 'method',
      exported: false,
      parent: parentId,
      span: { startLine: 10, startColumn: 0, endLine: 50, endColumn: 1 },
      sloc: 40,
    }

    const symbolTable: SymbolTable = {
      symbols: new Map([
        [smallNested.id, smallNested],
        [largeNested.id, largeNested],
      ]),
      byFile: new Map([['/test/project/src/file.ts', [smallNested, largeNested]]]),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // Should fall back to the largest nested symbol
    expect(result.coverage[0].symbolId).toBe('/test/project/src/file.ts::large')
  })

  it('preserves existing symbol name on issue when enriching', async () => {
    const { spawnSync } = await import('child_process')
    const { mapLocationToSymbol } = await import('../../src/symbols/mapper.js')

    // Coverage-final with function name already set
    let existsCallCount = 0
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      existsCallCount++
      return String(p).includes('coverage-final.json') && existsCallCount === 1
    })

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      '/test/project/src/file.ts': {
        path: '/test/project/src/file.ts',
        statementMap: {},
        fnMap: {
          '0': {
            name: 'existingFunctionName',
            decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 15 } },
            loc: { start: { line: 1, column: 0 }, end: { line: 5, column: 1 } },
          },
        },
        branchMap: {},
        s: {},
        f: { '0': 0 },
        b: {},
      },
    }))

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const fileSymbol: CodeSymbol = {
      id: '/test/project/src/file.ts::existingFunctionName',
      file: '/test/project/src/file.ts',
      name: 'existingFunctionName',
      qualifiedName: 'existingFunctionName',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
      sloc: 5,
    }

    vi.mocked(mapLocationToSymbol).mockReturnValue(fileSymbol)

    const symbolTable: SymbolTable = {
      symbols: new Map([[fileSymbol.id, fileSymbol]]),
      byFile: new Map([['/test/project/src/file.ts', [fileSymbol]]]),
      lineIndex: new Map(),
    }

    const result = extractLocatedIssues({
      symbolTable,
      skipTypescript: true,
      skipEslint: true,
      skipSonarQube: true,
    })

    // Should preserve the existing symbol name from the issue
    expect(result.coverage[0].symbol).toBe('existingFunctionName')
    expect(result.coverage[0].symbolId).toBe('/test/project/src/file.ts::existingFunctionName')
  })
})
