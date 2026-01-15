#!/usr/bin/env npx tsx
/**
 * List SonarQube Issues
 * =====================
 * Fetches and displays issues from SonarQube with filtering options.
 *
 * Usage:
 *   npx quality-gate-sgd list-issues [options]
 *
 * Options:
 *   --severity=LEVEL    Filter by severity (BLOCKER, CRITICAL, MAJOR, MINOR, INFO)
 *   --limit=N           Maximum number of issues to show (default: 100)
 *   --rule=RULE         Filter by rule ID (e.g., typescript:S3358)
 *   --file=PATH         Filter by file path pattern
 *   --summary, -s       Show only summary by rule (no file details)
 *
 * Examples:
 *   npx quality-gate-sgd list-issues                           # All issues
 *   npx quality-gate-sgd list-issues --severity=MINOR -s       # Minor issues summary only
 *   npx quality-gate-sgd list-issues --severity=MAJOR          # Major issues with details
 *   npx quality-gate-sgd list-issues --rule=typescript:S1874   # Specific rule
 */
export declare function listIssues(args?: string[]): Promise<void>;
//# sourceMappingURL=list-issues.d.ts.map