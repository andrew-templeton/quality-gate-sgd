import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import {
  buildDimension,
  appendToConfigFile,
} from '../../src/dimensions/builder.js'

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  }
})

// Mock child_process
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}))

describe('buildDimension', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when Claude CLI is not available', async () => {
    const { execSync, spawnSync } = await import('child_process')
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command not found')
    })
    vi.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: 1,
      signal: null,
      pid: 123,
      output: [],
    })

    const result = await buildDimension({
      command: 'npx plato -r src',
      hint: 'Code complexity metric',
    })

    expect(result.error).toContain('Failed to get response from Claude CLI')
  })

  it('runs command when runNow is true', async () => {
    const { execSync, spawnSync } = await import('child_process')

    // Mock running the command
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'sh') {
        return {
          stdout: '{"summary": {"averageComplexity": 3.5}}',
          stderr: '',
          status: 0,
          signal: null,
          pid: 123,
          output: [],
        }
      }
      return {
        stdout: '',
        stderr: '',
        status: 1,
        signal: null,
        pid: 124,
        output: [],
      }
    })

    // Mock Claude CLI failing
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Claude not available')
    })

    await buildDimension({
      command: 'npx plato -r src',
      runNow: true,
      fetchDocs: false,
    })

    // Should have called the command via spawnSync
    expect(spawnSync).toHaveBeenCalledWith(
      'sh',
      ['-c', 'npx plato -r src'],
      expect.any(Object)
    )
  })

  it('fetches package docs when available', async () => {
    const { execSync, spawnSync } = await import('child_process')

    vi.mocked(execSync).mockImplementation((cmd) => {
      if (String(cmd).includes('npm view')) {
        return 'Plato is a complexity analyzer for JavaScript\n'
      }
      throw new Error('Claude not available')
    })

    vi.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: 1,
      signal: null,
      pid: 123,
      output: [],
    })

    await buildDimension({
      command: 'npx plato -r src',
      hint: 'Code complexity',
      fetchDocs: true,
    })

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('npm view plato readme'),
      expect.any(Object)
    )
  })

  it('parses valid LLM response', async () => {
    const { execSync } = await import('child_process')

    const validConfig = {
      path: 'custom.avgComplexity',
      displayName: 'Average Complexity',
      description: 'Cyclomatic complexity of code',
      direction: 'lower-better',
      continuity: 'smooth',
      defaultWeight: 0.05,
      extractor: {
        type: 'script',
        command: 'npx plato -r src',
        parseOutput: 'json',
        jsonPath: '$.summary.averageComplexity',
      },
    }

    vi.mocked(execSync).mockReturnValue(JSON.stringify(validConfig))

    const result = await buildDimension({
      command: 'npx plato -r src',
      fetchDocs: false,
    })

    expect(result.config).toBeDefined()
    expect(result.config?.path).toBe('custom.avgComplexity')
    expect(result.config?.direction).toBe('lower-better')
  })

  it('handles LLM response wrapped in markdown', async () => {
    const { execSync } = await import('child_process')

    const validConfig = {
      path: 'custom.complexity',
      displayName: 'Complexity',
      direction: 'lower-better',
      extractor: {
        type: 'script',
        command: 'npx plato',
        parseOutput: 'number',
      },
    }

    vi.mocked(execSync).mockReturnValue(
      '```json\n' + JSON.stringify(validConfig) + '\n```'
    )

    const result = await buildDimension({
      command: 'npx plato',
      fetchDocs: false,
    })

    expect(result.config).toBeDefined()
    expect(result.config?.path).toBe('custom.complexity')
  })

  it('returns error for invalid LLM response', async () => {
    const { execSync } = await import('child_process')

    vi.mocked(execSync).mockReturnValue('This is not valid JSON at all')

    const result = await buildDimension({
      command: 'npx plato -r src',
      fetchDocs: false,
    })

    expect(result.error).toContain('Failed to parse LLM response')
    expect(result.rawResponse).toBe('This is not valid JSON at all')
  })

  it('rejects config with invalid path', async () => {
    const { execSync } = await import('child_process')

    const invalidConfig = {
      path: 'invalid.path', // Should start with 'custom.'
      displayName: 'Test',
      direction: 'lower-better',
      extractor: {
        type: 'script',
        command: 'test',
        parseOutput: 'number',
      },
    }

    vi.mocked(execSync).mockReturnValue(JSON.stringify(invalidConfig))

    const result = await buildDimension({
      command: 'test',
      fetchDocs: false,
    })

    expect(result.error).toContain('Failed to parse LLM response')
  })

  it('extracts package name from npx command', async () => {
    const { execSync, spawnSync } = await import('child_process')

    vi.mocked(execSync).mockImplementation((cmd) => {
      if (String(cmd).includes('npm view madge')) {
        return 'Madge is a module dependency graph generator'
      }
      throw new Error('Claude not available')
    })

    vi.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: 1,
      signal: null,
      pid: 123,
      output: [],
    })

    await buildDimension({
      command: 'npx madge --circular --json src',
      fetchDocs: true,
    })

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('npm view madge readme'),
      expect.any(Object)
    )
  })

  it('extracts package name from node_modules path', async () => {
    const { execSync, spawnSync } = await import('child_process')

    vi.mocked(execSync).mockImplementation((cmd) => {
      if (String(cmd).includes('npm view depcheck')) {
        return 'Depcheck checks for unused dependencies'
      }
      throw new Error('Claude not available')
    })

    vi.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: 1,
      signal: null,
      pid: 123,
      output: [],
    })

    await buildDimension({
      command: 'node_modules/.bin/depcheck',
      fetchDocs: true,
    })

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('npm view depcheck readme'),
      expect.any(Object)
    )
  })

  it('recognizes known tool names in command', async () => {
    const { execSync, spawnSync } = await import('child_process')

    vi.mocked(execSync).mockImplementation((cmd) => {
      if (String(cmd).includes('npm view jscpd')) {
        return 'JSCPD - Copy/paste detector'
      }
      throw new Error('Claude not available')
    })

    vi.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: 1,
      signal: null,
      pid: 123,
      output: [],
    })

    await buildDimension({
      command: 'run jscpd --format json',
      fetchDocs: true,
    })

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('npm view jscpd readme'),
      expect.any(Object)
    )
  })

  it('handles command execution error gracefully', async () => {
    const { execSync, spawnSync } = await import('child_process')

    // Command fails
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'sh') {
        throw new Error('Command execution failed')
      }
      return {
        stdout: '',
        stderr: '',
        status: 1,
        signal: null,
        pid: 123,
        output: [],
      }
    })

    // Claude not available
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Claude not available')
    })

    const result = await buildDimension({
      command: 'failing-command',
      runNow: true,
      fetchDocs: false,
    })

    // Should still return error about Claude, not crash
    expect(result.error).toContain('Failed to get response from Claude CLI')
  })

  it('tries alternative Claude invocation when first fails', async () => {
    const { execSync, spawnSync } = await import('child_process')

    const validConfig = {
      path: 'custom.test',
      displayName: 'Test',
      direction: 'higher-better',
      extractor: {
        type: 'script',
        command: 'test',
        parseOutput: 'number',
      },
    }

    // First invocation fails
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('pipe failed')
    })

    // Alternative invocation succeeds
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'claude') {
        return {
          stdout: JSON.stringify(validConfig),
          stderr: '',
          status: 0,
          signal: null,
          pid: 123,
          output: [],
        }
      }
      return {
        stdout: '',
        stderr: '',
        status: 1,
        signal: null,
        pid: 124,
        output: [],
      }
    })

    const result = await buildDimension({
      command: 'test',
      fetchDocs: false,
    })

    expect(result.config).toBeDefined()
    expect(result.config?.path).toBe('custom.test')
  })

  it('validates continuity values', async () => {
    const { execSync } = await import('child_process')

    const configWithInvalidContinuity = {
      path: 'custom.test',
      displayName: 'Test',
      direction: 'lower-better',
      continuity: 'invalid',
      extractor: {
        type: 'script',
        command: 'test',
        parseOutput: 'number',
      },
    }

    vi.mocked(execSync).mockReturnValue(JSON.stringify(configWithInvalidContinuity))

    const result = await buildDimension({
      command: 'test',
      fetchDocs: false,
    })

    // Should default to 'discrete' for invalid continuity
    expect(result.config?.continuity).toBe('discrete')
  })

  it('clamps defaultWeight to valid range', async () => {
    const { execSync } = await import('child_process')

    const configWithHighWeight = {
      path: 'custom.test',
      displayName: 'Test',
      direction: 'lower-better',
      defaultWeight: 5.0, // Too high
      extractor: {
        type: 'script',
        command: 'test',
        parseOutput: 'number',
      },
    }

    vi.mocked(execSync).mockReturnValue(JSON.stringify(configWithHighWeight))

    const result = await buildDimension({
      command: 'test',
      fetchDocs: false,
    })

    expect(result.config?.defaultWeight).toBe(1) // Clamped to max
  })
})

