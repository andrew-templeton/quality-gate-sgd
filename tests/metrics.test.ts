import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import {
  extractAllCoverageMetrics,
  extractCoverageMetrics,
  extractSloc,
  runScript,
  runScripts,
  extractTypescriptMetrics,
  extractEslintMetrics,
  extractSonarqubeMetrics,
  isSonarqubeAvailable,
  getTopSonarIssues,
  runSonarqubeScan,
  extractAllMetrics,
  extractAllMetricsAsync,
} from '../src/metrics.js'

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  }
})

// Mock child_process
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}))

// Mock config
vi.mock('../src/config.js', () => ({
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
    defaultScriptTimeout: 60000,
    scriptTimeouts: {},
  })),
  getSonarCurlAuth: vi.fn(() => ''),
}))

describe('Coverage Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('extractAllCoverageMetrics', () => {
    it('returns empty coverage when no files exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = extractAllCoverageMetrics()

      expect(result.unit).toBeUndefined()
      expect(result.lambda).toBeUndefined()
      expect(result.union).toBeUndefined()
    })

    it('extracts unit coverage when file exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('coverage/coverage-summary.json')
      })

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        total: {
          statements: { total: 100, covered: 80, pct: 80 },
          branches: { total: 50, covered: 40, pct: 80 },
          functions: { total: 20, covered: 15, pct: 75 },
          lines: { total: 100, covered: 85, pct: 85 },
        },
        '/test/file.ts': {
          statements: { total: 100, covered: 80, pct: 80 },
          branches: { total: 50, covered: 40, pct: 80 },
          functions: { total: 20, covered: 15, pct: 75 },
          lines: { total: 100, covered: 85, pct: 85 },
        },
      }))

      const result = extractAllCoverageMetrics()

      expect(result.unit).toBeDefined()
      expect(result.unit?.branches).toBe(80)
      expect(result.unit?.statements).toBe(80)
    })

    it('merges overlapping coverage from unit and lambda tests', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('coverage-lambda')) {
          return JSON.stringify({
            total: {
              statements: { total: 100, covered: 60, pct: 60 },
              branches: { total: 50, covered: 30, pct: 60 },
              functions: { total: 20, covered: 10, pct: 50 },
              lines: { total: 100, covered: 60, pct: 60 },
            },
            '/test/file.ts': {
              statements: { total: 100, covered: 60, pct: 60 },
              branches: { total: 50, covered: 30, pct: 60 },
              functions: { total: 20, covered: 10, pct: 50 },
              lines: { total: 100, covered: 60, pct: 60 },
            },
          })
        }
        return JSON.stringify({
          total: {
            statements: { total: 100, covered: 80, pct: 80 },
            branches: { total: 50, covered: 40, pct: 80 },
            functions: { total: 20, covered: 15, pct: 75 },
            lines: { total: 100, covered: 85, pct: 85 },
          },
          '/test/file.ts': {
            statements: { total: 100, covered: 80, pct: 80 },
            branches: { total: 50, covered: 40, pct: 80 },
            functions: { total: 20, covered: 15, pct: 75 },
            lines: { total: 100, covered: 85, pct: 85 },
          },
        })
      })

      const result = extractAllCoverageMetrics()

      // Union should take max of overlapping files
      expect(result.union).toBeDefined()
      expect(result.union?.branches).toBe(80) // max of 80 and 60
      expect(result.union?.statements).toBe(80)
    })

    it('handles invalid JSON gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      const result = extractAllCoverageMetrics()

      expect(result.unit).toBeUndefined()
      expect(result.lambda).toBeUndefined()
    })

    it('merges non-overlapping files from unit and lambda', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('coverage-lambda')) {
          return JSON.stringify({
            total: {
              statements: { total: 50, covered: 40, pct: 80 },
              branches: { total: 25, covered: 20, pct: 80 },
              functions: { total: 10, covered: 8, pct: 80 },
              lines: { total: 50, covered: 40, pct: 80 },
            },
            '/test/lambda-file.ts': {
              statements: { total: 50, covered: 40, pct: 80 },
              branches: { total: 25, covered: 20, pct: 80 },
              functions: { total: 10, covered: 8, pct: 80 },
              lines: { total: 50, covered: 40, pct: 80 },
            },
          })
        }
        return JSON.stringify({
          total: {
            statements: { total: 50, covered: 30, pct: 60 },
            branches: { total: 25, covered: 15, pct: 60 },
            functions: { total: 10, covered: 6, pct: 60 },
            lines: { total: 50, covered: 30, pct: 60 },
          },
          '/test/unit-file.ts': {
            statements: { total: 50, covered: 30, pct: 60 },
            branches: { total: 25, covered: 15, pct: 60 },
            functions: { total: 10, covered: 6, pct: 60 },
            lines: { total: 50, covered: 30, pct: 60 },
          },
        })
      })

      const result = extractAllCoverageMetrics()

      // Union should combine both files: 70/100 statements = 70%
      expect(result.union).toBeDefined()
      expect(result.union?.statements).toBe(70) // (40 + 30) / 100 * 100
      expect(result.union?.branches).toBe(70)   // (20 + 15) / 50 * 100
    })

    it('extracts lambda coverage independently', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('coverage-lambda')
      })

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        total: {
          statements: { total: 100, covered: 70, pct: 70 },
          branches: { total: 50, covered: 35, pct: 70 },
          functions: { total: 20, covered: 14, pct: 70 },
          lines: { total: 100, covered: 70, pct: 70 },
        },
        '/test/file.ts': {
          statements: { total: 100, covered: 70, pct: 70 },
          branches: { total: 50, covered: 35, pct: 70 },
          functions: { total: 20, covered: 14, pct: 70 },
          lines: { total: 100, covered: 70, pct: 70 },
        },
      }))

      const result = extractAllCoverageMetrics()

      expect(result.lambda).toBeDefined()
      expect(result.lambda?.branches).toBe(70)
      expect(result.unit).toBeUndefined()
    })

    it('handles coverage data with null entries', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        total: {
          statements: { total: 100, covered: 80, pct: 80 },
          branches: { total: 50, covered: 40, pct: 80 },
          functions: { total: 20, covered: 15, pct: 75 },
          lines: { total: 100, covered: 85, pct: 85 },
        },
        '/test/file.ts': null,
        '/test/other.ts': {
          statements: { total: 100, covered: 80, pct: 80 },
          branches: { total: 50, covered: 40, pct: 80 },
          functions: { total: 20, covered: 15, pct: 75 },
          lines: { total: 100, covered: 85, pct: 85 },
        },
      }))

      const result = extractAllCoverageMetrics()

      // Should skip null entries
      expect(result.union).toBeDefined()
    })

    it('calculates percentages correctly with zero totals', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        total: {
          statements: { total: 0, covered: 0, pct: 0 },
          branches: { total: 0, covered: 0, pct: 0 },
          functions: { total: 0, covered: 0, pct: 0 },
          lines: { total: 0, covered: 0, pct: 0 },
        },
        '/test/empty.ts': {
          statements: { total: 0, covered: 0, pct: 0 },
          branches: { total: 0, covered: 0, pct: 0 },
          functions: { total: 0, covered: 0, pct: 0 },
          lines: { total: 0, covered: 0, pct: 0 },
        },
      }))

      const result = extractAllCoverageMetrics()

      // Should return 0 not NaN for zero totals
      expect(result.union).toBeDefined()
      expect(result.union?.statements).toBe(0)
      expect(result.union?.branches).toBe(0)
    })

    it('handles coverage data without total property', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        '/test/file.ts': {
          statements: { total: 100, covered: 80, pct: 80 },
          branches: { total: 50, covered: 40, pct: 80 },
          functions: { total: 20, covered: 15, pct: 75 },
          lines: { total: 100, covered: 85, pct: 85 },
        },
      }))

      const result = extractAllCoverageMetrics()

      // extractFromTotal returns undefined when no total
      expect(result.unit).toBeUndefined()
      // But union should still work from file entries
      expect(result.union).toBeDefined()
    })
  })

  describe('extractCoverageMetrics', () => {
    it('returns undefined when no coverage data', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = extractCoverageMetrics()

      expect(result).toBeUndefined()
    })

    it('returns merged coverage when both exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('coverage-lambda')) {
          return JSON.stringify({
            total: {
              statements: { total: 100, covered: 50, pct: 50 },
              branches: { total: 50, covered: 25, pct: 50 },
              functions: { total: 20, covered: 10, pct: 50 },
              lines: { total: 100, covered: 50, pct: 50 },
            },
            '/test/file.ts': {
              statements: { total: 100, covered: 50, pct: 50 },
              branches: { total: 50, covered: 25, pct: 50 },
              functions: { total: 20, covered: 10, pct: 50 },
              lines: { total: 100, covered: 50, pct: 50 },
            },
          })
        }
        return JSON.stringify({
          total: {
            statements: { total: 100, covered: 80, pct: 80 },
            branches: { total: 50, covered: 40, pct: 80 },
            functions: { total: 20, covered: 15, pct: 75 },
            lines: { total: 100, covered: 85, pct: 85 },
          },
          '/test/file.ts': {
            statements: { total: 100, covered: 80, pct: 80 },
            branches: { total: 50, covered: 40, pct: 80 },
            functions: { total: 20, covered: 15, pct: 75 },
            lines: { total: 100, covered: 85, pct: 85 },
          },
        })
      })

      const result = extractCoverageMetrics()

      // Should return union coverage
      expect(result).toBeDefined()
      expect(result?.branches).toBe(80) // max of 80 and 50
    })
  })
})

