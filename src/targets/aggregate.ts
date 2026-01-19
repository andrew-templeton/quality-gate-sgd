/**
 * Optimization Target Aggregation
 * ================================
 * Aggregates located issues into optimization targets with computed ΔQ.
 *
 * The key insight: one target (file/symbol) can address MULTIPLE dimensions.
 * We compute totalDeltaQ as the weighted sum of impacts across all dimensions.
 *
 * Graph Weighting:
 * When includeGraphWeights is enabled, targets are weighted by their position
 * in the dependency graph. Files with more dependents get higher priority
 * because fixing them has broader impact across the codebase.
 */

import { getDefaultFitnessConfig } from '../fitness.js';
import { getDimension } from '../dimensions/index.js';
import { buildDependencyGraph } from '../dependency-graph.js';
import type { FileInfo } from '../types.js';
import { getFileSymbols } from '../symbols/mapper.js';
import { computeSymbolCallGraphWeights } from '../symbols/call-graph.js';
import type {
  LocatedIssue,
  ExtractedIssues,
  OptimizationTarget,
  AggregateTargetsOptions,
  IssueSeverity,
} from './types.js';
import type {
  SymbolTable,
  CodeSymbol,
  SymbolIssues,
  SymbolCoverage,
  SymbolIssuesByAxis,
} from '../symbols/types.js';

// =============================================================================
// ΔQ Computation
// =============================================================================

/**
 * Compute total ΔQ for an optimization target.
 *
 * Sums the ΔQ contributions from all issues at this target.
 */
export function computeTargetDeltaQ(issues: LocatedIssue[]): number {
  let totalDeltaQ = 0;

  // Group impacts by dimension to avoid double-counting
  const impactsByDimension = new Map<string, number>();

  for (const issue of issues) {
    const dim = issue.impact.dimension;
    const currentTotal = impactsByDimension.get(dim) ?? 0;
    impactsByDimension.set(dim, currentTotal + issue.impact.delta);
  }

  // Compute ΔQ for each dimension's total impact
  for (const [dimension, totalDelta] of impactsByDimension) {
    const dim = getDimension(dimension);
    if (!dim) continue;

    const config = getDefaultFitnessConfig();
    const weight = config.weights[dimension] ?? dim.defaultWeight;

    if (dim.direction === 'higher-better') {
      // Coverage: direct contribution
      totalDeltaQ += weight * totalDelta;
    } else {
      // Errors: each reduction helps (use simple approximation)
      // More errors fixed = more improvement, but diminishing returns
      const errorCount = Math.abs(totalDelta);
      const avgGainPerError = 0.105; // exp(1/10) - 1
      totalDeltaQ += weight * avgGainPerError * errorCount;
    }
  }

  return totalDeltaQ;
}

// =============================================================================
// Breakdown Computation
// =============================================================================

/**
 * Compute the breakdown for an optimization target.
 */
