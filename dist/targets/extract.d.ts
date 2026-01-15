/**
 * Located Issue Extraction
 * ========================
 * Extracts issues with location information from all quality sources.
 *
 * Unlike the metrics extraction (which aggregates to counts), this preserves
 * the file:line:column information so we can compute target-space gradients.
 */
import type { LocatedIssue, ExtractedIssues, ExtractLocatedIssuesOptions } from './types.js';
/**
 * Extract uncovered branches and lines from coverage-final.json.
 *
 * Each uncovered branch becomes a LocatedIssue with estimated coverage impact.
 */
export declare function extractCoverageIssues(coverageDir?: string): LocatedIssue[];
/**
 * Extract TypeScript errors with location information.
 */
export declare function extractTypescriptIssues(): LocatedIssue[];
/**
 * Extract ESLint issues with location information.
 */
export declare function extractEslintIssues(): LocatedIssue[];
/**
 * Extract SonarQube issues with location information.
 */
export declare function extractSonarqubeIssues(): LocatedIssue[];
/**
 * Extract located issues from all sources.
 *
 * This is the main entry point for Phase 2 of the location-aware targets system.
 */
export declare function extractLocatedIssues(options?: ExtractLocatedIssuesOptions): ExtractedIssues;
//# sourceMappingURL=extract.d.ts.map