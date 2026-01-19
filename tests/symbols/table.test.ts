import { describe, it, expect, beforeAll } from 'vitest'
import { extractSymbols } from '../../src/symbols/extractor.js'
import {
  getSymbolTableStats,
  filterSymbols,
  getChildren,
  getParentChain,
  getSiblings,
  findSymbolsByName,
  findSymbolsByQualifiedName,
  getFiles,
  getTopLevelSymbols,
  mergeSymbolTables,
  createEmptySymbolTable,
} from '../../src/symbols/table.js'
import type { SymbolTable } from '../../src/symbols/types.js'
import path from 'path'
import { writeFileSync, mkdirSync } from 'fs'

const TEST_FIXTURES_DIR = path.join(process.cwd(), 'tests/fixtures/table')

describe('getSymbolTableStats', () => {
  let table: SymbolTable

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export function exportedFn() { return 1 }
function privateFn() { return 2 }

export class MyClass {
  method1() {}
  method2() {}
}

export interface MyInterface {
  prop: string
}

export type MyType = string

export enum MyEnum { A, B }
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'stats.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['stats.ts'],
    })
  })

  it('computes total symbol count', () => {
    const stats = getSymbolTableStats(table)
    expect(stats.totalSymbols).toBeGreaterThan(0)
  })

  it('computes file count', () => {
    const stats = getSymbolTableStats(table)
    expect(stats.fileCount).toBe(1)
  })

  it('computes exported count', () => {
    const stats = getSymbolTableStats(table)
    expect(stats.exportedCount).toBeGreaterThan(0)
  })

  it('tracks symbols by kind', () => {
    const stats = getSymbolTableStats(table)
    expect(stats.byKind['function']).toBeGreaterThanOrEqual(2)
    expect(stats.byKind['class']).toBeGreaterThanOrEqual(1)
    expect(stats.byKind['method']).toBeGreaterThanOrEqual(2)
    expect(stats.byKind['interface']).toBeGreaterThanOrEqual(1)
    expect(stats.byKind['type-alias']).toBeGreaterThanOrEqual(1)
    expect(stats.byKind['enum']).toBeGreaterThanOrEqual(1)
  })

  it('computes average symbols per file', () => {
    const stats = getSymbolTableStats(table)
    expect(stats.avgSymbolsPerFile).toBeGreaterThan(0)
  })

  it('handles empty table', () => {
    const emptyTable = createEmptySymbolTable()
    const stats = getSymbolTableStats(emptyTable)
    expect(stats.totalSymbols).toBe(0)
    expect(stats.avgSymbolsPerFile).toBe(0)
  })
})

describe('filterSymbols', () => {
  let table: SymbolTable

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export function bigFunction() {
  const a = 1
  const b = 2
  const c = 3
  const d = 4
  const e = 5
  return a + b + c + d + e
}

function smallFunction() { return 1 }

export class Service {
  handleRequest() {}
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'filter.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['filter.ts'],
    })
  })

  it('filters by kind', () => {
    const functions = filterSymbols(table, { kinds: ['function'] })
    expect(functions.every(s => s.kind === 'function')).toBe(true)
  })

  it('filters by exported status', () => {
    const exported = filterSymbols(table, { exported: true })
    expect(exported.every(s => s.exported)).toBe(true)

    const nonExported = filterSymbols(table, { exported: false })
    expect(nonExported.every(s => !s.exported)).toBe(true)
  })

  it('filters by name pattern', () => {
    const handlers = filterSymbols(table, { namePattern: /handle/i })
    expect(handlers.some(s => s.name.toLowerCase().includes('handle'))).toBe(true)
  })

  it('filters by minSloc', () => {
    const bigSymbols = filterSymbols(table, { minSloc: 5 })
    expect(bigSymbols.every(s => s.sloc >= 5)).toBe(true)
  })

  it('filters by maxSloc', () => {
    const smallSymbols = filterSymbols(table, { maxSloc: 3 })
    expect(smallSymbols.every(s => s.sloc <= 3)).toBe(true)
  })

  it('combines multiple filters', () => {
    const result = filterSymbols(table, {
      kinds: ['function'],
      exported: true,
    })
    expect(result.every(s => s.kind === 'function' && s.exported)).toBe(true)
  })
})

describe('getChildren', () => {
  let table: SymbolTable
  let classSymbolId: string

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export class Parent {
  child1() {}
  child2() {}
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'children.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['children.ts'],
    })

    const classSymbol = Array.from(table.symbols.values()).find(s => s.name === 'Parent')
    classSymbolId = classSymbol!.id
  })

  it('returns children of a class', () => {
    const children = getChildren(table, classSymbolId)
    expect(children.length).toBeGreaterThanOrEqual(2)
    expect(children.some(c => c.name === 'child1')).toBe(true)
    expect(children.some(c => c.name === 'child2')).toBe(true)
  })

  it('returns empty array for symbol with no children', () => {
    const methodSymbol = Array.from(table.symbols.values()).find(s => s.name === 'child1')
    const children = getChildren(table, methodSymbol!.id)
    expect(children).toEqual([])
  })

  it('returns empty array for unknown symbol', () => {
    const children = getChildren(table, 'nonexistent')
    expect(children).toEqual([])
  })
})

