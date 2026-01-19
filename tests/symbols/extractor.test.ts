import { describe, it, expect, beforeAll } from 'vitest'
import { extractSymbols, extractSymbolsFromSingleFile } from '../../src/symbols/extractor.js'
import path from 'path'
import { writeFileSync, mkdirSync } from 'fs'

const TEST_FIXTURES_DIR = path.join(process.cwd(), 'tests/fixtures')

describe('extractSymbols', () => {
  beforeAll(() => {
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true })
  })

  it('extracts function declarations', () => {
    const fixtureContent = `
export function myFunction(x: number): number {
  return x * 2
}

function privateFunction() {
  console.log('private')
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'functions.ts')
    writeFileSync(fixturePath, fixtureContent)

    const table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['*.ts'],
    })

    expect(table.symbols.size).toBeGreaterThan(0)

    const symbols = Array.from(table.symbols.values())
    const myFunction = symbols.find(s => s.name === 'myFunction')
    const privateFunction = symbols.find(s => s.name === 'privateFunction')

    expect(myFunction).toBeDefined()
    expect(myFunction?.kind).toBe('function')
    expect(myFunction?.exported).toBe(true)

    expect(privateFunction).toBeDefined()
    expect(privateFunction?.kind).toBe('function')
    expect(privateFunction?.exported).toBe(false)
  })

  it('extracts class declarations with methods', () => {
    const fixtureContent = `
export class UserService {
  private users: string[] = []

  getUser(id: string): string | undefined {
    return this.users.find(u => u === id)
  }

  addUser(name: string): void {
    this.users.push(name)
  }
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'class.ts')
    writeFileSync(fixturePath, fixtureContent)

    const table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['class.ts'],
    })

    const symbols = Array.from(table.symbols.values())

    const userService = symbols.find(s => s.name === 'UserService')
    expect(userService).toBeDefined()
    expect(userService?.kind).toBe('class')
    expect(userService?.exported).toBe(true)

    const getUser = symbols.find(s => s.name === 'getUser')
    expect(getUser).toBeDefined()
    expect(getUser?.kind).toBe('method')
    expect(getUser?.parent).toBe(userService?.id)
    expect(getUser?.qualifiedName).toBe('UserService.getUser')

    const addUser = symbols.find(s => s.name === 'addUser')
    expect(addUser).toBeDefined()
    expect(addUser?.qualifiedName).toBe('UserService.addUser')
  })

  it('extracts arrow functions assigned to const', () => {
    const fixtureContent = `
export const handler = (event: unknown) => {
  return { statusCode: 200 }
}

const internalHelper = () => 'helper'
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'arrows.ts')
    writeFileSync(fixturePath, fixtureContent)

    const table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['arrows.ts'],
    })

    const symbols = Array.from(table.symbols.values())

    const handler = symbols.find(s => s.name === 'handler')
    expect(handler).toBeDefined()
    expect(handler?.kind).toBe('arrow-function')

    const helper = symbols.find(s => s.name === 'internalHelper')
    expect(helper).toBeDefined()
    expect(helper?.kind).toBe('arrow-function')
  })

  it('extracts interfaces and type aliases', () => {
    const fixtureContent = `
export interface User {
  id: string
  name: string
}

export type UserId = string

type InternalConfig = {
  debug: boolean
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'types.ts')
    writeFileSync(fixturePath, fixtureContent)

    const table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['types.ts'],
    })

    const symbols = Array.from(table.symbols.values())

    const userInterface = symbols.find(s => s.name === 'User')
    expect(userInterface).toBeDefined()
    expect(userInterface?.kind).toBe('interface')

    const userIdType = symbols.find(s => s.name === 'UserId')
    expect(userIdType).toBeDefined()
    expect(userIdType?.kind).toBe('type-alias')

    const internalConfig = symbols.find(s => s.name === 'InternalConfig')
    expect(internalConfig).toBeDefined()
    expect(internalConfig?.kind).toBe('type-alias')
  })

  it('extracts enums', () => {
    const fixtureContent = `
export enum Status {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE',
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'enums.ts')
    writeFileSync(fixturePath, fixtureContent)

    const table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['enums.ts'],
    })

    const symbols = Array.from(table.symbols.values())

    const status = symbols.find(s => s.name === 'Status')
    expect(status).toBeDefined()
    expect(status?.kind).toBe('enum')
  })

  it('builds correct line index', () => {
    const fixtureContent = `
function outer() {
  return 42
}
// line 5 is a comment
function another() {
  return 'test'
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'lineindex.ts')
    writeFileSync(fixturePath, fixtureContent)

    const table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['lineindex.ts'],
    })

    // Line 3 should be inside 'outer'
    const line3Key = `${fixturePath}:3`
    const line3Symbol = table.lineIndex.get(line3Key)
    expect(line3Symbol?.name).toBe('outer')

    // Line 7 should be inside 'another'
    const line7Key = `${fixturePath}:7`
    const line7Symbol = table.lineIndex.get(line7Key)
    expect(line7Symbol?.name).toBe('another')
  })

  it('respects exclude patterns', () => {
    const fixtureContent = `export const test = 1`
    const excludedPath = path.join(TEST_FIXTURES_DIR, 'excluded.test.ts')
    writeFileSync(excludedPath, fixtureContent)

    const table = extractSymbols({
      rootDir: TEST_FIXTURES_DIR,
      include: ['*.ts'],
      exclude: ['*.test.ts'],
    })

    const hasExcludedFile = Array.from(table.byFile.keys()).some(f =>
      f.includes('excluded.test.ts')
    )
    expect(hasExcludedFile).toBe(false)
  })

  it('returns empty table for non-existent directory', () => {
    const table = extractSymbols({
      rootDir: '/nonexistent/path',
      include: ['*.ts'],
    })

    expect(table.symbols.size).toBe(0)
    expect(table.byFile.size).toBe(0)
  })
})

describe('extractSymbolsFromSingleFile', () => {
  it('extracts symbols from a single file', () => {
    const fixtureContent = `
export function singleFileFunction() {
  return 'hello'
}
`
    const fixturePath = path.join(TEST_FIXTURES_DIR, 'single.ts')
    writeFileSync(fixturePath, fixtureContent)

    const symbols = extractSymbolsFromSingleFile(fixturePath)

    expect(symbols.length).toBeGreaterThan(0)
    const fn = symbols.find(s => s.name === 'singleFileFunction')
    expect(fn).toBeDefined()
    expect(fn?.kind).toBe('function')
  })

  it('returns empty array for non-existent file', () => {
    const symbols = extractSymbolsFromSingleFile('/nonexistent/file.ts')
    expect(symbols).toEqual([])
  })
})
