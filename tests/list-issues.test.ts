import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listIssues } from '../src/list-issues.js'

// Mock config module
vi.mock('../src/config.js', () => ({
  getConfig: vi.fn(() => ({
    projectRoot: '/test/project',
    sonarqube: {
      url: 'http://localhost:9000',
      projectKey: 'test-project',
    },
  })),
  getSonarAuthToken: vi.fn(() => 'test-token'),
}))

// Store original global fetch
const originalFetch = global.fetch

describe('list-issues module', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let processExitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
  })

  describe('parseArgs (via listIssues behavior)', () => {
    it('parses --severity flag', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total: 0, p: 1, ps: 100, issues: [] }),
      })

      await listIssues(['--severity=MAJOR'])

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('severities=MAJOR'),
        expect.any(Object)
      )
    })

    it('parses --limit flag', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total: 0, p: 1, ps: 50, issues: [] }),
      })

      await listIssues(['--limit=50'])

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ps=50'),
        expect.any(Object)
      )
    })

    it('parses --rule flag', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total: 0, p: 1, ps: 100, issues: [] }),
      })

      await listIssues(['--rule=typescript:S1874'])

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('rules=typescript'),
        expect.any(Object)
      )
    })

    it('parses --file flag', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total: 0, p: 1, ps: 100, issues: [] }),
      })

      await listIssues(['--file=src/utils'])

      // File filter doesn't go to API, just filters results
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('file=src/utils')
      )
    })

    it('parses --summary flag', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          p: 1,
          ps: 100,
          issues: [{
            key: 'issue1',
            component: 'test-project:src/file.ts',
            message: 'Test issue',
            severity: 'MAJOR',
            type: 'CODE_SMELL',
            rule: 'typescript:S1234',
          }],
        }),
      })

      await listIssues(['--summary'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Issues by rule:'))
    })

    it('parses -s shorthand for summary', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          p: 1,
          ps: 100,
          issues: [{
            key: 'issue1',
            component: 'test-project:src/file.ts',
            message: 'Test issue',
            severity: 'MAJOR',
            type: 'CODE_SMELL',
            rule: 'typescript:S1234',
          }],
        }),
      })

      await listIssues(['-s'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Issues by rule:'))
    })

    it('supports legacy positional args for severity', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total: 0, p: 1, ps: 100, issues: [] }),
      })

      await listIssues(['MINOR'])

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('severities=MINOR'),
        expect.any(Object)
      )
    })

    it('supports legacy positional args for limit', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total: 0, p: 1, ps: 25, issues: [] }),
      })

      await listIssues(['25'])

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ps=25'),
        expect.any(Object)
      )
    })
  })

  describe('listIssues', () => {
    it('shows help with --help flag', async () => {
      await listIssues(['--help'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--severity=LEVEL'))
    })

    it('shows help with -h flag', async () => {
      await listIssues(['-h'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
    })

    it('fetches issues from SonarQube API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 5,
          p: 1,
          ps: 100,
          issues: [],
        }),
      })

      await listIssues([])

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:9000/api/issues/search'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        })
      )
    })

    it('displays issue count summary', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 42,
          p: 1,
          ps: 100,
          issues: [],
        }),
      })

      await listIssues([])

      expect(consoleSpy).toHaveBeenCalledWith('Total: 42 issues')
      expect(consoleSpy).toHaveBeenCalledWith('Showing: 0')
    })

    it('groups issues by file in detailed mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 2,
          p: 1,
          ps: 100,
          issues: [
            {
              key: 'issue1',
              component: 'test-project:src/fileA.ts',
              line: 10,
              message: 'Issue in file A',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            },
            {
              key: 'issue2',
              component: 'test-project:src/fileA.ts',
              line: 20,
              message: 'Another issue in file A',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S5678',
            },
          ],
        }),
      })

      await listIssues([])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('src/fileA.ts (2 issues):'))
    })

    it('handles API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })

      await expect(listIssues([])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error:',
        expect.objectContaining({ message: expect.stringContaining('401') })
      )
    })

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      await expect(listIssues([])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error:',
        expect.objectContaining({ message: 'Network error' })
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Make sure SonarQube is running')
      )
    })

    it('filters issues by file pattern', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 3,
          p: 1,
          ps: 100,
          issues: [
            {
              key: 'issue1',
              component: 'test-project:src/utils/helper.ts',
              message: 'Issue in utils',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            },
            {
              key: 'issue2',
              component: 'test-project:src/core/main.ts',
              message: 'Issue in core',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            },
            {
              key: 'issue3',
              component: 'test-project:src/utils/format.ts',
              message: 'Another issue in utils',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S5678',
            },
          ],
        }),
      })

      await listIssues(['--file=utils'])

      expect(consoleSpy).toHaveBeenCalledWith('Showing: 2')
    })

    it('shows filter info in output', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total: 0, p: 1, ps: 100, issues: [] }),
      })

      await listIssues(['--severity=MAJOR', '--rule=typescript:S1234'])

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('severity=MAJOR')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('rule=typescript:S1234')
      )
    })

    it('limits page size to 500 (SonarQube max)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total: 0, p: 1, ps: 500, issues: [] }),
      })

      await listIssues(['--limit=1000'])

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ps=500'),
        expect.any(Object)
      )
    })

    it('shows top 10 rules in detailed mode', async () => {
      const issues = []
      for (let i = 0; i < 15; i++) {
        issues.push({
          key: `issue${i}`,
          component: 'test-project:src/file.ts',
          message: `Issue ${i}`,
          severity: 'MAJOR',
          type: 'CODE_SMELL',
          rule: `typescript:S${1000 + i}`,
        })
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 15,
          p: 1,
          ps: 100,
          issues,
        }),
      })

      await listIssues([])

      expect(consoleSpy).toHaveBeenCalledWith('Top rules:')
    })

    it('sorts files alphabetically', async () => {
      const logCalls: string[] = []
      consoleSpy.mockImplementation((msg) => {
        if (typeof msg === 'string') {
          logCalls.push(msg)
        }
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 2,
          p: 1,
          ps: 100,
          issues: [
            {
              key: 'issue1',
              component: 'test-project:src/z-file.ts',
              message: 'Issue Z',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            },
            {
              key: 'issue2',
              component: 'test-project:src/a-file.ts',
              message: 'Issue A',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            },
          ],
        }),
      })

      await listIssues([])

      const aFileIndex = logCalls.findIndex(c => c.includes('a-file.ts'))
      const zFileIndex = logCalls.findIndex(c => c.includes('z-file.ts'))

      expect(aFileIndex).toBeLessThan(zFileIndex)
    })

    it('handles issues without line numbers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          p: 1,
          ps: 100,
          issues: [
            {
              key: 'issue1',
              component: 'test-project:src/file.ts',
              message: 'File-level issue',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            },
          ],
        }),
      })

      await listIssues([])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('File-level issue'))
    })

    it('shows rule suggestion in summary mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          p: 1,
          ps: 100,
          issues: [{
            key: 'issue1',
            component: 'test-project:src/file.ts',
            message: 'Test issue',
            severity: 'MAJOR',
            type: 'CODE_SMELL',
            rule: 'typescript:S1234',
          }],
        }),
      })

      await listIssues(['-s'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('To see details for a specific rule:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--rule=typescript:'))
    })

    it('handles multiple files with issues', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          total: 3,
          p: 1,
          ps: 100,
          issues: [
            {
              key: 'issue1',
              component: 'test-project:src/a.ts',
              line: 5,
              message: 'Issue A',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            },
            {
              key: 'issue2',
              component: 'test-project:src/b.ts',
              line: 10,
              message: 'Issue B',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S1234',
            },
            {
              key: 'issue3',
              component: 'test-project:src/c.ts',
              line: 15,
              message: 'Issue C',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              rule: 'typescript:S5678',
            },
          ],
        }),
      })

      await listIssues([])

      expect(consoleSpy).toHaveBeenCalledWith('Showing: 3')
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('src/a.ts (1 issues):'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('src/b.ts (1 issues):'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('src/c.ts (1 issues):'))
    })
  })
})
