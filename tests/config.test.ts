import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadConfig,
  getConfig,
  resetConfig,
  getSonarAuthToken,
  getSonarCurlAuth,
} from '../src/config.js'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
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
