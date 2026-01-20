/**
 * Tests for targets/aggregate.ts
 */
import { describe, it, expect } from 'vitest';
import {
  computeTargetDeltaQ,
  aggregateToTargets,
  aggregateToSymbols,
  aggregateToSymbolsWithOptions,
} from '../../src/targets/aggregate.js';
import type {
  LocatedIssue,
  ExtractedIssues,
} from '../../src/targets/types.js';
import type { SymbolTable, CodeSymbol } from '../../src/symbols/types.js';

// =============================================================================
// Test Data Factories
// =============================================================================

function createLocatedIssue(overrides: Partial<LocatedIssue> = {}): LocatedIssue {
  return {
    file: 'src/test.ts',
    line: 10,
    source: 'typescript',
    dimension: 'typescript.errors',
    impact: {
      dimension: 'typescript.errors',
      delta: -1,
      direction: 'lower-better',
    },
    message: 'Test error',
    ...overrides,
  };
}

function createCoverageIssue(overrides: Partial<LocatedIssue> = {}): LocatedIssue {
  return {
    file: 'src/test.ts',
    line: 10,
    source: 'coverage',
    dimension: 'coverage.unit.branches',
    impact: {
      dimension: 'coverage.unit.branches',
      delta: 0.5,
      direction: 'higher-better',
    },
    message: 'Uncovered branch',
    ...overrides,
  };
}

function createEslintIssue(overrides: Partial<LocatedIssue> = {}): LocatedIssue {
  return {
    file: 'src/test.ts',
    line: 10,
    source: 'eslint',
    dimension: 'eslint.errors',
    code: 'no-unused-vars',
    impact: {
      dimension: 'eslint.errors',
      delta: -1,
      direction: 'lower-better',
    },
    message: 'Unused variable',
    ...overrides,
  };
}

function createSonarIssue(overrides: Partial<LocatedIssue> = {}): LocatedIssue {
  return {
    file: 'src/test.ts',
    line: 10,
    source: 'sonarqube',
    dimension: 'sonarqube.bugs',
    severity: 'major',
    code: 'S1234',
    impact: {
      dimension: 'sonarqube.bugs',
      delta: -1,
      direction: 'lower-better',
    },
    message: 'Code smell',
    ...overrides,
  };
}

function createEmptyExtractedIssues(): ExtractedIssues {
  return {
    coverage: [],
    typescript: [],
    eslint: [],
    sonarqube: [],
    totalCount: 0,
    summary: {
      coverage: 0,
      typescript: 0,
      eslint: 0,
      sonarqube: 0,
    },
  };
}

function createSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    id: 'src/test.ts::testFunction',
    file: 'src/test.ts',
    name: 'testFunction',
    qualifiedName: 'testFunction',
    kind: 'function',
    exported: true,
    span: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
    sloc: 10,
    ...overrides,
  };
}

function createSymbolTable(symbols: CodeSymbol[]): SymbolTable {
  const symbolMap = new Map<string, CodeSymbol>();
  const byFile = new Map<string, CodeSymbol[]>();
  const lineIndex = new Map<string, CodeSymbol>();

  for (const sym of symbols) {
    symbolMap.set(sym.id, sym);

    // Group by file
    const existing = byFile.get(sym.file) || [];
    existing.push(sym);
    byFile.set(sym.file, existing);

    // Build line index
    for (let line = sym.span.startLine; line <= sym.span.endLine; line++) {
      const key = `${sym.file}:${line}`;
      lineIndex.set(key, sym);
    }
  }

  return {
    files: [...new Set(symbols.map(s => s.file))],
    symbols: symbolMap,
    byFile,
    lineIndex,
  };
}

// =============================================================================
// computeTargetDeltaQ Tests
// =============================================================================

