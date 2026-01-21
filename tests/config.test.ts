import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  loadConfig,
  getConfig,
  resetConfig,
  getSonarAuthToken,
  getSonarCurlAuth,
} from '../src/config.js'
import {
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
} from 'fs'
import path from 'path'

describe('loadConfig', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    resetConfig()
  })

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv }
    resetConfig()
  })

  it('returns default configuration', () => {
    const config = loadConfig()

    expect(config.projectRoot).toBeDefined()
    expect(config.sonarqube.url).toBe('http://localhost:9000')
    expect(config.coverage.unitDir).toBe('coverage')
    expect(config.cache.maxAgeDays).toBe(90)
    expect(config.rulesFile).toBe('rules.json')
    expect(config.codePathspecs).toContain('src/')
  })

  it('respects SONARQUBE_URL environment variable', () => {
    process.env.SONARQUBE_URL = 'http://custom-sonar:9000'

    const config = loadConfig()

    expect(config.sonarqube.url).toBe('http://custom-sonar:9000')
  })

  it('respects QUALITY_CACHE_MAX_AGE_DAYS environment variable', () => {
    process.env.QUALITY_CACHE_MAX_AGE_DAYS = '30'

    const config = loadConfig()

    expect(config.cache.maxAgeDays).toBe(30)
  })

  it('respects QUALITY_CODE_PATHSPECS environment variable', () => {
    process.env.QUALITY_CODE_PATHSPECS = 'lib/,test/'

    const config = loadConfig()

    expect(config.codePathspecs).toEqual(['lib/', 'test/'])
  })

  it('respects QUALITY_RULES_FILE environment variable', () => {
    process.env.QUALITY_RULES_FILE = 'custom-rules.json'

    const config = loadConfig()

    expect(config.rulesFile).toBe('custom-rules.json')
  })

  it('detects project key from package.json', () => {
    const config = loadConfig()

    // Should detect from current project's package.json
    expect(config.sonarqube.projectKey).toBe('quality-gate-sgd')
  })

  it('detects project key from sonar-project.properties when available', () => {
    // The actual project has sonar-project.properties
    const sonarPropsPath = path.join(process.cwd(), 'sonar-project.properties')
    if (existsSync(sonarPropsPath)) {
      const content = readFileSync(sonarPropsPath, 'utf-8')
      if (content.includes('sonar.projectKey=')) {
        const config = loadConfig()
        // Should detect from sonar-project.properties
        expect(config.sonarqube.projectKey).toBe('quality-gate-sgd')
      }
    }
  })

  it('respects QUALITY_PROJECT_ROOT environment variable', () => {
    const testRoot = path.join(process.cwd(), 'tests/fixtures')
    process.env.QUALITY_PROJECT_ROOT = testRoot

    const config = loadConfig()

    expect(config.projectRoot).toBe(testRoot)
  })

  it('respects QUALITY_PROJECT_NAME environment variable', () => {
    process.env.QUALITY_PROJECT_NAME = 'my-custom-project'

    const config = loadConfig()

    expect(config.projectName).toBe('my-custom-project')
  })

  it('respects SONARQUBE_PROJECT_KEY environment variable', () => {
    process.env.SONARQUBE_PROJECT_KEY = 'custom-project-key'

    const config = loadConfig()

    expect(config.sonarqube.projectKey).toBe('custom-project-key')
  })

  it('respects SONARQUBE_DEFAULT_USER environment variable', () => {
    process.env.SONARQUBE_DEFAULT_USER = 'custom-user'

    const config = loadConfig()

    expect(config.sonarqube.defaultCredentials.user).toBe('custom-user')
  })

  it('respects SONARQUBE_DEFAULT_PASSWORD environment variable', () => {
    process.env.SONARQUBE_DEFAULT_PASSWORD = 'custom-password'

    const config = loadConfig()

    expect(config.sonarqube.defaultCredentials.password).toBe('custom-password')
  })

  it('respects QUALITY_COVERAGE_UNIT_DIR environment variable', () => {
    process.env.QUALITY_COVERAGE_UNIT_DIR = 'custom-coverage'

    const config = loadConfig()

    expect(config.coverage.unitDir).toBe('custom-coverage')
  })

  it('respects QUALITY_COVERAGE_LAMBDA_DIR environment variable', () => {
    process.env.QUALITY_COVERAGE_LAMBDA_DIR = 'custom-lambda-coverage'

    const config = loadConfig()

    expect(config.coverage.lambdaDir).toBe('custom-lambda-coverage')
  })

  it('respects QUALITY_COVERAGE_SUMMARY_FILE environment variable', () => {
    process.env.QUALITY_COVERAGE_SUMMARY_FILE = 'custom-summary.json'

    const config = loadConfig()

    expect(config.coverage.summaryFile).toBe('custom-summary.json')
  })

  it('respects QUALITY_CACHE_FILE environment variable', () => {
    process.env.QUALITY_CACHE_FILE = '/custom/cache/file.json'

    const config = loadConfig()

    expect(config.cache.file).toBe('/custom/cache/file.json')
  })
})

describe('getConfig', () => {
  beforeEach(() => {
    resetConfig()
  })

  afterEach(() => {
    resetConfig()
  })

  it('caches configuration', () => {
    const config1 = getConfig()
    const config2 = getConfig()

    expect(config1).toBe(config2) // Same object reference
  })

  it('returns fresh config after reset', () => {
    const config1 = getConfig()
    resetConfig()
    const config2 = getConfig()

    expect(config1).not.toBe(config2) // Different object references
    expect(config1).toEqual(config2) // But same values
  })
})

