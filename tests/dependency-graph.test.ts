import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import {
  getAllTypeScriptFiles,
  extractLocalImports,
  calculateDegrees,
  buildDependentCounts,
  attachCoverageData,
  buildDependencyGraph,
} from '../src/dependency-graph.js'
import type { FileInfo } from '../src/types.js'

// Mock config
vi.mock('../src/config.js', () => ({
  getConfig: vi.fn(() => ({
    projectRoot: process.cwd(),
  })),
}))

const TEST_DIR = join(process.cwd(), '.test-dep-graph')

describe('getAllTypeScriptFiles', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('finds TypeScript files recursively', () => {
    mkdirSync(join(TEST_DIR, 'sub'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'a.ts'), 'export const a = 1;')
    writeFileSync(join(TEST_DIR, 'sub', 'b.ts'), 'export const b = 2;')

    const files = getAllTypeScriptFiles(TEST_DIR)

    expect(files).toContain(join(TEST_DIR, 'a.ts'))
    expect(files).toContain(join(TEST_DIR, 'sub', 'b.ts'))
  })

  it('skips test files', () => {
    writeFileSync(join(TEST_DIR, 'file.ts'), 'export const x = 1;')
    writeFileSync(join(TEST_DIR, 'file.test.ts'), 'test("x", () => {});')
    writeFileSync(join(TEST_DIR, 'file.spec.ts'), 'describe("x", () => {});')

    const files = getAllTypeScriptFiles(TEST_DIR)

    expect(files).toContain(join(TEST_DIR, 'file.ts'))
    expect(files).not.toContain(join(TEST_DIR, 'file.test.ts'))
    expect(files).not.toContain(join(TEST_DIR, 'file.spec.ts'))
  })

  it('skips declaration files', () => {
    writeFileSync(join(TEST_DIR, 'types.d.ts'), 'declare const x: number;')
    writeFileSync(join(TEST_DIR, 'main.ts'), 'export const x = 1;')

    const files = getAllTypeScriptFiles(TEST_DIR)

    expect(files).toContain(join(TEST_DIR, 'main.ts'))
    expect(files).not.toContain(join(TEST_DIR, 'types.d.ts'))
  })

  it('skips __tests__ directories', () => {
    mkdirSync(join(TEST_DIR, '__tests__'), { recursive: true })
    writeFileSync(join(TEST_DIR, '__tests__', 'test.ts'), 'test();')
    writeFileSync(join(TEST_DIR, 'main.ts'), 'export const x = 1;')

    const files = getAllTypeScriptFiles(TEST_DIR)

    expect(files).toContain(join(TEST_DIR, 'main.ts'))
    expect(files).not.toContain(join(TEST_DIR, '__tests__', 'test.ts'))
  })

  it('skips node_modules', () => {
    mkdirSync(join(TEST_DIR, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'node_modules', 'pkg', 'index.ts'), 'export const x = 1;')
    writeFileSync(join(TEST_DIR, 'main.ts'), 'export const x = 1;')

    const files = getAllTypeScriptFiles(TEST_DIR)

    expect(files).toContain(join(TEST_DIR, 'main.ts'))
    expect(files).not.toContain(join(TEST_DIR, 'node_modules', 'pkg', 'index.ts'))
  })

  it('includes JavaScript files', () => {
    writeFileSync(join(TEST_DIR, 'file.js'), 'const x = 1;')
    writeFileSync(join(TEST_DIR, 'file.jsx'), 'const Comp = () => <div/>;')

    const files = getAllTypeScriptFiles(TEST_DIR)

    expect(files).toContain(join(TEST_DIR, 'file.js'))
    expect(files).toContain(join(TEST_DIR, 'file.jsx'))
  })
})

