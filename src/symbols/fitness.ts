/**
 * Address Fitness Metrics
 * =======================
 * Diagnostics for how well an addressing scheme supports target-space gradients.
 */

import type { ExtractedIssues, LocatedIssue } from '../targets/types.js';
import type { SymbolTable } from './types.js';
import { computeSymbolCallGraphStats, type SymbolCallGraphStats } from './call-graph.js';

export interface AddressFitnessStats {
  addressSpace: {
    symbolCount: number;
    fileCount: number;
    topLevelSymbolCount: number;
  };
  mapping: {
    totalIssues: number;
    lineIssues: number;
    fileIssues: number;
    mappedIssues: number;
    mappedLineIssues: number;
    mappedFileIssues: number;
    unmappedIssues: number;
    overallMappingRate: number;
    lineMappingRate: number;
    fileMappingRate: number;
  };
  size: {
    minSloc: number;
    medianSloc: number;
    p90Sloc: number;
    p95Sloc: number;
    maxSloc: number;
    avgSloc: number;
  };
  graph?: SymbolCallGraphStats;
  assessment: {
    status: 'fit' | 'mixed' | 'unfit';
    reasons: string[];
  };
}

export interface AddressFitnessOptions {
  includeCallGraph?: boolean;
}

export function computeAddressFitness(
  symbolTable: SymbolTable,
  extractedIssues: ExtractedIssues,
  options: AddressFitnessOptions = {}
): AddressFitnessStats {
  const allIssues = flattenIssues(extractedIssues);
  const totalIssues = allIssues.length;
  const lineIssues = allIssues.filter(issue => issue.line !== undefined).length;
  const fileIssues = totalIssues - lineIssues;
  const mappedIssues = allIssues.filter(issue => issue.symbolId).length;
  const mappedLineIssues = allIssues.filter(issue => issue.line !== undefined && issue.symbolId).length;
  const mappedFileIssues = allIssues.filter(issue => issue.line === undefined && issue.symbolId).length;
  const unmappedIssues = totalIssues - mappedIssues;

  const overallMappingRate = totalIssues > 0 ? mappedIssues / totalIssues : 1;
  const lineMappingRate = lineIssues > 0 ? mappedLineIssues / lineIssues : 1;
  const fileMappingRate = fileIssues > 0 ? mappedFileIssues / fileIssues : 1;

  const symbols = [...symbolTable.symbols.values()];
  const slocValues = symbols.map(symbol => symbol.sloc).sort((a, b) => a - b);

  const size = {
    minSloc: slocValues.length > 0 ? slocValues[0] : 0,
    medianSloc: percentile(slocValues, 50),
    p90Sloc: percentile(slocValues, 90),
    p95Sloc: percentile(slocValues, 95),
    maxSloc: slocValues.length > 0 ? slocValues[slocValues.length - 1] : 0,
    avgSloc: slocValues.length > 0
      ? slocValues.reduce((sum, value) => sum + value, 0) / slocValues.length
      : 0,
  };

  const addressSpace = {
    symbolCount: symbolTable.symbols.size,
    fileCount: symbolTable.byFile.size,
    topLevelSymbolCount: symbols.filter(symbol => !symbol.parent).length,
  };

  const graph = options.includeCallGraph ? computeSymbolCallGraphStats(symbolTable) : undefined;
  const assessment = assessFitness(totalIssues, overallMappingRate, lineMappingRate, size);

  return {
    addressSpace,
    mapping: {
      totalIssues,
      lineIssues,
      fileIssues,
      mappedIssues,
      mappedLineIssues,
      mappedFileIssues,
      unmappedIssues,
      overallMappingRate,
      lineMappingRate,
      fileMappingRate,
    },
    size,
    graph,
    assessment,
  };
}

export function formatAddressFitness(stats: AddressFitnessStats): string {
  const lines: string[] = [];
  const { mapping, size, addressSpace, graph, assessment } = stats;

  lines.push('Address Fitness');
  lines.push(`  Status: ${assessment.status}${assessment.reasons.length > 0 ? ` (${assessment.reasons.join('; ')})` : ''}`);
  lines.push(`  Mapping: ${(mapping.overallMappingRate * 100).toFixed(1)}% overall, ${(mapping.lineMappingRate * 100).toFixed(1)}% line-level`);
  lines.push(`  Fallback: ${(mapping.fileMappingRate * 100).toFixed(1)}% file-level, ${mapping.unmappedIssues} unmapped`);
  lines.push(`  Units: ${addressSpace.symbolCount} symbols across ${addressSpace.fileCount} files`);
  lines.push(`  Size: median ${Math.round(size.medianSloc)} lines, p90 ${Math.round(size.p90Sloc)}, max ${Math.round(size.maxSloc)}`);

  if (graph) {
    lines.push(`  Call graph: ${(graph.resolutionRate * 100).toFixed(1)}% resolved, ${graph.edgeCount} edges, avg out ${graph.avgOutDegree.toFixed(2)}`);
  }

  return lines.join('\n');
}

function flattenIssues(extractedIssues: ExtractedIssues): LocatedIssue[] {
  return [
    ...extractedIssues.coverage,
    ...extractedIssues.typescript,
    ...extractedIssues.eslint,
    ...extractedIssues.sonarqube,
  ];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.floor((p / 100) * (values.length - 1)));
  return values[index];
}

function assessFitness(
  totalIssues: number,
  overallMappingRate: number,
  lineMappingRate: number,
  size: AddressFitnessStats['size']
): AddressFitnessStats['assessment'] {
  const reasons: string[] = [];

  if (totalIssues === 0) {
    reasons.push('no issues to evaluate mapping');
  }

  if (overallMappingRate < 0.9) {
    reasons.push('low overall mapping coverage');
  }
  if (lineMappingRate < 0.8) {
    reasons.push('low line-level mapping coverage');
  }
  if (size.p90Sloc > 300) {
    reasons.push('address units are coarse (p90 > 300 lines)');
  }
  if (size.medianSloc > 0 && size.medianSloc < 3) {
    reasons.push('address units are very small (median < 3 lines)');
  }

  let status: 'fit' | 'mixed' | 'unfit';

  if (totalIssues === 0) {
    status = 'mixed';
  } else if (overallMappingRate >= 0.9 && lineMappingRate >= 0.8) {
    status = 'fit';
  } else if (overallMappingRate >= 0.7 && lineMappingRate >= 0.5) {
    status = 'mixed';
  } else {
    status = 'unfit';
  }

  return { status, reasons };
}
