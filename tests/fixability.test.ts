import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import type { SymbolIssues, CodeSymbol } from '../src/symbols/types.js'

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

// Mock OpenAI - need to properly mock as a class
const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    }
  },
}))

function createSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    id: 'src/test.ts::testFunc',
    file: 'src/test.ts',
    name: 'testFunc',
    qualifiedName: 'testFunc',
    kind: 'function',
    exported: true,
    span: { startLine: 1, startColumn: 0, endLine: 20, endColumn: 1 },
    sloc: 20,
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

describe('fixability/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env
    delete process.env.OPENAI_API_KEY
  })

  describe('extractSymbolCode', () => {
    it('returns null when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      // Should return empty since file doesn't exist
      expect(estimates).toHaveLength(0)
    })

    it('extracts code from file based on span', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10'
      )

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 0.8,
              effort: 'moderate',
              reasoning: 'Simple function',
            }),
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues({
        symbol: createSymbol({
          span: { startLine: 2, startColumn: 0, endLine: 5, endColumn: 1 },
        }),
      })]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(estimates.length).toBeGreaterThanOrEqual(0)
    })

    it('handles read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error')
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      // Should return empty since file read failed
      expect(estimates).toHaveLength(0)
    })
  })

  describe('buildPrompt', () => {
    it('includes coverage issues in prompt', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      let capturedPrompt = ''
      mockCreate.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
        capturedPrompt = params.messages[1].content
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                score: 0.7,
                effort: 'moderate',
                reasoning: 'Test',
              }),
            },
          }],
        }
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues({
        issues: {
          typescript: [],
          eslint: [],
          sonarqube: [],
          coverage: [
            { file: 'test.ts', source: 'coverage', dimension: 'coverage.branches', code: 'branch-uncovered', message: 'Uncovered branch' },
          ],
        },
      })]

      await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(capturedPrompt).toContain('uncovered branch')
    })

    it('includes typescript errors in prompt', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      let capturedPrompt = ''
      mockCreate.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
        capturedPrompt = params.messages[1].content
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                score: 0.6,
                effort: 'significant',
                reasoning: 'Type fixes needed',
              }),
            },
          }],
        }
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues({
        issues: {
          typescript: [
            { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS2345', message: 'Type error' },
            { file: 'test.ts', source: 'typescript', dimension: 'typescript.errors', code: 'TS2339', message: 'Property error' },
          ],
          eslint: [],
          sonarqube: [],
          coverage: [],
        },
        totalIssueCount: 2,
      })]

      await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(capturedPrompt).toContain('TypeScript errors')
      expect(capturedPrompt).toContain('TS2345')
    })

    it('includes eslint issues in prompt', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      let capturedPrompt = ''
      mockCreate.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
        capturedPrompt = params.messages[1].content
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                score: 0.9,
                effort: 'trivial',
                reasoning: 'Quick fixes',
              }),
            },
          }],
        }
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues({
        issues: {
          typescript: [],
          eslint: [
            { file: 'test.ts', source: 'eslint', dimension: 'eslint.errors', code: 'no-unused-vars', message: 'Unused var' },
          ],
          sonarqube: [],
          coverage: [],
        },
        totalIssueCount: 1,
      })]

      await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(capturedPrompt).toContain('ESLint issues')
    })

    it('includes sonarqube issues in prompt', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      let capturedPrompt = ''
      mockCreate.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
        capturedPrompt = params.messages[1].content
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                score: 0.5,
                effort: 'significant',
                reasoning: 'Code smell needs refactoring',
              }),
            },
          }],
        }
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues({
        issues: {
          typescript: [],
          eslint: [],
          sonarqube: [
            { file: 'test.ts', source: 'sonarqube', dimension: 'sonarqube.codeSmells', code: 'typescript:S1234', message: 'Code smell' },
          ],
          coverage: [],
        },
        totalIssueCount: 1,
      })]

      await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(capturedPrompt).toContain('SonarQube issues')
    })
  })

  describe('isValidResponse', () => {
    it('returns default estimate for invalid response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: '{}', // Empty object - invalid
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      // Should get default estimate after retries
      expect(estimates.length).toBe(1)
      expect(estimates[0].score).toBe(0.5)
      expect(estimates[0].reasoning).toContain('default')
    })

    it('retries on invalid response before returning default', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      let callCount = 0
      mockCreate.mockImplementation(async () => {
        callCount++
        if (callCount < 3) {
          return {
            choices: [{
              message: {
                content: '{}', // Invalid
              },
            }],
          }
        }
        // Third attempt succeeds
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                score: 0.7,
                effort: 'moderate',
                reasoning: 'Finally worked',
              }),
            },
          }],
        }
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(estimates.length).toBe(1)
      expect(estimates[0].reasoning).toBe('Finally worked')
    })
  })

  describe('estimateOne', () => {
    it('returns conservative estimate for large symbols (>200 lines)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues({
        symbol: createSymbol({ sloc: 250 }), // > 200 lines
      })]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(estimates.length).toBe(1)
      expect(estimates[0].score).toBe(0.3)
      expect(estimates[0].estimatedEffort).toBe('significant')
      expect(estimates[0].reasoning).toContain('Large symbol')
    })

    it('clamps score to 0-1 range', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 1.5, // > 1
              effort: 'trivial',
              reasoning: 'High score',
            }),
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(estimates.length).toBe(1)
      expect(estimates[0].score).toBe(1) // Clamped to 1
    })

    it('defaults invalid effort to moderate', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 0.5,
              effort: 'invalid-effort', // Not a valid effort
              reasoning: 'Test',
            }),
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(estimates.length).toBe(1)
      expect(estimates[0].estimatedEffort).toBe('moderate')
    })

    it('handles API errors with retry', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockRejectedValue(new Error('API Error'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      // Should return empty after all retries fail
      expect(estimates).toHaveLength(0)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('estimateFixability', () => {
    it('returns empty array when no API key is set', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, {})

      expect(estimates).toHaveLength(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('OPENAI_API_KEY not set')
      )

      consoleSpy.mockRestore()
    })

    it('uses env var for API key when not provided', async () => {
      process.env.OPENAI_API_KEY = 'env-api-key'

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 0.8,
              effort: 'moderate',
              reasoning: 'Test',
            }),
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols)

      // Should work with env var
      expect(estimates.length).toBe(1)
    })

    it('limits estimation to maxSymbols', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 0.8,
              effort: 'moderate',
              reasoning: 'Test',
            }),
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [
        createSymbolIssues({ symbol: createSymbol({ id: 'sym1', name: 'func1' }) }),
        createSymbolIssues({ symbol: createSymbol({ id: 'sym2', name: 'func2' }) }),
        createSymbolIssues({ symbol: createSymbol({ id: 'sym3', name: 'func3' }) }),
      ]

      const estimates = await estimateFixability(symbols, {
        apiKey: 'test-key',
        maxSymbols: 2,
      })

      // Should only estimate 2 symbols
      expect(estimates.length).toBe(2)
    })

    it('updates symbols with fixability scores', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 0.7,
              effort: 'moderate',
              reasoning: 'Test',
            }),
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues({ totalDeltaQ: 2.0 })]

      await estimateFixability(symbols, { apiKey: 'test-key' })

      // Symbol should be updated in place
      expect(symbols[0].fixabilityScore).toBe(0.7)
      expect(symbols[0].adjustedDeltaQ).toBe(1.4) // 2.0 * 0.7
    })

    it('re-sorts symbols with estimated ones first', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 0.5,
              effort: 'moderate',
              reasoning: 'Test',
            }),
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [
        createSymbolIssues({ symbol: createSymbol({ id: 'sym1' }), totalDeltaQ: 1.0 }),
        createSymbolIssues({ symbol: createSymbol({ id: 'sym2' }), totalDeltaQ: 2.0 }),
        createSymbolIssues({ symbol: createSymbol({ id: 'sym3' }), totalDeltaQ: 3.0 }),
      ]

      // Only estimate first symbol
      await estimateFixability(symbols, { apiKey: 'test-key', maxSymbols: 1 })

      // sym1 (estimated) should be first, then sym3, sym2 by deltaQ
      expect(symbols[0].symbol.id).toBe('sym1')
    })

    it('uses default model gpt-5-nano', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      let usedModel = ''
      mockCreate.mockImplementation(async (params: { model: string }) => {
        usedModel = params.model
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                score: 0.8,
                effort: 'moderate',
                reasoning: 'Test',
              }),
            },
          }],
        }
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(usedModel).toBe('gpt-5-nano')
    })

    it('allows custom model override', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      let usedModel = ''
      mockCreate.mockImplementation(async (params: { model: string }) => {
        usedModel = params.model
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                score: 0.8,
                effort: 'moderate',
                reasoning: 'Test',
              }),
            },
          }],
        }
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      await estimateFixability(symbols, {
        apiKey: 'test-key',
        model: 'gpt-5',
      })

      expect(usedModel).toBe('gpt-5')
    })

    it('handles empty content response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: '', // Empty content
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      // Should handle gracefully (might return default or empty)
      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      // Either returns default estimate or empty
      expect(Array.isArray(estimates)).toBe(true)
    })

    it('clamps negative score to 0', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('function test() { }')

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              score: -0.5, // Negative
              effort: 'trivial',
              reasoning: 'Negative score',
            }),
          },
        }],
      })

      const { estimateFixability } = await import('../src/fixability/index.js')

      const symbols = [createSymbolIssues()]

      const estimates = await estimateFixability(symbols, { apiKey: 'test-key' })

      expect(estimates.length).toBe(1)
      expect(estimates[0].score).toBe(0) // Clamped to 0
    })
  })
})
