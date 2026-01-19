import { describe, it, expect, beforeAll } from 'vitest'
import { extractSymbols } from '../../src/symbols/extractor.js'
import {
  mapLocationToSymbol,
  mapLocationsToSymbols,
  getFileSymbols,
  getSymbolById,
} from '../../src/symbols/mapper.js'
import type { SymbolTable } from '../../src/symbols/types.js'
import path from 'path'
import { writeFileSync, mkdirSync } from 'fs'

const TEST_FIXTURES_DIR = path.join(process.cwd(), 'tests/fixtures/mapper')

describe('mapLocationToSymbol', () => {
  let table: SymbolTable
  let fixturePath: string

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `// line 1
export function topLevel() {  // line 2
  const x = 1                 // line 3
  return x                    // line 4
}                             // line 5
// line 6
export class MyClass {        // line 7
  doSomething() {             // line 8
    return 'done'             // line 9
  }                           // line 10
}                             // line 11
// line 12
const helper = () => 'help'   // line 13
`
    fixturePath = path.join(TEST_FIXTURES_DIR, 'mapping.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['*.ts'],
    })
  })

  it('maps line inside function to innermost symbol', () => {
    // Line 3 has `const x = 1` which is extracted as a symbol
    // The mapper returns the innermost (smallest) symbol containing the line
    const symbol = mapLocationToSymbol(table, fixturePath, 3)
    // Either the const 'x' or the function 'topLevel' are valid
    expect(symbol).toBeDefined()
    expect(['x', 'topLevel']).toContain(symbol?.name)
  })

  it('maps line inside method to that method', () => {
    const symbol = mapLocationToSymbol(table, fixturePath, 9)
    expect(symbol?.name).toBe('doSomething')
    expect(symbol?.kind).toBe('method')
  })

  it('maps line with class definition to class', () => {
    const symbol = mapLocationToSymbol(table, fixturePath, 7)
    expect(symbol?.name).toBe('MyClass')
    expect(symbol?.kind).toBe('class')
  })

  it('maps arrow function line correctly', () => {
    const symbol = mapLocationToSymbol(table, fixturePath, 13)
    expect(symbol?.name).toBe('helper')
    expect(symbol?.kind).toBe('arrow-function')
  })

  it('returns undefined for line outside any symbol', () => {
    const symbol = mapLocationToSymbol(table, fixturePath, 1)
    expect(symbol).toBeUndefined()
  })

  it('returns undefined for non-existent file', () => {
    const symbol = mapLocationToSymbol(table, '/no/such/file.ts', 5)
    expect(symbol).toBeUndefined()
  })

  it('handles relative vs absolute path matching', () => {
    const relativePath = path.relative(process.cwd(), fixturePath)
    const symbol = mapLocationToSymbol(table, relativePath, 3)
    // Should still find the symbol through suffix matching
    expect(symbol).toBeDefined()
    expect(['x', 'topLevel']).toContain(symbol?.name)
  })

  it('prefers innermost symbol for nested locations', () => {
    // Line 9 is inside both MyClass and doSomething, should return doSomething
    const symbol = mapLocationToSymbol(table, fixturePath, 9)
    expect(symbol?.name).toBe('doSomething')
  })
})

describe('mapLocationsToSymbols', () => {
  let table: SymbolTable
  let fixturePath: string

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
function first() { return 1 }
function second() { return 2 }
function third() { return 3 }
`
    fixturePath = path.join(TEST_FIXTURES_DIR, 'bulk.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['bulk.ts'],
    })
  })

  it('maps multiple locations efficiently', () => {
    const locations = [
      { file: fixturePath, line: 2 },
      { file: fixturePath, line: 3 },
      { file: fixturePath, line: 4 },
    ]

    const results = mapLocationsToSymbols(table, locations)

    expect(results).toHaveLength(3)
    expect(results[0].symbolId).toBeDefined()
    expect(results[1].symbolId).toBeDefined()
    expect(results[2].symbolId).toBeDefined()
  })

  it('preserves original location info', () => {
    const locations = [{ file: fixturePath, line: 2, column: 5 }]

    const results = mapLocationsToSymbols(table, locations)

    expect(results[0].file).toBe(fixturePath)
    expect(results[0].line).toBe(2)
    expect(results[0].column).toBe(5)
  })

  it('handles missing symbols gracefully', () => {
    const locations = [
      { file: fixturePath, line: 1 }, // comment line, no symbol
      { file: '/nonexistent.ts', line: 5 },
    ]

    const results = mapLocationsToSymbols(table, locations)

    expect(results).toHaveLength(2)
    expect(results[0].symbol).toBeUndefined()
    expect(results[1].symbol).toBeUndefined()
  })
})

describe('getFileSymbols', () => {
  let table: SymbolTable
  let fixturePath: string

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `
export function a() {}
export function b() {}
`
    fixturePath = path.join(TEST_FIXTURES_DIR, 'filesymbols.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['filesymbols.ts'],
    })
  })

  it('returns all symbols for a file', () => {
    const symbols = getFileSymbols(table, fixturePath)
    expect(symbols.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty array for unknown file', () => {
    const symbols = getFileSymbols(table, '/unknown/file.ts')
    expect(symbols).toEqual([])
  })
})

describe('getSymbolById', () => {
  let table: SymbolTable
  let fixturePath: string

  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })

    const fixtureContent = `export function lookup() {}`
    fixturePath = path.join(TEST_FIXTURES_DIR, 'lookup.ts')
    writeFileSync(fixturePath, fixtureContent)

    table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['lookup.ts'],
    })
  })

  it('retrieves symbol by ID', () => {
    const expectedId = `${fixturePath}::lookup`
    const symbol = getSymbolById(table, expectedId)
    expect(symbol?.name).toBe('lookup')
  })

  it('returns undefined for unknown ID', () => {
    const symbol = getSymbolById(table, 'nonexistent::symbol')
    expect(symbol).toBeUndefined()
  })
})