describe('SLOC Extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 when directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = extractSloc('/nonexistent')

    expect(result).toBe(0)
  })

  it('counts lines in TypeScript files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'file.ts', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as fs.Stats)
    vi.mocked(fs.readFileSync).mockReturnValue(`
function foo() {
  return 1
}
`)

    const result = extractSloc('/test/src')

    expect(result).toBeGreaterThan(0)
  })

  it('skips test files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'file.test.ts', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('skips declaration files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'types.d.ts', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('skips node_modules directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'node_modules', isDirectory: () => true, isFile: () => false } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('handles block comments correctly', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'file.ts', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as fs.Stats)
    vi.mocked(fs.readFileSync).mockReturnValue(`
/*
 * Multi-line comment
 * should not be counted
 */
const x = 1
// Single line comment
const y = 2
`)

    const result = extractSloc('/test/src')

    // Should only count 'const x = 1' and 'const y = 2'
    expect(result).toBe(2)
  })

  it('handles single-line block comments', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'file.ts', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as fs.Stats)
    vi.mocked(fs.readFileSync).mockReturnValue(`/* comment */
const x = 1`)

    const result = extractSloc('/test/src')

    // Single-line block comment doesn't set inBlockComment flag
    expect(result).toBe(1)
  })

  it('recursively walks subdirectories', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)

    let readdirCallCount = 0
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      readdirCallCount++
      if (readdirCallCount === 1) {
        return [
          { name: 'subdir', isDirectory: () => true, isFile: () => false } as fs.Dirent,
        ]
      }
      return [
        { name: 'file.ts', isDirectory: () => false, isFile: () => true } as fs.Dirent,
      ]
    })
    vi.mocked(fs.readFileSync).mockReturnValue('const x = 1')

    const result = extractSloc('/test/src')

    expect(result).toBe(1)
    expect(readdirCallCount).toBe(2) // Root + subdir
  })

  it('skips dist directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'dist', isDirectory: () => true, isFile: () => false } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('skips coverage directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'coverage', isDirectory: () => true, isFile: () => false } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('skips .git directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: '.git', isDirectory: () => true, isFile: () => false } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('skips .next directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: '.next', isDirectory: () => true, isFile: () => false } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('skips build directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'build', isDirectory: () => true, isFile: () => false } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('counts .tsx files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'component.tsx', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])
    vi.mocked(fs.readFileSync).mockReturnValue('export const Component = () => <div>Hello</div>')

    const result = extractSloc('/test/src')

    expect(result).toBe(1)
  })

  it('counts .js files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'script.js', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])
    vi.mocked(fs.readFileSync).mockReturnValue('console.log("hello")')

    const result = extractSloc('/test/src')

    expect(result).toBe(1)
  })

  it('counts .jsx files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'component.jsx', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])
    vi.mocked(fs.readFileSync).mockReturnValue('export const App = () => <div/>')

    const result = extractSloc('/test/src')

    expect(result).toBe(1)
  })

  it('skips .spec.ts files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'file.spec.ts', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('skips non-matching extensions', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'readme.md', isDirectory: () => false, isFile: () => true } as fs.Dirent,
      { name: 'config.json', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('handles file read errors gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'file.ts', isDirectory: () => false, isFile: () => true } as fs.Dirent,
    ])
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Permission denied')
    })

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('handles directory read errors gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('Permission denied')
    })

    const result = extractSloc('/test/src')

    expect(result).toBe(0)
  })

  it('uses default src directory when not specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([])

    extractSloc() // No argument

    expect(fs.existsSync).toHaveBeenCalledWith('/test/project/src')
  })
})

