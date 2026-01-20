import { describe, it, expect, vi } from 'vitest'
import {
  computeAddressFitness,
  formatAddressFitness,
  type AddressFitnessStats,
} from '../../src/symbols/fitness.js'
import type { SymbolTable, CodeSymbol } from '../../src/symbols/types.js'
import type { ExtractedIssues, LocatedIssue } from '../../src/targets/types.js'

// Mock call-graph module
vi.mock('../../src/symbols/call-graph.js', () => ({
  computeSymbolCallGraphStats: vi.fn(() => ({
    resolutionRate: 0.85,
    edgeCount: 100,
    avgOutDegree: 2.5,
    nodeCount: 50,
  })),
}))

function createSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    id: 'test::testFunc',
    file: 'test.ts',
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

function createIssue(overrides: Partial<LocatedIssue> = {}): LocatedIssue {
  return {
    file: 'test.ts',
    source: 'typescript',
    dimension: 'typescript.errors',
    message: 'Test error',
    ...overrides,
  }
}

function createExtractedIssues(issues: {
  coverage?: LocatedIssue[]
  typescript?: LocatedIssue[]
  eslint?: LocatedIssue[]
  sonarqube?: LocatedIssue[]
} = {}): ExtractedIssues {
  return {
    coverage: issues.coverage || [],
    typescript: issues.typescript || [],
    eslint: issues.eslint || [],
    sonarqube: issues.sonarqube || [],
    totalCount: (issues.coverage?.length || 0) +
      (issues.typescript?.length || 0) +
      (issues.eslint?.length || 0) +
      (issues.sonarqube?.length || 0),
  }
}

