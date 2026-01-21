/**
 * Tests for targets/aggregate.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mock dependency-graph module
vi.mock('../../src/dependency-graph.js', () => ({
  buildDependencyGraph: vi.fn(),
}));

// Mock symbols/call-graph module
vi.mock('../../src/symbols/call-graph.js', () => ({
  computeSymbolCallGraphWeights: vi.fn(),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
  });
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

  it('handles issues without line numbers for line range', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/a.ts', line: undefined }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].startLine).toBeUndefined();
    expect(result[0].endLine).toBeUndefined();
  });

  it('falls back to file when symbol granularity but no symbol info', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/orphan.ts', symbol: undefined, symbolId: undefined }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToTargets(extracted, { granularity: 'symbol' });

    expect(result.length).toBe(1);
    expect(result[0].file).toBe('src/orphan.ts');
    expect(result[0].symbol).toBeUndefined();
  });

  it('parses file::symbol back correctly', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/a.ts', symbol: 'myFunc' }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToTargets(extracted, { granularity: 'symbol' });

    expect(result.length).toBe(1);
    expect(result[0].file).toBe('src/a.ts');
    expect(result[0].symbol).toBe('myFunc');
  });

  it('handles sonar issues without severity', () => {
    const extracted = createEmptyExtractedIssues();
    extracted.sonarqube = [
      createSonarIssue({ severity: undefined }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToTargets(extracted, { granularity: 'file' });

    expect(result.length).toBe(1);
    expect(result[0].breakdown.sonarqube).toBeDefined();
  });

  describe('with graph weights', () => {
    it('computes weighted ΔQ when graph is available', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(
        new Map([
          ['src/core.ts', {
            path: 'src/core.ts',
            directDependents: 5,
            indirectDependents: 10,
            directDependencies: 2,
            indirectDependencies: 5,
            impact: 0.8,
            dependentPaths: [],
          }],
        ])
      );

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ file: 'src/core.ts' }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToTargets(extracted, {
        granularity: 'file',
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].dependentCount).toBe(10);
      expect(result[0].centralityScore).toBe(0.8);
      expect(result[0].weightedDeltaQ).toBeGreaterThan(result[0].totalDeltaQ);
    });

    it('handles graph building failure gracefully', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockImplementation(() => {
        throw new Error('Graph build failed');
      });

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ file: 'src/a.ts' }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToTargets(extracted, {
        granularity: 'file',
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].weightedDeltaQ).toBeUndefined();
    });

    it('uses unweighted ΔQ for files not in graph', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(new Map());

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ file: 'src/unknown.ts' }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToTargets(extracted, {
        granularity: 'file',
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].weightedDeltaQ).toBe(result[0].totalDeltaQ);
    });

    it('matches files by path suffix', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(
        new Map([
          ['/absolute/path/src/core.ts', {
            path: '/absolute/path/src/core.ts',
            directDependents: 3,
            indirectDependents: 7,
            directDependencies: 1,
            indirectDependencies: 3,
            impact: 0.5,
            dependentPaths: [],
          }],
        ])
      );

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ file: 'src/core.ts' }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToTargets(extracted, {
        granularity: 'file',
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].dependentCount).toBe(7);
    });

    it('matches by basename when suffix does not match', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(
        new Map([
          ['different/path/core.ts', {
            path: 'different/path/core.ts',
            directDependents: 2,
            indirectDependents: 4,
            directDependencies: 1,
            indirectDependencies: 2,
            impact: 0.3,
            dependentPaths: [],
          }],
        ])
      );

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ file: 'src/core.ts' }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToTargets(extracted, {
        granularity: 'file',
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].dependentCount).toBe(4);
    });

    it('sorts by weightedDeltaQ when graph weights enabled', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(
        new Map([
          ['src/core.ts', {
            path: 'src/core.ts',
            directDependents: 10,
            indirectDependents: 20,
            directDependencies: 1,
            indirectDependencies: 2,
            impact: 0.9,
            dependentPaths: [],
          }],
          ['src/leaf.ts', {
            path: 'src/leaf.ts',
            directDependents: 0,
            indirectDependents: 0,
            directDependencies: 5,
            indirectDependencies: 10,
            impact: 0.1,
            dependentPaths: [],
          }],
        ])
      );

      const extracted = createEmptyExtractedIssues();
      // Leaf has more issues but core has more dependents
      extracted.typescript = [
        createLocatedIssue({ file: 'src/core.ts' }),
        createLocatedIssue({ file: 'src/leaf.ts' }),
        createLocatedIssue({ file: 'src/leaf.ts' }),
        createLocatedIssue({ file: 'src/leaf.ts' }),
      ];
      extracted.totalCount = 4;

      const result = aggregateToTargets(extracted, {
        granularity: 'file',
        includeGraphWeights: true,
      });

      expect(result.length).toBe(2);
      // Core should be first due to high dependent count despite fewer issues
      expect(result[0].file).toBe('src/core.ts');
    });
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

  it('expands synthetic symbol span with multiple issues', () => {
    const symbolTable = createSymbolTable([]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ file: 'src/orphan.ts', line: 50, endLine: 55 }),
      createLocatedIssue({ file: 'src/orphan.ts', line: 10, endLine: 15 }),
      createLocatedIssue({ file: 'src/orphan.ts', line: 100, endLine: 110 }),
    ];
    extracted.totalCount = 3;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    expect(result[0].symbol.span.startLine).toBe(10);
    expect(result[0].symbol.span.endLine).toBe(110);
  });

  it('falls back to primary symbol when symbolId not found', () => {
    // Create a large function that should be the primary symbol for the file
    const primarySymbol = createSymbol({
      id: 'src/test.ts::mainFunction',
      file: 'src/test.ts',
      sloc: 100,
    });
    const symbolTable = createSymbolTable([primarySymbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({
        file: 'src/test.ts',
        symbolId: undefined,
        symbol: undefined,
      }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    expect(result[0].symbol.id).toBe('src/test.ts::mainFunction');
  });

  it('selects largest symbol when all symbols have parents (no top-level)', () => {
    // Create nested symbols where ALL have parents - tests the branch at line 432
    // where topLevel.length === 0 so we fall back to fileSymbols
    const outerSymbol = createSymbol({
      id: 'src/nested.ts::OuterClass',
      file: 'src/nested.ts',
      name: 'OuterClass',
      kind: 'class',
      sloc: 50,
      parent: 'src/nested.ts::module', // Has a parent, so NOT top-level
    });
    const innerSymbol = createSymbol({
      id: 'src/nested.ts::OuterClass.innerMethod',
      file: 'src/nested.ts',
      name: 'innerMethod',
      kind: 'method',
      sloc: 20,
      parent: 'src/nested.ts::OuterClass', // Has a parent
    });
    const symbolTable = createSymbolTable([outerSymbol, innerSymbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({
        file: 'src/nested.ts',
        symbolId: undefined,
        symbol: undefined,
      }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    // Should select OuterClass because it has the largest SLOC (50 > 20)
    expect(result[0].symbol.id).toBe('src/nested.ts::OuterClass');
  });

  it('handles issueDensity when sloc is 0', () => {
    const symbol = createSymbol({ id: 'src/test.ts::emptyFunc', sloc: 0 });
    const symbolTable = createSymbolTable([symbol]);

    const extracted = createEmptyExtractedIssues();
    extracted.typescript = [
      createLocatedIssue({ symbolId: 'src/test.ts::emptyFunc' }),
    ];
    extracted.totalCount = 1;

    const result = aggregateToSymbols(extracted, symbolTable);

    expect(result.length).toBe(1);
    expect(result[0].issueDensity).toBe(0);
  });

  describe('coverage parsing', () => {
    it('parses summary coverage context with X / Y format', () => {
      const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.coverage = [
        createCoverageIssue({
          symbolId: 'src/test.ts::testFunc',
          dimension: 'coverage.unit.branches',
          code: 'uncovered-branches',
          context: '5 / 20 branches uncovered',
        }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbols(extracted, symbolTable);

      expect(result.length).toBe(1);
      expect(result[0].coverage.branches.total).toBe(20);
      expect(result[0].coverage.branches.uncovered).toBe(5);
      expect(result[0].coverage.branches.covered).toBe(15);
    });

    it('uses delta when context parsing fails', () => {
      const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.coverage = [
        createCoverageIssue({
          symbolId: 'src/test.ts::testFunc',
          dimension: 'coverage.unit.branches',
          code: 'uncovered-branches',
          context: 'no numbers here',
          impact: { dimension: 'coverage.unit.branches', delta: 0.25, direction: 'higher-better' },
        }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbols(extracted, symbolTable);

      expect(result.length).toBe(1);
      expect(result[0].coverageGap).toBe(0.25);
    });

    it('handles per-branch issues', () => {
      const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.coverage = [
        createCoverageIssue({
          symbolId: 'src/test.ts::testFunc',
          dimension: 'coverage.unit.branches',
          code: 'branch-1',
          impact: { dimension: 'coverage.unit.branches', delta: 0.1, direction: 'higher-better' },
        }),
        createCoverageIssue({
          symbolId: 'src/test.ts::testFunc',
          dimension: 'coverage.unit.branches',
          code: 'branch-2',
          impact: { dimension: 'coverage.unit.branches', delta: 0.1, direction: 'higher-better' },
        }),
      ];
      extracted.totalCount = 2;

      const result = aggregateToSymbols(extracted, symbolTable);

      expect(result.length).toBe(1);
      expect(result[0].coverage.branches.uncovered).toBe(2);
    });

    it('handles generic branch issues without code', () => {
      const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.coverage = [
        createCoverageIssue({
          symbolId: 'src/test.ts::testFunc',
          dimension: 'coverage.unit.branches',
          code: undefined,
          impact: { dimension: 'coverage.unit.branches', delta: 0.3, direction: 'higher-better' },
        }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbols(extracted, symbolTable);

      expect(result.length).toBe(1);
      expect(result[0].coverageGap).toBeGreaterThan(0);
    });

    it('clamps coverage gap to [0, 1]', () => {
      const symbol = createSymbol({ id: 'src/test.ts::testFunc' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.coverage = [
        createCoverageIssue({
          symbolId: 'src/test.ts::testFunc',
          dimension: 'coverage.unit.branches',
          code: 'uncovered-branches',
          context: undefined,
          impact: { dimension: 'coverage.unit.branches', delta: 2.0, direction: 'higher-better' },
        }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbols(extracted, symbolTable);

      expect(result.length).toBe(1);
      expect(result[0].coverageGap).toBeLessThanOrEqual(1);
    });
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

  describe('with call graph weights', () => {
    it('applies call graph weights when requested', async () => {
      const { computeSymbolCallGraphWeights } = await import('../../src/symbols/call-graph.js');
      vi.mocked(computeSymbolCallGraphWeights).mockReturnValue(
        new Map([
          ['src/test.ts::funcA', { callersCount: 10, calleesCount: 2 }],
          ['src/test.ts::funcB', { callersCount: 0, calleesCount: 5 }],
        ])
      );

      const symbols = [
        createSymbol({ id: 'src/test.ts::funcA' }),
        createSymbol({ id: 'src/test.ts::funcB' }),
      ];
      const symbolTable = createSymbolTable(symbols);

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ symbolId: 'src/test.ts::funcA' }),
        createLocatedIssue({ symbolId: 'src/test.ts::funcB' }),
        createLocatedIssue({ symbolId: 'src/test.ts::funcB' }),
      ];
      extracted.totalCount = 3;

      const result = aggregateToSymbolsWithOptions(extracted, symbolTable, {
        includeCallGraphWeights: true,
      });

      expect(result.length).toBe(2);
      // funcA should be first due to higher callers count despite fewer issues
      expect(result[0].symbol.id).toBe('src/test.ts::funcA');
      expect(result[0].callersCount).toBe(10);
      expect(result[0].calleesCount).toBe(2);
      expect(result[0].weightingSource).toBe('call-graph');
      expect(result[0].weightedDeltaQ).toBeGreaterThan(result[0].totalDeltaQ);
    });

    it('handles symbols not in call graph', async () => {
      const { computeSymbolCallGraphWeights } = await import('../../src/symbols/call-graph.js');
      vi.mocked(computeSymbolCallGraphWeights).mockReturnValue(new Map());

      const symbol = createSymbol({ id: 'src/test.ts::orphan' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ symbolId: 'src/test.ts::orphan' }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbolsWithOptions(extracted, symbolTable, {
        includeCallGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].callersCount).toBe(0);
      expect(result[0].calleesCount).toBe(0);
    });
  });

  describe('with file graph weights', () => {
    it('applies file graph weights when requested', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(
        new Map([
          ['src/test.ts', {
            path: 'src/test.ts',
            directDependents: 5,
            indirectDependents: 15,
            directDependencies: 2,
            indirectDependencies: 5,
            impact: 0.7,
            dependentPaths: [],
          }],
        ])
      );

      const symbol = createSymbol({ id: 'src/test.ts::func', file: 'src/test.ts' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ symbolId: 'src/test.ts::func' }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbolsWithOptions(extracted, symbolTable, {
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].dependentCount).toBe(15);
      expect(result[0].centralityScore).toBe(0.7);
      expect(result[0].weightingSource).toBe('file');
      expect(result[0].weightedDeltaQ).toBeGreaterThan(result[0].totalDeltaQ);
    });

    it('handles graph build failure gracefully', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockImplementation(() => {
        throw new Error('Graph build failed');
      });

      const symbol = createSymbol({ id: 'src/test.ts::func' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ symbolId: 'src/test.ts::func' }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbolsWithOptions(extracted, symbolTable, {
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].weightedDeltaQ).toBeUndefined();
    });

    it('tries relative path when absolute does not match', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(
        new Map([
          ['src/test.ts', {
            path: 'src/test.ts',
            directDependents: 3,
            indirectDependents: 8,
            directDependencies: 1,
            indirectDependencies: 3,
            impact: 0.5,
            dependentPaths: [],
          }],
        ])
      );

      const symbol = createSymbol({
        id: `${process.cwd()}/src/test.ts::func`,
        file: `${process.cwd()}/src/test.ts`,
      });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ symbolId: symbol.id }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbolsWithOptions(extracted, symbolTable, {
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].dependentCount).toBe(8);
    });

    it('uses suffix matching as fallback', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(
        new Map([
          ['other/path/src/test.ts', {
            path: 'other/path/src/test.ts',
            directDependents: 2,
            indirectDependents: 6,
            directDependencies: 1,
            indirectDependencies: 2,
            impact: 0.4,
            dependentPaths: [],
          }],
        ])
      );

      const symbol = createSymbol({
        id: '/project/src/test.ts::func',
        file: '/project/src/test.ts',
      });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ symbolId: symbol.id }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbolsWithOptions(extracted, symbolTable, {
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].dependentCount).toBe(6);
    });

    it('uses unweighted delta for files not in graph', async () => {
      const { buildDependencyGraph } = await import('../../src/dependency-graph.js');
      vi.mocked(buildDependencyGraph).mockReturnValue(new Map());

      const symbol = createSymbol({ id: 'src/unknown.ts::func', file: 'src/unknown.ts' });
      const symbolTable = createSymbolTable([symbol]);

      const extracted = createEmptyExtractedIssues();
      extracted.typescript = [
        createLocatedIssue({ symbolId: symbol.id }),
      ];
      extracted.totalCount = 1;

      const result = aggregateToSymbolsWithOptions(extracted, symbolTable, {
        includeGraphWeights: true,
      });

      expect(result.length).toBe(1);
      expect(result[0].weightedDeltaQ).toBe(result[0].totalDeltaQ);
      expect(result[0].weightingSource).toBe('file');
    });
  });
});