describe('Script Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runScript', () => {
    it('returns pass when script exits with 0', async () => {
      const { spawnSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      })

      const result = runScript('test')

      expect(result).toBe('pass')
    })

    it('returns fail when script exits with non-zero', async () => {
      const { spawnSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'error',
        pid: 123,
        signal: null,
        output: [],
      })

      const result = runScript('test')

      expect(result).toBe('fail')
    })
  })

  describe('runScripts', () => {
    it('runs multiple scripts and returns results', async () => {
      const { spawnSync } = await import('child_process')
      vi.mocked(spawnSync)
        .mockReturnValueOnce({
          status: 0,
          stdout: '',
          stderr: '',
          pid: 123,
          signal: null,
          output: [],
        })
        .mockReturnValueOnce({
          status: 1,
          stdout: '',
          stderr: '',
          pid: 124,
          signal: null,
          output: [],
        })

      const result = runScripts(['test', 'lint'])

      expect(result).toEqual({
        test: 'pass',
        lint: 'fail',
      })
    })
  })
})

describe('TypeScript Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 errors when type-check passes', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractTypescriptMetrics()

    expect(result.errors).toBe(0)
    expect(result.warnings).toBe(0)
  })

  it('counts TypeScript errors from output', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: `src/file.ts(10,5): error TS2345: Argument of type 'string' is not assignable.
src/file.ts(15,3): error TS2339: Property 'foo' does not exist.`,
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractTypescriptMetrics()

    expect(result.errors).toBe(2)
  })

  it('counts root causes (unique file+code combinations)', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: `src/file.ts(10,5): error TS2345: First error.
src/file.ts(15,3): error TS2345: Same error code, same file.
src/other.ts(5,1): error TS2345: Same error code, different file.`,
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractTypescriptMetrics()

    expect(result.errors).toBe(3)
    // Root causes: src/file.ts:TS2345, src/other.ts:TS2345 = 2
    expect(result.rootCauses).toBe(2)
  })

  it('counts errors from stderr as well as stdout', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: `src/file.ts(10,5): error TS2345: Error in stdout.`,
      stderr: `src/other.ts(5,1): error TS2339: Error in stderr.`,
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractTypescriptMetrics()

    expect(result.errors).toBe(2) // Both stdout and stderr are combined
  })

  it('uses regex fallback count when parsing fails', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: `error TS2345: Some weird format
error TS2339: Another weird format`,
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractTypescriptMetrics()

    // Regex fallback should find 2 errors
    expect(result.errors).toBe(2)
  })

  it('uses max of parsed and regex counts', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: `src/file.ts(10,5): error TS2345: Parseable error.
error TS2339: Unparseable error.
error TS1234: Another unparseable error.`,
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractTypescriptMetrics()

    // 1 parsed + 3 regex matches = max(1, 3) = 3
    expect(result.errors).toBe(3)
  })

  it('handles empty output', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractTypescriptMetrics()

    expect(result.errors).toBe(0)
    expect(result.rootCauses).toBe(0)
  })

  it('handles null stdout/stderr', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: null as unknown as string,
      stderr: null as unknown as string,
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractTypescriptMetrics()

    expect(result.errors).toBe(0)
  })
})

