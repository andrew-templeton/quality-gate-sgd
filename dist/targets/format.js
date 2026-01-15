/**
 * Target Formatting
 * =================
 * Formats optimization targets for CLI and MCP output.
 */
// =============================================================================
// Single Target Formatting
// =============================================================================
/**
 * Format a single optimization target for CLI display.
 */
export function formatTarget(target, rank) {
    const lines = [];
    // Header with rank
    const header = rank !== undefined
        ? `### ${rank}. ${target.file}`
        : `### ${target.file}`;
    if (target.symbol) {
        lines.push(`${header}`);
        lines.push(`    Symbol: ${target.symbol} (lines ${target.startLine}-${target.endLine})`);
    }
    else {
        lines.push(header);
    }
    // Expected gain
    lines.push(`    Expected ΔQ: +${target.totalDeltaQ.toFixed(3)}`);
    lines.push('');
    // Issues breakdown
    lines.push('    Issues:');
    if (target.breakdown.coverage) {
        const cov = target.breakdown.coverage;
        const parts = [];
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
        const parts = [];
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
        const parts = [];
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
export function formatTargetList(targets, options = {}) {
    const { title = 'Optimization Targets', showTotal = true } = options;
    const lines = [];
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
export function formatTargetSuggestion(suggestion) {
    const lines = [];
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
export function formatTargetsForJson(targets) {
    return {
        targetCount: targets.length,
        totalPotentialGain: targets.reduce((sum, t) => sum + t.totalDeltaQ, 0),
        targets: targets.map((t, i) => ({
            rank: i + 1,
            file: t.file,
            symbol: t.symbol,
            lineRange: t.startLine && t.endLine ? { start: t.startLine, end: t.endLine } : undefined,
            expectedDeltaQ: Math.round(t.totalDeltaQ * 1000) / 1000,
            issueCount: t.issueCount,
            dimensionsAffected: t.dimensionsAffected,
            breakdown: t.breakdown,
        })),
    };
}
//# sourceMappingURL=format.js.map