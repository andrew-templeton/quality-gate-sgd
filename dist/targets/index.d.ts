/**
 * Targets Module
 * ==============
 * Location-aware optimization targets for discrete gradient computation.
 */
export type { IssueSource, IssueSeverity, LocatedIssue, OptimizationTarget, ExtractLocatedIssuesOptions, ExtractedIssues, TargetGranularity, AggregateTargetsOptions, TargetSuggestion, } from './types.js';
export { extractLocatedIssues, extractCoverageIssues, extractTypescriptIssues, extractEslintIssues, extractSonarqubeIssues, } from './extract.js';
export { aggregateToTargets, computeTargetDeltaQ, aggregateToSymbols, aggregateToSymbolsWithOptions, type AggregateToSymbolsOptions, } from './aggregate.js';
export { formatTarget, formatTargetList, formatTargetSuggestion, formatTargetsForJson, formatSymbolIssues, formatSymbolIssuesList, formatSymbolIssuesForJson, } from './format.js';
//# sourceMappingURL=index.d.ts.map