function computeBreakdown(issues: LocatedIssue[]): OptimizationTarget['breakdown'] {
  const breakdown: OptimizationTarget['breakdown'] = {};

  // Coverage
  const coverageIssues = issues.filter(i => i.source === 'coverage');
  if (coverageIssues.length > 0) {
    const branchIssues = coverageIssues.filter(i => i.dimension === 'coverage.unit.branches');
    const lineIssues = coverageIssues.filter(i => i.dimension === 'coverage.unit.lines');
    const estimatedGain = coverageIssues.reduce((sum, i) => sum + i.impact.delta * 100, 0);

    breakdown.coverage = {
      uncoveredBranches: branchIssues.length,
      uncoveredLines: lineIssues.length,
      estimatedCoverageGain: Math.round(estimatedGain * 10) / 10,
    };
  }

  // TypeScript
  const tsIssues = issues.filter(i => i.source === 'typescript');
  if (tsIssues.length > 0) {
    const codes = [...new Set(tsIssues.map(i => i.code).filter(Boolean))] as string[];
    breakdown.typescript = {
      errorCount: tsIssues.length,
      errorCodes: codes,
    };
  }

  // ESLint
  const eslintIssues = issues.filter(i => i.source === 'eslint');
  if (eslintIssues.length > 0) {
    const errors = eslintIssues.filter(i => i.dimension === 'eslint.errors');
    const warnings = eslintIssues.filter(i => i.dimension === 'eslint.warnings');
    const rules = [...new Set(eslintIssues.map(i => i.code).filter(Boolean))] as string[];

    breakdown.eslint = {
      errorCount: errors.length,
      warningCount: warnings.length,
      rules,
    };
  }

  // SonarQube
  const sonarIssues = issues.filter(i => i.source === 'sonarqube');
  if (sonarIssues.length > 0) {
    const bugs = sonarIssues.filter(i => i.dimension === 'sonarqube.bugs').length;
    const vulns = sonarIssues.filter(i => i.dimension === 'sonarqube.vulnerabilities').length;
    const smells = sonarIssues.filter(i => i.dimension === 'sonarqube.codeSmells').length;

    const severityCounts: Record<IssueSeverity, number> = {
      blocker: 0,
      critical: 0,
      major: 0,
      minor: 0,
      info: 0,
    };

    for (const issue of sonarIssues) {
      if (issue.severity) {
        severityCounts[issue.severity]++;
      }
    }

    breakdown.sonarqube = {
      bugs,
      vulnerabilities: vulns,
      codeSmells: smells,
      severityCounts,
    };
  }

  return breakdown;
}

// =============================================================================
// Aggregation
// =============================================================================

/**
 * Aggregate located issues into optimization targets.
 *
 * Groups issues by file (or symbol if granularity='symbol'), computes
 * total ΔQ for each target, and returns sorted by impact.
 *
 * When includeGraphWeights is enabled:
 * - Builds the dependency graph to get dependent counts per file
 * - Computes weightedDeltaQ = totalDeltaQ * (1 + log2(dependentCount + 1))
 * - Sorts by weightedDeltaQ instead of totalDeltaQ
 *
 * This prioritizes fixing files that many other files depend on, since
 * improving their quality has cascading benefits.
 */