describe('computeAddressFitness', () => {
  it('computes basic stats with empty inputs', () => {
    const symbolTable = createSymbolTable([])
    const issues = createExtractedIssues()

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.addressSpace.symbolCount).toBe(0)
    expect(stats.addressSpace.fileCount).toBe(0)
    expect(stats.mapping.totalIssues).toBe(0)
    expect(stats.mapping.overallMappingRate).toBe(1) // No issues = 100% mapped
    expect(stats.assessment.status).toBe('mixed')
    expect(stats.assessment.reasons).toContain('no issues to evaluate mapping')
  })

  it('computes mapping stats for line-level issues', () => {
    const symbols = [
      createSymbol({ id: 'sym1', sloc: 10 }),
      createSymbol({ id: 'sym2', sloc: 20 }),
    ]
    const symbolTable = createSymbolTable(symbols)

    const issues = createExtractedIssues({
      typescript: [
        createIssue({ line: 5, symbolId: 'sym1' }),
        createIssue({ line: 15, symbolId: 'sym2' }),
        createIssue({ line: 25 }), // No symbolId - unmapped
      ],
    })

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.mapping.totalIssues).toBe(3)
    expect(stats.mapping.lineIssues).toBe(3)
    expect(stats.mapping.mappedIssues).toBe(2)
    expect(stats.mapping.unmappedIssues).toBe(1)
    expect(stats.mapping.overallMappingRate).toBeCloseTo(2 / 3)
  })

  it('computes mapping stats for file-level issues', () => {
    const symbols = [createSymbol()]
    const symbolTable = createSymbolTable(symbols)

    const issues = createExtractedIssues({
      coverage: [
        createIssue({ source: 'coverage', symbolId: 'sym1' }), // File-level, mapped
        createIssue({ source: 'coverage' }), // File-level, unmapped
      ],
    })

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.mapping.totalIssues).toBe(2)
    expect(stats.mapping.fileIssues).toBe(2)
    expect(stats.mapping.lineIssues).toBe(0)
    expect(stats.mapping.mappedFileIssues).toBe(1)
    expect(stats.mapping.fileMappingRate).toBe(0.5)
  })

  it('computes size statistics', () => {
    const symbols = [
      createSymbol({ id: 'sym1', sloc: 5 }),
      createSymbol({ id: 'sym2', sloc: 10 }),
      createSymbol({ id: 'sym3', sloc: 15 }),
      createSymbol({ id: 'sym4', sloc: 100 }),
      createSymbol({ id: 'sym5', sloc: 200 }),
    ]
    const symbolTable = createSymbolTable(symbols)
    const issues = createExtractedIssues()

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.size.minSloc).toBe(5)
    expect(stats.size.maxSloc).toBe(200)
    expect(stats.size.medianSloc).toBe(15)
    expect(stats.size.avgSloc).toBe(66) // (5+10+15+100+200)/5
  })

  it('counts top-level symbols', () => {
    const symbols = [
      createSymbol({ id: 'parent', parent: undefined }),
      createSymbol({ id: 'child1', parent: 'parent' }),
      createSymbol({ id: 'child2', parent: 'parent' }),
    ]
    const symbolTable = createSymbolTable(symbols)
    const issues = createExtractedIssues()

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.addressSpace.symbolCount).toBe(3)
    expect(stats.addressSpace.topLevelSymbolCount).toBe(1)
  })

  it('includes call graph stats when requested', async () => {
    const symbols = [createSymbol()]
    const symbolTable = createSymbolTable(symbols)
    const issues = createExtractedIssues()

    const stats = computeAddressFitness(symbolTable, issues, { includeCallGraph: true })

    expect(stats.graph).toBeDefined()
    expect(stats.graph?.resolutionRate).toBe(0.85)
    expect(stats.graph?.edgeCount).toBe(100)
  })

  it('excludes call graph stats by default', () => {
    const symbols = [createSymbol()]
    const symbolTable = createSymbolTable(symbols)
    const issues = createExtractedIssues()

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.graph).toBeUndefined()
  })

  it('assesses as fit when mapping is high', () => {
    const symbols = [createSymbol()]
    const symbolTable = createSymbolTable(symbols)

    const issues = createExtractedIssues({
      typescript: Array(10).fill(null).map((_, i) =>
        createIssue({ line: i + 1, symbolId: 'test::testFunc' })
      ),
    })

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.assessment.status).toBe('fit')
    expect(stats.mapping.overallMappingRate).toBe(1)
    expect(stats.mapping.lineMappingRate).toBe(1)
  })

  it('assesses as unfit when mapping is low', () => {
    const symbols = [createSymbol()]
    const symbolTable = createSymbolTable(symbols)

    const issues = createExtractedIssues({
      typescript: [
        // Only 2 out of 10 mapped = 20%
        createIssue({ line: 1, symbolId: 'test::testFunc' }),
        createIssue({ line: 2, symbolId: 'test::testFunc' }),
        ...Array(8).fill(null).map((_, i) =>
          createIssue({ line: i + 10 }) // No symbolId
        ),
      ],
    })

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.assessment.status).toBe('unfit')
    expect(stats.mapping.overallMappingRate).toBe(0.2)
  })

  it('assesses as mixed when mapping is moderate', () => {
    const symbols = [createSymbol()]
    const symbolTable = createSymbolTable(symbols)

    const issues = createExtractedIssues({
      typescript: [
        // 7 out of 10 mapped = 70%
        ...Array(7).fill(null).map((_, i) =>
          createIssue({ line: i + 1, symbolId: 'test::testFunc' })
        ),
        ...Array(3).fill(null).map((_, i) =>
          createIssue({ line: i + 10 }) // No symbolId
        ),
      ],
    })

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.assessment.status).toBe('mixed')
    expect(stats.mapping.overallMappingRate).toBe(0.7)
  })

  it('adds reason for coarse address units', () => {
    const symbols = [
      createSymbol({ id: 'large1', sloc: 500 }),
      createSymbol({ id: 'large2', sloc: 400 }),
      createSymbol({ id: 'large3', sloc: 350 }),
    ]
    const symbolTable = createSymbolTable(symbols)
    const issues = createExtractedIssues({
      typescript: [createIssue({ line: 1, symbolId: 'large1' })],
    })

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.assessment.reasons).toContain('address units are coarse (p90 > 300 lines)')
  })

  it('adds reason for very small address units', () => {
    const symbols = [
      createSymbol({ id: 'tiny1', sloc: 1 }),
      createSymbol({ id: 'tiny2', sloc: 2 }),
      createSymbol({ id: 'tiny3', sloc: 2 }),
    ]
    const symbolTable = createSymbolTable(symbols)
    const issues = createExtractedIssues({
      typescript: [createIssue({ line: 1, symbolId: 'tiny1' })],
    })

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.assessment.reasons).toContain('address units are very small (median < 3 lines)')
  })

  it('flattens issues from all sources', () => {
    const symbols = [createSymbol()]
    const symbolTable = createSymbolTable(symbols)

    const issues = createExtractedIssues({
      coverage: [createIssue({ source: 'coverage' })],
      typescript: [createIssue({ source: 'typescript' })],
      eslint: [createIssue({ source: 'eslint' })],
      sonarqube: [createIssue({ source: 'sonarqube' })],
    })

    const stats = computeAddressFitness(symbolTable, issues)

    expect(stats.mapping.totalIssues).toBe(4)
  })
})

