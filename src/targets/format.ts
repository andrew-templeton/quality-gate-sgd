/**
 * Target Formatting
 * =================
 * Formats optimization targets for CLI and MCP output.
 */

import type {
  OptimizationTarget,
  TargetSuggestion,
} from './types.js';
import type { SymbolIssues } from '../symbols/types.js';

// =============================================================================
// Single Target Formatting
// =============================================================================

/**
 * Format a single optimization target for CLI display.
 */
export function formatTarget(target: OptimizationTarget, rank?: number): string {
  const lines: string[] = [];

  // Header with rank
  const header = rank !== undefined
    ? `### ${rank}. ${target.file}`
    : `### ${target.file}`;

  if (target.symbol) {
    lines.push(`${header}`);
    lines.push(`    Symbol: ${target.symbol} (lines ${target.startLine}-${target.endLine})`);
  } else {
    lines.push(header);
  }

  // Expected gain - show weighted if available
  if (target.weightedDeltaQ !== undefined && target.weightedDeltaQ !== target.totalDeltaQ) {
    lines.push(`    Expected ΔQ: +${target.totalDeltaQ.toFixed(3)} (graph-weighted: +${target.weightedDeltaQ.toFixed(3)})`);
  } else {
    lines.push(`    Expected ΔQ: +${target.totalDeltaQ.toFixed(3)}`);
  }
  lines.push('');

  // Issues breakdown
  lines.push('    Issues:');

  if (target.breakdown.coverage) {
    const cov = target.breakdown.coverage;
    const parts: string[] = [];
    if (cov.uncoveredBranches > 0) {
      parts.push(`${cov.uncoveredBranches} uncovered branches`);
    }
    if (cov.uncoveredLines > 0) {
      parts.push(`${cov.uncoveredLines} uncovered lines`);
    }
    if (parts.length > 0) {
      lines.push(`    - Coverage: ${parts.join(', ')} (~+${cov.estimatedCoverageGain.toFixed(1)}%)`);
    }
  }

  if (target.breakdown.typescript) {
    const ts = target.breakdown.typescript;
    const codes = ts.errorCodes.slice(0, 3).join(', ');
    const more = ts.errorCodes.length > 3 ? ` +${ts.errorCodes.length - 3} more` : '';
    lines.push(`    - TypeScript: ${ts.errorCount} error${ts.errorCount !== 1 ? 's' : ''} (${codes}${more})`);
  }

  if (target.breakdown.eslint) {
    const eslint = target.breakdown.eslint;
    const parts: string[] = [];
    if (eslint.errorCount > 0) {
      parts.push(`${eslint.errorCount} error${eslint.errorCount !== 1 ? 's' : ''}`);
    }
    if (eslint.warningCount > 0) {
      parts.push(`${eslint.warningCount} warning${eslint.warningCount !== 1 ? 's' : ''}`);
    }
    if (parts.length > 0) {
      lines.push(`    - ESLint: ${parts.join(', ')}`);
    }
  }

  if (target.breakdown.sonarqube) {
    const sonar = target.breakdown.sonarqube;
    const parts: string[] = [];
    if (sonar.bugs > 0) {
      parts.push(`${sonar.bugs} bug${sonar.bugs !== 1 ? 's' : ''}`);
    }
    if (sonar.vulnerabilities > 0) {
      parts.push(`${sonar.vulnerabilities} vulnerability${sonar.vulnerabilities !== 1 ? 'ies' : ''}`);
    }
    if (sonar.codeSmells > 0) {
      parts.push(`${sonar.codeSmells} code smell${sonar.codeSmells !== 1 ? 's' : ''}`);
    }
    if (parts.length > 0) {
      lines.push(`    - SonarQube: ${parts.join(', ')}`);
    }
  }

  // Dimensions affected summary
  if (target.dimensionsAffected.length > 1) {
    lines.push('');
    lines.push(`    Addresses ${target.dimensionsAffected.length} dimensions simultaneously.`);
  }

  // Graph info if available
  if (target.dependentCount !== undefined && target.dependentCount > 0) {
    lines.push(`    Dependents: ${target.dependentCount} files depend on this module.`);
  }

  return lines.join('\n');
}

/**
 * Format a list of targets for CLI display.
 */
