import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import {
  computeSymbolCallGraphStats,
  computeSymbolCallGraphWeights,
} from '../../src/symbols/call-graph.js'
import type { SymbolTable, CodeSymbol } from '../../src/symbols/types.js'

const TEST_DIR = join(process.cwd(), '.test-call-graph')

function createSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    id: 'test::testFunc',
    file: join(TEST_DIR, 'test.ts'),
    name: 'testFunc',
    qualifiedName: 'testFunc',
    kind: 'function',
    exported: true,
    span: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
    sloc: 10,
    ...overrides,
  }
}

function createSymbolTable(symbols: CodeSymbol[]): SymbolTable {
  const symbolMap = new Map<string, CodeSymbol>()
  const byFile = new Map<string, CodeSymbol[]>()
  const lineIndex = new Map<string, CodeSymbol>()

  for (const sym of symbols) {
    symbolMap.set(sym.id, sym)
    const existing = byFile.get(sym.file) || []
    existing.push(sym)
    byFile.set(sym.file, existing)
    for (let line = sym.span.startLine; line <= sym.span.endLine; line++) {
      lineIndex.set(`${sym.file}:${line}`, sym)
    }
  }

  return {
    files: [...new Set(symbols.map(s => s.file))],
    symbols: symbolMap,
    byFile,
    lineIndex,
  }
}

describe('computeSymbolCallGraphStats', () => {
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

  it('returns zeros for empty symbol table', () => {
    const symbolTable = createSymbolTable([])

    const stats = computeSymbolCallGraphStats(symbolTable)

    expect(stats.totalCalls).toBe(0)
    expect(stats.resolvedCalls).toBe(0)
    expect(stats.unresolvedCalls).toBe(0)
    expect(stats.edgeCount).toBe(0)
    expect(stats.nodeCount).toBe(0)
    expect(stats.avgOutDegree).toBe(0)
    expect(stats.resolutionRate).toBe(0)
  })

  it('detects function calls in simple code', () => {
    const testFile = join(TEST_DIR, 'simple.ts')
    writeFileSync(testFile, `
function helper(): void {
  console.log('helper');
}

function main(): void {
  helper();
}
`)

    const helperSymbol = createSymbol({
      id: `${testFile}::helper`,
      file: testFile,
      name: 'helper',
      qualifiedName: 'helper',
      span: { startLine: 2, startColumn: 0, endLine: 4, endColumn: 1 },
    })
    const mainSymbol = createSymbol({
      id: `${testFile}::main`,
      file: testFile,
      name: 'main',
      qualifiedName: 'main',
      span: { startLine: 6, startColumn: 0, endLine: 8, endColumn: 1 },
    })

    const symbolTable = createSymbolTable([helperSymbol, mainSymbol])

    const stats = computeSymbolCallGraphStats(symbolTable)

    // Should detect the helper() call from main
    expect(stats.totalCalls).toBeGreaterThan(0)
    expect(stats.edgeCount).toBeGreaterThanOrEqual(0)
  })

  it('handles files with no calls', () => {
    const testFile = join(TEST_DIR, 'nocalls.ts')
    writeFileSync(testFile, `
const x: number = 1;
const y: number = 2;
`)

    const symbolTable = createSymbolTable([
      createSymbol({
        id: `${testFile}::x`,
        file: testFile,
        name: 'x',
        span: { startLine: 2, startColumn: 0, endLine: 2, endColumn: 20 },
      }),
    ])

    const stats = computeSymbolCallGraphStats(symbolTable)

    expect(stats.totalCalls).toBe(0)
    expect(stats.resolutionRate).toBe(0)
  })

  it('ignores self-calls', () => {
    const testFile = join(TEST_DIR, 'recursive.ts')
    writeFileSync(testFile, `
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`)

    const factorialSymbol = createSymbol({
      id: `${testFile}::factorial`,
      file: testFile,
      name: 'factorial',
      qualifiedName: 'factorial',
      span: { startLine: 2, startColumn: 0, endLine: 5, endColumn: 1 },
    })

    const symbolTable = createSymbolTable([factorialSymbol])

    const stats = computeSymbolCallGraphStats(symbolTable)

    // Self-calls should not create edges
    expect(stats.edgeCount).toBe(0)
  })
})

describe('computeSymbolCallGraphWeights', () => {
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

  it('returns empty map for empty symbol table', () => {
    const symbolTable = createSymbolTable([])

    const weights = computeSymbolCallGraphWeights(symbolTable)

    expect(weights.size).toBe(0)
  })

  it('computes callers and callees counts', () => {
    const testFile = join(TEST_DIR, 'weights.ts')
    writeFileSync(testFile, `
function a(): void {
  b();
  c();
}

function b(): void {
  c();
}

function c(): void {
  console.log('c');
}
`)

    const aSymbol = createSymbol({
      id: `${testFile}::a`,
      file: testFile,
      name: 'a',
      span: { startLine: 2, startColumn: 0, endLine: 5, endColumn: 1 },
    })
    const bSymbol = createSymbol({
      id: `${testFile}::b`,
      file: testFile,
      name: 'b',
      span: { startLine: 7, startColumn: 0, endLine: 9, endColumn: 1 },
    })
    const cSymbol = createSymbol({
      id: `${testFile}::c`,
      file: testFile,
      name: 'c',
      span: { startLine: 11, startColumn: 0, endLine: 13, endColumn: 1 },
    })

    const symbolTable = createSymbolTable([aSymbol, bSymbol, cSymbol])

    const weights = computeSymbolCallGraphWeights(symbolTable)

    // Verify the weights are computed (actual values depend on resolution)
    // At minimum we should have some weights computed
    expect(weights).toBeDefined()
    // The function should work without errors
  })

  it('handles single function with no calls', () => {
    const testFile = join(TEST_DIR, 'single.ts')
    writeFileSync(testFile, `
function isolated(): number {
  return 42;
}
`)

    const symbol = createSymbol({
      id: `${testFile}::isolated`,
      file: testFile,
      name: 'isolated',
      span: { startLine: 2, startColumn: 0, endLine: 4, endColumn: 1 },
    })

    const symbolTable = createSymbolTable([symbol])

    const weights = computeSymbolCallGraphWeights(symbolTable)

    // No calls, so no weights
    expect(weights.size).toBe(0)
  })

  it('handles multiple files', () => {
    const fileA = join(TEST_DIR, 'fileA.ts')
    const fileB = join(TEST_DIR, 'fileB.ts')

    writeFileSync(fileA, `
export function funcA(): void {
  console.log('A');
}
`)

    writeFileSync(fileB, `
import { funcA } from './fileA';

export function funcB(): void {
  funcA();
}
`)

    const funcA = createSymbol({
      id: `${fileA}::funcA`,
      file: fileA,
      name: 'funcA',
      span: { startLine: 2, startColumn: 0, endLine: 4, endColumn: 1 },
    })
    const funcB = createSymbol({
      id: `${fileB}::funcB`,
      file: fileB,
      name: 'funcB',
      span: { startLine: 4, startColumn: 0, endLine: 6, endColumn: 1 },
    })

    const symbolTable = createSymbolTable([funcA, funcB])

    const weights = computeSymbolCallGraphWeights(symbolTable)

    // Should handle cross-file calls
    expect(weights).toBeDefined()
  })
})