describe('formatAddressFitness', () => {
  it('formats basic stats', () => {
    const stats: AddressFitnessStats = {
      addressSpace: {
        symbolCount: 50,
        fileCount: 10,
        topLevelSymbolCount: 30,
      },
      mapping: {
        totalIssues: 100,
        lineIssues: 80,
        fileIssues: 20,
        mappedIssues: 90,
        mappedLineIssues: 75,
        mappedFileIssues: 15,
        unmappedIssues: 10,
        overallMappingRate: 0.9,
        lineMappingRate: 0.9375,
        fileMappingRate: 0.75,
      },
      size: {
        minSloc: 2,
        medianSloc: 15,
        p90Sloc: 100,
        p95Sloc: 150,
        maxSloc: 300,
        avgSloc: 40,
      },
      assessment: {
        status: 'fit',
        reasons: [],
      },
    }

    const output = formatAddressFitness(stats)

    expect(output).toContain('Address Fitness')
    expect(output).toContain('Status: fit')
    expect(output).toContain('90.0% overall')
    expect(output).toContain('93.8% line-level')
    expect(output).toContain('75.0% file-level')
    expect(output).toContain('10 unmapped')
    expect(output).toContain('50 symbols across 10 files')
    expect(output).toContain('median 15 lines')
    expect(output).toContain('p90 100')
    expect(output).toContain('max 300')
  })

  it('includes reasons when present', () => {
    const stats: AddressFitnessStats = {
      addressSpace: { symbolCount: 10, fileCount: 2, topLevelSymbolCount: 5 },
      mapping: {
        totalIssues: 10,
        lineIssues: 10,
        fileIssues: 0,
        mappedIssues: 5,
        mappedLineIssues: 5,
        mappedFileIssues: 0,
        unmappedIssues: 5,
        overallMappingRate: 0.5,
        lineMappingRate: 0.5,
        fileMappingRate: 1,
      },
      size: { minSloc: 10, medianSloc: 50, p90Sloc: 100, p95Sloc: 150, maxSloc: 200, avgSloc: 60 },
      assessment: {
        status: 'unfit',
        reasons: ['low overall mapping coverage', 'low line-level mapping coverage'],
      },
    }

    const output = formatAddressFitness(stats)

    expect(output).toContain('Status: unfit')
    expect(output).toContain('low overall mapping coverage')
    expect(output).toContain('low line-level mapping coverage')
  })

  it('includes call graph stats when available', () => {
    const stats: AddressFitnessStats = {
      addressSpace: { symbolCount: 10, fileCount: 2, topLevelSymbolCount: 5 },
      mapping: {
        totalIssues: 10,
        lineIssues: 10,
        fileIssues: 0,
        mappedIssues: 10,
        mappedLineIssues: 10,
        mappedFileIssues: 0,
        unmappedIssues: 0,
        overallMappingRate: 1,
        lineMappingRate: 1,
        fileMappingRate: 1,
      },
      size: { minSloc: 10, medianSloc: 50, p90Sloc: 100, p95Sloc: 150, maxSloc: 200, avgSloc: 60 },
      graph: {
        resolutionRate: 0.85,
        edgeCount: 100,
        avgOutDegree: 2.5,
        nodeCount: 50,
      },
      assessment: { status: 'fit', reasons: [] },
    }

    const output = formatAddressFitness(stats)

    expect(output).toContain('Call graph:')
    expect(output).toContain('85.0% resolved')
    expect(output).toContain('100 edges')
    expect(output).toContain('avg out 2.50')
  })
})