describe('ESLint Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 errors when eslint passes', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractEslintMetrics()

    expect(result.errors).toBe(0)
    expect(result.warnings).toBe(0)
  })

  it('counts ESLint errors and warnings', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: JSON.stringify([
        {
          filePath: '/test/file.ts',
          errorCount: 2,
          warningCount: 3,
          messages: [
            { ruleId: 'no-unused-vars', severity: 2, message: 'error', line: 1, column: 1 },
            { ruleId: 'no-unused-vars', severity: 2, message: 'error', line: 2, column: 1 },
            { ruleId: 'no-console', severity: 1, message: 'warning', line: 3, column: 1 },
            { ruleId: 'no-console', severity: 1, message: 'warning', line: 4, column: 1 },
            { ruleId: 'prefer-const', severity: 1, message: 'warning', line: 5, column: 1 },
          ],
        },
      ]),
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractEslintMetrics()

    expect(result.errors).toBe(2)
    expect(result.warnings).toBe(3)
  })

  it('counts root causes (unique file+rule combinations)', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: JSON.stringify([
        {
          filePath: '/test/file.ts',
          errorCount: 3,
          warningCount: 0,
          messages: [
            { ruleId: 'no-unused-vars', severity: 2, message: 'error', line: 1, column: 1 },
            { ruleId: 'no-unused-vars', severity: 2, message: 'error', line: 2, column: 1 },
            { ruleId: 'no-explicit-any', severity: 2, message: 'error', line: 3, column: 1 },
          ],
        },
        {
          filePath: '/test/other.ts',
          errorCount: 1,
          warningCount: 0,
          messages: [
            { ruleId: 'no-unused-vars', severity: 2, message: 'error', line: 1, column: 1 },
          ],
        },
      ]),
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractEslintMetrics()

    expect(result.errors).toBe(4)
    // Root causes: file.ts:no-unused-vars, file.ts:no-explicit-any, other.ts:no-unused-vars = 3
    expect(result.rootCauses).toBe(3)
  })

  it('handles invalid JSON output', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: 'not valid json',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractEslintMetrics()

    expect(result.errors).toBe(1) // Falls back to exit code
    expect(result.warnings).toBe(0)
  })

  it('handles invalid JSON output with exit code 0', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'not valid json',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractEslintMetrics()

    expect(result.errors).toBe(0) // Exit code 0 = no errors
    expect(result.warnings).toBe(0)
    expect(result.rootCauses).toBeUndefined() // Can't compute without parsed output
  })

  it('ignores warnings when counting root causes', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify([
        {
          filePath: '/test/file.ts',
          errorCount: 0,
          warningCount: 2,
          messages: [
            { ruleId: 'no-console', severity: 1, message: 'warning', line: 1, column: 1 },
            { ruleId: 'no-console', severity: 1, message: 'warning', line: 2, column: 1 },
          ],
        },
      ]),
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractEslintMetrics()

    expect(result.errors).toBe(0)
    expect(result.warnings).toBe(2)
    expect(result.rootCauses).toBe(0) // Only errors count as root causes
  })

  it('handles messages without ruleId', async () => {
    const { spawnSync } = await import('child_process')
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: JSON.stringify([
        {
          filePath: '/test/file.ts',
          errorCount: 1,
          warningCount: 0,
          messages: [
            { ruleId: null, severity: 2, message: 'error', line: 1, column: 1 },
          ],
        },
      ]),
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    const result = extractEslintMetrics()

    expect(result.errors).toBe(1)
    expect(result.rootCauses).toBe(0) // null ruleId not counted as root cause
  })
})

