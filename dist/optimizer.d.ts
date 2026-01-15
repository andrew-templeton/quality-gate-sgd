/**
 * Optimizer Module
 * ================
 * Computes file priorities for LLM agent guidance using a multi-dimensional
 * priority function that combines coverage, ease of testing, impact, and severity.
 *
 * This implements the mathematical framework for "weighted gradient descent" where:
 * - Objective metrics (coverage, bugs) create the gradient (what to optimize)
 * - Weighting metrics (impact, ease) focus the gradient (where to optimize)
 *
 * The composite priority function is:
 *   priority = w_cov * coverageGap + w_ease * easeOfTesting + w_impact * importance + w_sev * severityScore
 */
import type { FileInfo, FailedRule, PriorityWeights, PrioritizedFile } from './types.js';
/**
 * Default weights for the four priority dimensions.
 * These can be customized to emphasize different aspects of quality.
 *
 * Default strategy prioritizes:
 * 1. Impact (0.30) - Critical code that affects many files
 * 2. Coverage (0.30) - Files needing more tests
 * 3. Ease (0.25) - Leaf nodes that are simpler to test
 * 4. Severity (0.15) - Files with more/worse violations
 */
export declare const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights;
/**
 * Compute the priority score for a single file.
 *
 * @param file - File info with degree, impact, and coverage
 * @param failedRules - Array of failed rules (for severity calculation)
 * @param weights - Priority dimension weights
 * @param customSeverityWeights - Optional custom severity weights
 * @returns PrioritizedFile with priority score and components
 */
export declare function computePriority(file: FileInfo, failedRules?: FailedRule[], weights?: PriorityWeights, customSeverityWeights?: Record<string, number>): PrioritizedFile;
/**
 * Prioritize all files based on the composite priority function.
 * Returns files sorted by priority (highest first).
 *
 * @param files - Map of file paths to FileInfo
 * @param failedRules - Array of failed rules (optional, for severity)
 * @param weights - Priority dimension weights
 * @param threshold - Minimum coverage threshold to include (default: 100 = all files)
 * @returns Array of PrioritizedFile sorted by priority descending
 */
export declare function prioritizeFiles(files: Map<string, FileInfo>, failedRules?: FailedRule[], weights?: PriorityWeights, threshold?: number): PrioritizedFile[];
/**
 * Categorize files by their strategic importance.
 *
 * Categories:
 * - Critical Foundation: High impact + low degree (test first)
 * - Integration Layer: High impact + high degree (test after deps)
 * - Isolated Utilities: Low impact + low degree (test opportunistically)
 * - Complex Isolated: Low impact + high degree (defer or skip)
 */
export declare function categorizeFiles(files: Map<string, FileInfo>): Record<string, FileInfo[]>;
/**
 * Get the "gradient direction" - the ordered list of files to work on.
 * This is the discrete analog of a gradient in continuous optimization.
 *
 * @param prioritizedFiles - Array of prioritized files (already sorted)
 * @param limit - Maximum number of files to return
 * @returns Array of file paths in priority order
 */
export declare function getGradientDirection(prioritizedFiles: PrioritizedFile[], limit?: number): string[];
/**
 * Format prioritized files for display.
 * Useful for CLI output and LLM context.
 */
export declare function formatPrioritizedFiles(prioritizedFiles: PrioritizedFile[], srcDir: string, limit?: number): string;
//# sourceMappingURL=optimizer.d.ts.map