describe('appendToConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleConfig = {
    path: 'custom.complexity',
    displayName: 'Code Complexity',
    direction: 'lower-better' as const,
    extractor: {
      type: 'script' as const,
      command: 'npx plato -r src',
      parseOutput: 'json' as const,
      jsonPath: '$.summary.average',
    },
  }

  it('creates new config file when none exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    appendToConfigFile(sampleConfig)

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('quality-gate.config.ts'),
      expect.stringContaining('export const customDimensions'),
      'utf-8'
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('custom.complexity'),
      'utf-8'
    )
  })

  it('appends to existing config file with customDimensions array', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(`
import type { CustomDimensionConfig } from 'quality-gate-sgd';

export const customDimensions: CustomDimensionConfig[] = [
  { path: 'custom.existing', displayName: 'Existing', direction: 'higher-better', extractor: { type: 'script', command: 'test', parseOutput: 'number' } },
];
`)

    appendToConfigFile(sampleConfig)

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('custom.existing'),
      'utf-8'
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('custom.complexity'),
      'utf-8'
    )
  })

  it('appends as new export when no customDimensions found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(`
// Some other config content
export const otherSetting = true;
`)

    appendToConfigFile(sampleConfig)

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('export const customDimensions'),
      'utf-8'
    )
  })

  it('uses provided config path', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    appendToConfigFile(sampleConfig, '/custom/path/config.ts')

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/custom/path/config.ts',
      expect.any(String),
      'utf-8'
    )
  })
})