describe('SonarQube Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('extractSonarqubeMetrics', () => {
    it('returns metrics when API responds successfully', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        component: {
          measures: [
            { metric: 'bugs', value: '5' },
            { metric: 'vulnerabilities', value: '2' },
            { metric: 'code_smells', value: '10' },
            { metric: 'coverage', value: '75.5' },
            { metric: 'duplicated_lines_density', value: '3.2' },
            { metric: 'blocker_violations', value: '1' },
            { metric: 'critical_violations', value: '2' },
            { metric: 'major_violations', value: '5' },
            { metric: 'minor_violations', value: '8' },
            { metric: 'info_violations', value: '3' },
          ],
        },
      }))

      const result = extractSonarqubeMetrics()

      expect(result).toBeDefined()
      expect(result?.bugs).toBe(5)
      expect(result?.vulnerabilities).toBe(2)
      expect(result?.codeSmells).toBe(10)
      expect(result?.coverage).toBe(75.5)
      expect(result?.duplications).toBe(3.2)
      expect(result?.blocker).toBe(1)
      expect(result?.critical).toBe(2)
      expect(result?.major).toBe(5)
      expect(result?.minor).toBe(8)
      expect(result?.info).toBe(3)
    })

    it('returns undefined when API fails', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Connection refused')
      })

      const result = extractSonarqubeMetrics()

      expect(result).toBeUndefined()
    })

    it('returns undefined when response has no measures', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        component: {},
      }))

      const result = extractSonarqubeMetrics()

      expect(result).toBeUndefined()
    })

    it('returns undefined when response has empty measures', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        component: {
          measures: [],
        },
      }))

      const result = extractSonarqubeMetrics()

      expect(result).toBeUndefined()
    })

    it('returns 0 for missing metrics', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        component: {
          measures: [
            { metric: 'bugs', value: '3' },
          ],
        },
      }))

      const result = extractSonarqubeMetrics()

      expect(result).toBeDefined()
      expect(result?.bugs).toBe(3)
      expect(result?.vulnerabilities).toBe(0) // Missing metric
      expect(result?.codeSmells).toBe(0)
    })
  })

  describe('isSonarqubeAvailable', () => {
    it('returns true when SonarQube responds', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue('200')

      const result = isSonarqubeAvailable()

      expect(result).toBe(true)
    })

    it('returns false when SonarQube is unreachable', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Connection refused')
      })

      const result = isSonarqubeAvailable()

      expect(result).toBe(false)
    })
  })

  describe('getTopSonarIssues', () => {
    it('returns issues from API', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        issues: [
          {
            severity: 'MAJOR',
            type: 'CODE_SMELL',
            message: 'Refactor this function.',
            component: 'test-project:src/file.ts',
            line: 10,
            rule: 'typescript:S1234',
          },
          {
            severity: 'CRITICAL',
            type: 'BUG',
            message: 'Fix this bug.',
            component: 'test-project:src/other.ts',
            rule: 'typescript:S5678',
          },
        ],
        total: 2,
      }))

      const result = getTopSonarIssues(10)

      expect(result).toHaveLength(2)
      expect(result[0].severity).toBe('MAJOR')
      expect(result[0].component).toBe('src/file.ts') // Project key stripped
      expect(result[0].line).toBe(10)
      expect(result[1].severity).toBe('CRITICAL')
      expect(result[1].component).toBe('src/other.ts')
      expect(result[1].line).toBeUndefined()
    })

    it('returns empty array when API fails', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Timeout')
      })

      const result = getTopSonarIssues()

      expect(result).toEqual([])
    })

    it('returns empty array when no issues in response', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        total: 0,
      }))

      const result = getTopSonarIssues()

      expect(result).toEqual([])
    })
  })

  describe('runSonarqubeScan', () => {
    it('returns success when scan completes', async () => {
      const { spawnSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: 'Scan completed',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      })
      vi.mocked(fs.existsSync).mockReturnValue(false) // No task ID file

      const result = runSonarqubeScan()

      expect(result.success).toBe(true)
    })

    it('returns failure when scan fails', async () => {
      const { spawnSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'Analysis failed',
        pid: 123,
        signal: null,
        output: [],
      })

      const result = runSonarqubeScan()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Analysis failed')
    })

    it('waits for task when task ID is found', async () => {
      const { spawnSync, execSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      })
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('ceTaskId=task123\nserverUrl=http://localhost:9000')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        task: { id: 'task123', status: 'SUCCESS' },
      }))

      const result = runSonarqubeScan()

      expect(result.success).toBe(true)
    })

    it('returns failure when task fails', async () => {
      const { spawnSync, execSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      })
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('ceTaskId=task123')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        task: { id: 'task123', status: 'FAILED', errorMessage: 'Analysis error' },
      }))

      const result = runSonarqubeScan()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Analysis error')
    })

    it('returns failure when task is canceled', async () => {
      const { spawnSync, execSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      })
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('ceTaskId=task123')
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        task: { id: 'task123', status: 'CANCELED' },
      }))

      const result = runSonarqubeScan()

      expect(result.success).toBe(false)
      expect(result.error).toContain('canceled')
    })

    it('retries on transient WebSocket error', async () => {
      const { spawnSync } = await import('child_process')
      let npmCallCount = 0
      vi.mocked(spawnSync).mockImplementation((cmd) => {
        if (cmd === 'sleep') {
          return { status: 0, stdout: '', stderr: '', pid: 0, signal: null, output: [] }
        }
        npmCallCount++
        if (npmCallCount === 1) {
          return {
            status: 1,
            stdout: '',
            stderr: 'WebSocket connection error',
            pid: 123,
            signal: null,
            output: [],
          }
        }
        // Second npm call succeeds
        return {
          status: 0,
          stdout: 'OK',
          stderr: '',
          pid: 124,
          signal: null,
          output: [],
        }
      })
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = runSonarqubeScan()

      expect(result.success).toBe(true)
      expect(npmCallCount).toBe(2) // Retried once
    })

    it('retries on Connection reset error', async () => {
      const { spawnSync } = await import('child_process')
      let callCount = 0
      vi.mocked(spawnSync).mockImplementation(() => {
        callCount++
        if (callCount <= 2) { // First npm run + first sleep
          if (callCount === 1) {
            return {
              status: 1,
              stdout: 'Connection reset',
              stderr: '',
              pid: 123,
              signal: null,
              output: [],
            }
          }
          // Sleep call
          return { status: 0, stdout: '', stderr: '', pid: 0, signal: null, output: [] }
        }
        // Second npm run succeeds
        return {
          status: 0,
          stdout: 'OK',
          stderr: '',
          pid: 124,
          signal: null,
          output: [],
        }
      })
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = runSonarqubeScan()

      expect(result.success).toBe(true)
    })

    it('fails after max retries on transient errors', async () => {
      const { spawnSync } = await import('child_process')
      vi.mocked(spawnSync).mockImplementation((cmd) => {
        if (cmd === 'sleep') {
          return { status: 0, stdout: '', stderr: '', pid: 0, signal: null, output: [] }
        }
        return {
          status: 1,
          stdout: '',
          stderr: 'WebSocket connection error',
          pid: 123,
          signal: null,
          output: [],
        }
      })
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = runSonarqubeScan()

      expect(result.success).toBe(false)
    })

    it('handles report-task.txt read error', async () => {
      const { spawnSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      })
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = runSonarqubeScan()

      // Should succeed because no task ID found
      expect(result.success).toBe(true)
    })

    it('handles report-task.txt without ceTaskId', async () => {
      const { spawnSync } = await import('child_process')
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 123,
        signal: null,
        output: [],
      })
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('serverUrl=http://localhost:9000\nprojectKey=myproject')

      const result = runSonarqubeScan()

      // Should succeed because no task ID found
      expect(result.success).toBe(true)
    })
  })
})

