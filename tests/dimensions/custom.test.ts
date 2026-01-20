import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import {
  loadCustomDimensions,
  extractCustomMetric,
  registerCustomDimensions,
  extractAllCustomMetrics,
  type CustomDimensionConfig,
} from '../../src/dimensions/custom.js'

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
  execSync: vi.fn(),
}))

// Mock registry - ensure it doesn't conflict with our tests
vi.mock('../../src/dimensions/registry.js', () => ({
  registerDimension: vi.fn(),
  getValidPaths: vi.fn(() => []),
}))

describe('loadCustomDimensions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no config file exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = await loadCustomDimensions()

    expect(result).toEqual([])
  })

  // Note: Testing loadCustomDimensions with config file parsing is challenging
  // because it uses dynamic imports. The main functionality tested here is the
  // empty case and extractCustomMetric which doesn't rely on dynamic imports.
})

describe('extractCustomMetric', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseConfig: CustomDimensionConfig = {
    path: 'custom.test',
    displayName: 'Test',
    direction: 'lower-better',
    extractor: {
      type: 'script',
      command: 'echo 42',
      parseOutput: 'number',
    },
  }

  it('extracts number from simple output', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('42\n')

    const result = extractCustomMetric(baseConfig)

    expect(result).toBe(42)
  })

  it('extracts first number from text output', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('Found 15 issues in 3 files\n')

    const result = extractCustomMetric(baseConfig)

    expect(result).toBe(15)
  })

  it('handles decimal numbers', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('Average: 3.14159\n')

    const result = extractCustomMetric(baseConfig)

    expect(result).toBe(3.14159)
  })

  it('handles negative numbers', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('Delta: -5.5\n')

    const result = extractCustomMetric(baseConfig)

    expect(result).toBe(-5.5)
  })

  it('returns 0 when no number found', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('No numbers here\n')

    const result = extractCustomMetric(baseConfig)

    expect(result).toBe(0)
  })

  it('extracts value from JSON output with jsonPath', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      summary: {
        total: 25,
        average: 5.5,
      },
    }))

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'cat report.json',
        parseOutput: 'json',
        jsonPath: '$.summary.total',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(25)
  })

  it('extracts value using jsonPath without $ prefix', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      count: 100,
    }))

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'cat report.json',
        parseOutput: 'json',
        jsonPath: 'count',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(100)
  })

  it('extracts value from JSON array using index', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      items: [10, 20, 30],
    }))

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'cat report.json',
        parseOutput: 'json',
        jsonPath: '$.items[1]',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(20)
  })

  it('returns 0 for invalid JSON', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('not valid json')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'cat broken.json',
        parseOutput: 'json',
        jsonPath: '$.value',
      },
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = extractCustomMetric(config)

    expect(result).toBe(0)
    consoleSpy.mockRestore()
  })

  it('returns numeric JSON value when no jsonPath', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('42')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'echo 42',
        parseOutput: 'json',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(42)
  })

  it('extracts value using regex with capture group', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('Complexity score: 7.5 (medium)\n')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'plato report',
        parseOutput: 'regex',
        regex: 'score:\\s*(\\d+\\.?\\d*)',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(7.5)
  })

  it('returns 0 when regex has no capture group match', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('No match here\n')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'test',
        parseOutput: 'regex',
        regex: 'score:\\s*(\\d+)',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(0)
  })

  it('returns 0 when regex is missing but parseOutput is regex', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('42\n')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'test',
        parseOutput: 'regex',
        // No regex provided
      },
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = extractCustomMetric(config)

    expect(result).toBe(0)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('regex parseOutput requires regex pattern')
    )
    consoleSpy.mockRestore()
  })

  it('handles invalid regex pattern gracefully', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('42\n')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'test',
        parseOutput: 'regex',
        regex: '[invalid regex(',
      },
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = extractCustomMetric(config)

    expect(result).toBe(0)
    consoleSpy.mockRestore()
  })

  it('returns 0 when command fails', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed')
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = extractCustomMetric(baseConfig)

    expect(result).toBe(0)
    consoleSpy.mockRestore()
  })

  it('uses custom timeout', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('42\n')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'slow-command',
        timeout: 60000,
      },
    }

    extractCustomMetric(config)

    expect(execSync).toHaveBeenCalledWith(
      'slow-command',
      expect.objectContaining({ timeout: 60000 })
    )
  })
})

describe('registerCustomDimensions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no config file exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const configs = await registerCustomDimensions('/nonexistent')

    expect(configs).toEqual([])
  })
})

describe('extractAllCustomMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts all metrics from configs', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync)
      .mockReturnValueOnce('10\n')
      .mockReturnValueOnce('20\n')

    const configs: CustomDimensionConfig[] = [
      {
        path: 'custom.metricA',
        displayName: 'Metric A',
        direction: 'lower-better',
        extractor: { type: 'script', command: 'echo 10' },
      },
      {
        path: 'custom.metricB',
        displayName: 'Metric B',
        direction: 'higher-better',
        extractor: { type: 'script', command: 'echo 20' },
      },
    ]

    const result = extractAllCustomMetrics(configs)

    expect(result).toEqual({
      metricA: 10,
      metricB: 20,
    })
  })

  it('returns empty object for empty configs', () => {
    const result = extractAllCustomMetrics([])

    expect(result).toEqual({})
  })
})