describe('computeTargetDeltaQ', () => {
  it('returns 0 for empty issues array', () => {
    const result = computeTargetDeltaQ([]);
    expect(result).toBe(0);
  });

  it('computes ΔQ for coverage issues (higher-better)', () => {
    const issues = [
      createCoverageIssue({ impact: { dimension: 'coverage.unit.branches', delta: 0.5, direction: 'higher-better' } }),
      createCoverageIssue({ impact: { dimension: 'coverage.unit.branches', delta: 0.3, direction: 'higher-better' } }),
    ];

    const result = computeTargetDeltaQ(issues);
    // Coverage is higher-better, so delta adds to Q
    expect(result).toBeGreaterThan(0);
  });

  it('computes ΔQ for error issues (lower-better)', () => {
    const issues = [
      createLocatedIssue({ impact: { dimension: 'typescript.errors', delta: -1, direction: 'lower-better' } }),
      createLocatedIssue({ impact: { dimension: 'typescript.errors', delta: -1, direction: 'lower-better' } }),
    ];

    const result = computeTargetDeltaQ(issues);
    // Errors are lower-better, reducing them improves Q
    expect(result).toBeGreaterThan(0);
  });

  it('handles mixed dimensions', () => {
    const issues = [
      createCoverageIssue(),
      createLocatedIssue(),
      createEslintIssue(),
    ];

    const result = computeTargetDeltaQ(issues);
    // Should aggregate impacts from all dimensions
    expect(result).toBeGreaterThan(0);
  });

  it('groups impacts by dimension to avoid double-counting', () => {
    const issues = [
      createLocatedIssue({ impact: { dimension: 'typescript.errors', delta: -1, direction: 'lower-better' } }),
      createLocatedIssue({ impact: { dimension: 'typescript.errors', delta: -1, direction: 'lower-better' } }),
    ];

    // The ΔQ should be computed from total delta per dimension, not per issue
    const result = computeTargetDeltaQ(issues);
    expect(result).toBeGreaterThan(0);
  });

  it('handles unknown dimensions gracefully', () => {
    const issues = [
      createLocatedIssue({ impact: { dimension: 'unknown.dimension', delta: -1, direction: 'lower-better' } }),
    ];

    // Should not throw, but dimension won't contribute
    const result = computeTargetDeltaQ(issues);
    expect(result).toBe(0);
  });
});

// =============================================================================
// aggregateToTargets Tests
// =============================================================================