describe('getParentChain', () => {
  let table: SymbolTable
  let methodId: string

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export class Outer {
  inner() {}
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'parent.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['parent.ts'],
    })

    const method = Array.from(table.symbols.values()).find(s => s.name === 'inner')
    methodId = method!.id
  })

  it('returns parent chain for nested symbol', () => {
    const chain = getParentChain(table, methodId)
    expect(chain.length).toBe(1)
    expect(chain[0].name).toBe('Outer')
  })

  it('returns empty array for top-level symbol', () => {
    const classSymbol = Array.from(table.symbols.values()).find(s => s.name === 'Outer')
    const chain = getParentChain(table, classSymbol!.id)
    expect(chain).toEqual([])
  })
})

describe('getSiblings', () => {
  let table: SymbolTable
  let fixturePath: string

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export function sibling1() {}
export function sibling2() {}
export function sibling3() {}
`
    fixturePath = path.join(TEST_FIXTURES_DIR, 'siblings.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['siblings.ts'],
    })
  })

  it('returns other symbols in same file', () => {
    const sibling1 = Array.from(table.symbols.values()).find(s => s.name === 'sibling1')
    const siblings = getSiblings(table, sibling1!.id)
    expect(siblings.length).toBe(2)
    expect(siblings.some(s => s.name === 'sibling2')).toBe(true)
    expect(siblings.some(s => s.name === 'sibling3')).toBe(true)
    expect(siblings.some(s => s.name === 'sibling1')).toBe(false) // Excludes self
  })

  it('returns empty array for unknown symbol', () => {
    const siblings = getSiblings(table, 'nonexistent')
    expect(siblings).toEqual([])
  })
})

describe('findSymbolsByName', () => {
  let table: SymbolTable

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export function findMe() {}
function alsoFindMe() {}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'findname.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['findname.ts'],
    })
  })

  it('finds symbols by exact name', () => {
    const results = findSymbolsByName(table, 'findMe')
    expect(results.length).toBe(1)
    expect(results[0].name).toBe('findMe')
  })

  it('returns empty array for no match', () => {
    const results = findSymbolsByName(table, 'notFound')
    expect(results).toEqual([])
  })
})

describe('findSymbolsByQualifiedName', () => {
  let table: SymbolTable

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export class MyClass {
  myMethod() {}
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'findqualified.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['findqualified.ts'],
    })
  })

  it('finds symbols by qualified name', () => {
    const results = findSymbolsByQualifiedName(table, 'MyClass.myMethod')
    expect(results.length).toBe(1)
    expect(results[0].qualifiedName).toBe('MyClass.myMethod')
  })
})

describe('getFiles', () => {
  let table: SymbolTable

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    writeFileSync(path.join(TEST_FIXTURES_DIR, 'file1.ts'), 'export const a = 1')
    writeFileSync(path.join(TEST_FIXTURES_DIR, 'file2.ts'), 'export const b = 2')

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['file1.ts', 'file2.ts'],
    })
  })

  it('returns list of files', () => {
    const files = getFiles(table)
    expect(files.length).toBeGreaterThanOrEqual(2)
  })
})

describe('getTopLevelSymbols', () => {
  let table: SymbolTable
  let fixturePath: string

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export function topLevel() {}

export class TopClass {
  nestedMethod() {}
}
`
    fixturePath = path.join(TEST_FIXTURES_DIR, 'toplevel.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['toplevel.ts'],
    })
  })

  it('returns only top-level symbols', () => {
    const topLevel = getTopLevelSymbols(table, fixturePath)
    expect(topLevel.every(s => !s.parent)).toBe(true)
    expect(topLevel.some(s => s.name === 'topLevel')).toBe(true)
    expect(topLevel.some(s => s.name === 'TopClass')).toBe(true)
    expect(topLevel.some(s => s.name === 'nestedMethod')).toBe(false)
  })
})

describe('mergeSymbolTables', () => {
  it('merges two tables', () => {
    const table1 = createEmptySymbolTable()
    const table2 = createEmptySymbolTable()

    table1.symbols.set('id1', {
      id: 'id1',
      file: 'a.ts',
      name: 'sym1',
      qualifiedName: 'sym1',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 1 },
      sloc: 3,
    })

    table2.symbols.set('id2', {
      id: 'id2',
      file: 'b.ts',
      name: 'sym2',
      qualifiedName: 'sym2',
      kind: 'function',
      exported: true,
      span: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 1 },
      sloc: 3,
    })

    const merged = mergeSymbolTables(table1, table2)
    expect(merged.symbols.size).toBe(2)
    expect(merged.symbols.has('id1')).toBe(true)
    expect(merged.symbols.has('id2')).toBe(true)
  })
})

describe('createEmptySymbolTable', () => {
  it('creates an empty table', () => {
    const table = createEmptySymbolTable()
    expect(table.symbols.size).toBe(0)
    expect(table.byFile.size).toBe(0)
    expect(table.lineIndex.size).toBe(0)
  })
})
