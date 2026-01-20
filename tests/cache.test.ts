import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import { execSync } from 'child_process'
import type { QualityGateCache, CacheEntry, Metrics, QualityRules } from '../src/types.js'

// Mock modules
vi.mock('fs')
vi.mock('child_process')
vi.mock('../src/config.js', () => ({
  getConfig: vi.fn(() => ({
    projectRoot: '/test/project',
    codePathspecs: ['src/', 'tests/'],
    cache: {
      file: '/test/project/.quality-cache.json',
    },
  })),
}))
vi.mock('../src/rules.js', () => ({
  computeRulesHash: vi.fn(() => 'test-rules-hash'),
}))

// Import after mocks
import {
  getCurrentCommitHash,
  getBaselineCommitHash,
  getCacheKey,
  isWIPKey,
  loadCache,
  saveCache,
  getCacheEntry,
  setCacheEntry,
  createCacheEntry,
  findBaselineEntry,
  pruneOldEntries,
} from '../src/cache.js'

const mockFs = vi.mocked(fs)
const mockExecSync = vi.mocked(execSync)

describe('cache module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCurrentCommitHash', () => {
    it('returns trimmed commit hash', () => {
      mockExecSync.mockReturnValue('abc123def456\n')

      const result = getCurrentCommitHash()

      expect(result).toBe('abc123def456')
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse HEAD', {
        cwd: '/test/project',
        encoding: 'utf-8',
      })
    })

    it('throws error on git failure', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('git error')
      })

      expect(() => getCurrentCommitHash()).toThrow('Failed to get current commit hash')
    })
  })

  describe('getBaselineCommitHash', () => {
    it('returns parent commit hash', () => {
      mockExecSync.mockReturnValue('parent123\n')

      const result = getBaselineCommitHash()

      expect(result).toBe('parent123')
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse HEAD~1', {
        cwd: '/test/project',
        encoding: 'utf-8',
      })
    })

    it('returns undefined for first commit', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('no parent')
      })

      const result = getBaselineCommitHash()

      expect(result).toBeUndefined()
    })
  })

  describe('getCacheKey', () => {
    it('returns commit hash when no uncommitted changes', () => {
      mockExecSync
        .mockReturnValueOnce('') // git status --porcelain
        .mockReturnValueOnce('abc123\n') // git rev-parse HEAD

      const result = getCacheKey()

      expect(result).toEqual({
        key: 'abc123',
        isWIP: false,
      })
    })

    it('returns wip key when uncommitted changes exist', () => {
      mockExecSync
        .mockReturnValueOnce('M src/file.ts\n') // git status --porcelain
        .mockReturnValueOnce('diff content') // git diff HEAD
        .mockReturnValueOnce('') // git ls-files --others

      const result = getCacheKey()

      expect(result.isWIP).toBe(true)
      expect(result.key).toMatch(/^wip:/)
    })
  })

  describe('isWIPKey', () => {
    it('returns true for wip keys', () => {
      expect(isWIPKey('wip:abc123')).toBe(true)
    })

    it('returns false for commit hashes', () => {
      expect(isWIPKey('abc123def456')).toBe(false)
    })
  })

  describe('loadCache', () => {
    it('returns empty cache when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = loadCache()

      expect(result).toEqual({
        schemaVersion: 1,
        entries: {},
      })
    })

    it('returns parsed cache when file exists with valid schema', () => {
      const cacheData: QualityGateCache = {
        schemaVersion: 1,
        entries: {
          'abc123': {
            timestamp: 12345,
            rulesVersion: '1.0.0',
            rulesHash: 'hash',
            evaluation: { status: 'pass', failedRules: [] },
            metrics: {} as Metrics,
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(cacheData))

      const result = loadCache()

      expect(result).toEqual(cacheData)
    })

    it('returns empty cache on invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('invalid json')

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = loadCache()

      expect(result).toEqual({
        schemaVersion: 1,
        entries: {},
      })
      consoleSpy.mockRestore()
    })

    it('returns empty cache on schema version mismatch', () => {
      const oldCache = {
        schemaVersion: 0,
        entries: {},
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(oldCache))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = loadCache()

      expect(result).toEqual({
        schemaVersion: 1,
        entries: {},
      })
      consoleSpy.mockRestore()
    })
  })

  describe('saveCache', () => {
    it('writes sorted cache to file', () => {
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {
          'zzz': { timestamp: 1, rulesVersion: '1.0.0', rulesHash: 'h', evaluation: { status: 'pass', failedRules: [] }, metrics: {} as Metrics },
          'aaa': { timestamp: 2, rulesVersion: '1.0.0', rulesHash: 'h', evaluation: { status: 'pass', failedRules: [] }, metrics: {} as Metrics },
        },
      }

      saveCache(cache)

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/project/.quality-cache.json',
        expect.stringContaining('"aaa"')
      )

      // Verify aaa comes before zzz in the output
      const writtenContent = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string
      const aaaIndex = writtenContent.indexOf('"aaa"')
      const zzzIndex = writtenContent.indexOf('"zzz"')
      expect(aaaIndex).toBeLessThan(zzzIndex)
    })
  })

  describe('getCacheEntry', () => {
    it('returns entry for existing key', () => {
      const entry: CacheEntry = {
        timestamp: 12345,
        rulesVersion: '1.0.0',
        rulesHash: 'hash',
        evaluation: { status: 'pass', failedRules: [] },
        metrics: {} as Metrics,
      }
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: { 'abc123': entry },
      }

      const result = getCacheEntry(cache, 'abc123')

      expect(result).toBe(entry)
    })

    it('returns undefined for missing key', () => {
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {},
      }

      const result = getCacheEntry(cache, 'missing')

      expect(result).toBeUndefined()
    })
  })

  describe('setCacheEntry', () => {
    it('sets entry in cache', () => {
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {},
      }
      const entry: CacheEntry = {
        timestamp: 12345,
        rulesVersion: '1.0.0',
        rulesHash: 'hash',
        evaluation: { status: 'pass', failedRules: [] },
        metrics: {} as Metrics,
      }

      setCacheEntry(cache, 'abc123', entry)

      expect(cache.entries['abc123']).toBe(entry)
    })
  })

  describe('createCacheEntry', () => {
    it('creates entry with correct structure', () => {
      const metrics: Metrics = {
        coverage: { unit: { branches: 80, statements: 85 } },
      } as Metrics
      const rules: QualityRules = {
        version: '1.0.0',
        rules: {},
      }

      const result = createCacheEntry(metrics, rules, 'pass', [])

      expect(result.rulesVersion).toBe('1.0.0')
      expect(result.rulesHash).toBe('test-rules-hash')
      expect(result.evaluation.status).toBe('pass')
      expect(result.evaluation.failedRules).toEqual([])
      expect(result.metrics).toBe(metrics)
      expect(typeof result.timestamp).toBe('number')
    })

    it('creates entry with failed rules', () => {
      const metrics = {} as Metrics
      const rules: QualityRules = { version: '1.0.0', rules: {} }

      const result = createCacheEntry(metrics, rules, 'fail', ['rule1', 'rule2'])

      expect(result.evaluation.status).toBe('fail')
      expect(result.evaluation.failedRules).toEqual(['rule1', 'rule2'])
    })
  })

  describe('findBaselineEntry', () => {
    it('returns HEAD entry for WIP code', () => {
      const headEntry: CacheEntry = {
        timestamp: 12345,
        rulesVersion: '1.0.0',
        rulesHash: 'hash',
        evaluation: { status: 'pass', failedRules: [] },
        metrics: {} as Metrics,
      }

      mockExecSync.mockReturnValue('headcommit\n')

      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: { 'headcommit': headEntry },
      }
      const rules: QualityRules = { version: '1.0.0', rules: {} }

      const result = findBaselineEntry(cache, rules, true)

      expect(result).toBe(headEntry)
    })

    it('returns parent entry for committed code', () => {
      const parentEntry: CacheEntry = {
        timestamp: 12345,
        rulesVersion: '1.0.0',
        rulesHash: 'hash',
        evaluation: { status: 'pass', failedRules: [] },
        metrics: {} as Metrics,
      }

      mockExecSync.mockReturnValue('parentcommit\n')

      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: { 'parentcommit': parentEntry },
      }
      const rules: QualityRules = { version: '1.0.0', rules: {} }

      const result = findBaselineEntry(cache, rules, false)

      expect(result).toBe(parentEntry)
    })

    it('returns undefined when no baseline exists', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('no parent')
      })

      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {},
      }
      const rules: QualityRules = { version: '1.0.0', rules: {} }

      const result = findBaselineEntry(cache, rules, false)

      expect(result).toBeUndefined()
    })
  })

  describe('pruneOldEntries', () => {
    it('removes entries older than specified days', () => {
      const now = Date.now()
      const oldTimestamp = now - 100 * 24 * 60 * 60 * 1000 // 100 days ago
      const recentTimestamp = now - 10 * 24 * 60 * 60 * 1000 // 10 days ago

      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {
          'old': { timestamp: oldTimestamp, rulesVersion: '1.0.0', rulesHash: 'h', evaluation: { status: 'pass', failedRules: [] }, metrics: {} as Metrics },
          'recent': { timestamp: recentTimestamp, rulesVersion: '1.0.0', rulesHash: 'h', evaluation: { status: 'pass', failedRules: [] }, metrics: {} as Metrics },
        },
      }

      const pruned = pruneOldEntries(cache, 90)

      expect(pruned).toBe(1)
      expect(cache.entries['old']).toBeUndefined()
      expect(cache.entries['recent']).toBeDefined()
    })

    it('returns 0 when no entries to prune', () => {
      const cache: QualityGateCache = {
        schemaVersion: 1,
        entries: {},
      }

      const pruned = pruneOldEntries(cache, 90)

      expect(pruned).toBe(0)
    })
  })
})
