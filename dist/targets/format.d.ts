/**
 * Target Formatting
 * =================
 * Formats optimization targets for CLI and MCP output.
 */
import type { OptimizationTarget, TargetSuggestion } from './types.js';
import type { SymbolIssues } from '../symbols/types.js';
/**
 * Format a single optimization target for CLI display.
 */
export declare function formatTarget(target: OptimizationTarget, rank?: number): string;
/**
 * Format a list of targets for CLI display.
 */
export declare function formatTargetList(targets: OptimizationTarget[], options?: {
    title?: string;
    showTotal?: boolean;
}): string;
/**
 * Format a target suggestion for CLI display.
 */
export declare function formatTargetSuggestion(suggestion: TargetSuggestion): string;
/**
 * Format targets for JSON output (MCP tool response).
 */
export declare function formatTargetsForJson(targets: OptimizationTarget[]): object;
/**
 * Format a single symbol's issues for CLI display.
 *
 * Shows the unified view: a symbol with issues from ALL axes,
 * plus normalized metrics for comparison.
 */
export declare function formatSymbolIssues(entry: SymbolIssues, rank?: number): string;
/**
 * Format a list of symbol issues for CLI display.
 */
export declare function formatSymbolIssuesList(entries: SymbolIssues[], options?: {
    title?: string;
    showTotal?: boolean;
}): string;
/**
 * Format symbol issues for JSON output.
 */
export declare function formatSymbolIssuesForJson(entries: SymbolIssues[]): object;
//# sourceMappingURL=format.d.ts.map