describe('extractLocalImports', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('extracts relative imports', () => {
    const mainFile = join(TEST_DIR, 'main.ts')
    const helperFile = join(TEST_DIR, 'helper.ts')

    writeFileSync(helperFile, 'export const helper = () => {};')
    writeFileSync(mainFile, "import { helper } from './helper';")

    const allFiles = new Set([mainFile, helperFile])
    const imports = extractLocalImports(mainFile, allFiles, TEST_DIR)

    expect(imports).toContain(helperFile)
  })

  it('extracts nested relative imports', () => {
    mkdirSync(join(TEST_DIR, 'utils'), { recursive: true })
    const mainFile = join(TEST_DIR, 'main.ts')
    const utilFile = join(TEST_DIR, 'utils', 'format.ts')

    writeFileSync(utilFile, 'export const format = () => {};')
    writeFileSync(mainFile, "import { format } from './utils/format';")

    const allFiles = new Set([mainFile, utilFile])
    const imports = extractLocalImports(mainFile, allFiles, TEST_DIR)

    expect(imports).toContain(utilFile)
  })

  it('deduplicates imports', () => {
    const mainFile = join(TEST_DIR, 'main.ts')
    const helperFile = join(TEST_DIR, 'helper.ts')

    writeFileSync(helperFile, 'export const a = 1; export const b = 2;')
    writeFileSync(mainFile, `
import { a } from './helper';
import { b } from './helper';
`)

    const allFiles = new Set([mainFile, helperFile])
    const imports = extractLocalImports(mainFile, allFiles, TEST_DIR)

    expect(imports).toHaveLength(1)
    expect(imports[0]).toBe(helperFile)
  })

  it('handles require syntax', () => {
    const mainFile = join(TEST_DIR, 'main.ts')
    const helperFile = join(TEST_DIR, 'helper.ts')

    writeFileSync(helperFile, 'module.exports = { helper: () => {} };')
    writeFileSync(mainFile, "const { helper } = require('./helper');")

    const allFiles = new Set([mainFile, helperFile])
    const imports = extractLocalImports(mainFile, allFiles, TEST_DIR)

    expect(imports).toContain(helperFile)
  })

  it('ignores external packages', () => {
    const mainFile = join(TEST_DIR, 'main.ts')

    writeFileSync(mainFile, `
import * as fs from 'fs';
import lodash from 'lodash';
`)

    const allFiles = new Set([mainFile])
    const imports = extractLocalImports(mainFile, allFiles, TEST_DIR)

    expect(imports).toHaveLength(0)
  })

  it('resolves @/ alias imports', () => {
    // @/ alias assumes @/ points to the src directory
    const srcDir = TEST_DIR
    const mainFile = join(TEST_DIR, 'main.ts')
    const utilFile = join(TEST_DIR, 'utils.ts')

    writeFileSync(utilFile, 'export const util = () => {};')
    writeFileSync(mainFile, "import { util } from '@/utils';")

    const allFiles = new Set([mainFile, utilFile])
    const imports = extractLocalImports(mainFile, allFiles, srcDir)

    expect(imports).toContain(utilFile)
  })

  it('resolves @/ alias with nested paths', () => {
    // Create nested structure
    mkdirSync(join(TEST_DIR, 'components'), { recursive: true })
    const srcDir = TEST_DIR
    const mainFile = join(TEST_DIR, 'main.ts')
    const componentFile = join(TEST_DIR, 'components', 'Button.ts')

    writeFileSync(componentFile, 'export const Button = () => {};')
    writeFileSync(mainFile, "import { Button } from '@/components/Button';")

    const allFiles = new Set([mainFile, componentFile])
    const imports = extractLocalImports(mainFile, allFiles, srcDir)

    expect(imports).toContain(componentFile)
  })
})