export function formatTargetList(
  targets: OptimizationTarget[],
  options: { title?: string; showTotal?: boolean } = {}
): string {
  const { title = 'Optimization Targets', showTotal = true } = options;
  const lines: string[] = [];

  lines.push(`## ${title}`);
  lines.push('');

  if (targets.length === 0) {
    lines.push('No optimization targets found. All metrics are optimal!');
    return lines.join('\n');
  }

  for (let i = 0; i < targets.length; i++) {
    lines.push(formatTarget(targets[i], i + 1));
    lines.push('');
  }

  if (showTotal) {
    const totalDeltaQ = targets.reduce((sum, t) => sum + t.totalDeltaQ, 0);
    const totalIssues = targets.reduce((sum, t) => sum + t.issueCount, 0);
    lines.push('---');
    lines.push(`Total: ${targets.length} targets, ${totalIssues} issues, potential ΔQ: +${totalDeltaQ.toFixed(3)}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Suggestion Formatting
// =============================================================================

/**
 * Format a target suggestion for CLI display.
 */
export function formatTargetSuggestion(suggestion: TargetSuggestion): string {
  const lines: string[] = [];
  const { target, rank, rationale, expectedGain, dimensionBreakdown, guidance } = suggestion;

  // Header
  lines.push(`### ${rank}. ${target.symbol ?? target.file}`);
  if (target.symbol && target.startLine) {
    lines.push(`    Location: ${target.file}:${target.startLine}`);
  }
  lines.push('');

  // Rationale
  lines.push(`    ${rationale}`);
  lines.push('');

  // Expected gain
  lines.push(`    Expected fitness gain: +${expectedGain.toFixed(3)}`);
  lines.push('');

  // Dimension breakdown
  if (dimensionBreakdown.length > 0) {
    lines.push('    Breakdown:');
    for (const dim of dimensionBreakdown) {
      const sign = dim.expectedDelta >= 0 ? '+' : '';
      lines.push(`    - ${dim.displayName}: ${sign}${dim.expectedDelta.toFixed(1)} → ΔQ ${dim.deltaQ >= 0 ? '+' : ''}${dim.deltaQ.toFixed(4)}`);
    }
    lines.push('');
  }

  // Guidance
  if (guidance) {
    lines.push(`    Guidance: ${guidance}`);
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// JSON Formatting
// =============================================================================

/**
 * Format targets for JSON output (MCP tool response).
 */
export function formatTargetsForJson(targets: OptimizationTarget[]): object {
  const hasGraphWeights = targets.some(t => t.weightedDeltaQ !== undefined);

  return {
    targetCount: targets.length,
    totalPotentialGain: targets.reduce((sum, t) => sum + t.totalDeltaQ, 0),
    graphWeightingEnabled: hasGraphWeights,
    targets: targets.map((t, i) => ({
      rank: i + 1,
      file: t.file,
      symbol: t.symbol,
      lineRange: t.startLine && t.endLine ? { start: t.startLine, end: t.endLine } : undefined,
      expectedDeltaQ: Math.round(t.totalDeltaQ * 1000) / 1000,
      weightedDeltaQ: t.weightedDeltaQ !== undefined ? Math.round(t.weightedDeltaQ * 1000) / 1000 : undefined,
      dependentCount: t.dependentCount,
      centralityScore: t.centralityScore !== undefined ? Math.round(t.centralityScore * 1000) / 1000 : undefined,
      issueCount: t.issueCount,
      dimensionsAffected: t.dimensionsAffected,
      breakdown: t.breakdown,
    })),
  };
}

// =============================================================================
// Symbol Issues Formatting
// =============================================================================

/**
 * Format a single symbol's issues for CLI display.
 *
 * Shows the unified view: a symbol with issues from ALL axes,
 * plus normalized metrics for comparison.
 */
export function formatSymbolIssues(entry: SymbolIssues, rank?: number): string {
  const lines: string[] = [];
  const {
    symbol, coverage, issues, issueDensity, coverageGap, totalDeltaQ,
    dependentCount, weightedDeltaQ, fixabilityScore, adjustedDeltaQ,
    callersCount, calleesCount,
  } = entry;

  // Header with rank
  const header = rank !== undefined
    ? `### ${rank}. ${symbol.qualifiedName}`
    : `### ${symbol.qualifiedName}`;

  lines.push(header);
  lines.push(`    File: ${symbol.file}:${symbol.span.startLine}-${symbol.span.endLine}`);
  lines.push(`    Kind: ${symbol.kind} (${symbol.sloc} lines)`);
  lines.push('');

  // Normalized metrics
  lines.push('    Metrics:');
  lines.push(`    - Issue density: ${issueDensity.toFixed(3)} issues/line`);
  lines.push(`    - Coverage gap: ${(coverageGap * 100).toFixed(1)}% uncovered branches`);

  // Show graph-weighted ΔQ if different from base
  if (weightedDeltaQ !== undefined && weightedDeltaQ !== totalDeltaQ) {
    lines.push(`    - Total ΔQ: +${totalDeltaQ.toFixed(3)} (graph-weighted: +${weightedDeltaQ.toFixed(3)})`);
  } else {
    lines.push(`    - Total ΔQ: +${totalDeltaQ.toFixed(3)}`);
  }

  // Show fixability-adjusted ΔQ if available
  if (adjustedDeltaQ !== undefined && fixabilityScore !== undefined) {
    lines.push(`    - Fixability: ${(fixabilityScore * 100).toFixed(0)}% (adjusted ΔQ: +${adjustedDeltaQ.toFixed(3)})`);
  }

  // Show dependent count if graph weighted
  if (dependentCount !== undefined && dependentCount > 0) {
    lines.push(`    - Dependents: ${dependentCount} files depend on this module`);
  }
  if (callersCount !== undefined && callersCount > 0) {
    lines.push(`    - Callers: ${callersCount} symbols call this`);
  }
  if (calleesCount !== undefined && calleesCount > 0) {
    lines.push(`    - Callees: ${calleesCount} symbols called`);
  }

  lines.push('');

  // Issues by axis
  lines.push('    Issues:');

  if (issues.coverage.length > 0) {
    const branchIssues = issues.coverage.filter(i => i.code?.includes('branch'));
    const funcIssues = issues.coverage.filter(i => i.code?.includes('function'));
    const parts: string[] = [];
    if (branchIssues.length > 0) {
      parts.push(`${branchIssues.length} uncovered branches`);
    }
    if (funcIssues.length > 0) {
      parts.push(`${funcIssues.length} uncovered functions`);
    }
    if (parts.length > 0) {
      const pct = coverage.branches.percentage.toFixed(1);
      lines.push(`    - Coverage: ${parts.join(', ')} (${pct}% covered)`);
    }
  }

  if (issues.typescript.length > 0) {
    const codes = [...new Set(issues.typescript.map(i => i.code).filter(Boolean))];
    const codeStr = codes.slice(0, 3).join(', ');
    const more = codes.length > 3 ? ` +${codes.length - 3} more` : '';
    lines.push(`    - TypeScript: ${issues.typescript.length} error${issues.typescript.length !== 1 ? 's' : ''} (${codeStr}${more})`);
  }

  if (issues.eslint.length > 0) {
    const errors = issues.eslint.filter(i => i.dimension === 'eslint.errors');
    const warnings = issues.eslint.filter(i => i.dimension === 'eslint.warnings');
    const parts: string[] = [];
    if (errors.length > 0) parts.push(`${errors.length} error${errors.length !== 1 ? 's' : ''}`);
    if (warnings.length > 0) parts.push(`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`);
    lines.push(`    - ESLint: ${parts.join(', ')}`);
  }

  if (issues.sonarqube.length > 0) {
    const bugs = issues.sonarqube.filter(i => i.dimension === 'sonarqube.bugs');
    const vulns = issues.sonarqube.filter(i => i.dimension === 'sonarqube.vulnerabilities');
    const smells = issues.sonarqube.filter(i => i.dimension === 'sonarqube.codeSmells');
    const parts: string[] = [];
    if (bugs.length > 0) parts.push(`${bugs.length} bug${bugs.length !== 1 ? 's' : ''}`);
    if (vulns.length > 0) parts.push(`${vulns.length} vulnerability${vulns.length !== 1 ? 'ies' : ''}`);
    if (smells.length > 0) parts.push(`${smells.length} smell${smells.length !== 1 ? 's' : ''}`);
    lines.push(`    - SonarQube: ${parts.join(', ')}`);
  }

  // Cross-axis indicator
  const axesWithIssues = [
    issues.coverage.length > 0 ? 'coverage' : null,
    issues.typescript.length > 0 ? 'typescript' : null,
    issues.eslint.length > 0 ? 'eslint' : null,
    issues.sonarqube.length > 0 ? 'sonarqube' : null,
  ].filter(Boolean);

  if (axesWithIssues.length > 1) {
    lines.push('');
    lines.push(`    Cross-cutting: Issues from ${axesWithIssues.length} axes (${axesWithIssues.join(', ')})`);
  }

  return lines.join('\n');
}

/**
 * Format a list of symbol issues for CLI display.
 */
export function formatSymbolIssuesList(
  entries: SymbolIssues[],
  options: { title?: string; showTotal?: boolean } = {}
): string {
  const { title = 'Symbol-Level Optimization Targets', showTotal = true } = options;
  const lines: string[] = [];

  lines.push(`## ${title}`);
  lines.push('');

  if (entries.length === 0) {
    lines.push('No symbols with issues found. All code is optimal!');
    return lines.join('\n');
  }

  for (let i = 0; i < entries.length; i++) {
    lines.push(formatSymbolIssues(entries[i], i + 1));
    lines.push('');
  }

  if (showTotal) {
    const totalDeltaQ = entries.reduce((sum, e) => sum + e.totalDeltaQ, 0);
    const totalIssues = entries.reduce((sum, e) => sum + e.totalIssueCount, 0);
    const avgDensity = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.issueDensity, 0) / entries.length
      : 0;

    lines.push('---');
    lines.push(`Total: ${entries.length} symbols, ${totalIssues} issues`);
    lines.push(`Average density: ${avgDensity.toFixed(3)} issues/line`);
    lines.push(`Potential ΔQ: +${totalDeltaQ.toFixed(3)}`);
  }

  return lines.join('\n');
}

/**
 * Format symbol issues for JSON output.
 */
export function formatSymbolIssuesForJson(entries: SymbolIssues[]): object {
  const hasGraphWeights = entries.some(e => e.weightedDeltaQ !== undefined);

  return {
    symbolCount: entries.length,
    totalPotentialGain: entries.reduce((sum, e) => sum + e.totalDeltaQ, 0),
    totalWeightedGain: hasGraphWeights
      ? entries.reduce((sum, e) => sum + (e.weightedDeltaQ ?? e.totalDeltaQ), 0)
      : undefined,
    averageIssueDensity: entries.length > 0
      ? entries.reduce((sum, e) => sum + e.issueDensity, 0) / entries.length
      : 0,
    graphWeighted: hasGraphWeights,
    symbols: entries.map((e, i) => ({
      rank: i + 1,
      symbolId: e.symbol.id,
      qualifiedName: e.symbol.qualifiedName,
      file: e.symbol.file,
      lineRange: { start: e.symbol.span.startLine, end: e.symbol.span.endLine },
      kind: e.symbol.kind,
      sloc: e.symbol.sloc,
      metrics: {
        issueDensity: Math.round(e.issueDensity * 1000) / 1000,
        coverageGap: Math.round(e.coverageGap * 1000) / 1000,
        totalDeltaQ: Math.round(e.totalDeltaQ * 1000) / 1000,
        // Graph weighting
        weightedDeltaQ: e.weightedDeltaQ !== undefined
          ? Math.round(e.weightedDeltaQ * 1000) / 1000
          : undefined,
        dependentCount: e.dependentCount,
        centralityScore: e.centralityScore !== undefined
          ? Math.round(e.centralityScore * 1000) / 1000
          : undefined,
        weightingSource: e.weightingSource,
        callersCount: e.callersCount,
        calleesCount: e.calleesCount,
        // Fixability estimation
        fixabilityScore: e.fixabilityScore !== undefined
          ? Math.round(e.fixabilityScore * 1000) / 1000
          : undefined,
        adjustedDeltaQ: e.adjustedDeltaQ !== undefined
          ? Math.round(e.adjustedDeltaQ * 1000) / 1000
          : undefined,
      },
      coverage: {
        branches: e.coverage.branches,
      },
      issueCounts: {
        coverage: e.issues.coverage.length,
        typescript: e.issues.typescript.length,
        eslint: e.issues.eslint.length,
        sonarqube: e.issues.sonarqube.length,
        total: e.totalIssueCount,
      },
    })),
  };
}