export function aggregateToTargets(
  extractedIssues: ExtractedIssues,
  options: AggregateTargetsOptions = { granularity: 'file' }
): OptimizationTarget[] {
  const { granularity, limit, minDeltaQ, includeGraphWeights } = options;

  // Build dependency graph if graph weighting is enabled
  let fileInfoMap: Map<string, FileInfo> | undefined;
  if (includeGraphWeights) {
    try {
      fileInfoMap = buildDependencyGraph();
    } catch {
      // If graph building fails, continue without weights
      fileInfoMap = undefined;
    }
  }

  // Combine all issues
  const allIssues = [
    ...extractedIssues.coverage,
    ...extractedIssues.typescript,
    ...extractedIssues.eslint,
    ...extractedIssues.sonarqube,
  ];

  // Group by file (or symbol if granularity='symbol')
  const groups = new Map<string, LocatedIssue[]>();

  for (const issue of allIssues) {
    let key: string;

    if (granularity === 'symbol') {
      if (issue.symbolId) {
        key = issue.symbolId;
      } else if (issue.symbol) {
        key = `${issue.file}::${issue.symbol}`;
      } else {
        key = issue.file;
      }
    } else {
      key = issue.file;
    }

    const existing = groups.get(key) ?? [];
    existing.push(issue);
    groups.set(key, existing);
  }

  // Build optimization targets
  const targets: OptimizationTarget[] = [];

  for (const [key, issues] of groups) {
    // Parse key back to file/symbol
    let file = key;
    let symbol: string | undefined;
    if (key.includes('::')) {
      const parts = key.split('::');
      file = parts.shift() ?? key;
      symbol = parts.join('::') || undefined;
    }

    // Compute impacts per dimension
    const impacts: Record<string, number> = {};
    for (const issue of issues) {
      const dim = issue.impact.dimension;
      impacts[dim] = (impacts[dim] ?? 0) + issue.impact.delta;
    }

    // Compute total ΔQ
    const totalDeltaQ = computeTargetDeltaQ(issues);

    // Skip if below threshold
    if (minDeltaQ !== undefined && totalDeltaQ < minDeltaQ) {
      continue;
    }

    // Compute breakdown
    const breakdown = computeBreakdown(issues);

    // Determine dimensions affected
    const dimensionsAffected = [...new Set(issues.map(i => i.dimension))];

    // Find line range
    const lines = issues.map(i => i.line).filter((l): l is number => l !== undefined);
    const startLine = lines.length > 0 ? Math.min(...lines) : undefined;
    const endLine = lines.length > 0 ? Math.max(...lines) : undefined;

    // Compute graph-based weights if available
    let dependentCount: number | undefined;
    let centralityScore: number | undefined;
    let weightedDeltaQ: number | undefined;

    if (fileInfoMap) {
      // Try to find file info - handle both absolute and relative paths
      const fileInfo = fileInfoMap.get(file) ?? findFileInfoByPath(fileInfoMap, file);

      if (fileInfo) {
        dependentCount = fileInfo.indirectDependents;
        centralityScore = fileInfo.impact;

        // weightedDeltaQ = totalDeltaQ * (1 + log2(dependentCount + 1))
        // This gives a multiplicative boost based on how many files depend on this one:
        // - 0 dependents: 1x boost
        // - 1 dependent: ~2x boost
        // - 3 dependents: ~2x boost
        // - 7 dependents: ~3x boost
        // - 15 dependents: ~4x boost
        // - 31 dependents: ~5x boost
        const graphMultiplier = 1 + Math.log2(dependentCount + 1);
        weightedDeltaQ = totalDeltaQ * graphMultiplier;
      } else {
        // File not in graph (possibly external or test file)
        weightedDeltaQ = totalDeltaQ;
      }
    }

    targets.push({
      file,
      symbol,
      startLine,
      endLine,
      issues,
      issueCount: issues.length,
      dimensionsAffected,
      impacts,
      totalDeltaQ,
      dependentCount,
      centralityScore,
      weightedDeltaQ,
      breakdown,
    });
  }

  // Sort by weightedDeltaQ if available, otherwise totalDeltaQ
  if (includeGraphWeights) {
    targets.sort((a, b) => (b.weightedDeltaQ ?? b.totalDeltaQ) - (a.weightedDeltaQ ?? a.totalDeltaQ));
  } else {
    targets.sort((a, b) => b.totalDeltaQ - a.totalDeltaQ);
  }

  // Apply limit
  if (limit !== undefined && limit > 0) {
    return targets.slice(0, limit);
  }

  return targets;
}

/**
 * Try to find file info by matching the end of the path.
 * Handles cases where issues have relative paths but graph has absolute paths.
 */
function findFileInfoByPath(
  fileInfoMap: Map<string, FileInfo>,
  targetPath: string
): FileInfo | undefined {
  // Normalize the target path
  const normalizedTarget = targetPath.replace(/\\/g, '/');

  for (const [graphPath, info] of fileInfoMap) {
    const normalizedGraph = graphPath.replace(/\\/g, '/');

    // Check if one ends with the other
    if (normalizedGraph.endsWith(normalizedTarget) || normalizedTarget.endsWith(normalizedGraph)) {
      return info;
    }

    // Check if basenames match and paths are similar
    const targetBase = normalizedTarget.split('/').pop();
    const graphBase = normalizedGraph.split('/').pop();
    if (targetBase === graphBase) {
      // Could be the same file with different root paths
      return info;
    }
  }

  return undefined;
}

// =============================================================================
// Symbol-Level Aggregation
// =============================================================================

/**
 * Create an empty coverage structure.
 */
function createEmptyCoverage(): SymbolCoverage {
  return {
    branches: { total: 0, covered: 0, uncovered: 0, percentage: 100 },
    statements: { total: 0, covered: 0, uncovered: 0, percentage: 100 },
  };
}

/**
 * Create an empty issues-by-axis structure.
 */
function createEmptyIssuesByAxis(): SymbolIssuesByAxis {
  return {
    typescript: [],
    eslint: [],
    sonarqube: [],
    coverage: [],
  };
}