describe('aggregateToTargets', () => {
  it('returns empty array for no issues', () => {
    const extracted = createEmptyExtractedIssues();
    const result = aggregateToTargets(extracted);
    expect(result).toEqual([]);
  });

  it('groups issues by file with file granularity', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.coverage = [
      createCoverageIssue({ file: 'src/a.ts' }),
      createCoverageIssue({ file: 'src/b.ts' }),
      createCoverageIssue({ file: 'src/a.ts' }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(2);
    const fileA = result.find(t => t.file === 'src/a.ts');
    const fileB = result.find(t => t.file === 'src/b.ts');
    expect(fileA?.issueCount).toBe(2);
    expect(fileB?.issueCount).toBe(1);
  });

  it('groups issues by symbol with symbol granularity', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/a.ts', symbol: 'funcA' }),
      createLocatedIssue({ file: 'src/a.ts', symbol: 'funcB' }),
      createLocatedIssue({ file: 'src/a.ts', symbol: 'funcA' }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToTargets(extracted, { granularity: 'symbol' });

    expect(result.length).toBe(2);
    const funcA = result.find(t => t.symbol === 'funcA');
    const funcB = result.find(t => t.symbol === 'funcB');
    expect(funcA?.issueCount).toBe(2);
    expect(funcB?.issueCount).toBe(1);
  });

  it('uses symbolId when available for symbol granularity', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/a.ts', symbolId: 'src/a.ts::funcA' }),
      createLocatedIssue({ file: 'src/a.ts', symbolId: 'src/a.ts::funcB' }),
    ];
    extracted.totalCount = 2;

    const result = aggregateToTargets(extracted, { granularity: 'symbol' });

    expect(result.length).toBe(2);
  });

  it('sorts targets by totalDeltaQ descending', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.coverage = [
      // File A has less coverage issues
      createCoverageIssue({ file: 'src/a.ts' }),
      // File B has more coverage issues
      createCoverageIssue({ file: 'src/b.ts' }),
      createCoverageIssue({ file: 'src/b.ts' }),
      createCoverageIssue({ file: 'src/b.ts' }),
    ];
    extracted.totalCount = 4;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(2);
    expect(result[0].file).toBe('src/b.ts'); // Higher ΔQ first
    expect(result[1].file).toBe('src/a.ts');
  });

  it('applies limit option', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/a.ts' }),
      createLocatedIssue({ file: 'src/b.ts' }),
      createLocatedIssue({ file: 'src/c.ts' }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToTargets(extracted, { granularity: 'file', limit: 2 });

    expect(result.length).toBe(2);
  });

  it('applies minDeltaQ filter', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/a.ts' }),
    ];
    extracted.totalCount = 1;

    // Set a very high threshold that no target can meet
    const result = aggregateToTargets(extracted, { granularity: 'file', minDeltaQ: 1000 });

    expect(result.length).toBe(0);
  });

  it('computes breakdown for coverage issues', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.coverage = [
      createCoverageIssue({ dimension: 'coverage.unit.branches' }),
      createCoverageIssue({ dimension: 'coverage.unit.lines' }),
    ];
    extracted.totalCount = 2;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].breakdown.coverage).toBeDefined();
    expect(result[0].breakdown.coverage?.uncoveredBranches).toBe(1);
    expect(result[0].breakdown.coverage?.uncoveredLines).toBe(1);
  });

  it('computes breakdown for typescript issues', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ code: 'TS2345' }),
      createLocatedIssue({ code: 'TS2322' }),
    ];
    extracted.totalCount = 2;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].breakdown.typescript).toBeDefined();
    expect(result[0].breakdown.typescript?.errorCount).toBe(2);
    expect(result[0].breakdown.typescript?.errorCodes).toContain('TS2345');
    expect(result[0].breakdown.typescript?.errorCodes).toContain('TS2322');
  });

  it('computes breakdown for eslint issues', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.eslint = [
      createEslintIssue({ dimension: 'eslint.errors', code: 'no-unused-vars' }),
      createEslintIssue({ dimension: 'eslint.warnings', code: 'prefer-const' }),
    ];
    extracted.totalCount = 2;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].breakdown.eslint).toBeDefined();
    expect(result[0].breakdown.eslint?.errorCount).toBe(1);
    expect(result[0].breakdown.eslint?.warningCount).toBe(1);
    expect(result[0].breakdown.eslint?.rules).toContain('no-unused-vars');
  });

  it('computes breakdown for sonarqube issues', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.sonarqube = [
      createSonarIssue({ dimension: 'sonarqube.bugs', severity: 'major' }),
      createSonarIssue({ dimension: 'sonarqube.vulnerabilities', severity: 'critical' }),
      createSonarIssue({ dimension: 'sonarqube.codeSmells', severity: 'minor' }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].breakdown.sonarqube).toBeDefined();
    expect(result[0].breakdown.sonarqube?.bugs).toBe(1);
    expect(result[0].breakdown.sonarqube?.vulnerabilities).toBe(1);
    expect(result[0].breakdown.sonarqube?.codeSmells).toBe(1);
    expect(result[0].breakdown.sonarqube?.severityCounts.major).toBe(1);
    expect(result[0].breakdown.sonarqube?.severityCounts.critical).toBe(1);
  });

  it('tracks dimensionsAffected correctly', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.coverage = [createCoverageIssue({ file: 'src/a.ts' })];
    extracted.typescript = [createLocatedIssue({ file: 'src/a.ts' })];
    extracted.totalCount = 2;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].dimensionsAffected).toContain('coverage.unit.branches');
    expect(result[0].dimensionsAffected).toContain('typescript.errors');
  });

  it('computes line range from issues', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/a.ts', line: 10 }),
      createLocatedIssue({ file: 'src/a.ts', line: 50 }),
      createLocatedIssue({ file: 'src/a.ts', line: 30 }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].startLine).toBe(10);
    expect(result[0].endLine).toBe(50);
  });

  it('combines issues from all sources', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.coverage = [createCoverageIssue()];
    extracted.typescript = [createLocatedIssue()];
    extracted.eslint = [createEslintIssue()];
    extracted.sonarqube = [createSonarIssue()];
    extracted.totalCount = 4;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].issueCount).toBe(4);
  });
});

