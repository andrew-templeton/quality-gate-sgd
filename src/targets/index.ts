/**
 * Targets Module
 * ==============
 * Location-aware optimization targets for discrete gradient computation.
 */

// Types
export type {
  IssueSource,
  IssueSeverity,
  LocatedIssue,
  OptimizationTarget,
  ExtractLocatedIssuesOptions,
  ExtractedIssues,
  TargetGranularity,
  AggregateTargetsOptions,
  TargetSuggestion,
} from './types.js';

// Extraction (Phase 2)
export {
  extractLocatedIssues,
  extractCoverageIssues,
  extractTypescriptIssues,
  extractEslintIssues,
  extractSonarqubeIssues,
} from './extract.js';

// Aggregation (Phase 3)
export {
  aggregateToTargets,
  computeTargetDeltaQ,
} from './aggregate.js';

// Formatting (for CLI output)
export {
  formatTarget,
  formatTargetList,
  formatTargetSuggestion,
  formatTargetsForJson,
} from './format.js';
