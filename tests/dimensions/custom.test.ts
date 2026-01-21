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

  it('tries multiple config file names in order', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await loadCustomDimensions('/test/path')

    // Should check all config file names
    expect(fs.existsSync).toHaveBeenCalledWith('/test/path/quality-gate.config.ts')
    expect(fs.existsSync).toHaveBeenCalledWith('/test/path/quality-gate.config.js')
    expect(fs.existsSync).toHaveBeenCalledWith('/test/path/quality-gate.config.mjs')
    expect(fs.existsSync).toHaveBeenCalledWith('/test/path/quality-gate.config.cjs')
  })

  it('handles config file read errors gracefully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error')
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await loadCustomDimensions('/test/path')

    expect(result).toEqual([])
    consoleSpy.mockRestore()
  })

  it('parses TS config with simple JSON array export', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    // Simple literal JSON array in the file
    const configContent = `
export const customDimensions = [
  {"path": "custom.test", "displayName": "Test", "direction": "lower-better", "extractor": {"type": "script", "command": "echo 1"}}
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    const result = await loadCustomDimensions('/test/path')

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('custom.test')
  })

  it('warns when TS config has JS expressions', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    // Config with JS expressions that can't be parsed as JSON
    const configContent = `
export const customDimensions = [
  { path: \`custom.test\`, displayName: getDisplayName(), direction: 'lower-better' }
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await loadCustomDimensions('/test/path')

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Install tsx or ts-node')
    )
    consoleSpy.mockRestore()
  })

  it('returns empty when no customDimensions export found in TS file', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    const configContent = `
export const otherConfig = { foo: 'bar' };
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    const result = await loadCustomDimensions('/test/path')

    expect(result).toEqual([])
  })

  it('filters out invalid configs during validation', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    // Mix of valid and invalid configs
    const configContent = `
export const customDimensions = [
  {"path": "custom.valid", "displayName": "Valid", "direction": "lower-better", "extractor": {"type": "script", "command": "echo 1"}},
  {"path": "invalid.noprefix", "displayName": "Invalid", "direction": "lower-better", "extractor": {"type": "script", "command": "echo 1"}},
  {"path": "custom.missing", "displayName": "Missing"},
  null,
  "not-an-object"
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await loadCustomDimensions('/test/path')

    // Only the first valid config should pass
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('custom.valid')
    consoleSpy.mockRestore()
  })

  it('sets default values for continuity and defaultWeight', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    const configContent = `
export const customDimensions = [
  {"path": "custom.test", "displayName": "Test", "direction": "higher-better", "extractor": {"type": "script", "command": "echo 1"}}
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    const result = await loadCustomDimensions('/test/path')

    expect(result[0].continuity).toBe('discrete')
    expect(result[0].defaultWeight).toBe(0.01)
  })

  it('preserves custom continuity and defaultWeight values', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    const configContent = `
export const customDimensions = [
  {"path": "custom.test", "displayName": "Test", "direction": "lower-better", "continuity": "smooth", "defaultWeight": 0.5, "extractor": {"type": "script", "command": "echo 1"}}
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    const result = await loadCustomDimensions('/test/path')

    expect(result[0].continuity).toBe('smooth')
    expect(result[0].defaultWeight).toBe(0.5)
  })

  // Note: Testing .js/.mjs/.cjs config files requires actual file system access
  // and dynamic imports, which are challenging to mock in Vitest. The TypeScript
  // path is tested via the readFileSync fallback which covers the main logic.
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

  it('returns 0 for JSON with non-numeric root when no jsonPath', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('{"key": "value"}')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'echo json',
        parseOutput: 'json',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(0)
  })

  it('returns 0 for unknown parseOutput mode', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue('42\n')

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'echo 42',
        parseOutput: 'unknown' as 'number',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(0)
  })

  it('returns undefined when array indexing used on non-array', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      items: 'not-an-array',
    }))

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'cat report.json',
        parseOutput: 'json',
        jsonPath: '$.items[0]',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(0)
  })

  it('returns 0 when jsonPath traverses through null', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      summary: null,
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

    expect(result).toBe(0)
  })

  it('returns 0 when jsonPath traverses through primitive', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      summary: 42,
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

    expect(result).toBe(0)
  })

  it('parses string value from jsonPath as number', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      value: '123.5',
    }))

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'cat report.json',
        parseOutput: 'json',
        jsonPath: '$.value',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(123.5)
  })

  it('returns 0 for non-numeric string value from jsonPath', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      value: 'not-a-number',
    }))

    const config: CustomDimensionConfig = {
      ...baseConfig,
      extractor: {
        type: 'script',
        command: 'cat report.json',
        parseOutput: 'json',
        jsonPath: '$.value',
      },
    }

    const result = extractCustomMetric(config)

    expect(result).toBe(0)
  })

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

  it('registers dimensions from config file', async () => {
    const { registerDimension } = await import('../../src/dimensions/registry.js')

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    const configContent = `
export const customDimensions = [
  {"path": "custom.metric1", "displayName": "Metric 1", "direction": "lower-better", "extractor": {"type": "script", "command": "echo 1"}},
  {"path": "custom.metric2", "displayName": "Metric 2", "description": "Custom description", "direction": "higher-better", "extractor": {"type": "script", "command": "echo 2"}}
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    const configs = await registerCustomDimensions('/test/path')

    expect(configs).toHaveLength(2)
    expect(registerDimension).toHaveBeenCalledTimes(2)
    expect(registerDimension).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'custom.metric1',
        displayName: 'Metric 1',
        category: 'custom',
        direction: 'lower-better',
      })
    )
    expect(registerDimension).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'custom.metric2',
        displayName: 'Metric 2',
        description: 'Custom description',
        category: 'custom',
        direction: 'higher-better',
      })
    )
  })

  it('uses default description when not provided', async () => {
    const { registerDimension } = await import('../../src/dimensions/registry.js')

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    const configContent = `
export const customDimensions = [
  {"path": "custom.test", "displayName": "Test Metric", "direction": "lower-better", "extractor": {"type": "script", "command": "echo 1"}}
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    await registerCustomDimensions('/test/path')

    expect(registerDimension).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Custom metric: Test Metric',
      })
    )
  })

  it('handles registration errors gracefully', async () => {
    const { registerDimension } = await import('../../src/dimensions/registry.js')
    vi.mocked(registerDimension).mockImplementation(() => {
      throw new Error('Registration failed')
    })

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    const configContent = `
export const customDimensions = [
  {"path": "custom.test", "displayName": "Test", "direction": "lower-better", "extractor": {"type": "script", "command": "echo 1"}}
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const configs = await registerCustomDimensions('/test/path')

    // Still returns configs even if registration fails
    expect(configs).toHaveLength(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to register custom dimension'),
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })

  it('sets default continuity and weight in registered dimension', async () => {
    const { registerDimension } = await import('../../src/dimensions/registry.js')

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return String(path).endsWith('quality-gate.config.ts')
    })

    const configContent = `
export const customDimensions = [
  {"path": "custom.test", "displayName": "Test", "direction": "lower-better", "extractor": {"type": "script", "command": "echo 1"}}
];
`
    vi.mocked(fs.readFileSync).mockReturnValue(configContent)

    await registerCustomDimensions('/test/path')

    expect(registerDimension).toHaveBeenCalledWith(
      expect.objectContaining({
        continuity: 'discrete',
        defaultWeight: 0.01,
        unit: 'count',
      })
    )
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
