/**
 * Targets Module
 * ==============
 * Location-aware optimization targets for discrete gradient computation.
 */
// Extraction (Phase 2)
export { extractLocatedIssues, extractCoverageIssues, extractTypescriptIssues, extractEslintIssues, extractSonarqubeIssues, } from './extract.js';
// Aggregation (Phase 3)
export { aggregateToTargets, computeTargetDeltaQ, aggregateToSymbols, aggregateToSymbolsWithOptions, } from './aggregate.js';
// Formatting (for CLI output)
export { formatTarget, formatTargetList, formatTargetSuggestion, formatTargetsForJson, formatSymbolIssues, formatSymbolIssuesList, formatSymbolIssuesForJson, } from './format.js';
//# sourceMappingURL=index.js.map