// =============================================================================
// aggregateToSymbols Tests
// =============================================================================

describe('aggregateToSymbols', () => {
  it('returns empty array when no issues match symbols', () => {
    const extracted = createEmptyExtractedIssues();
    const symbolTable = createSymbolTable([]);

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result).toEqual([]);
  });

  it('maps issues to symbols by symbolId', () => {
    const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
    const symbolTable = createSymbolTable([symbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/test.ts', symbolId: 'src/test.ts::testFunc' }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    expect(result[0].symbol.id).toBe('src/test.ts::testFunc');
    expect(result[0].issues.typescript.length).toBe(1);
  });

  it('groups multiple issues to the same symbol', () => {
    const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
    const symbolTable = createSymbolTable([symbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::testFunc' }),
      createLocatedIssue({ symbolId: 'src/test.ts::testFunc' }),
    ];
    extracted.eslint = [
      createEslintIssue({ symbolId: 'src/test.ts::testFunc' }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    expect(result[0].issues.typescript.length).toBe(2);
    expect(result[0].issues.eslint.length).toBe(1);
    expect(result[0].totalIssueCount).toBe(3);
  });

  it('creates synthetic symbols for issues without symbolId', () => {
    const symbolTable = createSymbolTable([]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/orphan.ts', line: 5 }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbols(extracted, symbolTable);

    // Should create a synthetic file-level symbol
    expect(result.length).toBe(1);
    expect(result[0].symbol.kind).toBe('file');
  });

  it('computes issueDensity correctly', () => {
    const symbol = createSymbol({ id: 'src/test.ts::testFunc', sloc: 10 });
    const symbolTable = createSymbolTable([symbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::testFunc' }),
      createLocatedIssue({ symbolId: 'src/test.ts::testFunc' }),
    ];
    extracted.totalCount = 2;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    expect(result[0].issueDensity).toBe(0.2); // 2 issues / 10 SLOC
  });

  it('computes coverageGap from coverage issues', () => {
    const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
    const symbolTable = createSymbolTable([symbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.coverage = [
      createCoverageIssue({
        symbolId: 'src/test.ts::testFunc',
        dimension: 'coverage.unit.branches',
        code: 'uncovered-branches',
        context: '3 / 10 branches uncovered',
        impact: { dimension: 'coverage.unit.branches', delta: 0.3, direction: 'higher-better' },
      }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    expect(result[0].coverageGap).toBeGreaterThan(0);
  });

  it('sorts results by totalDeltaQ descending', () => {
    const symbolA = createSymbol({ id: 'src/test.ts::funcA', sloc: 10 });
    const symbolB = createSymbol({ id: 'src/test.ts::funcB', sloc: 10 });
    const symbolTable = createSymbolTable([symbolA, symbolB]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::funcA' }),
      createLocatedIssue({ symbolId: 'src/test.ts::funcB' }),
      createLocatedIssue({ symbolId: 'src/test.ts::funcB' }),
      createLocatedIssue({ symbolId: 'src/test.ts::funcB' }),
    ];
    extracted.totalCount = 4;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(2);
    expect(result[0].symbol.id).toBe('src/test.ts::funcB'); // More issues = higher ΔQ
  });

  it('filters out symbols with no issues', () => {
    const symbolA = createSymbol({ id: 'src/test.ts::funcA' });
    const symbolB = createSymbol({ id: 'src/test.ts::funcB' });
    const symbolTable = createSymbolTable([symbolA, symbolB]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::funcA' }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    expect(result[0].symbol.id).toBe('src/test.ts::funcA');
  });

  it('handles coverage issues in totalIssueCount correctly', () => {
    const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
    const symbolTable = createSymbolTable([symbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.coverage = [
      createCoverageIssue({ symbolId: 'src/test.ts::testFunc' }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    // Coverage issues are not counted in totalIssueCount (they affect coverageGap instead)
    expect(result[0].totalIssueCount).toBe(0);
    expect(result[0].issues.coverage.length).toBe(1);
  });
});

// =============================================================================
// aggregateToSymbolsWithOptions Tests
// =============================================================================

describe('aggregateToSymbolsWithOptions', () => {
  it('applies limit option', () => {
    const symbols = [
      createSymbol({ id: 'src/test.ts::funcA' }),
      createSymbol({ id: 'src/test.ts::funcB' }),
      createSymbol({ id: 'src/test.ts::funcC' }),
    ];
    const symbolTable = createSymbolTable(symbols);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::funcA' }),
      createLocatedIssue({ symbolId: 'src/test.ts::funcB' }),
      createLocatedIssue({ symbolId: 'src/test.ts::funcC' }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToSymbolsWithOptions(extracted, symbolTable, { limit: 2 });

    expect(result.length).toBe(2);
  });

  it('applies minDeltaQ filter', () => {
    const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
    const symbolTable = createSymbolTable([symbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::testFunc' }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbolsWithOptions(extracted, symbolTable, { minDeltaQ: 1000 });

    expect(result.length).toBe(0);
  });

  it('applies minIssueDensity filter', () => {
    const symbolA = createSymbol({ id: 'src/test.ts::funcA', sloc: 100 }); // Low density
    const symbolB = createSymbol({ id: 'src/test.ts::funcB', sloc: 1 }); // High density
    const symbolTable = createSymbolTable([symbolA, symbolB]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::funcA' }),
      createLocatedIssue({ symbolId: 'src/test.ts::funcB' }),
    ];
    extracted.totalCount = 2;

    const result = aggregateToSymbolsWithOptions(extracted, symbolTable, { minIssueDensity: 0.5 });

    expect(result.length).toBe(1);
    expect(result[0].symbol.id).toBe('src/test.ts::funcB');
  });

  it('applies kinds filter', () => {
    const funcSymbol = createSymbol({ id: 'src/test.ts::func', kind: 'function' });
    const classSymbol = createSymbol({ id: 'src/test.ts::MyClass', kind: 'class' });
    const symbolTable = createSymbolTable([funcSymbol, classSymbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::func' }),
      createLocatedIssue({ symbolId: 'src/test.ts::MyClass' }),
    ];
    extracted.totalCount = 2;

    const result = aggregateToSymbolsWithOptions(extracted, symbolTable, { kinds: ['function'] });

    expect(result.length).toBe(1);
    expect(result[0].symbol.kind).toBe('function');
  });

  it('combines multiple filters', () => {
    const symbols = [
      createSymbol({ id: 'src/test.ts::funcA', kind: 'function', sloc: 10 }),
      createSymbol({ id: 'src/test.ts::funcB', kind: 'function', sloc: 100 }),
      createSymbol({ id: 'src/test.ts::MyClass', kind: 'class', sloc: 10 }),
    ];
    const symbolTable = createSymbolTable(symbols);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::funcA' }),
      createLocatedIssue({ symbolId: 'src/test.ts::funcB' }),
      createLocatedIssue({ symbolId: 'src/test.ts::MyClass' }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToSymbolsWithOptions(extracted, symbolTable, {
      kinds: ['function'],
      minIssueDensity: 0.05,
    });

    expect(result.length).toBe(1);
    expect(result[0].symbol.id).toBe('src/test.ts::funcA');
  });
});