/**
 * Aggregate issues to the symbol level with unified representation.
 *
 * This function groups issues by their containing symbol (using symbolId)
 * and computes normalized metrics like issue density and coverage gap.
 *
 * Unlike aggregateToTargets which groups by file/symbol string,
 * this uses the full symbol table for accurate symbol information
 * and enables normalized cross-axis comparison.
 *
 * @param extractedIssues - Issues from all axes (must have symbolId populated)
 * @param symbolTable - Symbol table from symbol extraction
 * @returns Array of SymbolIssues sorted by totalDeltaQ descending
 */
export function aggregateToSymbols(
  extractedIssues: ExtractedIssues,
  symbolTable: SymbolTable
): SymbolIssues[] {
  // Initialize map with all symbols from table
  const symbolIssuesMap = new Map<string, SymbolIssues>();

  for (const [id, symbol] of symbolTable.symbols) {
    symbolIssuesMap.set(id, {
      symbol,
      coverage: createEmptyCoverage(),
      issues: createEmptyIssuesByAxis(),
      totalIssueCount: 0,
      issueDensity: 0,
      coverageGap: 0,
      totalDeltaQ: 0,
    });
  }

  const filePrimarySymbol = new Map<string, CodeSymbol | null>();
  const syntheticSymbols = new Map<string, CodeSymbol>();

  const getPrimarySymbolForFile = (file: string): CodeSymbol | null => {
    if (filePrimarySymbol.has(file)) {
      return filePrimarySymbol.get(file) ?? null;
    }

    const fileSymbols = getFileSymbols(symbolTable, file);
    if (fileSymbols.length === 0) {
      filePrimarySymbol.set(file, null);
      return null;
    }

    const topLevel = fileSymbols.filter(s => !s.parent);
    const primary = (topLevel.length > 0 ? topLevel : fileSymbols)
      .reduce((a, b) => a.sloc > b.sloc ? a : b);

    filePrimarySymbol.set(file, primary);
    return primary;
  };

  const getOrCreateSyntheticSymbol = (issue: LocatedIssue): CodeSymbol => {
    const file = issue.file;
    let synthetic = syntheticSymbols.get(file);

    if (!synthetic) {
      const name = file.split(/[/\\]/).pop() ?? file;
      const startLine = issue.line ?? 1;
      const endLine = issue.endLine ?? issue.line ?? startLine;

      synthetic = {
        id: `${file}::(file)`,
        file,
        name,
        qualifiedName: file,
        kind: 'file',
        exported: false,
        span: {
          startLine,
          startColumn: 0,
          endLine,
          endColumn: 0,
        },
        sloc: Math.max(1, endLine - startLine + 1),
      };

      syntheticSymbols.set(file, synthetic);
      symbolIssuesMap.set(synthetic.id, {
        symbol: synthetic,
        coverage: createEmptyCoverage(),
        issues: createEmptyIssuesByAxis(),
        totalIssueCount: 0,
        issueDensity: 0,
        coverageGap: 0,
        totalDeltaQ: 0,
      });
    } else if (issue.line !== undefined) {
      const startLine = issue.line;
      const endLine = issue.endLine ?? issue.line;
      if (startLine < synthetic.span.startLine) {
        synthetic.span.startLine = startLine;
      }
      if (endLine > synthetic.span.endLine) {
        synthetic.span.endLine = endLine;
      }
      synthetic.sloc = Math.max(1, synthetic.span.endLine - synthetic.span.startLine + 1);
    }

    return synthetic;
  };

  // Map issues to symbols
  const allIssues: Array<LocatedIssue & { axis: 'coverage' | 'typescript' | 'eslint' | 'sonarqube' }> = [
    ...extractedIssues.coverage.map(i => ({ ...i, axis: 'coverage' as const })),
    ...extractedIssues.typescript.map(i => ({ ...i, axis: 'typescript' as const })),
    ...extractedIssues.eslint.map(i => ({ ...i, axis: 'eslint' as const })),
    ...extractedIssues.sonarqube.map(i => ({ ...i, axis: 'sonarqube' as const })),
  ];

  for (const issue of allIssues) {
    let symbolId = issue.symbolId;
    let entry = symbolId ? symbolIssuesMap.get(symbolId) : undefined;

    if (!entry) {
      const primary = getPrimarySymbolForFile(issue.file);
      const fallback = primary ?? getOrCreateSyntheticSymbol(issue);
      symbolId = fallback.id;
      entry = symbolIssuesMap.get(symbolId);
      issue.symbolId = symbolId;
      issue.symbol = issue.symbol ?? fallback.qualifiedName;
    }

    if (!entry) {
      continue;
    }

    // Add to appropriate axis
    entry.issues[issue.axis].push(issue);

    // Count non-coverage issues
    if (issue.axis !== 'coverage') {
      entry.totalIssueCount++;
    }
  }

  // Update coverage statistics from coverage issues
  for (const entry of symbolIssuesMap.values()) {
    const coverageIssues = entry.issues.coverage;
    if (coverageIssues.length > 0) {
      const branchIssues = coverageIssues.filter(i => i.dimension.endsWith('.branches'));
      const perBranchIssues = branchIssues.filter(i => i.code?.startsWith('branch-'));
      const summaryIssues = branchIssues.filter(i => i.code === 'uncovered-branches');

      let totalBranches = 0;
      let uncoveredBranches = 0;
      let branchGap = 0;

      if (summaryIssues.length > 0) {
        const summary = summaryIssues[0];
        let parsedMissing: number | undefined;
        let parsedTotal: number | undefined;

        if (summary.context) {
          const match = summary.context.match(/(\d+)\s*\/\s*(\d+)/);
          if (match) {
            parsedMissing = parseInt(match[1], 10);
            parsedTotal = parseInt(match[2], 10);
          }
        }

        if (parsedMissing !== undefined && parsedTotal !== undefined && parsedTotal > 0) {
          uncoveredBranches = parsedMissing;
          totalBranches = parsedTotal;
          branchGap = parsedMissing / parsedTotal;
        } else {
          branchGap = Math.max(0, summary.impact.delta);
        }
      } else if (perBranchIssues.length > 0) {
        uncoveredBranches = perBranchIssues.length;
        const deltaSum = perBranchIssues.reduce((sum, issue) => sum + Math.max(0, issue.impact.delta), 0);
        branchGap = deltaSum;
        if (deltaSum > 0) {
          totalBranches = Math.max(uncoveredBranches, Math.round(uncoveredBranches / deltaSum));
        }
      } else if (branchIssues.length > 0) {
        branchGap = branchIssues.reduce((sum, issue) => sum + Math.max(0, issue.impact.delta), 0);
      }

      branchGap = Math.max(0, Math.min(1, branchGap));

      entry.coverage.branches.total = totalBranches;
      entry.coverage.branches.uncovered = uncoveredBranches;
      entry.coverage.branches.covered = totalBranches > 0
        ? Math.max(0, totalBranches - uncoveredBranches)
        : 0;
      entry.coverage.branches.percentage = totalBranches > 0
        ? (entry.coverage.branches.covered / totalBranches) * 100
        : (1 - branchGap) * 100;
      entry.coverageGap = branchGap;
    }
  }

  // Compute derived metrics
  for (const entry of symbolIssuesMap.values()) {
    // Issue density = issues / SLOC
    entry.issueDensity = entry.symbol.sloc > 0
      ? entry.totalIssueCount / entry.symbol.sloc
      : 0;

    // Compute totalDeltaQ using the same logic as OptimizationTarget
    const allSymbolIssues = [
      ...entry.issues.coverage,
      ...entry.issues.typescript,
      ...entry.issues.eslint,
      ...entry.issues.sonarqube,
    ];
    entry.totalDeltaQ = computeTargetDeltaQ(allSymbolIssues);
  }

  // Convert to array and filter out symbols with no issues
  const results = [...symbolIssuesMap.values()]
    .filter(entry =>
      entry.totalIssueCount > 0 ||
      entry.issues.coverage.length > 0
    );

  // Sort by totalDeltaQ descending (highest priority first)
  results.sort((a, b) => b.totalDeltaQ - a.totalDeltaQ);

  return results;
}