describe('extractAllMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts all metrics with default options', async () => {
    const { spawnSync, execSync } = await import('child_process')

    // Coverage files don't exist
    vi.mocked(fs.existsSync).mockReturnValue(false)

    // TypeScript/ESLint/scripts pass
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })

    // SonarQube returns metrics
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      component: {
        measures: [
          { metric: 'bugs', value: '0' },
        ],
      },
    }))

    const result = extractAllMetrics()

    expect(result.coverage).toBeDefined()
    expect(result.typescript).toBeDefined()
    expect(result.eslint).toBeDefined()
    expect(result.sonarqube).toBeDefined()
    expect(result.scripts).toBeDefined()
    expect(result.sloc).toBe(0)
  })

  it('accepts array of scripts for backward compatibility', async () => {
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
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ component: { measures: [] } }))

    const result = extractAllMetrics(['test', 'lint'])

    expect(result.scripts).toEqual({
      test: 'pass',
      lint: 'pass',
    })
  })

  it('skips SonarQube when skipSonarQube is true', async () => {
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

    const result = extractAllMetrics({ skipSonarQube: true })

    expect(result.sonarqube).toBeUndefined()
    expect(execSync).not.toHaveBeenCalled()
  })

  it('extracts custom metrics when dimensions provided', async () => {
    const { spawnSync, execSync } = await import('child_process')

    // Mock file existence - return false for coverage files
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      pid: 123,
      signal: null,
      output: [],
    })
    // Mock execSync to return JSON for the custom metric command
    vi.mocked(execSync).mockImplementation((cmd) => {
      const cmdStr = String(cmd)
      if (cmdStr.includes('custom-output.json')) {
        return JSON.stringify({ customValue: 42 })
      }
      // SonarQube response
      return JSON.stringify({ component: { measures: [] } })
    })

    const result = extractAllMetrics({
      customDimensions: [
        {
          path: 'custom.test_dim',
          displayName: 'Test Dimension',
          direction: 'lower-better',
          extractor: {
            type: 'script',
            command: 'cat /test/project/custom-output.json',
            parseOutput: 'json',
            jsonPath: 'customValue',
          },
        },
      ],
    })

    expect(result.custom).toBeDefined()
    expect(result.custom?.['test_dim']).toBe(42)
  })

  it('skips custom metrics when skipCustomDimensions is true', async () => {
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
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ component: { measures: [] } }))

    const result = extractAllMetrics({
      skipCustomDimensions: true,
      customDimensions: [
        {
          path: 'custom.test_dim',
          displayName: 'Test Dimension',
          direction: 'lower-is-better',
          extractor: {
            type: 'json',
            filePath: '/test/project/test.json',
            jsonPath: 'value',
          },
        },
      ],
    })

    expect(result.custom).toBeUndefined()
  })

  it('skips custom metrics when no dimensions provided', async () => {
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
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ component: { measures: [] } }))

    const result = extractAllMetrics({
      customDimensions: [],
    })

    expect(result.custom).toBeUndefined()
  })
})

describe('extractAllMetricsAsync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads custom dimensions automatically', async () => {
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
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ component: { measures: [] } }))

    const result = await extractAllMetricsAsync()

    expect(result.coverage).toBeDefined()
    expect(result.typescript).toBeDefined()
    expect(result.eslint).toBeDefined()
  })

  it('uses provided custom dimensions instead of loading', async () => {
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
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ component: { measures: [] } }))

    const result = await extractAllMetricsAsync({
      customDimensions: [],
    })

    expect(result.custom).toBeUndefined()
  })

  it('skips custom dimension loading when skipCustomDimensions is true', async () => {
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
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ component: { measures: [] } }))

    const result = await extractAllMetricsAsync({
      skipCustomDimensions: true,
    })

    expect(result.custom).toBeUndefined()
  })
})
