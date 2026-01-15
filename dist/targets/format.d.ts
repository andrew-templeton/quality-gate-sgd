/**
 * Target Formatting
 * =================
 * Formats optimization targets for CLI and MCP output.
 */
import type { OptimizationTarget, TargetSuggestion } from './types.js';
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
//# sourceMappingURL=format.d.ts.map