/**
 * Options for symbol-level aggregation.
 */
export interface AggregateToSymbolsOptions {
  /** Maximum number of symbols to return */
  limit?: number;

  /** Minimum totalDeltaQ to include a symbol */
  minDeltaQ?: number;

  /** Minimum issue density to include a symbol */
  minIssueDensity?: number;

  /** Filter to specific symbol kinds */
  kinds?: Array<'class' | 'method' | 'function' | 'arrow-function'>;

  /** Include dependency graph weighting for prioritization */
  includeGraphWeights?: boolean;

  /** Include symbol call graph weighting (symbols mode) */
  includeCallGraphWeights?: boolean;
}

/**
 * Aggregate to symbols with filtering options.
 */
export function aggregateToSymbolsWithOptions(
  extractedIssues: ExtractedIssues,
  symbolTable: SymbolTable,
  options: AggregateToSymbolsOptions = {}
): SymbolIssues[] {
  let results = aggregateToSymbols(extractedIssues, symbolTable);

  // Apply call graph weighting if requested (symbol-level)
  if (options.includeCallGraphWeights) {
    const weights = computeSymbolCallGraphWeights(symbolTable);

    for (const entry of results) {
      const weight = weights.get(entry.symbol.id);
      entry.callersCount = weight?.callersCount ?? 0;
      entry.calleesCount = weight?.calleesCount ?? 0;
      entry.weightingSource = 'call-graph';

      const graphMultiplier = 1 + Math.log2(entry.callersCount + 1);
      entry.weightedDeltaQ = entry.totalDeltaQ * graphMultiplier;
    }

    results.sort((a, b) => (b.weightedDeltaQ ?? b.totalDeltaQ) - (a.weightedDeltaQ ?? a.totalDeltaQ));
  } else if (options.includeGraphWeights) {
    let fileInfoMap: Map<string, FileInfo> | undefined;
    try {
      fileInfoMap = buildDependencyGraph();
    } catch {
      fileInfoMap = undefined;
    }

    if (fileInfoMap) {
      for (const entry of results) {
        // Normalize file path for graph lookup (may need to strip prefix or add it)
        const file = entry.symbol.file;
        let fileInfo = fileInfoMap.get(file);

        // Try relative path if absolute didn't match
        if (!fileInfo) {
          const relativePath = file.replace(process.cwd() + '/', '');
          fileInfo = fileInfoMap.get(relativePath);
        }

        // Try finding by suffix match
        if (!fileInfo) {
          for (const [graphPath, info] of fileInfoMap) {
            if (file.endsWith(graphPath) || graphPath.endsWith(file.replace(/^.*\/src\//, 'src/'))) {
              fileInfo = info;
              break;
            }
          }
        }

        if (fileInfo) {
          entry.dependentCount = fileInfo.indirectDependents;
          entry.centralityScore = fileInfo.impact;
          entry.weightingSource = 'file';

          // weightedDeltaQ = totalDeltaQ * (1 + log2(dependentCount + 1))
          // This gives a multiplier ranging from 1.0 (no dependents) to ~4.0+ (many dependents)
          const graphMultiplier = 1 + Math.log2(entry.dependentCount + 1);
          entry.weightedDeltaQ = entry.totalDeltaQ * graphMultiplier;
        } else {
          // No graph info - use unweighted
          entry.weightedDeltaQ = entry.totalDeltaQ;
          entry.weightingSource = 'file';
        }
      }

      // Re-sort by weightedDeltaQ
      results.sort((a, b) => (b.weightedDeltaQ ?? b.totalDeltaQ) - (a.weightedDeltaQ ?? a.totalDeltaQ));
    }
  }

  // Apply filters
  if (options.minDeltaQ !== undefined) {
    results = results.filter(s => s.totalDeltaQ >= options.minDeltaQ!);
  }

  if (options.minIssueDensity !== undefined) {
    results = results.filter(s => s.issueDensity >= options.minIssueDensity!);
  }

  if (options.kinds && options.kinds.length > 0) {
    results = results.filter(s => options.kinds!.includes(s.symbol.kind as typeof options.kinds[number]));
  }

  // Apply limit
  if (options.limit !== undefined && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}