describe('calculateDegrees', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('assigns degree 0 to leaf nodes', () => {
    const leafFile = join(TEST_DIR, 'leaf.ts')
    writeFileSync(leafFile, 'export const x = 1;')

    const result = calculateDegrees([leafFile], TEST_DIR)

    expect(result.get(leafFile)?.degree).toBe(0)
  })

  it('assigns higher degrees to files with dependencies', () => {
    const leafFile = join(TEST_DIR, 'leaf.ts')
    const depFile = join(TEST_DIR, 'dep.ts')

    writeFileSync(leafFile, 'export const x = 1;')
    writeFileSync(depFile, "import { x } from './leaf'; export const y = x + 1;")

    const result = calculateDegrees([leafFile, depFile], TEST_DIR)

    expect(result.get(leafFile)?.degree).toBe(0)
    expect(result.get(depFile)?.degree).toBe(1)
  })

  it('handles chain of dependencies', () => {
    const aFile = join(TEST_DIR, 'a.ts')
    const bFile = join(TEST_DIR, 'b.ts')
    const cFile = join(TEST_DIR, 'c.ts')

    writeFileSync(aFile, 'export const a = 1;')
    writeFileSync(bFile, "import { a } from './a'; export const b = a + 1;")
    writeFileSync(cFile, "import { b } from './b'; export const c = b + 1;")

    const result = calculateDegrees([aFile, bFile, cFile], TEST_DIR)

    expect(result.get(aFile)?.degree).toBe(0)
    expect(result.get(bFile)?.degree).toBe(1)
    expect(result.get(cFile)?.degree).toBe(2)
  })

  it('handles circular dependencies with high degree', () => {
    const aFile = join(TEST_DIR, 'circA.ts')
    const bFile = join(TEST_DIR, 'circB.ts')

    writeFileSync(aFile, "import { b } from './circB'; export const a = b + 1;")
    writeFileSync(bFile, "import { a } from './circA'; export const b = a + 1;")

    const result = calculateDegrees([aFile, bFile], TEST_DIR)

    // Both should have degree > 0 due to circular dependency handling
    expect(result.get(aFile)?.degree).toBeGreaterThan(0)
    expect(result.get(bFile)?.degree).toBeGreaterThan(0)
  })
})

describe('buildDependentCounts', () => {
  it('counts direct dependents', () => {
    const fileA: FileInfo = {
      path: '/a.ts',
      degree: 0,
      localDependencies: [],
      dependencyCount: 0,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }
    const fileB: FileInfo = {
      path: '/b.ts',
      degree: 1,
      localDependencies: ['/a.ts'],
      dependencyCount: 1,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }
    const fileC: FileInfo = {
      path: '/c.ts',
      degree: 1,
      localDependencies: ['/a.ts'],
      dependencyCount: 1,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }

    const files = new Map<string, FileInfo>([
      ['/a.ts', fileA],
      ['/b.ts', fileB],
      ['/c.ts', fileC],
    ])

    buildDependentCounts(files)

    expect(fileA.directDependents).toBe(2) // B and C depend on A
    expect(fileB.directDependents).toBe(0)
    expect(fileC.directDependents).toBe(0)
  })

  it('counts indirect dependents transitively', () => {
    const fileA: FileInfo = {
      path: '/a.ts',
      degree: 0,
      localDependencies: [],
      dependencyCount: 0,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }
    const fileB: FileInfo = {
      path: '/b.ts',
      degree: 1,
      localDependencies: ['/a.ts'],
      dependencyCount: 1,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }
    const fileC: FileInfo = {
      path: '/c.ts',
      degree: 2,
      localDependencies: ['/b.ts'],
      dependencyCount: 1,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }

    const files = new Map<string, FileInfo>([
      ['/a.ts', fileA],
      ['/b.ts', fileB],
      ['/c.ts', fileC],
    ])

    buildDependentCounts(files)

    // A is depended on by B directly, and C indirectly (C -> B -> A)
    expect(fileA.indirectDependents).toBe(2)
    expect(fileB.indirectDependents).toBe(1)
    expect(fileC.indirectDependents).toBe(0)
  })

  it('calculates normalized impact scores', () => {
    const fileA: FileInfo = {
      path: '/a.ts',
      degree: 0,
      localDependencies: [],
      dependencyCount: 0,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }
    const fileB: FileInfo = {
      path: '/b.ts',
      degree: 1,
      localDependencies: ['/a.ts'],
      dependencyCount: 1,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }

    const files = new Map<string, FileInfo>([
      ['/a.ts', fileA],
      ['/b.ts', fileB],
    ])

    buildDependentCounts(files)

    // A has 1 indirect dependent (B), B has 0
    // Impact should be normalized: A = 1/1 = 1, B = 0/1 = 0
    expect(fileA.impact).toBe(1)
    expect(fileB.impact).toBe(0)
  })
})