describe('resetConfig', () => {
  it('clears the cached configuration', () => {
    const config1 = getConfig()
    resetConfig()
    const config2 = getConfig()

    expect(config1).not.toBe(config2)
  })
})

describe('getSonarAuthToken', () => {
  const testTokenPath = path.join(process.cwd(), '.test-sonar-token')

  afterEach(() => {
    if (existsSync(testTokenPath)) {
      unlinkSync(testTokenPath)
    }
    resetConfig()
  })

  it('returns default user when no token file exists', () => {
    const token = getSonarAuthToken()

    expect(token).toBe('admin') // Default user
  })

  it('reads token from file when it exists', () => {
    // Set up token file path in config
    process.env.SONARQUBE_TOKEN_FILE = testTokenPath
    writeFileSync(testTokenPath, 'my-secret-token\n')
    resetConfig()

    const token = getSonarAuthToken()

    expect(token).toBe('my-secret-token')
  })
})

describe('detectProjectKey edge cases', () => {
  const testDir = path.join(process.cwd(), 'tests/fixtures/config-test')
  const originalEnv = { ...process.env }

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    resetConfig()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    resetConfig()
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  })

  it('returns my-project when no package.json or sonar-project.properties exist', () => {
    // Create an empty directory with no package.json
    process.env.QUALITY_PROJECT_ROOT = testDir
    delete process.env.SONARQUBE_PROJECT_KEY

    const config = loadConfig()

    expect(config.sonarqube.projectKey).toBe('my-project')
  })

  it('reads project key from sonar-project.properties', () => {
    // Create sonar-project.properties
    writeFileSync(
      path.join(testDir, 'sonar-project.properties'),
      'sonar.projectKey=from-sonar-props\n'
    )
    process.env.QUALITY_PROJECT_ROOT = testDir
    delete process.env.SONARQUBE_PROJECT_KEY

    const config = loadConfig()

    expect(config.sonarqube.projectKey).toBe('from-sonar-props')
  })

  it('handles sonar-project.properties without projectKey', () => {
    // Create sonar-project.properties without projectKey line
    writeFileSync(
      path.join(testDir, 'sonar-project.properties'),
      'sonar.host.url=http://localhost:9000\n'
    )
    process.env.QUALITY_PROJECT_ROOT = testDir
    delete process.env.SONARQUBE_PROJECT_KEY

    const config = loadConfig()

    // Should fall back to my-project since no package.json either
    expect(config.sonarqube.projectKey).toBe('my-project')
  })

  it('reads from package.json when sonar-project.properties has no key', () => {
    // Create sonar-project.properties without key
    writeFileSync(
      path.join(testDir, 'sonar-project.properties'),
      'sonar.host.url=http://localhost:9000\n'
    )
    // Create package.json with name
    writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'test-pkg' })
    )
    process.env.QUALITY_PROJECT_ROOT = testDir
    delete process.env.SONARQUBE_PROJECT_KEY

    const config = loadConfig()

    expect(config.sonarqube.projectKey).toBe('test-pkg')
  })

  it('handles scoped package names', () => {
    writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: '@scope/my-package' })
    )
    process.env.QUALITY_PROJECT_ROOT = testDir
    delete process.env.SONARQUBE_PROJECT_KEY

    const config = loadConfig()

    expect(config.sonarqube.projectKey).toBe('scope-my-package')
  })

  it('handles invalid package.json', () => {
    writeFileSync(path.join(testDir, 'package.json'), 'invalid json {')
    process.env.QUALITY_PROJECT_ROOT = testDir
    delete process.env.SONARQUBE_PROJECT_KEY

    const config = loadConfig()

    // Should fall back to default
    expect(config.sonarqube.projectKey).toBe('my-project')
  })

  it('handles package.json without name field', () => {
    writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({ version: '1.0.0' })
    )
    process.env.QUALITY_PROJECT_ROOT = testDir
    delete process.env.SONARQUBE_PROJECT_KEY

    const config = loadConfig()

    expect(config.sonarqube.projectKey).toBe('my-project')
  })
})

describe('resolveProjectRoot', () => {
  const originalEnv = { ...process.env }
  const testDir = path.join(process.cwd(), 'tests/fixtures/resolve-root-test')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    resetConfig()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    resetConfig()
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  })

  it('uses cwd when package.json exists there', () => {
    // Default behavior - cwd has package.json
    delete process.env.QUALITY_PROJECT_ROOT

    const config = loadConfig()

    expect(config.projectRoot).toBe(process.cwd())
  })
})

describe('getSonarCurlAuth', () => {
  const testTokenPath = path.join(process.cwd(), '.test-sonar-token-curl')

  afterEach(() => {
    if (existsSync(testTokenPath)) {
      unlinkSync(testTokenPath)
    }
    resetConfig()
  })

  it('returns default credentials when no token file exists', () => {
    const auth = getSonarCurlAuth()

    expect(auth).toBe('-u admin:admin')
  })

  it('returns token auth when token file exists', () => {
    process.env.SONARQUBE_TOKEN_FILE = testTokenPath
    writeFileSync(testTokenPath, 'my-token\n')
    resetConfig()

    const auth = getSonarCurlAuth()

    expect(auth).toBe('-u my-token:')
  })
})