describe('attachCoverageData', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('attaches coverage data to matching files', () => {
    const coveragePath = join(TEST_DIR, 'coverage-summary.json')
    const filePath = '/test/file.ts'

    writeFileSync(coveragePath, JSON.stringify({
      [filePath]: {
        statements: { pct: 80 },
        branches: { pct: 70 },
        functions: { pct: 90 },
        lines: { pct: 85 },
      },
    }))

    const fileInfo: FileInfo = {
      path: filePath,
      degree: 0,
      localDependencies: [],
      dependencyCount: 0,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }

    const files = new Map<string, FileInfo>([[filePath, fileInfo]])

    attachCoverageData(files, coveragePath)

    expect(fileInfo.coverage).toEqual({
      statements: 80,
      branches: 70,
      functions: 90,
      lines: 85,
    })
  })

  it('handles missing coverage file gracefully', () => {
    const fileInfo: FileInfo = {
      path: '/test/file.ts',
      degree: 0,
      localDependencies: [],
      dependencyCount: 0,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }

    const files = new Map<string, FileInfo>([['/test/file.ts', fileInfo]])

    // Should not throw
    attachCoverageData(files, '/nonexistent/coverage.json')

    expect(fileInfo.coverage).toBeUndefined()
  })

  it('handles invalid JSON gracefully', () => {
    const coveragePath = join(TEST_DIR, 'invalid.json')
    writeFileSync(coveragePath, 'not valid json')

    const fileInfo: FileInfo = {
      path: '/test/file.ts',
      degree: 0,
      localDependencies: [],
      dependencyCount: 0,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }

    const files = new Map<string, FileInfo>([['/test/file.ts', fileInfo]])

    // Should not throw
    attachCoverageData(files, coveragePath)

    expect(fileInfo.coverage).toBeUndefined()
  })

  it('skips files not in coverage data', () => {
    const coveragePath = join(TEST_DIR, 'coverage-summary.json')

    writeFileSync(coveragePath, JSON.stringify({
      '/other/file.ts': {
        statements: { pct: 100 },
        branches: { pct: 100 },
        functions: { pct: 100 },
        lines: { pct: 100 },
      },
    }))

    const fileInfo: FileInfo = {
      path: '/test/file.ts',
      degree: 0,
      localDependencies: [],
      dependencyCount: 0,
      directDependents: 0,
      indirectDependents: 0,
      impact: 0,
    }

    const files = new Map<string, FileInfo>([['/test/file.ts', fileInfo]])

    attachCoverageData(files, coveragePath)

    expect(fileInfo.coverage).toBeUndefined()
  })
})

describe('buildDependencyGraph', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('builds complete graph from source directory', () => {
    const aFile = join(TEST_DIR, 'a.ts')
    const bFile = join(TEST_DIR, 'b.ts')

    writeFileSync(aFile, 'export const a = 1;')
    writeFileSync(bFile, "import { a } from './a'; export const b = a + 1;")

    const graph = buildDependencyGraph(TEST_DIR)

    expect(graph.size).toBe(2)
    expect(graph.get(aFile)?.degree).toBe(0)
    expect(graph.get(bFile)?.degree).toBe(1)
    expect(graph.get(aFile)?.directDependents).toBe(1)
  })
})
